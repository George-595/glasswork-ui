import { randomUUID } from 'node:crypto';
import { createDbClient } from './index.ts';
import { migrate } from './migrate.ts';
import type { DbClient, DbDriver } from './types.ts';

/* Test-only. One fresh, migrated database per call, on any of the three drivers, so the same
   suite can run on all of them (repository contract tests, schema-conventions test).

   SQLite is always available (a new :memory: database). Postgres and MySQL are available when
   TEST_POSTGRES_URL / TEST_MYSQL_URL are set (`npm run test:db` sets them for the compose
   containers). For those, the URL names a database the user can CREATE DATABASE from; each
   call creates its own throwaway database next to it and drops it on close, so test files run
   in parallel without seeing each other's tables and a failed run leaves nothing behind but
   an empty `t_…` database (which the next `npm run db:reset` removes). */
export interface TestTarget {
  driver: DbDriver;
  /** The server URL from the environment; undefined for SQLite. */
  url: string | undefined;
  /** False when the environment does not provide this driver (the suite is skipped). */
  available: boolean;
}

export const TEST_TARGETS: readonly TestTarget[] = [
  { driver: 'sqlite', url: undefined, available: true },
  {
    driver: 'postgres',
    url: process.env.TEST_POSTGRES_URL || undefined,
    available: !!process.env.TEST_POSTGRES_URL,
  },
  {
    driver: 'mysql',
    url: process.env.TEST_MYSQL_URL || undefined,
    available: !!process.env.TEST_MYSQL_URL,
  },
];

export interface TestDb {
  db: DbClient;
  /** The throwaway database's URL (SQLite: ':memory:'). */
  url: string;
  close(): Promise<void>;
}

export async function openTestDb(
  target: TestTarget,
  opts: { migrated?: boolean } = {},
): Promise<TestDb> {
  const migrated = opts.migrated ?? true;
  if (target.driver === 'sqlite') {
    const db = await createDbClient('sqlite::memory:');
    if (migrated) await migrate(db);
    return { db, url: 'sqlite::memory:', close: () => db.close() };
  }

  if (!target.url) throw new Error(`no test URL for ${target.driver}`);
  const name = `t_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
  const admin = await createDbClient(target.url);
  await admin.execute(
    target.driver === 'mysql'
      ? `CREATE DATABASE ${name} CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`
      : `CREATE DATABASE ${name}`,
  );
  const own = new URL(target.url);
  own.pathname = `/${name}`;
  const db = await createDbClient(own.toString());
  try {
    if (migrated) await migrate(db);
  } catch (err) {
    await db.close();
    await admin.execute(`DROP DATABASE ${name}`);
    await admin.close();
    throw err;
  }
  return {
    db,
    url: own.toString(),
    close: async () => {
      await db.close();
      await admin.execute(`DROP DATABASE IF EXISTS ${name}`);
      await admin.close();
    },
  };
}
