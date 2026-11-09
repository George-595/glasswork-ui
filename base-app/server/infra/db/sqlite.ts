import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { DbQueryError } from './errors.ts';
import type { DbClient, DbExecutor, ExecResult, Row, SqlParam } from './types.ts';

type NativeParam = string | number | bigint | Uint8Array | null;

/** node:sqlite has no boolean or Date type: booleans become 1/0, dates become ISO text. */
function toNativeParam(p: SqlParam): NativeParam {
  if (typeof p === 'boolean') return p ? 1 : 0;
  if (p instanceof Date) return p.toISOString();
  return p;
}

/**
 * Opens a SQLite database with the built-in node:sqlite module. `path` is ':memory:' or a
 * filesystem path; for a file, its parent directory is created if missing.
 */
export function createSqliteClient(path: string): DbClient {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  // Off by default in SQLite and per connection: without it every foreign key is decoration.
  db.exec('PRAGMA foreign_keys = ON');
  let closed = false;

  // node:sqlite is synchronous, so the lock only orders async callers. A transaction holds
  // it for its whole duration; statements inside the transaction bypass it (see `txExec`).
  let lock: Promise<void> = Promise.resolve();
  const withLock = <T>(fn: () => Promise<T>): Promise<T> => {
    const result = lock.then(fn);
    lock = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  };

  const assertOpen = (): void => {
    if (closed) throw new DbQueryError('sqlite', new Error('database is closed'));
  };

  const runQuery = <T extends Row>(sql: string, params: readonly SqlParam[] = []): T[] => {
    assertOpen();
    try {
      const stmt = db.prepare(sql);
      return stmt.all(...params.map(toNativeParam)) as T[];
    } catch (err) {
      throw new DbQueryError('sqlite', err);
    }
  };

  const runExecute = (sql: string, params: readonly SqlParam[] = []): ExecResult => {
    assertOpen();
    try {
      const result = db.prepare(sql).run(...params.map(toNativeParam));
      return { rowsAffected: Number(result.changes), lastInsertId: result.lastInsertRowid };
    } catch (err) {
      throw new DbQueryError('sqlite', err);
    }
  };

  const txExec: DbExecutor = {
    driver: 'sqlite',
    query: async <T extends Row = Row>(sql: string, params?: readonly SqlParam[]) =>
      runQuery<T>(sql, params),
    execute: async (sql, params) => runExecute(sql, params),
  };

  return {
    driver: 'sqlite',
    query: <T extends Row = Row>(sql: string, params?: readonly SqlParam[]) =>
      withLock(async () => runQuery<T>(sql, params)),
    execute: (sql, params) => withLock(async () => runExecute(sql, params)),
    transaction: <T>(fn: (tx: DbExecutor) => Promise<T>) =>
      withLock(async () => {
        assertOpen();
        db.exec('BEGIN');
        try {
          const out = await fn(txExec);
          db.exec('COMMIT');
          return out;
        } catch (err) {
          // fn may already have ended the transaction; keep the original error.
          if (db.isTransaction) db.exec('ROLLBACK');
          throw err;
        }
      }),
    ping: () =>
      withLock(async () => {
        const started = performance.now();
        runQuery('SELECT 1 AS ok');
        return { latencyMs: performance.now() - started };
      }),
    close: () =>
      withLock(async () => {
        if (closed) return;
        closed = true;
        db.close();
      }),
  };
}
