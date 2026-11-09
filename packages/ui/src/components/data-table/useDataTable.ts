import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type Column,
  type Density,
  type FacetOption,
  facetCounts,
  field,
  filterRows,
  type SortDir,
  type SortKey,
  sortRows,
} from './table-core';

/* useDataTable — the headless half of the table system. It owns the state
   (sort, search, facets, paging, selection, hidden columns, density,
   expanded rows) and derives the rows to show. It renders nothing: the parts
   (DataTableView, TableSearch, FacetFilter, TablePagination ...) take what
   it returns, so a page can lay them out however it likes.

   Every piece of state can be controlled or not, key by key:
   - uncontrolled: pass `initialState`, read the result;
   - controlled: pass `state` (any subset) and `onStateChange`, e.g. to keep
     it in the URL. A key present in `state` wins over the hook's own copy,
     the others stay the hook's. `onStateChange(patch, next)` gets only what
     changed, and `next` is the whole state after the change.

   `manual: { rowCount }` is for server-driven tables: the hook then does NOT
   sort, filter or page `rows` (they are the page the server sent) and only
   reports state changes, so the page can fetch. Facet counts are then the
   column's `facetOptions` (the server knows them, the hook cannot). */
export interface DataTableState {
  /** Ordered: the first key decides, the next break ties. */
  sort: readonly SortKey[];
  search: string;
  facets: Readonly<Record<string, readonly string[]>>;
  pageIndex: number;
  /** 0 shows every row. */
  pageSize: number;
  selected: ReadonlySet<string>;
  /** Keys of hidden columns. */
  hidden: readonly string[];
  density: Density;
  /** Keys of expanded rows. */
  expanded: ReadonlySet<string>;
}

export const DEFAULT_PAGE_SIZES: readonly number[] = [10, 25, 50, 100];

export interface UseDataTableOptions<T> {
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Names a row for its checkbox and buttons. Default: the first column's value, then the key. */
  rowLabel?: (row: T) => string;
  initialState?: Partial<DataTableState>;
  state?: Partial<DataTableState>;
  onStateChange?: (patch: Partial<DataTableState>, next: DataTableState) => void;
  /** Choices for "Rows per page". Default 10, 25, 50, 100. */
  pageSizes?: readonly number[];
  manual?: { rowCount: number };
}

export interface FacetModel {
  key: string;
  label: string;
  options: FacetOption[];
  selected: readonly string[];
  toggle: (value: string, on?: boolean) => void;
  clear: () => void;
}

export interface ActiveFilter {
  id: string;
  /** "Status: Active", "Search: ada" */
  label: string;
  remove: () => void;
}

export interface SelectionApi {
  selected: ReadonlySet<string>;
  /** Selected rows that exist in `rows` (in manual mode, every selected key). */
  count: number;
  isSelected: (key: string) => boolean;
  toggle: (key: string, on?: boolean) => void;
  /** Every row that passes the filters is selected. */
  allSelected: boolean;
  someSelected: boolean;
  pageAllSelected: boolean;
  pageSomeSelected: boolean;
  /** Select (or, with false, unselect) every row that passes the filters. */
  selectAll: (on?: boolean) => void;
  /** Select (or unselect) the rows on this page. */
  selectPage: (on?: boolean) => void;
  clear: () => void;
}

export interface DataTableApi<T> {
  columns: readonly Column<T>[];
  visibleColumns: readonly Column<T>[];
  rowKey: (row: T) => string;
  rowLabel: (row: T) => string;
  state: DataTableState;
  setState: (patch: Partial<DataTableState>) => void;
  manual: boolean;

  /** Rows after search, facets and sort, before paging. In manual mode, the rows as given. */
  rows: readonly T[];
  /** The rows on the current page. */
  pageRows: readonly T[];
  /** Rows that pass the filters (the server's `rowCount` in manual mode). */
  rowCount: number;
  pageIndex: number;
  pageCount: number;
  pageSize: number;
  pageSizes: readonly number[];
  /** 1-based range of the current page, 0–0 when empty. */
  range: { from: number; to: number };
  paged: boolean;

  sortInfo: (key: string) => { dir: SortDir; rank: number } | undefined;
  /** Click: sort by this column alone (asc, then desc). `additive` (Shift+click): add it as a further key, flip it, then drop it. */
  sortBy: (key: string, additive?: boolean) => void;

  search: string;
  setSearch: (value: string) => void;
  facets: FacetModel[];
  activeFilters: ActiveFilter[];
  clearFilters: () => void;

  setPageIndex: (index: number) => void;
  setPageSize: (size: number) => void;

  selection: SelectionApi;

  setColumnVisible: (key: string, visible: boolean) => void;
  resetColumns: () => void;
  setDensity: (density: Density) => void;
  isExpanded: (key: string) => boolean;
  toggleExpanded: (key: string, on?: boolean) => void;
}

const SEP = '\u0000';

export function defaultState<T>(columns: readonly Column<T>[]): DataTableState {
  return {
    sort: [],
    search: '',
    facets: {},
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZES[0] ?? 10,
    selected: new Set(),
    hidden: columns.filter((c) => c.defaultHidden).map((c) => c.key),
    density: 'normal',
    expanded: new Set(),
  };
}

/** The key of `controlled` that are set, so `undefined` means "not controlled". */
function definedOnly(partial: Partial<DataTableState> | undefined): Partial<DataTableState> {
  const out: Partial<DataTableState> = {};
  if (!partial) return out;
  for (const k of Object.keys(partial) as (keyof DataTableState)[]) {
    if (partial[k] !== undefined) Object.assign(out, { [k]: partial[k] });
  }
  return out;
}

export function useDataTable<T>(options: UseDataTableOptions<T>): DataTableApi<T> {
  const {
    columns,
    rows,
    rowKey,
    initialState,
    state: controlled,
    onStateChange,
    pageSizes = DEFAULT_PAGE_SIZES,
    manual,
  } = options;
  const isManual = manual !== undefined;

  const [inner, setInner] = useState<DataTableState>(() => ({
    ...defaultState(columns),
    ...definedOnly(initialState),
  }));
  const state = useMemo<DataTableState>(
    () => ({ ...inner, ...definedOnly(controlled) }),
    [inner, controlled],
  );

  // Handlers read the latest state and callback through refs, so they keep one
  // identity and two updates in the same event compose.
  // (seeded empty: the effect below fills it before any handler can run)
  const latest = useRef<{
    state: DataTableState;
    onStateChange: UseDataTableOptions<T>['onStateChange'];
  }>({ state: defaultState([]), onStateChange: undefined });
  useEffect(() => {
    latest.current = { state, onStateChange };
  });
  const setState = useCallback((patch: Partial<DataTableState>) => {
    const next = { ...latest.current.state, ...patch };
    latest.current.state = next;
    setInner((prev) => ({ ...prev, ...patch }));
    latest.current.onStateChange?.(patch, next);
  }, []);
  const commit = useRef(setState);

  /* ---- derive the rows ------------------------------------------------- */

  const query = useMemo(
    () => ({ search: state.search, facets: state.facets }),
    [state.search, state.facets],
  );
  const filtered = useMemo(
    () => (isManual ? rows : filterRows(rows, columns, query)),
    [isManual, rows, columns, query],
  );
  const sorted = useMemo(
    () => (isManual ? rows : sortRows(filtered, columns, state.sort)),
    [isManual, rows, filtered, columns, state.sort],
  );

  const rowCount = isManual ? manual.rowCount : sorted.length;
  const paged = state.pageSize > 0;
  const pageCount = paged ? Math.max(1, Math.ceil(rowCount / state.pageSize)) : 1;
  const pageIndex = Math.min(state.pageIndex, pageCount - 1);
  const pageRows = useMemo(() => {
    if (isManual || !paged) return sorted;
    return sorted.slice(pageIndex * state.pageSize, (pageIndex + 1) * state.pageSize);
  }, [isManual, paged, sorted, pageIndex, state.pageSize]);
  const range = {
    from: rowCount === 0 ? 0 : paged ? pageIndex * state.pageSize + 1 : 1,
    to: paged ? Math.min(rowCount, (pageIndex + 1) * state.pageSize) : rowCount,
  };

  /* ---- rows change: back to page 1, drop selections whose rows are gone -- */

  // Keyed on the row keys, not the array, so a parent re-rendering with an
  // equal array keeps the page. A server-driven table pages through rows that
  // are always different, so it keeps both.
  const rowSignature = useMemo(() => rows.map(rowKey).join(SEP), [rows, rowKey]);
  const seenSignature = useRef(rowSignature);
  useEffect(() => {
    if (seenSignature.current === rowSignature) return;
    seenSignature.current = rowSignature;
    if (isManual) return;
    const { state: now } = latest.current;
    const patch: Partial<DataTableState> = {};
    if (now.pageIndex !== 0) patch.pageIndex = 0;
    const live = new Set(rowSignature ? rowSignature.split(SEP) : []);
    if ([...now.selected].some((k) => !live.has(k))) {
      patch.selected = new Set([...now.selected].filter((k) => live.has(k)));
    }
    if (Object.keys(patch).length > 0) commit.current(patch);
  }, [rowSignature, isManual]);

  /* ---- labels ----------------------------------------------------------- */

  const rowLabel = useMemo(() => {
    if (options.rowLabel) return options.rowLabel;
    return (row: T) => {
      const first = columns[0];
      const v = first && (first.sortValue ? first.sortValue(row) : field(row, first.key));
      return typeof v === 'string' || typeof v === 'number'
        ? String(v) || rowKey(row)
        : rowKey(row);
    };
  }, [options.rowLabel, columns, rowKey]);

  /* ---- sorting ---------------------------------------------------------- */

  const sortInfo = useCallback(
    (key: string) => {
      const i = state.sort.findIndex((s) => s.key === key);
      const s = state.sort[i];
      return s ? { dir: s.dir, rank: i + 1 } : undefined;
    },
    [state.sort],
  );
  const sortBy = useCallback(
    (key: string, additive = false) => {
      const cur = latest.current.state.sort;
      const at = cur.find((s) => s.key === key);
      let sort: SortKey[];
      if (additive) {
        if (!at) sort = [...cur, { key, dir: 'asc' }];
        else if (at.dir === 'asc')
          sort = cur.map((s) => (s.key === key ? { key, dir: 'desc' } : s));
        else sort = cur.filter((s) => s.key !== key);
      } else {
        const single = cur.length === 1 && at;
        sort = [{ key, dir: single && at.dir === 'asc' ? 'desc' : 'asc' }];
      }
      setState({ sort, pageIndex: 0 });
    },
    [setState],
  );

  /* ---- search and facets ------------------------------------------------ */

  const setSearch = useCallback((search: string) => setState({ search, pageIndex: 0 }), [setState]);

  const setFacet = useCallback(
    (key: string, values: readonly string[]) => {
      const facets = { ...latest.current.state.facets };
      if (values.length === 0) delete facets[key];
      else facets[key] = values;
      setState({ facets, pageIndex: 0 });
    },
    [setState],
  );

  const toggleFacet = useCallback(
    (key: string, value: string, on?: boolean) => {
      const cur = latest.current.state.facets[key] ?? [];
      const want = on ?? !cur.includes(value);
      setFacet(key, want ? [...new Set([...cur, value])] : cur.filter((v) => v !== value));
    },
    [setFacet],
  );

  const facets = useMemo<FacetModel[]>(
    () =>
      columns
        .filter((c) => c.facet)
        .map((c) => {
          const chosen = state.facets[c.key] ?? [];
          const choices = isManual
            ? manualOptions(c, chosen)
            : facetCounts(rows, columns, c.key, query);
          return {
            key: c.key,
            label: c.header,
            options: choices,
            selected: chosen,
            toggle: (value, on) => toggleFacet(c.key, value, on),
            clear: () => setFacet(c.key, []),
          };
        }),
    [columns, rows, query, state.facets, isManual, setFacet, toggleFacet],
  );

  const removeFilter = useCallback(
    (facetKey: string | null, value: string) => {
      if (facetKey === null) setState({ search: '', pageIndex: 0 });
      else toggleFacet(facetKey, value, false);
    },
    [setState, toggleFacet],
  );
  // built with literals and map, not push: the React Compiler lint reads
  // `out.push(obj with a ref-reading handler)` as a ref passed during render
  const activeFilters = useMemo<ActiveFilter[]>(() => {
    const searchChip: ActiveFilter[] = state.search.trim()
      ? [
          {
            id: 'search',
            label: `Search: ${state.search.trim()}`,
            remove: () => removeFilter(null, ''),
          },
        ]
      : [];
    const facetChips = facets.flatMap((f) =>
      f.selected.map((v) => ({
        id: `facet:${f.key}:${v}`,
        label: `${f.label}: ${f.options.find((o) => o.value === v)?.label ?? v}`,
        remove: () => removeFilter(f.key, v),
      })),
    );
    return [...searchChip, ...facetChips];
  }, [state.search, facets, removeFilter]);

  const clearFilters = useCallback(
    () => setState({ search: '', facets: {}, pageIndex: 0 }),
    [setState],
  );

  /* ---- paging ----------------------------------------------------------- */

  const setPageIndex = useCallback(
    (index: number) => setState({ pageIndex: Math.max(0, index) }),
    [setState],
  );
  const setPageSize = useCallback(
    (pageSize: number) => setState({ pageSize, pageIndex: 0 }),
    [setState],
  );
  const sizes = useMemo(
    () =>
      pageSizes.includes(state.pageSize) || state.pageSize === 0
        ? pageSizes
        : [...pageSizes, state.pageSize].toSorted((a, b) => a - b),
    [pageSizes, state.pageSize],
  );

  /* ---- selection -------------------------------------------------------- */

  const selection = useMemo<SelectionApi>(() => {
    const chosen = state.selected;
    const filteredKeys = isManual ? pageRows.map(rowKey) : sorted.map(rowKey);
    const pageKeys = pageRows.map(rowKey);
    const rowKeys = isManual ? null : new Set(rows.map(rowKey));
    const count = rowKeys ? [...chosen].filter((k) => rowKeys.has(k)).length : chosen.size;
    const hits = (keys: readonly string[]) => keys.filter((k) => chosen.has(k)).length;
    const setMany = (keys: readonly string[], on: boolean) => {
      const next = new Set(latest.current.state.selected);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      setState({ selected: next });
    };
    const all = hits(filteredKeys);
    const onPage = hits(pageKeys);
    return {
      selected: chosen,
      count,
      isSelected: (key) => chosen.has(key),
      toggle: (key, on) => setMany([key], on ?? !latest.current.state.selected.has(key)),
      allSelected: filteredKeys.length > 0 && all === filteredKeys.length,
      someSelected: all > 0,
      pageAllSelected: pageKeys.length > 0 && onPage === pageKeys.length,
      pageSomeSelected: onPage > 0,
      selectAll: (on = true) => setMany(filteredKeys, on),
      selectPage: (on = true) => setMany(pageKeys, on),
      clear: () => setState({ selected: new Set() }),
    };
  }, [state.selected, isManual, sorted, pageRows, rows, rowKey, setState]);

  /* ---- columns, density, expansion -------------------------------------- */

  const visibleColumns = useMemo(
    () => columns.filter((c) => !state.hidden.includes(c.key)),
    [columns, state.hidden],
  );
  const setColumnVisible = useCallback(
    (key: string, visible: boolean) => {
      const hidden = latest.current.state.hidden;
      if (visible) {
        setState({ hidden: hidden.filter((k) => k !== key) });
        return;
      }
      // a table with no columns is not a table: the last one stays
      const shown = columns.filter((c) => !hidden.includes(c.key));
      if (hidden.includes(key) || shown.length <= 1) return;
      setState({ hidden: [...hidden, key] });
    },
    [columns, setState],
  );
  const resetColumns = useCallback(
    () => setState({ hidden: columns.filter((c) => c.defaultHidden).map((c) => c.key) }),
    [columns, setState],
  );
  const setDensity = useCallback((density: Density) => setState({ density }), [setState]);
  const isExpanded = useCallback((key: string) => state.expanded.has(key), [state.expanded]);
  const toggleExpanded = useCallback(
    (key: string, on?: boolean) => {
      const next = new Set(latest.current.state.expanded);
      if (on ?? !next.has(key)) next.add(key);
      else next.delete(key);
      setState({ expanded: next });
    },
    [setState],
  );

  return {
    columns,
    visibleColumns,
    rowKey,
    rowLabel,
    state,
    setState,
    manual: isManual,
    rows: sorted,
    pageRows,
    rowCount,
    pageIndex,
    pageCount,
    pageSize: state.pageSize,
    pageSizes: sizes,
    range,
    paged,
    sortInfo,
    sortBy,
    search: state.search,
    setSearch,
    facets,
    activeFilters,
    clearFilters,
    setPageIndex,
    setPageSize,
    selection,
    setColumnVisible,
    resetColumns,
    setDensity,
    isExpanded,
    toggleExpanded,
  };
}

/** A server-driven facet: the column's own options, plus any chosen value they miss. */
function manualOptions<T>(col: Column<T>, chosen: readonly string[]): FacetOption[] {
  const options = [...(col.facetOptions ?? [])];
  for (const v of chosen) {
    if (!options.some((o) => o.value === v))
      options.push({ value: v, label: col.facetLabel?.(v) ?? v });
  }
  return options;
}
