import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnvError, readServerEnv } from '../config/env.ts';
import { createDbClient, redactUrl } from '../infra/db/index.ts';
import { MigrationError, migrate, SchemaBehindError, verifySchema } from '../infra/db/migrate.ts';
import { seedIfEmpty } from '../services/index.ts';

/* The migration CLI. Migrations run once, during the deploy, never on a request:
     node server/cli/migrate.ts --apply    apply pending migrations (`npm run db:migrate`)
     node server/cli/migrate.ts --verify   read-only: exit 1 if the database is behind the code
     node server/cli/migrate.ts --deploy   the Vercel build step (`npm run vercel-build`)

   --deploy decides from VERCEL_ENV:
     production                  applies, then seeds the admin (never demo data);
     preview + MIGRATE_PREVIEW=apply   applies (a Preview on its own Neon branch);
     anything else               only verifies, and FAILS the build when a migration is pending:
                                 previews share the production database, so a branch that adds
                                 a migration must be given its own Neon branch (docs/DEPLOY.md).
   A failed migration fails the build, so the deployment is never promoted. The whole run is one
   transaction under an advisory lock (infra/db/migrate.ts): safe to run twice at once.

   Which database: MIGRATION_DATABASE_URL, else DATABASE_URL_UNPOOLED (Neon's direct endpoint,
   set by its Vercel integration), else DATABASE_URL. Migrations want a direct connection
   (a pooler in transaction mode is fine for the lock, but not for long DDL). One connection. */

export type Mode = 'apply' | 'verify' | 'deploy';

export function databaseUrlFor(env: Record<string, string | undefined>): string | undefined {
  for (const key of ['MIGRATION_DATABASE_URL', 'DATABASE_URL_UNPOOLED', 'DATABASE_URL']) {
    const v = env[key];
    if (v) return v;
  }
  return undefined;
}

/** `host/database`, never credentials. */
export function describeTarget(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    return redactUrl(url).replace(/^[a-z]+:/, '');
  }
}

/** What --deploy does in this environment. */
export function deployAction(env: Record<string, string | undefined>): 'apply' | 'verify' {
  if (env.VERCEL_ENV === 'production') return 'apply';
  if (env.VERCEL_ENV === 'preview' && env.MIGRATE_PREVIEW === 'apply') return 'apply';
  return 'verify';
}

export interface Io {
  info: (line: string) => void;
  error: (line: string) => void;
}

const USAGE = 'usage: node server/cli/migrate.ts --apply | --verify | --deploy';

export async function runCli(
  argv: readonly string[],
  env: Record<string, string | undefined>,
  io: Io = { info: console.info, error: console.error },
): Promise<number> {
  const flags = argv.filter((a) => a.startsWith('--'));
  const mode = (['apply', 'verify', 'deploy'] as const).find((m) => flags.includes(`--${m}`));
  if (!mode || flags.length !== 1) {
    io.error(USAGE);
    return 2;
  }
  const url = databaseUrlFor(env);
  if (!url) {
    io.error(
      'migrate: no database. Set MIGRATION_DATABASE_URL, DATABASE_URL_UNPOOLED or DATABASE_URL.',
    );
    return 1;
  }
  const target = describeTarget(url);
  const action = mode === 'deploy' ? deployAction(env) : mode;

  let db: Awaited<ReturnType<typeof createDbClient>> | undefined;
  try {
    // The admin account is seeded after applying; read its settings first, so a misconfigured
    // deploy fails before it touches the database.
    let admin: { adminEmail: string; adminPassword: string } | undefined;
    if (mode === 'deploy' && action === 'apply') {
      const cfg = readServerEnv({ ...env, DATABASE_URL: url });
      admin = {
        adminEmail: cfg.auth.adminEmail,
        adminPassword: cfg.auth.adminPassword,
      };
    }

    db = await createDbClient(url, { poolMax: 1, statementTimeoutMs: 120_000 });
    if (action === 'apply') {
      const applied = await migrate(db);
      io.info(
        `migrate: ${target} (${db.driver}): applied ${applied.length ? applied.join(', ') : 'nothing, already up to date'}`,
      );
      if (admin) {
        const seed = await seedIfEmpty(db, { ...admin, seedDemoData: false });
        io.info(`migrate: admin account ${seed.admin}`);
      }
      return 0;
    }

    try {
      const { newer } = await verifySchema(db, undefined, {});
      io.info(
        `migrate: ${target} (${db.driver}): schema matches the code${
          newer.length ? ` (a newer deployment also applied ${newer.join(', ')})` : ''
        }`,
      );
      return 0;
    } catch (err) {
      if (err instanceof SchemaBehindError && mode === 'deploy') {
        io.error(
          `migrate: this commit adds ${err.pending.length === 1 ? 'migration' : 'migrations'} ${err.pending.join(', ')}; ` +
            'previews share the production database, so it is not applied here. ' +
            'Give this Preview its own Neon branch (set DATABASE_URL for it) and MIGRATE_PREVIEW=apply, ' +
            'or merge to production, which migrates. docs/DEPLOY.md.',
        );
        return 1;
      }
      throw err;
    }
  } catch (err) {
    if (err instanceof MigrationError || err instanceof EnvError) {
      io.error(`migrate: ${err.message}`);
    } else {
      // never the driver's own message: it can carry a host or a user name
      const code = (err as { code?: unknown } | null)?.code;
      io.error(
        `migrate: failed on ${target}: ${err instanceof Error ? err.name : 'error'}${typeof code === 'string' ? ` (${code})` : ''}`,
      );
    }
    return 1;
  } finally {
    await db?.close().catch(() => undefined);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli(process.argv.slice(2), process.env).then(
    (code) => process.exit(code),
    (err: unknown) => {
      console.error(`migrate: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    },
  );
}
