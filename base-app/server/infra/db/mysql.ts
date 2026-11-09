import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { DbQueryError } from './errors.ts';
import type { DbClient, DbExecutor, ExecResult, Row, SqlParam } from './types.ts';

/** Booleans become 1/0 and bigints become decimal text; Buffers pass through as Uint8Array. */
function toMysqlParam(p: SqlParam): string | number | Date | Buffer | null {
  if (typeof p === 'boolean') return p ? 1 : 0;
  if (typeof p === 'bigint') return p.toString();
  if (p instanceof Uint8Array) return Buffer.from(p);
  return p;
}

/** The timestamp contract: DATETIME columns arrive as Date (read as UTC, see `timezone`
    below) and leave as ISO-8601 UTC text with milliseconds. */
function isoRows<T extends Row>(rows: unknown[]): T[] {
  for (const row of rows as Record<string, unknown>[]) {
    for (const key of Object.keys(row)) {
      const v = row[key];
      if (v instanceof Date) row[key] = Number.isNaN(v.getTime()) ? null : v.toISOString();
    }
  }
  return rows as T[];
}

async function runQuery<T extends Row>(
  conn: Pool | PoolConnection,
  sql: string,
  params: readonly SqlParam[] = [],
): Promise<T[]> {
  try {
    const [rows] = await conn.execute<RowDataPacket[]>(sql, params.map(toMysqlParam));
    return isoRows<T>(rows);
  } catch (err) {
    throw new DbQueryError('mysql', err);
  }
}

async function runExecute(
  conn: Pool | PoolConnection,
  sql: string,
  params: readonly SqlParam[] = [],
): Promise<ExecResult> {
  try {
    const [header] = await conn.execute<ResultSetHeader>(sql, params.map(toMysqlParam));
    return { rowsAffected: header.affectedRows, lastInsertId: header.insertId };
  } catch (err) {
    throw new DbQueryError('mysql', err);
  }
}

function executorFor(conn: PoolConnection): DbExecutor {
  return {
    driver: 'mysql',
    query: <T extends Row = Row>(sql: string, params?: readonly SqlParam[]) =>
      runQuery<T>(conn, sql, params),
    execute: (sql, params) => runExecute(conn, sql, params),
  };
}

/**
 * Creates a MySQL client. `mysql2` is loaded here, lazily, so a SQLite-only process never
 * imports it. `query` and `execute` use mysql2 prepared statements (`pool.execute`).
 */
export async function createMysqlClient(url: string): Promise<DbClient> {
  const { default: mysql } = await import('mysql2/promise');
  const pool: Pool = mysql.createPool({
    uri: url,
    connectionLimit: 10,
    // Bind and read DATETIME as UTC whatever the server's or this process's time zone is.
    timezone: 'Z',
    // BIGINT arrives as a number, or a string only when it would lose precision.
    supportBigNumbers: true,
  });

  return {
    driver: 'mysql',
    query: <T extends Row = Row>(sql: string, params?: readonly SqlParam[]) =>
      runQuery<T>(pool, sql, params),
    execute: (sql, params) => runExecute(pool, sql, params),
    transaction: async <T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> => {
      const conn = await pool.getConnection();
      let broken = false;
      try {
        await conn.beginTransaction();
        const out = await fn(executorFor(conn));
        await conn.commit();
        return out;
      } catch (err) {
        broken = true;
        try {
          await conn.rollback();
          broken = false;
        } catch {
          // The connection is destroyed below; the original error is what the caller sees.
        }
        throw err;
      } finally {
        // A connection whose rollback failed is destroyed rather than returned to the pool.
        if (broken) conn.destroy();
        else conn.release();
      }
    },
    ping: async () => {
      const started = performance.now();
      await runQuery(pool, 'SELECT 1 AS ok');
      return { latencyMs: performance.now() - started };
    },
    close: () => pool.end(),
  };
}
