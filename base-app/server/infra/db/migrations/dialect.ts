import type { DbDriver } from '../types.ts';

/* The few places the three databases spell a column differently, in one place, so a
   migration reads as one schema and not three. Everything else in a migration is plain
   SQL that all three accept. Use the fields inside the migration's template strings:

     const d = dialectFor(driver);
     `CREATE TABLE users (id ${d.id} NOT NULL, created_at ${d.timestamp} NOT NULL, ...)`

   Timestamps (the contract, ENGINEERING §7 "Database design"): the column is native where
   the database has a native type, and every driver hands them back as ISO-8601 UTC text with
   milliseconds (`2026-10-12T08:30:00.123Z`), whatever the column type. */
export interface Dialect {
  driver: DbDriver;
  /** Primary and foreign key columns: a UUIDv7 string. VARCHAR(36), not CHAR(36), because
      Postgres pads CHAR with spaces, which would corrupt the readable seed ids. */
  id: string;
  /** A point in time, UTC, millisecond precision. */
  timestamp: string;
  /** 64-bit integer: money in minor units, byte sizes. */
  bigint: string;
  /** Unbounded text: JSON payloads, bodies, error messages. Never indexed. */
  text: string;
  /** 0/1 flag where a nullable `_at` column will not do. Pair it with a CHECK (x IN (0, 1)). */
  flag: string;
  /** Raw bytes (a stored photo): BYTEA / LONGBLOB / BLOB. Bound as a Uint8Array, read back as a Buffer
      or Uint8Array. Never indexed. */
  blob: string;
  /** A timestamp literal for a seed row written in a migration (no bound parameters there). */
  timestampLiteral(iso: string): string;
  /** CHECK expression: `column` holds no upper-case letters. MySQL's default collation is
      case-insensitive, so a plain `col = LOWER(col)` would always be true there. */
  isLowerCase(column: string): string;
}

export function dialectFor(driver: DbDriver): Dialect {
  switch (driver) {
    case 'postgres':
      return {
        driver,
        id: 'VARCHAR(36)',
        timestamp: 'TIMESTAMPTZ(3)',
        bigint: 'BIGINT',
        text: 'TEXT',
        flag: 'SMALLINT',
        blob: 'BYTEA',
        timestampLiteral: (iso) => `'${iso.replace('T', ' ').replace('Z', '+00')}'`,
        isLowerCase: (c) => `${c} = LOWER(${c})`,
      };
    case 'mysql':
      return {
        driver,
        id: 'VARCHAR(36)',
        timestamp: 'DATETIME(3)',
        bigint: 'BIGINT',
        text: 'MEDIUMTEXT',
        flag: 'SMALLINT',
        blob: 'LONGBLOB',
        timestampLiteral: (iso) => `'${iso.replace('T', ' ').replace('Z', '')}'`,
        isLowerCase: (c) => `CAST(${c} AS BINARY) = CAST(LOWER(${c}) AS BINARY)`,
      };
    case 'sqlite':
      return {
        driver,
        id: 'VARCHAR(36)',
        // SQLite has no date type: ISO-8601 text sorts and compares correctly as it is.
        timestamp: 'TEXT',
        bigint: 'BIGINT',
        text: 'TEXT',
        flag: 'SMALLINT',
        blob: 'BLOB',
        timestampLiteral: (iso) => `'${iso}'`,
        isLowerCase: (c) => `${c} = LOWER(${c})`,
      };
  }
}
