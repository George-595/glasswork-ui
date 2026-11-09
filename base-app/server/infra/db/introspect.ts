import type { DbClient } from './types.ts';

/* For tests only. Reads the live schema of any of the three databases into one shape, so one
   suite (the schema-conventions one) can hold all of them to the same conventions.

   Per driver the catalogue is different: sqlite_master + PRAGMAs; pg_catalog (pg_constraint,
   pg_index) and information_schema on Postgres; information_schema on MySQL. Known limits,
   which the test accounts for:
   - MySQL ignores the name of a PRIMARY KEY constraint: it is always `PRIMARY`.
   - SQLite keeps constraint names only in the CREATE TABLE text, so names are read from there. */
export interface ColumnInfo {
  name: string;
  /** The type as the catalogue reports it, lower-cased: 'timestamp with time zone', 'datetime', 'text'... */
  type: string;
  /** Fractional-second precision for date/time types, else null. */
  precision: number | null;
  nullable: boolean;
}
export interface ForeignKeyInfo {
  name: string;
  columns: string[];
  refTable: string;
  /** 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION' | 'SET DEFAULT' */
  onDelete: string;
}
export interface IndexInfo {
  name: string;
  columns: string[];
  unique: boolean;
}
export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  primaryKey: { name: string; columns: string[] } | null;
  foreignKeys: ForeignKeyInfo[];
  /** Every index except the primary key's own. */
  indexes: IndexInfo[];
  checks: string[];
}

const split = (s: unknown): string[] => (typeof s === 'string' && s !== '' ? s.split(',') : []);
const ruleName = (s: string): string => s.toUpperCase();

export async function introspect(db: DbClient): Promise<TableInfo[]> {
  switch (db.driver) {
    case 'sqlite':
      return sqlite(db);
    case 'postgres':
      return postgres(db);
    case 'mysql':
      return mysql(db);
  }
}

async function sqlite(db: DbClient): Promise<TableInfo[]> {
  const tables = await db.query<{ name: string; sql: string }>(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
  );
  const out: TableInfo[] = [];
  for (const t of tables) {
    const cols = await db.query<{
      name: string;
      type: string;
      notnull: number;
      pk: number;
    }>(`PRAGMA table_info(${t.name})`);
    const pkCols = cols
      .filter((c) => Number(c.pk) > 0)
      .toSorted((a, b) => Number(a.pk) - Number(b.pk))
      .map((c) => c.name);
    const pkName = /CONSTRAINT\s+(\w+)\s+PRIMARY KEY/i.exec(t.sql)?.[1];

    const fkRows = await db.query<{ id: number; from: string; table: string; on_delete: string }>(
      `PRAGMA foreign_key_list(${t.name})`,
    );
    const fkNames = new Map<string, string>(); // column -> constraint name, from the DDL text
    for (const m of t.sql.matchAll(/CONSTRAINT\s+(\w+)\s+FOREIGN KEY\s*\(([^)]+)\)/gi)) {
      fkNames.set((m[2] ?? '').trim(), m[1] ?? '');
    }
    const fks = new Map<number, ForeignKeyInfo>();
    for (const r of fkRows) {
      const id = Number(r.id);
      const fk = fks.get(id) ?? {
        name: fkNames.get(r.from) ?? `(unnamed fk on ${r.from})`,
        columns: [],
        refTable: r.table,
        onDelete: ruleName(r.on_delete),
      };
      fk.columns.push(r.from);
      fks.set(id, fk);
    }

    const idxList = await db.query<{ name: string; unique: number; origin: string }>(
      `PRAGMA index_list(${t.name})`,
    );
    const indexes: IndexInfo[] = [];
    for (const i of idxList) {
      if (i.origin === 'pk') continue;
      const info = await db.query<{ seqno: number; name: string }>(`PRAGMA index_info(${i.name})`);
      indexes.push({
        name: i.name,
        columns: info.toSorted((a, b) => Number(a.seqno) - Number(b.seqno)).map((c) => c.name),
        unique: Number(i.unique) === 1,
      });
    }

    out.push({
      name: t.name,
      columns: cols.map((c) => ({
        name: c.name,
        type: c.type.toLowerCase(),
        precision: null,
        // a PRIMARY KEY column is NOT NULL here too: the DDL says so explicitly
        nullable: Number(c.notnull) === 0 && Number(c.pk) === 0,
      })),
      primaryKey: pkName ? { name: pkName, columns: pkCols } : null,
      foreignKeys: [...fks.values()],
      indexes,
      checks: [...t.sql.matchAll(/CONSTRAINT\s+(\w+)\s+CHECK/gi)].map((m) => m[1] ?? ''),
    });
  }
  return out;
}

async function postgres(db: DbClient): Promise<TableInfo[]> {
  const tables = await db.query<{ name: string }>(
    `SELECT table_name AS name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`,
  );
  const cols = await db.query<{
    t: string;
    name: string;
    type: string;
    precision: number | null;
    nullable: string;
  }>(
    `SELECT table_name AS t, column_name AS name, data_type AS type,
            datetime_precision AS precision, is_nullable AS nullable
     FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position`,
  );
  const cons = await db.query<{
    t: string;
    name: string;
    kind: string;
    del: string;
    ref: string | null;
    cols: string;
  }>(
    `SELECT t.relname AS t, c.conname AS name, c.contype AS kind, c.confdeltype AS del,
            rt.relname AS ref,
            (SELECT string_agg(a.attname::text, ',' ORDER BY k.ord)
               FROM unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum) AS cols
     FROM pg_constraint c
     JOIN pg_class t ON t.oid = c.conrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     LEFT JOIN pg_class rt ON rt.oid = c.confrelid
     WHERE n.nspname = 'public'`,
  );
  const idx = await db.query<{ t: string; name: string; uniq: boolean; cols: string }>(
    `SELECT t.relname AS t, i.relname AS name, ix.indisunique AS uniq,
            (SELECT string_agg(a.attname::text, ',' ORDER BY k.ord)
               FROM unnest(ix.indkey::int2[]) WITH ORDINALITY AS k(attnum, ord)
               JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum) AS cols
     FROM pg_index ix
     JOIN pg_class t ON t.oid = ix.indrelid
     JOIN pg_class i ON i.oid = ix.indexrelid
     JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = 'public' AND NOT ix.indisprimary`,
  );
  const delRule: Record<string, string> = {
    a: 'NO ACTION',
    r: 'RESTRICT',
    c: 'CASCADE',
    n: 'SET NULL',
    d: 'SET DEFAULT',
  };
  return tables.map((t) => {
    const mine = cons.filter((c) => c.t === t.name);
    const pk = mine.find((c) => c.kind === 'p');
    return {
      name: t.name,
      columns: cols
        .filter((c) => c.t === t.name)
        .map((c) => ({
          name: c.name,
          type: c.type,
          precision: c.precision === null ? null : Number(c.precision),
          nullable: c.nullable === 'YES',
        })),
      primaryKey: pk ? { name: pk.name, columns: split(pk.cols) } : null,
      foreignKeys: mine
        .filter((c) => c.kind === 'f')
        .map((c) => ({
          name: c.name,
          columns: split(c.cols),
          refTable: c.ref ?? '',
          onDelete: delRule[c.del] ?? c.del,
        })),
      indexes: idx
        .filter((i) => i.t === t.name)
        .map((i) => ({ name: i.name, columns: split(i.cols), unique: i.uniq })),
      checks: mine.filter((c) => c.kind === 'c').map((c) => c.name),
    };
  });
}

async function mysql(db: DbClient): Promise<TableInfo[]> {
  const tables = await db.query<{ name: string }>(
    `SELECT TABLE_NAME AS name FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`,
  );
  const cols = await db.query<{
    t: string;
    name: string;
    type: string;
    prec: number | null;
    nullable: string;
  }>(
    `SELECT TABLE_NAME AS t, COLUMN_NAME AS name, DATA_TYPE AS type,
            DATETIME_PRECISION AS prec, IS_NULLABLE AS nullable
     FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME, ORDINAL_POSITION`,
  );
  const stats = await db.query<{
    t: string;
    name: string;
    non_unique: number;
    cols: string;
  }>(
    `SELECT TABLE_NAME AS t, INDEX_NAME AS name, MIN(NON_UNIQUE) AS non_unique,
            GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX SEPARATOR ',') AS cols
     FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE()
     GROUP BY TABLE_NAME, INDEX_NAME`,
  );
  const fks = await db.query<{
    t: string;
    name: string;
    ref: string;
    del: string;
    cols: string;
  }>(
    `SELECT r.TABLE_NAME AS t, r.CONSTRAINT_NAME AS name, r.REFERENCED_TABLE_NAME AS ref,
            r.DELETE_RULE AS del,
            (SELECT GROUP_CONCAT(k.COLUMN_NAME ORDER BY k.ORDINAL_POSITION SEPARATOR ',')
               FROM information_schema.KEY_COLUMN_USAGE k
              WHERE k.CONSTRAINT_SCHEMA = r.CONSTRAINT_SCHEMA AND k.CONSTRAINT_NAME = r.CONSTRAINT_NAME
                AND k.TABLE_NAME = r.TABLE_NAME) AS cols
     FROM information_schema.REFERENTIAL_CONSTRAINTS r WHERE r.CONSTRAINT_SCHEMA = DATABASE()`,
  );
  const checks = await db.query<{ t: string; name: string }>(
    `SELECT tc.TABLE_NAME AS t, tc.CONSTRAINT_NAME AS name
     FROM information_schema.TABLE_CONSTRAINTS tc
     WHERE tc.TABLE_SCHEMA = DATABASE() AND tc.CONSTRAINT_TYPE = 'CHECK'`,
  );
  return tables.map((t) => {
    const pk = stats.find((s) => s.t === t.name && s.name === 'PRIMARY');
    return {
      name: t.name,
      columns: cols
        .filter((c) => c.t === t.name)
        .map((c) => ({
          name: c.name,
          type: c.type.toLowerCase(),
          precision: c.prec === null ? null : Number(c.prec),
          nullable: c.nullable === 'YES',
        })),
      primaryKey: pk ? { name: 'PRIMARY', columns: split(pk.cols) } : null,
      foreignKeys: fks
        .filter((f) => f.t === t.name)
        .map((f) => ({
          name: f.name,
          columns: split(f.cols),
          refTable: f.ref,
          onDelete: ruleName(f.del),
        })),
      indexes: stats
        .filter((s) => s.t === t.name && s.name !== 'PRIMARY')
        .map((s) => ({ name: s.name, columns: split(s.cols), unique: Number(s.non_unique) === 0 })),
      checks: checks.filter((c) => c.t === t.name).map((c) => c.name),
    };
  });
}
