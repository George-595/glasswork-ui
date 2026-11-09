import type { Pool, PoolClient, PoolConfig } from 'pg';
import { DbQueryError } from './errors.ts';
import { toPostgresPlaceholders } from './placeholders.ts';
import type { DbClient, DbExecutor, ExecResult, Row, SqlParam } from './types.ts';

/** The part of a pg Pool or PoolClient this module uses. */
interface Queryable {
  query(text: string, values: unknown[]): Promise<{ rows: unknown[]; rowCount: number | null }>;
}

/** pg has no bigint or Uint8Array mapping we rely on, so both are converted explicitly. */
function toPgParam(p: SqlParam): string | number | boolean | Buffer | null {
  if (typeof p === 'bigint') return p.toString();
  // A Date goes as UTC ISO text, never through pg's local-time formatting.
  if (p instanceof Date) return p.toISOString();
  if (p instanceof Uint8Array) return Buffer.from(p);
  return p;
}

async function runQuery<T extends Row>(
  exec: Queryable,
  sql: string,
  params: readonly SqlParam[] = [],
): Promise<T[]> {
  try {
    const res = await exec.query(toPostgresPlaceholders(sql), params.map(toPgParam));
    return res.rows as T[];
  } catch (err) {
    throw new DbQueryError('postgres', err);
  }
}

async function runExecute(
  exec: Queryable,
  sql: string,
  params: readonly SqlParam[] = [],
): Promise<ExecResult> {
  try {
    const res = await exec.query(toPostgresPlaceholders(sql), params.map(toPgParam));
    return { rowsAffected: res.rowCount ?? 0 };
  } catch (err) {
    throw new DbQueryError('postgres', err);
  }
}

function executorFor(client: PoolClient): DbExecutor {
  return {
    driver: 'postgres',
    query: <T extends Row = Row>(sql: string, params?: readonly SqlParam[]) =>
      runQuery<T>(client, sql, params),
    execute: (sql, params) => runExecute(client, sql, params),
  };
}

/* Timeouts, because on a serverless host (Neon on Vercel) a stalled network or a slow query would
   otherwise hang a request until the platform kills the function (120 s on Vercel), and a
   connection left `idle in transaction` holds its row locks and blocks every other writer of those
   rows until the server drops it.
   - connectionTimeoutMillis: waiting for a free pooled connection or a new one;
   - idleTimeoutMillis: an idle client is closed after 10 s, so little sits open when a function
     is frozen (api/index.ts keeps the instance alive that long);
   - query_timeout (client side, the promise rejects) and statement_timeout (server side, the
     statement is cancelled): 30 s.
   The pooled Neon endpoint rejects startup `options`, so `idle_in_transaction_session_timeout`
   cannot be set here: set it on the database role instead. */
export const POSTGRES_TIMEOUTS = {
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10_000,
  query_timeout: 30_000,
  statement_timeout: 30_000,
} as const;

export interface PostgresOptions {
  poolMax?: number;
  /** Replaces the 30 s statement limit (the migration CLI allows a long DDL statement 120 s). */
  statementTimeoutMs?: number;
}

/** The pg Pool options for `url`. Exported for the test. */
export function postgresPoolConfig(
  url: string,
  options: PostgresOptions = {},
): Pick<PoolConfig, 'connectionString' | 'max'> & Record<keyof typeof POSTGRES_TIMEOUTS, number> {
  const limit = options.statementTimeoutMs;
  return {
    connectionString: url,
    max: options.poolMax ?? 10,
    ...POSTGRES_TIMEOUTS,
    // the client gives up a little after the server cancels, so the server's error wins
    ...(limit ? { statement_timeout: limit, query_timeout: limit + 5_000 } : {}),
  };
}

/**
 * Creates a Postgres client. `pg` is loaded here, lazily, so a SQLite-only process never
 * imports it. SQL uses `?`; it is rewritten to `$n` before it reaches pg.
 */
export async function createPostgresClient(
  url: string,
  options: PostgresOptions = {},
): Promise<DbClient> {
  const { default: pg } = await import('pg');
  // The timestamp contract: TIMESTAMPTZ columns come back as ISO-8601 UTC text with
  // milliseconds (pg's default is a JS Date). Set on this pool only, not globally.
  const TIMESTAMPTZ = 1184;
  const types = {
    getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
      oid === TIMESTAMPTZ
        ? (v: string) => new Date(v).toISOString()
        : pg.types.getTypeParser(oid, format as 'text')) as typeof pg.types.getTypeParser,
  };
  const pool: Pool = new pg.Pool({ ...postgresPoolConfig(url, options), types });
  // An idle client that errors is discarded by pg; the next query reports the failure.
  pool.on('error', () => undefined);

  return {
    driver: 'postgres',
    query: <T extends Row = Row>(sql: string, params?: readonly SqlParam[]) =>
      runQuery<T>(pool, sql, params),
    execute: (sql, params) => runExecute(pool, sql, params),
    transaction: async <T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> => {
      const client = await pool.connect();
      let broken = false;
      try {
        await client.query('BEGIN');
        const out = await fn(executorFor(client));
        await client.query('COMMIT');
        return out;
      } catch (err) {
        broken = true;
        try {
          await client.query('ROLLBACK');
          broken = false;
        } catch {
          // The connection is discarded below; the original error is what the caller sees.
        }
        throw err;
      } finally {
        // release(true) destroys the connection instead of returning it to the pool.
        client.release(broken);
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
