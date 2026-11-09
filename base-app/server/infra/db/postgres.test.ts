import { describe, expect, it } from 'vitest';
import { POSTGRES_TIMEOUTS, postgresPoolConfig } from './postgres.ts';
import { openTestDb, TEST_TARGETS } from './test-databases.ts';

describe('the Postgres pool configuration', () => {
  it('never waits forever: connection, idle and query limits are all set', () => {
    const cfg = postgresPoolConfig('postgres://u:p@h/db', { poolMax: 3 });
    expect(cfg).toMatchObject({
      connectionString: 'postgres://u:p@h/db',
      max: 3,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 10_000,
      query_timeout: 30_000,
      statement_timeout: 30_000,
    });
    expect(Object.values(POSTGRES_TIMEOUTS).every((v) => v > 0)).toBe(true);
  });

  it('defaults to 10 connections, and a longer statement limit is for the migrator only', () => {
    expect(postgresPoolConfig('postgres://x').max).toBe(10);
    const long = postgresPoolConfig('postgres://x', { statementTimeoutMs: 120_000 });
    expect(long.statement_timeout).toBe(120_000);
    expect(long.query_timeout).toBeGreaterThan(120_000);
  });
});

const pg = TEST_TARGETS.find((t) => t.driver === 'postgres');
describe.skipIf(!pg?.available)('the Postgres pool against a real server', () => {
  it('cancels a statement that runs past statement_timeout', async () => {
    if (!pg) throw new Error('unreachable');
    const t = await openTestDb(pg, { migrated: false });
    try {
      // the throwaway database's client has the 30 s limit; ask the server to apply 1 s for one
      // transaction to prove the server side is what cancels (pg_sleep(3) > 1 s)
      const err = await t.db
        .transaction(async (tx) => {
          await tx.execute("SET LOCAL statement_timeout = '1s'");
          await tx.query('SELECT pg_sleep(3)');
        })
        .catch((e: unknown) => e);
      expect((err as { code?: string }).code).toBe('57014'); // query_canceled
    } finally {
      await t.close();
    }
  }, 20_000);

  it('gives up on a statement that never answers, instead of hanging the request', async () => {
    if (!pg?.url) throw new Error('unreachable');
    const { createDbClient } = await import('./index.ts');
    // Neon ignores the startup statement_timeout (the role setting is its
    // server-side limit), so the client-side query_timeout is what is proved here: 0.5 s + 5 s.
    const db = await createDbClient(pg.url, { poolMax: 1, statementTimeoutMs: 500 });
    try {
      const started = Date.now();
      const err = await db.query('SELECT pg_sleep(30)').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(Error);
      expect(Date.now() - started).toBeLessThan(10_000);
    } finally {
      await db.close();
    }
  }, 20_000);
});
