import { describe, expect, it } from 'vitest';
import { createDbClient } from './index.ts';
import { checksum, MigrationError, migrate, SchemaBehindError, verifySchema } from './migrate.ts';
import { MIGRATIONS } from './migrations/index.ts';
import { openTestDb, TEST_TARGETS } from './test-databases.ts';
import type { DbClient } from './types.ts';

/** True when schema_migrations exists and holds `id`. */
async function recorded(db: DbClient, id: string): Promise<boolean> {
  try {
    return (await db.query('SELECT id FROM schema_migrations WHERE id = ?', [id])).length > 0;
  } catch {
    return false; // the whole run rolled back, the table with it
  }
}

describe('migrate', () => {
  it('applies every migration once, in order, and records it', async () => {
    const db = await createDbClient('sqlite::memory:');
    expect(await migrate(db)).toEqual(MIGRATIONS.map((m) => m.id));
    expect(await migrate(db)).toEqual([]);
    const rows = await db.query<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id');
    expect(rows.map((r) => r.id)).toEqual(MIGRATIONS.map((m) => m.id));
    await db.close();
  });

  it('applies only the new migration on a later boot', async () => {
    const db = await createDbClient('sqlite::memory:');
    const first = { id: '001_a', up: () => ['CREATE TABLE a (id INTEGER)'] };
    const second = { id: '002_b', up: () => ['CREATE TABLE b (id INTEGER)'] };
    await migrate(db, [first]);
    expect(await migrate(db, [first, second])).toEqual(['002_b']);
    await db.close();
  });

  it('rolls back a failed migration and leaves it unrecorded', async () => {
    const db = await createDbClient('sqlite::memory:');
    const broken = { id: '999_broken', up: () => ['CREATE TABLE t_ok (id INTEGER)', 'NOT SQL'] };
    await expect(migrate(db, [broken])).rejects.toThrow(/query failed/);
    expect(await recorded(db, '999_broken')).toBe(false);
    await db.close();
  });

  it('is all or nothing: a later failure undoes the earlier migrations of the same run', async () => {
    const db = await createDbClient('sqlite::memory:');
    const ok = { id: '001_ok', up: () => ['CREATE TABLE t_ok (id INTEGER)'] };
    const bad = { id: '002_bad', up: () => ['NOT SQL'] };
    await expect(migrate(db, [ok, bad])).rejects.toThrow(/query failed/);
    expect(await recorded(db, '001_ok')).toBe(false);
    await expect(db.query('SELECT * FROM t_ok')).rejects.toThrow(/query failed/);
    // and the fixed code applies both on the next run
    const fixed = { id: '002_bad', up: () => ['CREATE TABLE t_two (id INTEGER)'] };
    expect(await migrate(db, [ok, fixed])).toEqual(['001_ok', '002_bad']);
    await db.close();
  });

  it('refuses duplicate ids', async () => {
    const db = await createDbClient('sqlite::memory:');
    const m = { id: '001_x', up: () => [] };
    await expect(migrate(db, [m, m])).rejects.toThrow(/Duplicate/);
    await db.close();
  });
});

/* Append-only, enforced: the same four refusals on every driver. */
for (const target of TEST_TARGETS) {
  describe.skipIf(!target.available)(`migrate checksums (${target.driver})`, () => {
    const a = { id: '001_a', up: () => ['CREATE TABLE mig_a (id INTEGER NOT NULL)'] };
    const b = { id: '002_b', up: () => ['CREATE TABLE mig_b (id INTEGER NOT NULL)'] };

    it('stores the sha256 of the statements and an ISO applied_at', async () => {
      const t = await openTestDb(target, { migrated: false });
      try {
        await migrate(t.db, [a], () => new Date('2026-10-12T08:00:00.123Z'));
        const [row] = await t.db.query<{ checksum: string; applied_at: string }>(
          'SELECT checksum, applied_at FROM schema_migrations',
        );
        expect(row).toEqual({
          checksum: checksum(a.up()),
          applied_at: '2026-10-12T08:00:00.123Z',
        });
        expect(row?.checksum).toMatch(/^[0-9a-f]{64}$/);
      } finally {
        await t.close();
      }
    });

    it('applies the real baseline, and a second boot changes nothing', async () => {
      const t = await openTestDb(target, { migrated: false });
      try {
        expect(await migrate(t.db)).toEqual(MIGRATIONS.map((m) => m.id));
        expect(await migrate(t.db)).toEqual([]);
      } finally {
        await t.close();
      }
    });

    it('refuses to boot when an applied migration was edited', async () => {
      const t = await openTestDb(target, { migrated: false });
      try {
        await migrate(t.db, [a]);
        const edited = {
          id: '001_a',
          up: () => ['CREATE TABLE mig_a (id INTEGER NOT NULL, x INTEGER)'],
        };
        const err = await migrate(t.db, [edited]).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(MigrationError);
        expect((err as Error).message).toContain('"001_a" was applied and then changed');
        expect((err as Error).message).toContain('npm run db:reset');
      } finally {
        await t.close();
      }
    });

    it('refuses to boot when an applied id is not in the code', async () => {
      const t = await openTestDb(target, { migrated: false });
      try {
        await migrate(t.db, [a, b]);
        const err = await migrate(t.db, [a]).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(MigrationError);
        expect((err as Error).message).toContain('"002_b" is not in the code');
        expect((err as Error).message).toContain('npm run db:reset');
      } finally {
        await t.close();
      }
    });

    it('refuses a new migration that sorts before an applied one', async () => {
      const t = await openTestDb(target, { migrated: false });
      try {
        await migrate(t.db, [b]);
        const err = await migrate(t.db, [a, b]).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(MigrationError);
        expect((err as Error).message).toContain('sorts before the applied "002_b"');
      } finally {
        await t.close();
      }
    });

    it('explains a schema_migrations table from before checksums', async () => {
      const t = await openTestDb(target, { migrated: false });
      try {
        await t.db.execute(
          'CREATE TABLE schema_migrations (id VARCHAR(100) PRIMARY KEY, applied_at VARCHAR(32) NOT NULL)',
        );
        const err = await migrate(t.db, [a]).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(MigrationError);
        expect((err as Error).message).toContain('npm run db:reset');
      } finally {
        await t.close();
      }
    });

    it('a failing statement leaves the migration unrecorded', async () => {
      const t = await openTestDb(target, { migrated: false });
      try {
        const broken = {
          id: '009_broken',
          up: () => ['CREATE TABLE mig_ok (id INTEGER NOT NULL)', 'NOT SQL'],
        };
        await expect(migrate(t.db, [broken])).rejects.toThrow(/query failed/);
        expect(await recorded(t.db, '009_broken')).toBe(false);
      } finally {
        await t.close();
      }
    });
  });
}

/* Two runners at once (two cold starts, two containers, a deploy racing a preview): Postgres
   serialises them on a transaction-scoped advisory lock, so the loser finds the winner's rows
   and applies nothing, instead of dying on a primary-key or catalog conflict. */
describe.skipIf(!TEST_TARGETS.find((t) => t.driver === 'postgres')?.available)(
  'migrate concurrency (postgres)',
  () => {
    it('two parallel runs on a fresh database both resolve: [all] and []', async () => {
      const target = TEST_TARGETS.find((t) => t.driver === 'postgres');
      if (!target) throw new Error('unreachable');
      const t = await openTestDb(target, { migrated: false });
      const other = await createDbClient(t.url);
      try {
        const results = await Promise.all([migrate(t.db), migrate(other)]);
        const ids = MIGRATIONS.map((m) => m.id);
        expect(results.map((r) => r.length).toSorted()).toEqual([0, ids.length]);
        expect(results.find((r) => r.length > 0)).toEqual(ids);
        const rows = await t.db.query<{ id: string }>('SELECT id FROM schema_migrations');
        expect(rows).toHaveLength(ids.length);
      } finally {
        await other.close();
        await t.close();
      }
    });

    it('gives up on a lock it cannot get instead of queueing forever behind live queries', async () => {
      const target = TEST_TARGETS.find((t) => t.driver === 'postgres');
      if (!target) throw new Error('unreachable');
      const t = await openTestDb(target, { migrated: false });
      try {
        await migrate(t.db, [{ id: '001_a', up: () => ['CREATE TABLE lk (id INTEGER NOT NULL)'] }]);
        // a live query holds a lock on the table the next migration alters
        let release: () => void = () => undefined;
        const held = new Promise<void>((resolve) => {
          release = resolve;
        });
        const holder = t.db.transaction(async (tx) => {
          await tx.execute('LOCK TABLE lk IN ACCESS SHARE MODE');
          await held;
        });
        await new Promise((r) => setTimeout(r, 200));
        const started = Date.now();
        const err = await migrate(t.db, [
          { id: '001_a', up: () => ['CREATE TABLE lk (id INTEGER NOT NULL)'] },
          { id: '002_b', up: () => ['ALTER TABLE lk ADD x INTEGER'] },
        ]).catch((e: unknown) => e);
        release();
        await holder;
        expect(err).toBeInstanceOf(Error);
        expect(Date.now() - started).toBeLessThan(20_000);
        // nothing half applied
        expect(await recorded(t.db, '002_b')).toBe(false);
      } finally {
        await t.close();
      }
    }, 40_000);
  },
);

/* verifySchema: the read-only check a deployed function makes at boot. */
for (const target of TEST_TARGETS) {
  describe.skipIf(!target.available)(`verifySchema (${target.driver})`, () => {
    const a = { id: '001_a', up: () => ['CREATE TABLE ver_a (id INTEGER NOT NULL)'] };
    const b = { id: '002_b', up: () => ['CREATE TABLE ver_b (id INTEGER NOT NULL)'] };
    const c = { id: '003_c', up: () => ['CREATE TABLE ver_c (id INTEGER NOT NULL)'] };

    it('passes on a fully migrated database, and writes nothing', async () => {
      const t = await openTestDb(target);
      try {
        const before = await t.db.query('SELECT id, checksum, applied_at FROM schema_migrations');
        expect(await verifySchema(t.db)).toEqual({ newer: [] });
        expect(await t.db.query('SELECT id, checksum, applied_at FROM schema_migrations')).toEqual(
          before,
        );
      } finally {
        await t.close();
      }
    });

    it('throws SchemaBehindError naming the pending migration', async () => {
      const t = await openTestDb(target, { migrated: false });
      try {
        await migrate(t.db, [a]);
        const err = await verifySchema(t.db, [a, b]).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(SchemaBehindError);
        expect((err as SchemaBehindError).pending).toEqual(['002_b']);
        expect((err as Error).message).toContain('002_b');
      } finally {
        await t.close();
      }
    });

    it('on an empty database says everything is pending and creates nothing', async () => {
      const t = await openTestDb(target, { migrated: false });
      try {
        const err = await verifySchema(t.db, [a, b]).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(SchemaBehindError);
        expect((err as SchemaBehindError).pending).toEqual(['001_a', '002_b']);
        // read-only: not even schema_migrations was created
        await expect(t.db.query('SELECT id FROM schema_migrations')).rejects.toThrow(
          /query failed/,
        );
      } finally {
        await t.close();
      }
    });

    it('allows an applied id newer than the code (a newer deployment migrated) and warns', async () => {
      const t = await openTestDb(target, { migrated: false });
      try {
        await migrate(t.db, [a, b, c]);
        const warnings: unknown[] = [];
        const status = await verifySchema(t.db, [a, b], {
          warn: (message, fields) => warnings.push({ message, fields }),
        });
        expect(status).toEqual({ newer: ['003_c'] });
        expect(warnings).toHaveLength(1);
        expect(JSON.stringify(warnings)).toContain('003_c');
      } finally {
        await t.close();
      }
    });

    it('refuses an unknown applied id that sorts before the code last one', async () => {
      const t = await openTestDb(target, { migrated: false });
      try {
        await migrate(t.db, [a, b, c]);
        const err = await verifySchema(t.db, [a, c]).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(MigrationError);
        expect(err).not.toBeInstanceOf(SchemaBehindError);
        expect((err as Error).message).toContain('"002_b" is not in the code');
      } finally {
        await t.close();
      }
    });

    it('refuses an applied migration whose statements were edited', async () => {
      const t = await openTestDb(target, { migrated: false });
      try {
        await migrate(t.db, [a]);
        const edited = {
          id: '001_a',
          up: () => ['CREATE TABLE ver_a (id INTEGER NOT NULL, x INTEGER)'],
        };
        const err = await verifySchema(t.db, [edited]).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(MigrationError);
        expect((err as Error).message).toContain('"001_a" was applied and then changed');
      } finally {
        await t.close();
      }
    });
  });
}

describe('dialect', () => {
  it('writes the native timestamp type per driver', async () => {
    const { dialectFor } = await import('./migrations/dialect.ts');
    expect(dialectFor('postgres').timestamp).toBe('TIMESTAMPTZ(3)');
    expect(dialectFor('mysql').timestamp).toBe('DATETIME(3)');
    expect(dialectFor('sqlite').timestamp).toBe('TEXT');
  });
});
