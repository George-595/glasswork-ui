import type { DbDriver } from './types.ts';

/** A database URL or configuration is invalid. The message never contains credentials. */
export class DbConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DbConfigError';
  }
}

/**
 * A statement failed on a driver. The message names the driver and the driver's error
 * code only. The original error is kept as `cause` for code that needs it; do not log it
 * unredacted.
 */
export class DbQueryError extends Error {
  readonly driver: DbDriver;
  readonly code: string | undefined;

  constructor(driver: DbDriver, cause: unknown) {
    const code = codeOf(cause);
    super(`${driver} query failed${code ? ` (${code})` : ''}`, { cause });
    this.name = 'DbQueryError';
    this.driver = driver;
    this.code = code;
  }
}

function codeOf(err: unknown): string | undefined {
  if (typeof err === 'object' && err !== null && 'code' in err) {
    const code = (err as { code: unknown }).code;
    if (typeof code === 'string' && /^[A-Za-z0-9_]{1,64}$/.test(code)) return code;
  }
  return undefined;
}

/** True when `err` is a unique or primary key violation on any driver. */
export function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof DbQueryError)) return false;
  const cause = err.cause as { code?: unknown; errno?: unknown; errcode?: unknown } | undefined;
  if (err.driver === 'postgres') return cause?.code === '23505';
  if (err.driver === 'mysql') return cause?.code === 'ER_DUP_ENTRY' || cause?.errno === 1062;
  // SQLITE_CONSTRAINT_PRIMARYKEY 1555, SQLITE_CONSTRAINT_UNIQUE 2067
  return cause?.errcode === 1555 || cause?.errcode === 2067;
}
