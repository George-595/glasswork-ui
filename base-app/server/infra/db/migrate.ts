import { createHash } from 'node:crypto';
import { DbQueryError } from './errors.ts';
import { dialectFor } from './migrations/dialect.ts';
import { MIGRATIONS, type Migration } from './migrations/index.ts';
import type { DbClient, DbExecutor } from './types.ts';

/* Applies pending migrations in id order and records each in schema_migrations together
   with a checksum of the statements it ran.

   WHEN it runs: during the deploy, once, never on a request. Vercel runs `server/cli/migrate.ts
   --deploy` in the build (a failure fails the build, so nothing is promoted); Docker and
   `npm run dev` run it at boot (server/main.ts), which is safe with several containers because
   of the lock below. A Vercel function only calls `verifySchema`, which reads one table.

   HOW it is made safe to run twice at once:
   - Postgres: the whole run is ONE transaction. It takes
     `pg_advisory_xact_lock` first, a transaction-scoped lock, so it works through PgBouncer's
     transaction pooling (a session-level lock would not) and is released if the process dies.
     The second runner waits, then reads the winner's rows and applies nothing. `lock_timeout`
     and `statement_timeout` are set LOCAL, so a migration that would queue behind live queries
     gives up instead of stalling every request. DDL is transactional here: every pending
     migration commits together or not at all.
   - MySQL: DDL commits implicitly, so there is no all-or-nothing. A named lock (`GET_LOCK`) on
     the pinned connection serialises runners; each migration's row is committed with it.
   - SQLite: one process, and the single transaction is enough.

   Append-only is enforced, not hoped for. Before applying anything, every row already in
   schema_migrations is checked against the code:
   - an applied id the code does not know (a migration was deleted or renamed);
   - an applied id whose checksum differs from the code's statements (it was edited);
   - a pending migration that sorts before one already applied (added out of order).
   Any of these throws MigrationError and nothing is applied.

   `verifySchema` is the read-only boot check of a deployed function. It is more forgiving in
   exactly one way: an applied id that sorts AFTER the code's last migration is allowed, because
   a newer deployment migrated the database and this one (still serving until promotion, or
   after an Instant Rollback) must keep working. That is why, from 007 on, every migration
   must be backward-compatible with the previous release (migrations/README.md).
   Returns the ids applied. */

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

/** The database is behind the code: a migration in this build has not been applied yet. The
    deploy has not finished (or failed); a function answers 503 "updating" until it has. */
export class SchemaBehindError extends MigrationError {
  readonly pending: readonly string[];
  constructor(pending: readonly string[]) {
    super(
      `The database is behind the code: ${pending.join(', ')} ${
        pending.length === 1 ? 'has' : 'have'
      } not been applied. The deploy applies migrations before it serves; run \`npm run db:migrate\` against this database.`,
    );
    this.name = 'SchemaBehindError';
    this.pending = pending;
  }
}

const RESET_HINT =
  'In development, reset the local database with `npm run db:reset`. ' +
  'Never edit a migration that has been applied anywhere: add a new one.';

/** The one advisory-lock key every runner of this app contends on. */
const PG_LOCK_KEY = 7354812001;
const MYSQL_LOCK_NAME = 'app_migrate';
const MYSQL_LOCK_WAIT_SECONDS = 30;

/** sha256 of the statements a migration runs on this driver. */
export function checksum(statements: readonly string[]): string {
  return createHash('sha256').update(JSON.stringify(statements)).digest('hex');
}

type AppliedRow = { id: string; checksum: string };

function indexMigrations(migrations: readonly Migration[]): {
  ordered: Migration[];
  byId: Map<string, Migration>;
} {
  const ordered = migrations.toSorted((a, b) => a.id.localeCompare(b.id));
  const byId = new Map<string, Migration>();
  for (const m of ordered) {
    if (byId.has(m.id)) throw new Error(`Duplicate migration id ${m.id}`);
    byId.set(m.id, m);
  }
  return { ordered, byId };
}

/** True when `err` is the database saying a table does not exist, on any driver. */
function isMissingTable(err: unknown): boolean {
  if (!(err instanceof DbQueryError)) return false;
  const cause = err.cause as { code?: unknown; message?: unknown } | undefined;
  if (err.driver === 'postgres') return cause?.code === '42P01';
  if (err.driver === 'mysql') return cause?.code === 'ER_NO_SUCH_TABLE';
  return typeof cause?.message === 'string' && cause.message.includes('no such table');
}

async function readApplied(exec: DbExecutor): Promise<Map<string, string>> {
  let rows: AppliedRow[];
  try {
    rows = await exec.query<AppliedRow>('SELECT id, checksum FROM schema_migrations');
  } catch (err) {
    if (isMissingTable(err)) throw err;
    throw new MigrationError(
      `schema_migrations has no checksum column: this database was made by an older template. ${RESET_HINT}`,
    );
  }
  return new Map(rows.map((r) => [r.id, r.checksum]));
}

/** Refuses a history that disagrees with the code. `allowNewer` lets applied ids that sort after
    the code's last migration through (verifySchema); it returns them. */
function checkHistory(
  done: Map<string, string>,
  byId: Map<string, Migration>,
  ordered: readonly Migration[],
  driver: DbClient['driver'],
  allowNewer: boolean,
): string[] {
  const lastInCode = ordered.at(-1)?.id;
  const newer: string[] = [];
  for (const [id, applied] of done) {
    const m = byId.get(id);
    if (!m) {
      if (allowNewer && lastInCode !== undefined && id > lastInCode) {
        newer.push(id);
        continue;
      }
      throw new MigrationError(
        `Applied migration "${id}" is not in the code: it was deleted or renamed. ${RESET_HINT}`,
      );
    }
    if (checksum(m.up(driver)) !== applied) {
      throw new MigrationError(`Migration "${id}" was applied and then changed. ${RESET_HINT}`);
    }
  }
  return newer.toSorted();
}

export async function migrate(
  db: DbClient,
  migrations: readonly Migration[] = MIGRATIONS,
  now: () => Date = () => new Date(),
): Promise<string[]> {
  const { ordered, byId } = indexMigrations(migrations);
  const ts = dialectFor(db.driver).timestamp;

  return db.transaction(async (tx) => {
    // The lock comes first, so a second runner reads the winner's rows, not an empty table.
    if (db.driver === 'postgres') {
      // statement_timeout first, so waiting for a stuck holder of the lock is bounded too
      await tx.execute("SET LOCAL statement_timeout = '120s'");
      await tx.execute(`SELECT pg_advisory_xact_lock(${PG_LOCK_KEY})`);
      await tx.execute("SET LOCAL lock_timeout = '10s'");
    } else if (db.driver === 'mysql') {
      const [got] = await tx.query<{ got: number | string | null }>(
        'SELECT GET_LOCK(?, ?) AS got',
        [MYSQL_LOCK_NAME, MYSQL_LOCK_WAIT_SECONDS],
      );
      if (Number(got?.got) !== 1) {
        throw new MigrationError(
          `Another process is migrating this database (waited ${MYSQL_LOCK_WAIT_SECONDS}s for the "${MYSQL_LOCK_NAME}" lock).`,
        );
      }
    }
    try {
      await tx.execute(
        `CREATE TABLE IF NOT EXISTS schema_migrations (
          id VARCHAR(100) NOT NULL,
          checksum CHAR(64) NOT NULL,
          applied_at ${ts} NOT NULL,
          CONSTRAINT pk_schema_migrations PRIMARY KEY (id)
        )`,
      );

      const done = await readApplied(tx);
      checkHistory(done, byId, ordered, db.driver, false);
      const lastApplied = [...done.keys()].toSorted().at(-1);
      for (const m of ordered) {
        if (!done.has(m.id) && lastApplied !== undefined && m.id < lastApplied) {
          throw new MigrationError(
            `Migration "${m.id}" is new but sorts before the applied "${lastApplied}". ` +
              `Give it an id after "${lastApplied}". ${RESET_HINT}`,
          );
        }
      }

      const applied: string[] = [];
      for (const m of ordered) {
        if (done.has(m.id)) continue;
        const statements = m.up(db.driver);
        for (const sql of statements) await tx.execute(sql);
        await tx.execute(
          'INSERT INTO schema_migrations (id, checksum, applied_at) VALUES (?, ?, ?)',
          [m.id, checksum(statements), now()],
        );
        // MySQL commits DDL implicitly; commit the row with it so a later failure cannot
        // leave an applied migration unrecorded.
        if (db.driver === 'mysql') await tx.execute('COMMIT');
        applied.push(m.id);
      }
      return applied;
    } finally {
      if (db.driver === 'mysql') {
        await tx.execute('DO RELEASE_LOCK(?)', [MYSQL_LOCK_NAME]).catch(() => undefined);
      }
    }
  });
}

export interface SchemaStatus {
  /** Applied ids that sort after the code's last migration: a newer deployment migrated. */
  newer: string[];
}

/**
 * The read-only boot check. One SELECT on schema_migrations, no DDL, no lock, no write.
 * - a checksum that differs, or an unknown applied id that sorts before the code's last one:
 *   MigrationError (the history disagrees with this code);
 * - a migration in the code that is not applied: SchemaBehindError (the deploy has not
 *   migrated this database yet);
 * - an unknown applied id that sorts after the code's last one: allowed, reported in `newer`
 *   and through `warn`, so an older deployment keeps serving a database a newer one migrated.
 */
export async function verifySchema(
  db: DbExecutor,
  migrations: readonly Migration[] = MIGRATIONS,
  opts: { warn?: (message: string, fields: Record<string, unknown>) => void } = {},
): Promise<SchemaStatus> {
  const { ordered, byId } = indexMigrations(migrations);
  let done: Map<string, string>;
  try {
    done = await readApplied(db);
  } catch (err) {
    if (isMissingTable(err)) throw new SchemaBehindError(ordered.map((m) => m.id));
    throw err;
  }
  const newer = checkHistory(done, byId, ordered, db.driver, true);
  const pending = ordered.filter((m) => !done.has(m.id)).map((m) => m.id);
  if (pending.length > 0) throw new SchemaBehindError(pending);
  if (newer.length > 0) {
    opts.warn?.('the database was migrated by a newer deployment than this one', { newer });
  }
  return { newer };
}
