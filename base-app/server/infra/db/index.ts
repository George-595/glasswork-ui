import { createMysqlClient } from './mysql.ts';
import { createPostgresClient, type PostgresOptions } from './postgres.ts';
import { createSqliteClient } from './sqlite.ts';
import type { DbClient } from './types.ts';
import { parseDatabaseUrl } from './url.ts';

export { DbConfigError, DbQueryError, isUniqueViolation } from './errors.ts';
export { toPostgresPlaceholders } from './placeholders.ts';
export type {
  DbClient,
  DbDriver,
  DbExecutor,
  ExecResult,
  ParsedDbUrl,
  Row,
  SqlParam,
} from './types.ts';
export { parseDatabaseUrl, redactUrl } from './url.ts';

/**
 * Opens the database named by `url`. The Postgres and MySQL driver modules load their
 * packages (`pg`, `mysql2`) only when that driver is chosen.
 */
export async function createDbClient(
  url: string,
  options: PostgresOptions = {},
): Promise<DbClient> {
  const parsed = parseDatabaseUrl(url);
  switch (parsed.driver) {
    case 'sqlite':
      return createSqliteClient(parsed.path);
    case 'postgres':
      return createPostgresClient(parsed.url, options);
    case 'mysql':
      return createMysqlClient(parsed.url);
  }
}
export { type AfterCommitHook, afterCommit, withAfterCommit } from './after-commit.ts';
