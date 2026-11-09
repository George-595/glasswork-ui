import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { LiquidGlass } from '../../glass/LiquidGlass';
import { Icon } from '../../icons/Icon';
import { useBottomInset } from '../../lib/bottom-inset';
import { cn } from '../../lib/cn';
import { Button } from '../button';
import { Checkbox } from '../checkbox';
import { Input, Label } from '../input';
import { NativeSelect } from '../native-select';
import { Popover } from '../popover';
import { DENSITIES, type Density } from './table-core';
import type { ActiveFilter, DataTableApi, FacetModel } from './useDataTable';

/* The composable parts of the table system. Each is a plain component that
   takes either a value and a callback, or a slice of what `useDataTable`
   returns, so a page picks the ones it wants and lays them out itself
   (DataTable is one such layout). */

/* ---- toolbar ------------------------------------------------------------- */

export interface DataTableToolbarProps {
  /** The left side: search, facet filters. */
  children?: ReactNode;
  /** The right side: column toggle, density, export. */
  actions?: ReactNode;
  /** Names the group for assistive tech. Default "Table controls". */
  label?: string;
  className?: string;
}

/** A layout row: filters on the left, actions on the right. Both sides wrap
    on a narrow screen, so nothing scrolls the page sideways. */
export function DataTableToolbar({
  children,
  actions,
  label = 'Table controls',
  className,
}: DataTableToolbarProps) {
  return (
    <fieldset
      className={cn(
        'ui-table-toolbar m-0 flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-2 border-0 p-0',
        className,
      )}
    >
      <legend className="sr-only">{label}</legend>
      <div className="ui-table-toolbar-start flex min-w-0 flex-wrap items-center gap-2">
        {children}
      </div>
      {actions && (
        <div className="ui-table-toolbar-end flex flex-wrap items-center gap-2">{actions}</div>
      )}
    </fieldset>
  );
}

/* ---- search -------------------------------------------------------------- */

export interface TableSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** Wait this many ms after the last keystroke before calling onChange. Default 200; 0 calls it on every keystroke. */
  debounce?: number;
  /** The label, visually hidden. Default "Search". */
  label?: string;
  placeholder?: string;
  className?: string;
}

/** A labelled search field with a clear button. It types into its own copy and
    reports a settled value after `debounce`, Enter reports at once, Esc clears.
    A `value` changed from outside (Clear all, the URL) replaces what is typed. */
export function TableSearch({
  value,
  onChange,
  debounce = 200,
  label = 'Search',
  placeholder = 'Search…',
  className,
}: TableSearchProps) {
  const id = useId();
  const [draft, setDraft] = useState(value);
  const emitted = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const send = useRef(onChange);
  useEffect(() => {
    send.current = onChange;
  });

  useEffect(() => {
    if (value !== emitted.current) {
      emitted.current = value;
      setDraft(value);
    }
  }, [value]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const emit = (next: string) => {
    clearTimeout(timer.current);
    emitted.current = next;
    send.current(next);
  };
  const type = (next: string) => {
    setDraft(next);
    clearTimeout(timer.current);
    if (debounce <= 0) emit(next);
    else timer.current = setTimeout(() => emit(next), debounce);
  };
  const clear = () => {
    setDraft('');
    emit('');
  };

  return (
    <div className={cn('ui-table-search relative inline-flex items-center', className)}>
      <Label htmlFor={id} className="sr-only">
        {label}
      </Label>
      <Icon
        name="search"
        size={14}
        className="pointer-events-none absolute left-2.5 text-fg-subtle"
      />
      <Input
        id={id}
        type="search"
        value={draft}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="min-h-8 min-w-52 pr-8 pl-8 [&::-webkit-search-cancel-button]:appearance-none"
        onChange={(e) => type(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            emit(draft);
          } else if (e.key === 'Escape' && draft) {
            e.preventDefault();
            clear();
          }
        }}
      />
      {draft && (
        <button
          type="button"
          aria-label="Clear search"
          className="absolute right-1 inline-flex size-6 cursor-pointer items-center justify-center rounded-xs border-0 bg-transparent p-0 text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
          onClick={clear}
        >
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
}

/* ---- facet filter -------------------------------------------------------- */

export interface FacetFilterProps {
  facet: FacetModel;
  className?: string;
}

/** A button "Status · 2" that opens a panel of checkboxes with counts. The
    counts are of the rows that pass every other filter, so they say what
    ticking an option would leave. */
export function FacetFilter({ facet, className }: FacetFilterProps) {
  const n = facet.selected.length;
  return (
    <Popover
      label={`${facet.label} filter`}
      active={n > 0}
      className={className}
      trigger={
        <>
          {facet.label}
          {n > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {n}
                <span className="sr-only"> selected</span>
              </span>
            </>
          )}
        </>
      }
      footer={
        <Button
          variant="ghost"
          size="sm"
          aria-disabled={n === 0}
          onClick={() => n > 0 && facet.clear()}
        >
          Clear
        </Button>
      }
    >
      {facet.options.length === 0 ? (
        <p className="m-0 [font:var(--t-small)] text-fg-subtle">No options.</p>
      ) : (
        <fieldset className="m-0 flex max-h-60 min-w-0 flex-col gap-0.5 overflow-y-auto border-0 p-0">
          <legend className="sr-only">{facet.label}</legend>
          {facet.options.map((o) => (
            <Checkbox
              key={o.value}
              checked={facet.selected.includes(o.value)}
              onChange={(e) => facet.toggle(o.value, e.target.checked)}
              label={
                <span className="flex min-w-44 items-baseline justify-between gap-4">
                  <span>{o.label}</span>
                  {o.count !== undefined && (
                    <span className="tabular-nums text-fg-subtle">{o.count}</span>
                  )}
                </span>
              }
            />
          ))}
        </fieldset>
      )}
    </Popover>
  );
}

/* ---- filter chips -------------------------------------------------------- */

export interface FilterChipsProps {
  filters: readonly ActiveFilter[];
  onClearAll: () => void;
  className?: string;
}

/** The active search and facet choices as removable chips, plus "Clear all".
    Nothing renders when nothing is active. Removing a chip moves focus to the
    chip that took its place, so a keyboard user can keep going. */
export function FilterChips({ filters, onClearAll, className }: FilterChipsProps) {
  const list = useRef<HTMLUListElement>(null);
  const refocus = useRef<number | null>(null);
  useEffect(() => {
    if (refocus.current === null) return;
    const buttons = list.current?.querySelectorAll<HTMLElement>('button');
    const at = Math.min(refocus.current, (buttons?.length ?? 0) - 1);
    refocus.current = null;
    buttons?.[at]?.focus();
  });

  if (filters.length === 0) return null;
  return (
    <ul
      ref={list}
      aria-label="Active filters"
      className={cn(
        'ui-filter-chips m-0 flex list-none flex-wrap items-center gap-1.5 p-0',
        className,
      )}
    >
      {filters.map((f, i) => (
        <li
          key={f.id}
          className="ui-chip inline-flex items-center gap-0.5 rounded-pill border border-solid border-border bg-sunken py-0.5 pr-0.5 pl-2.5 [font:var(--t-small)] text-fg"
        >
          {f.label}
          <button
            type="button"
            aria-label={`Remove filter ${f.label}`}
            className="inline-flex size-6 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
            onClick={() => {
              refocus.current = i;
              f.remove();
            }}
          >
            <Icon name="x" size={12} />
          </button>
        </li>
      ))}
      <li>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            refocus.current = 0;
            onClearAll();
          }}
        >
          Clear all
        </Button>
      </li>
    </ul>
  );
}

/* ---- column toggle ------------------------------------------------------- */

export interface ColumnToggleProps<T> {
  table: Pick<DataTableApi<T>, 'columns' | 'visibleColumns' | 'setColumnVisible' | 'resetColumns'>;
  className?: string;
}

/** A "Columns" button with a checkbox per hideable column. The last visible
    column cannot be hidden. Nothing renders if no column is `hideable`. */
export function ColumnToggle<T>({ table, className }: ColumnToggleProps<T>) {
  const hideable = table.columns.filter((c) => c.hideable);
  if (hideable.length === 0) return null;
  const last = table.visibleColumns.length <= 1 ? table.visibleColumns[0]?.key : undefined;
  return (
    <Popover
      label="Choose columns"
      icon="table"
      trigger="Columns"
      className={className}
      footer={
        <Button variant="ghost" size="sm" onClick={table.resetColumns}>
          Reset
        </Button>
      }
    >
      <fieldset className="m-0 flex max-h-60 min-w-0 flex-col gap-0.5 overflow-y-auto border-0 p-0">
        <legend className="sr-only">Visible columns</legend>
        {hideable.map((c) => {
          const shown = table.visibleColumns.some((v) => v.key === c.key);
          const locked = c.key === last;
          return (
            <Checkbox
              key={c.key}
              checked={shown}
              aria-disabled={locked || undefined}
              className={locked ? 'opacity-50' : undefined}
              onChange={(e) => !locked && table.setColumnVisible(c.key, e.target.checked)}
              label={c.header}
            />
          );
        })}
      </fieldset>
    </Popover>
  );
}

/* ---- density ------------------------------------------------------------- */

export interface DensityToggleProps {
  value: Density;
  onChange: (density: Density) => void;
  className?: string;
}

const DENSITY_LABELS: Record<Density, string> = {
  compact: 'Compact',
  normal: 'Normal',
  comfortable: 'Comfortable',
};

/** Row density as a native select: the browser's own list is the most
    reliable keyboard and screen-reader control for three choices. */
export function DensityToggle({ value, onChange, className }: DensityToggleProps) {
  const id = useId();
  return (
    <div className={cn('ui-density inline-flex items-center gap-1.5', className)}>
      <Label htmlFor={id}>Density</Label>
      <NativeSelect
        id={id}
        className="min-h-8"
        value={value}
        onChange={(e) => onChange(e.target.value as Density)}
      >
        {DENSITIES.map((d) => (
          <option key={d} value={d}>
            {DENSITY_LABELS[d]}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

/* ---- pagination ---------------------------------------------------------- */

export interface TablePaginationProps {
  table: Pick<
    DataTableApi<unknown>,
    | 'pageIndex'
    | 'pageCount'
    | 'pageSize'
    | 'pageSizes'
    | 'rowCount'
    | 'range'
    | 'paged'
    | 'setPageIndex'
    | 'setPageSize'
  >;
  /** Adds "N selected ·" to the status line. */
  selectedCount?: number;
  /** First and Last buttons. Default true. */
  edges?: boolean;
  /** The "Rows per page" select. Default false. */
  pageSizeSelect?: boolean;
  className?: string;
}

/** "Showing a–b of n", "Rows per page", first / previous / next / last and a
    polite "Page x of y" line. The buttons use aria-disabled, not disabled, so
    a button that has focus when it reaches the end of the range keeps it. */
export function TablePagination({
  table,
  selectedCount,
  edges = true,
  pageSizeSelect = false,
  className,
}: TablePaginationProps) {
  const sizeId = useId();
  const { pageIndex: page, pageCount, paged, rowCount, range } = table;
  const atStart = page === 0;
  const atEnd = page >= pageCount - 1;
  const go = (to: number, blocked: boolean) => () => {
    if (!blocked) table.setPageIndex(to);
  };
  return (
    <div
      className={cn('ui-table-footer flex flex-wrap items-center justify-between gap-2', className)}
    >
      <p className="ui-table-status m-0 [font:var(--t-small)] text-fg-subtle">
        {selectedCount !== undefined && `${selectedCount} selected · `}
        {rowCount === 0
          ? 'No rows'
          : paged
            ? `Showing ${range.from}–${range.to} of ${rowCount}`
            : `${rowCount} rows`}
      </p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {pageSizeSelect && (
          <div className="ui-page-size inline-flex items-center gap-1.5">
            <Label htmlFor={sizeId}>Rows per page</Label>
            <NativeSelect
              id={sizeId}
              className="min-h-8"
              value={table.pageSize}
              onChange={(e) => table.setPageSize(Number(e.target.value))}
            >
              {table.pageSizes.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? 'All' : n}
                </option>
              ))}
            </NativeSelect>
          </div>
        )}
        {paged && (pageCount > 1 || pageSizeSelect) && (
          <nav aria-label="Pagination" className="ui-pager flex flex-wrap items-center gap-2">
            {edges && (
              <Button variant="outline" size="sm" aria-disabled={atStart} onClick={go(0, atStart)}>
                First
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              aria-disabled={atStart}
              onClick={go(page - 1, atStart)}
            >
              <Icon name="chevron-left" size={14} />
              Previous
            </Button>
            <span
              className="ui-pager-page [font:var(--t-small)] tabular-nums text-fg-muted"
              aria-live="polite"
            >
              Page {page + 1} of {pageCount}
            </span>
            <Button variant="outline" size="sm" aria-disabled={atEnd} onClick={go(page + 1, atEnd)}>
              Next
              <Icon name="chevron-right" size={14} />
            </Button>
            {edges && (
              <Button
                variant="outline"
                size="sm"
                aria-disabled={atEnd}
                onClick={go(pageCount - 1, atEnd)}
              >
                Last
              </Button>
            )}
          </nav>
        )}
      </div>
    </div>
  );
}

/* ---- bulk actions -------------------------------------------------------- */

export interface BulkActionBarProps {
  /** Selected rows. The bar renders only when this is above 0. */
  count: number;
  onClear: () => void;
  /** The actions: buttons, a Menu. */
  children?: ReactNode;
  /** Names the region. Default "Bulk actions". */
  label?: string;
  /** Pin the bar to the bottom of the viewport, above the phone tab bar and the safe area, so a
      long list never makes the person scroll back up to act. Default false (inline). */
  sticky?: boolean;
  className?: string;
}

/** Appears when something is selected: "N selected", your actions and "Clear
    selection". A region with a name, so a screen-reader user can jump to it;
    a glass surface in the glass skin. */
export function BulkActionBar({
  count,
  onClear,
  children,
  label = 'Bulk actions',
  sticky = false,
  className,
}: BulkActionBarProps) {
  const bar = useRef<HTMLElement>(null);
  // pinned, it is bottom chrome: focus scrolls clear of it and toasts rest above it
  useBottomInset(bar, sticky && count > 0);
  if (count <= 0) return null;
  return (
    <LiquidGlass
      ref={bar}
      as="div"
      role="region"
      aria-label={label}
      fill="raised"
      band={10}
      refraction={24}
      lens={false}
      className={cn(
        'ui-bulk-bar flex flex-wrap items-center gap-2 rounded-md border border-solid border-primary bg-raised px-3 py-2 [box-shadow:var(--elev-2)] forced-colors:border-[CanvasText]',
        sticky &&
          'sticky bottom-[calc(env(safe-area-inset-bottom)+8px)] z-20 max-md:bottom-[calc(var(--bottom-nav-h,0px)+env(safe-area-inset-bottom)+8px)]',
        className,
      )}
    >
      <span role="status" className="mr-1 [font:var(--t-small)] font-medium text-fg tabular-nums">
        {count} selected
      </span>
      {children}
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear}>
        Clear selection
      </Button>
    </LiquidGlass>
  );
}
