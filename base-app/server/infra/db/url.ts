import { DbConfigError } from './errors.ts';
import type { ParsedDbUrl } from './types.ts';

/** Replaces the password in `scheme://user:password@host` and in `password=` query params with `***`. */
export function redactUrl(url: string): string {
  return url
    .replace(/(:\/\/[^:/?#@\s]*:)[^@/?#\s]*@/, '$1***@')
    .replace(/([?&](?:password|pass|pwd)=)[^&#\s]*/gi, '$1***');
}

/**
 * Parses a database URL into a driver and a target.
 * Accepts `sqlite::memory:`, `sqlite:./rel.db`, `sqlite:///abs.db`, `postgres://`,
 * `postgresql://` and `mysql://`. Anything else throws DbConfigError with the URL redacted.
 */
export function parseDatabaseUrl(url: string): ParsedDbUrl {
  if (url.startsWith('sqlite:')) {
    const rest = url.slice('sqlite:'.length);
    if (rest === ':memory:') return { driver: 'sqlite', path: ':memory:' };
    // `sqlite:///abs.db` keeps its leading slash; `sqlite:./rel.db` is relative.
    const path = rest.startsWith('//') ? rest.slice(2) : rest;
    if (path.trim() === '') {
      throw new DbConfigError('sqlite URL has no file path (use sqlite::memory: for memory)');
    }
    return { driver: 'sqlite', path };
  }
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    return { driver: 'postgres', url };
  }
  if (url.startsWith('mysql://')) {
    return { driver: 'mysql', url };
  }
  throw new DbConfigError(
    `unsupported database URL "${redactUrl(url)}": expected sqlite:, postgres://, postgresql:// or mysql://`,
  );
}
