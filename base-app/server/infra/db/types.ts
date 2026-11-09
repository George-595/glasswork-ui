/* The one database interface every driver implements. Callers depend on these
   types only, never on a driver file. */
export type DbDriver = 'sqlite' | 'postgres' | 'mysql';
export type SqlParam = string | number | bigint | boolean | null | Date | Uint8Array;
export type Row = Record<string, unknown>;
export interface ExecResult {
  rowsAffected: number;
  lastInsertId?: number | bigint | string;
}
export interface DbExecutor {
  /** Which database this is, for the rare statement the dialects spell differently
      (a repository's conflict-ignoring insert). Everything else stays portable SQL. */
  readonly driver: DbDriver;
  /** SQL uses `?` positional placeholders on every driver (postgres is rewritten to $n). */
  query<T extends Row = Row>(sql: string, params?: readonly SqlParam[]): Promise<T[]>;
  execute(sql: string, params?: readonly SqlParam[]): Promise<ExecResult>;
}
export interface DbClient extends DbExecutor {
  /** Commits if fn resolves, rolls back and rethrows if it rejects. Nested calls are not supported. */
  transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T>;
  ping(): Promise<{ latencyMs: number }>;
  close(): Promise<void>;
}
export type ParsedDbUrl =
  | { driver: 'sqlite'; path: string /* ':memory:' or a filesystem path */ }
  | { driver: 'postgres' | 'mysql'; url: string };
