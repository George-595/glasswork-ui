import type { ReactNode } from 'react';

/* The pure half of the table system: the types, and the functions that sort,
   filter, count and export rows. No React state, no DOM, so each one is a
   unit test and the same code can run in a worker or on a server.

   Every optional field on Column<T> was added after the first DataTable; a
   column written for that version still means what it did. */
export type SortDir = 'asc' | 'desc';

export interface SortKey {
  key: string;
  dir: SortDir;
}

export type Density = 'compact' | 'normal' | 'comfortable';
export const DENSITIES: readonly Density[] = ['compact', 'normal', 'comfortable'];

export interface FacetOption {
  value: string;
  label: string;
  /** Rows with this value that pass every other filter. Absent when the table cannot know. */
  count?: number;
}

export interface Column<T> {
  key: string;
  header: string;
  /** What the cell shows. Default: the row's `key` property as text. */
  cell?: (row: T) => ReactNode;
  /** What the column sorts by. Default: the row's `key` property. */
  sortValue?: (row: T) => string | number;
  /** 'end' for numbers, so the digits line up. Default 'start'. */
  align?: 'start' | 'end';
  sortable?: boolean;

  /** Included in the global search. When no column says so, every column is searched. */
  searchable?: boolean;
  /** The text the global search looks at. Default: sortValue, then the `key` property. */
  searchValue?: (row: T) => string;
  /** The column gets a facet filter (a checkbox list with counts). */
  facet?: boolean;
  /** The facet value(s) of a row. Default: sortValue, then the `key` property. Return an array for a multi-valued field. */
  filterValue?: (row: T) => string | number | readonly (string | number)[];
  /** Shows a facet value as text. Default: the value itself. */
  facetLabel?: (value: string) => string;
  /** The facet's options, when they cannot be read from the rows (server-driven tables). */
  facetOptions?: readonly FacetOption[];
  /** The column can be hidden from the Columns popover. */
  hideable?: boolean;
  /** The column starts hidden (it should also be `hideable`, or it can never be shown). */
  defaultHidden?: boolean;
  /** A footer cell, computed over every row that passes the filters (not just the page). */
  footer?: (rows: readonly T[]) => ReactNode;
  /** The CSV cell. Default: sortValue, then the `key` property. */
  csv?: (row: T) => string | number;
}

export interface FilterQuery {
  search: string;
  /** Selected values per column key. Within a column they OR; across columns they AND. */
  facets: Readonly<Record<string, readonly string[]>>;
}

export const field = <T>(row: T, key: string): unknown => (row as Record<string, unknown>)[key];

const collator = new Intl.Collator('en-GB', { numeric: true, sensitivity: 'base' });

export function compare(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (a == null) return b == null ? 0 : 1; // empty values sort last
  if (b == null) return -1;
  return collator.compare(String(a), String(b));
}

/** A cell's default text: strings and numbers as they are, nothing for an
    object (never "[object Object]"). */
export function plain(v: unknown): string {
  return typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '';
}

const rawValue = <T>(col: Column<T>, row: T): unknown =>
  col.sortValue ? col.sortValue(row) : field(row, col.key);

/** Sorts by each key in turn: the first decides, the next breaks ties. Stable;
    never mutates its input. Unknown keys are skipped. */
export function sortRows<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  sort: readonly SortKey[],
): T[] {
  const keys = sort.flatMap((s) => {
    const col = columns.find((c) => c.key === s.key);
    return col ? [{ col, sign: s.dir === 'asc' ? 1 : -1 }] : [];
  });
  if (keys.length === 0) return [...rows];
  return rows.toSorted((a, b) => {
    for (const { col, sign } of keys) {
      const d = compare(rawValue(col, a), rawValue(col, b));
      if (d !== 0) return sign * d;
    }
    return 0;
  });
}

/** The text the global search reads for one column of one row. */
export function searchText<T>(col: Column<T>, row: T): string {
  if (col.searchValue) return col.searchValue(row);
  return plain(rawValue(col, row));
}

function searchedColumns<T>(columns: readonly Column<T>[]): readonly Column<T>[] {
  const chosen = columns.filter((c) => c.searchable || c.searchValue);
  return chosen.length > 0 ? chosen : columns;
}

/** The facet values of a row for a column, as strings (a multi-valued field gives several). */
export function facetValues<T>(col: Column<T>, row: T): string[] {
  const v = col.filterValue ? col.filterValue(row) : rawValue(col, row);
  const list: readonly unknown[] = Array.isArray(v) ? v : [v];
  return list.filter((x) => x != null && x !== '').map((x) => String(x));
}

const norm = (s: string) => s.toLocaleLowerCase('en-GB');

/** Rows that pass the search and every facet. `except` leaves one facet out,
    which is how a facet's own counts stay useful while it is being edited. */
export function filterRows<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  query: FilterQuery,
  except?: string,
): T[] {
  const needle = norm(query.search.trim());
  const searched = needle ? searchedColumns(columns) : [];
  const active = columns.filter((c) => c.key !== except && (query.facets[c.key]?.length ?? 0) > 0);
  if (!needle && active.length === 0) return [...rows];
  return rows.filter((row) => {
    if (needle && !searched.some((c) => norm(searchText(c, row)).includes(needle))) return false;
    return active.every((c) => {
      const want = query.facets[c.key] ?? [];
      return facetValues(c, row).some((v) => want.includes(v));
    });
  });
}

/** The options of one facet, with counts from the rows that pass everything
    but that facet. Chosen values that no row has any more stay listed at 0,
    so they can still be unticked. Options are in `facetOptions` order if the
    column gave one, otherwise alphabetical. */
export function facetCounts<T>(
  rows: readonly T[],
  columns: readonly Column<T>[],
  columnKey: string,
  query: FilterQuery,
): FacetOption[] {
  const col = columns.find((c) => c.key === columnKey);
  if (!col) return [];
  const label = (v: string) => col.facetLabel?.(v) ?? v;
  const counts = new Map<string, number>();
  for (const row of filterRows(rows, columns, query, columnKey)) {
    for (const v of new Set(facetValues(col, row))) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const chosen = query.facets[columnKey] ?? [];
  const values = col.facetOptions ? col.facetOptions.map((o) => o.value) : [...counts.keys()];
  for (const v of chosen) if (!values.includes(v)) values.push(v);
  const ordered = col.facetOptions
    ? values
    : values.toSorted((a, b) => compare(label(a), label(b)));
  return ordered.map((value) => ({
    value,
    label: col.facetOptions?.find((o) => o.value === value)?.label ?? label(value),
    count: counts.get(value) ?? 0,
  }));
}

/* ---- CSV ---------------------------------------------------------------- */

/** The CSV value of a cell: `csv`, then sortValue, then the `key` property. */
export function csvValue<T>(col: Column<T>, row: T): string | number {
  if (col.csv) return col.csv(row);
  const v = rawValue(col, row);
  return typeof v === 'number' ? v : plain(v);
}

/* A spreadsheet runs a text cell that starts with = + - @ as a formula (CSV
   injection). Text gets a leading apostrophe; real numbers are left alone. */
function csvCell(v: string | number): string {
  let text = String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** RFC 4180 CSV: a header row of the columns' headers, then one line per row. */
export function toCsv<T>(columns: readonly Column<T>[], rows: readonly T[]): string {
  const lines = [
    columns.map((c) => csvCell(c.header)).join(','),
    ...rows.map((row) => columns.map((c) => csvCell(csvValue(c, row))).join(',')),
  ];
  return `${lines.join('\r\n')}\r\n`;
}

export interface CsvSink {
  /** Hands the finished file to the user. Default: a download through a Blob link. */
  save?: (filename: string, csv: string) => void;
}

function browserSave(filename: string, csv: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Builds the CSV and saves it. Returns the text, so a caller (or a test)
    can read what was written. The default sink needs a browser (`document`
    and `URL.createObjectURL`) and does nothing without one, so it is safe
    to call on a server; `save` replaces it, which is how a test sees the file. */
export function downloadCsv<T>(
  filename: string,
  columns: readonly Column<T>[],
  rows: readonly T[],
  sink: CsvSink = {},
): string {
  const csv = toCsv(columns, rows);
  (sink.save ?? browserSave)(filename, csv);
  return csv;
}
