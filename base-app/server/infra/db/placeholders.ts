/**
 * Rewrites `?` placeholders to Postgres `$1..$n`. Question marks inside '...' (with ''
 * escapes), "..." identifiers, `-- line` comments and `/* block *\/` comments are left alone.
 * Dollar-quoted strings ($$...$$) are NOT handled: do not put `?` inside them.
 */
export function toPostgresPlaceholders(sql: string): string {
  let out = '';
  let n = 0;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i] ?? '';
    const next = sql[i + 1] ?? '';
    if (ch === "'" || ch === '"') {
      const end = findClosingQuote(sql, i, ch);
      out += sql.slice(i, end);
      i = end;
    } else if (ch === '-' && next === '-') {
      const nl = sql.indexOf('\n', i);
      const end = nl === -1 ? sql.length : nl;
      out += sql.slice(i, end);
      i = end;
    } else if (ch === '/' && next === '*') {
      const close = sql.indexOf('*/', i + 2);
      const end = close === -1 ? sql.length : close + 2;
      out += sql.slice(i, end);
      i = end;
    } else if (ch === '?') {
      n += 1;
      out += `$${n}`;
      i += 1;
    } else {
      out += ch;
      i += 1;
    }
  }
  return out;
}

/** Returns the index just past the closing quote; a doubled quote is an escape. */
function findClosingQuote(sql: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < sql.length) {
    if (sql[i] === quote) {
      if (sql[i + 1] === quote) {
        i += 2;
        continue;
      }
      return i + 1;
    }
    i += 1;
  }
  return sql.length;
}
