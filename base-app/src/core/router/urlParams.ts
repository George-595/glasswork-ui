/* The pure half of useUrlState: typed query parameters in the address
   ('/table?q=foo&status=paid,failed&page=2&sort=-date'). A parameter
   declares its default, how to read the raw text and how to write a value
   back; a value equal to the default writes nothing, so the URL stays short
   and "no parameters" always means "the defaults". */

export interface UrlParam<T> {
  readonly default: T;
  /** Raw text (null when absent) to a value. Anything unreadable gives the default. */
  read(raw: string | null): T;
  /** A value to its text, or null when it equals the default (the parameter is then dropped). */
  write(value: T): string | null;
}

/* Lists travel as one comma-separated parameter ('status=paid,failed'), so an
   item cannot itself contain a comma. */
const sameList = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

export const param = {
  /** Free text. The empty string is the same as absent unless the default says otherwise. */
  string(def = ''): UrlParam<string> {
    return {
      default: def,
      read: (raw) => (raw === null ? def : raw),
      write: (v) => (v === def ? null : v),
    };
  },
  /** A finite number, optionally clamped to [min, max] and/or rounded to a whole number. */
  number(
    def: number,
    opts: { min?: number; max?: number; integer?: boolean } = {},
  ): UrlParam<number> {
    return {
      default: def,
      read(raw) {
        if (raw === null || raw.trim() === '') return def;
        let n = Number(raw);
        if (!Number.isFinite(n)) return def;
        if (opts.integer) n = Math.trunc(n);
        if (opts.min !== undefined) n = Math.max(opts.min, n);
        if (opts.max !== undefined) n = Math.min(opts.max, n);
        return n;
      },
      write: (v) => (v === def ? null : String(v)),
    };
  },
  /** A list of strings, comma-separated. Blank items are dropped. */
  list(def: readonly string[] = []): UrlParam<readonly string[]> {
    return {
      default: def,
      read(raw) {
        if (raw === null) return def;
        const items = raw
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s !== '');
        return items.length === 0 ? def : items;
      },
      write: (v) => (sameList(v, def) || v.length === 0 ? null : v.join(',')),
    };
  },
  /** One of a fixed set; anything else reads as the default. */
  oneOf<const V extends string>(values: readonly V[], def: V): UrlParam<V> {
    return {
      default: def,
      read: (raw) =>
        raw !== null && (values as readonly string[]).includes(raw) ? (raw as V) : def,
      write: (v) => (v === def ? null : v),
    };
  },
  /** Any number of values from a fixed set (a facet filter); unknown items are dropped. */
  listOf<const V extends string>(
    values: readonly V[],
    def: readonly V[] = [],
  ): UrlParam<readonly V[]> {
    const known = values as readonly string[];
    return {
      default: def,
      read(raw) {
        if (raw === null) return def;
        const items = raw.split(',').filter((s): s is V => known.includes(s));
        return items.length === 0 ? def : [...new Set(items)];
      },
      write: (v) => (sameList(v, def) || v.length === 0 ? null : v.join(',')),
    };
  },
};

export type UrlSchema = Record<string, UrlParam<unknown>>;
export type UrlValues<S extends UrlSchema> = {
  [K in keyof S]: S[K] extends UrlParam<infer T> ? T : never;
};

/** The parameters of a query string (`location.search`: '?x=1', or '' for none). */
export function queryOf(search: string): URLSearchParams {
  return new URLSearchParams(search);
}

/** Every schema entry read from a query string. */
export function readParams<S extends UrlSchema>(schema: S, search: string): UrlValues<S> {
  const query = queryOf(search);
  const out: Record<string, unknown> = {};
  for (const [key, p] of Object.entries(schema)) {
    out[key] = (p as UrlParam<unknown>).read(query.get(key));
  }
  return out as UrlValues<S>;
}

/** The query string ('?a=1&b=2', or '' when empty) with `values` written into `search`: defaults
    are removed and parameters outside the schema are kept. */
export function buildSearch<S extends UrlSchema>(
  schema: S,
  search: string,
  values: Partial<UrlValues<S>>,
): string {
  const query = queryOf(search);
  for (const [key, value] of Object.entries(values)) {
    const p = schema[key] as UrlParam<unknown> | undefined;
    if (!p) continue;
    const text = p.write(value);
    if (text === null) query.delete(key);
    else query.set(key, text);
  }
  const text = query
    .toString()
    // commas and slashes are safe in a query and keep 'status=paid,failed' readable
    .replace(/%2C/gi, ',')
    .replace(/%2F/gi, '/');
  return text === '' ? '' : `?${text}`;
}
