import {
  type CSSProperties,
  Fragment,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { LiquidGlass } from '../../glass/LiquidGlass';
import { Icon } from '../../icons/Icon';
import { cn } from '../../lib/cn';
import { Checkbox } from '../checkbox';
import { Menu, type MenuItem } from '../menu';
import { SkeletonTable } from '../skeleton';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { type Column, type Density, field, plain } from './table-core';
import type { DataTableApi } from './useDataTable';

/* DataTableView — the <table> itself, drawn from what useDataTable returns.

   - A real table with a visible caption, in a focusable, labelled scroll
     region (so a keyboard user can scroll a wide table). In the glass skin
     the region is a translucent glass surface with no backdrop filter: it
     scrolls with the page (lens off).
   - Sortable headers are buttons; a sorted <th> carries aria-sort. With
     several sort keys, each button also says its place ("sort priority 2").
   - Selection: a checkbox per row, named after the row; the header checkbox
     selects every row that passes the filters and goes mixed for some.
   - Expandable rows: a disclosure button per row with aria-expanded and
     aria-controls; the detail row follows its row.
   - Clickable rows: the row is not focusable. The first cell's content
     becomes a button (or `rowOpenButton` adds a trailing "Open" button, for
     a first cell that already holds a link), and a mouse click anywhere on
     the row does the same. No nested interactive controls either way.
   - Row actions: the kit Menu in a last column, named after the row.
   - Loading: SkeletonTable in the same frame, aria-busy on the region.

   There is no wash on a selected row: it would pull coloured cell text
   (Badge up/down) under 4.5:1. Selection shows in the checkbox and in a
   3px brand bar on the row's leading edge. */
export interface DataTableViewProps<T> {
  table: DataTableApi<T>;
  caption: string;
  /** Adds the checkbox column. */
  selectable?: boolean;
  /** What the header checkbox selects: every row that passes the filters (default) or this page's rows. */
  selectScope?: 'filtered' | 'page';
  /** The header stays in view while the body scrolls (the frame gets a max height). */
  stickyHeader?: boolean;
  /** Adds the disclosure column; the detail row renders what this returns. */
  renderExpanded?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  /** Add a trailing "Open" button instead of making the first cell the button. */
  rowOpenButton?: boolean;
  rowActions?: (row: T) => readonly MenuItem[];
  loading?: boolean;
  /** Shown when no row passes. Default: text. */
  empty?: ReactNode;
  /** Total row of the columns' `footer` functions. Default true (only if a column has one). */
  footer?: boolean;
  /** Overrides the density in the table state. */
  density?: Density;
  /** Each column header gets a drag handle (also arrow keys) to set its width. */
  resizable?: boolean;
  /** Each column header gets a Pin button: a pinned column moves to the start and stays in
      view while the table scrolls sideways. */
  pinnable?: boolean;
  /** Draw only the rows in view, for thousands of rows on one page (`pageSize` 0). The frame
      becomes `height` px tall with a sticky header. Rows should be one line high. */
  virtual?: { height: number; rowHeight?: number };
  className?: string;
}

/* The row height a virtual table assumes, by density (one line of 14px text plus padding). */
const ROW_PX: Record<Density, number> = { compact: 37, normal: 45, comfortable: 57 };
const OVERSCAN = 6;

/* The scroll box must take focus so a keyboard user can scroll a wide table
   (WCAG 2.1.1; axe scrollable-region-focusable). Spread, because the linters'
   no-noninteractive-tabindex rule does not know that case. */
const SCROLL_FOCUS = { tabIndex: 0 } as const;

const PAD: Record<Density, string> = {
  compact: 'py-1.5',
  normal: 'py-3',
  comfortable: 'py-4',
};

const end = <T,>(c: Column<T>) => c.align === 'end' && 'text-right tabular-nums';

/* Clicks that belong to a control inside the row (a checkbox, a link, a
   menu) are not the row being opened. */
const INTERACTIVE = 'a,button,input,select,textarea,label,[role="menuitem"],[role="checkbox"]';

export function DataTableView<T>({
  table,
  caption,
  selectable = false,
  selectScope = 'filtered',
  stickyHeader = false,
  renderExpanded,
  onRowClick,
  rowOpenButton = false,
  rowActions,
  loading = false,
  empty = 'No rows to show.',
  footer = true,
  density,
  resizable = false,
  pinnable = false,
  virtual,
  className,
}: DataTableViewProps<T>) {
  const captionId = useId();
  const uid = useId();
  const { visibleColumns: columns, pageRows: allPageRows, selection, rowKey, rowLabel } = table;
  const { widths, pinned } = table.state;

  /* Pinned columns are sticky; each one's inline-start offset is the width of everything
     before it (the lead columns and earlier pins), measured from the header row. */
  const headRow = useRef<HTMLTableRowElement>(null);
  const [offsets, setOffsets] = useState<Record<string, number>>({});
  // every column's drawn width, for the resize handles' aria-valuenow
  const [drawn, setDrawn] = useState<Record<string, number>>({});
  const pinKey = pinned.join(',');
  const widthKey = `${JSON.stringify(widths)}|${columns.map((c) => c.key).join(',')}`;
  useLayoutEffect(() => {
    void widthKey;
    const row = headRow.current;
    if (!row || (pinKey === '' && !resizable)) return;
    const measure = () => {
      const next: Record<string, number> = {};
      const all: Record<string, number> = {};
      let x = 0;
      let pinning = pinKey !== '';
      for (const th of Array.from(row.children) as HTMLElement[]) {
        const key = th.dataset.col;
        const w = th.getBoundingClientRect().width;
        if (key !== undefined) all[key] = Math.round(w);
        if (key !== undefined && !pinKey.split(',').includes(key)) pinning = false;
        if (pinning && key !== undefined) next[key] = x;
        x += w;
      }
      setOffsets(next);
      setDrawn(all);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [pinKey, widthKey, resizable]);
  const lastPin = pinned.filter((k) => columns.some((c) => c.key === k)).at(-1);
  const pinCls = (key: string, head = false) =>
    pinned.includes(key) &&
    cn(
      'sticky z-[2] bg-surface-solid',
      head && 'z-[3]',
      key === lastPin && 'border-0 border-e border-solid border-border-strong',
    );
  const colStyle = (key: string, head = false): CSSProperties | undefined => {
    const w = widths[key];
    const off = offsets[key];
    if (w === undefined && off === undefined) return undefined;
    return {
      ...(w !== undefined && head ? { width: w, minWidth: w, maxWidth: w } : {}),
      ...(w !== undefined && !head ? { maxWidth: w } : {}),
      ...(off !== undefined ? { insetInlineStart: off } : {}),
    };
  };

  /* Virtual rows: only the window in view (plus a few) is in the DOM; spacer rows keep the
     scroll height. aria-rowcount and aria-rowindex tell assistive tech the real size. */
  const [scrollTop, setScrollTop] = useState(0);
  const rowPx = virtual?.rowHeight ?? ROW_PX[density ?? table.state.density];
  const first = virtual ? Math.max(0, Math.floor(scrollTop / rowPx) - OVERSCAN) : 0;
  const last = virtual
    ? Math.min(allPageRows.length, Math.ceil((scrollTop + virtual.height) / rowPx) + OVERSCAN)
    : allPageRows.length;
  const pageRows = virtual ? allPageRows.slice(first, last) : allPageRows;

  const startResize = (key: string) => (e: PointerEvent<HTMLSpanElement>) => {
    e.preventDefault();
    const th = e.currentTarget.parentElement;
    const from = th?.getBoundingClientRect().width ?? widths[key] ?? 120;
    const x0 = e.clientX;
    const target = e.currentTarget;
    target.setPointerCapture?.(e.pointerId);
    const move = (ev: globalThis.PointerEvent) => table.setColumnWidth(key, from + ev.clientX - x0);
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };
  const keyResize = (key: string) => (e: KeyboardEvent<HTMLSpanElement>) => {
    const step = e.shiftKey ? 48 : 16;
    const now = widths[key] ?? e.currentTarget.parentElement?.getBoundingClientRect().width ?? 120;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      table.setColumnWidth(key, now + (e.key === 'ArrowRight' ? step : -step));
    }
  };
  const dens = density ?? table.state.density;
  const pad = PAD[dens];
  const expandable = renderExpanded !== undefined;
  const hasFooter = footer && columns.some((c) => c.footer);
  const lead = (selectable ? 1 : 0) + (expandable ? 1 : 0);
  const trail = (rowActions ? 1 : 0) + (onRowClick && rowOpenButton ? 1 : 0);
  const span = columns.length + lead + trail;

  const allOn = selectScope === 'page' ? selection.pageAllSelected : selection.allSelected;
  const someOn = selectScope === 'page' ? selection.pageSomeSelected : selection.someSelected;
  const headerCount = selectScope === 'page' ? allPageRows.length : table.rowCount;

  const openRow = (row: T) => (e: MouseEvent<HTMLElement>) => {
    const hit = (e.target as Element).closest(INTERACTIVE);
    if (hit && !hit.hasAttribute('data-row-open')) return;
    onRowClick?.(row);
  };

  return (
    // relative: the scroll box is the containing block for any absolutely positioned cell
    // content (screen-reader-only text), so it is clipped here instead of widening the page
    <LiquidGlass
      as="section"
      className={cn(
        'ui-table-scroll relative overflow-x-auto rounded-md border border-solid border-border bg-surface [box-shadow:var(--elev-0)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] forced-colors:border-[CanvasText]',
        stickyHeader && !virtual && 'max-h-[min(70vh,40rem)] overflow-y-auto',
        virtual && 'overflow-y-auto',
        className,
      )}
      style={virtual ? { maxHeight: virtual.height } : undefined}
      onScroll={virtual ? (e) => setScrollTop(e.currentTarget.scrollTop) : undefined}
      aria-labelledby={captionId}
      aria-busy={loading || undefined}
      data-density={dens}
      band={10}
      refraction={30}
      // the scroller moves with the page: a refracting filter here re-runs on every scrolled frame
      lens={false}
      {...SCROLL_FOCUS}
    >
      {loading ? (
        <>
          <div
            id={captionId}
            className="ui-table-caption px-3.5 pt-3 pb-2 font-sans text-[14px] font-semibold leading-[1.3] text-fg"
          >
            {caption}
          </div>
          <SkeletonTable
            rows={Math.min(table.pageSize || 5, 5)}
            columns={Math.max(1, span)}
            className="rounded-none border-0 bg-transparent [box-shadow:none]"
          />
          <p role="status" className="sr-only">
            Loading {caption}
          </p>
        </>
      ) : (
        <Table className="ui-table" aria-rowcount={virtual ? allPageRows.length + 1 : undefined}>
          <TableCaption id={captionId} className="ui-table-caption">
            {caption}
          </TableCaption>
          <TableHeader
            className={cn((stickyHeader || virtual) && 'sticky top-0 z-10 bg-surface-solid')}
          >
            <TableRow ref={headRow} aria-rowindex={virtual ? 1 : undefined}>
              {selectable && (
                <TableHead scope="col" className="ui-table-select w-[1%] pe-0">
                  <Checkbox
                    aria-label={`Select all ${headerCount} rows`}
                    checked={allOn}
                    indeterminate={someOn && !allOn}
                    disabled={headerCount === 0}
                    onChange={(e) =>
                      selectScope === 'page'
                        ? selection.selectPage(e.target.checked)
                        : selection.selectAll(e.target.checked)
                    }
                  />
                </TableHead>
              )}
              {expandable && (
                <TableHead scope="col" className="ui-table-expand w-[1%] pe-0">
                  <span className="sr-only">Details</span>
                </TableHead>
              )}
              {columns.map((c) => {
                const info = table.sortInfo(c.key);
                const ariaSort = info
                  ? info.dir === 'asc'
                    ? 'ascending'
                    : 'descending'
                  : undefined;
                const multi = table.state.sort.length > 1;
                return (
                  <TableHead
                    key={c.key}
                    scope="col"
                    data-col={c.key}
                    data-align={c.align}
                    aria-sort={ariaSort}
                    style={colStyle(c.key, true)}
                    className={cn(
                      dens === 'compact' && 'h-9',
                      end(c),
                      (resizable || pinnable) && 'group/th relative',
                      pinCls(c.key, true),
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex max-w-full items-center gap-1',
                        c.align === 'end' && 'flex-row-reverse',
                      )}
                    >
                      {c.sortable ? (
                        <button
                          type="button"
                          className={cn(
                            'ui-sort -mx-1.5 -my-1 inline-flex min-h-6 pointer-coarse:min-h-12 cursor-pointer items-center gap-1 rounded-xs border-0 bg-transparent px-1.5 py-1 [font:inherit] tracking-[inherit] text-inherit uppercase hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
                            info && 'text-fg',
                            c.align === 'end' && 'flex-row-reverse',
                          )}
                          onClick={(e) => table.sortBy(c.key, e.shiftKey)}
                        >
                          {c.header}
                          <Icon
                            name={
                              info
                                ? info.dir === 'asc'
                                  ? 'arrow-up'
                                  : 'arrow-down'
                                : 'arrow-up-down'
                            }
                            size={13}
                          />
                          {info && multi && (
                            <>
                              <span aria-hidden="true" className="tabular-nums">
                                {info.rank}
                              </span>
                              <span className="sr-only">, sort priority {info.rank}</span>
                            </>
                          )}
                        </button>
                      ) : (
                        c.header
                      )}
                      {pinnable && (
                        <button
                          type="button"
                          aria-pressed={pinned.includes(c.key)}
                          aria-label={`Pin ${c.header}`}
                          onClick={() => table.togglePinned(c.key)}
                          className={cn(
                            'inline-grid size-6 pointer-coarse:size-12 shrink-0 cursor-pointer place-items-center rounded-xs border-0 bg-transparent p-0 text-fg-subtle hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
                            'aria-pressed:text-brand pointer-fine:opacity-0 pointer-fine:group-hover/th:opacity-100 pointer-fine:focus-visible:opacity-100 pointer-fine:aria-pressed:opacity-100',
                          )}
                        >
                          <Icon name="pin" size={12} />
                        </button>
                      )}
                    </span>
                    {resizable && (
                      // biome-ignore lint/a11y/useSemanticElements: an <hr> cannot take focus or be dragged; a focusable separator is the APG window splitter
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Resize ${c.header} column`}
                        aria-valuenow={Math.round(
                          widths[c.key] ?? drawn[c.key] ?? c.width ?? c.minWidth ?? 64,
                        )}
                        aria-valuemin={c.minWidth ?? 64}
                        aria-valuemax={960}
                        tabIndex={0}
                        onPointerDown={startResize(c.key)}
                        onKeyDown={keyResize(c.key)}
                        className="ui-col-resize absolute inset-y-1 end-0 z-[1] w-3 translate-x-1/2 cursor-col-resize touch-none rounded-xs after:absolute after:inset-y-1 after:start-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-border after:content-[''] hover:after:bg-primary focus-visible:outline-none focus-visible:after:bg-primary focus-visible:[box-shadow:var(--ring)]"
                      />
                    )}
                  </TableHead>
                );
              })}
              {onRowClick && rowOpenButton && (
                <TableHead scope="col" className="w-[1%]">
                  <span className="sr-only">Open</span>
                </TableHead>
              )}
              {rowActions && (
                <TableHead scope="col" className="w-[1%]">
                  <span className="sr-only">Actions</span>
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {allPageRows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="ui-table-empty px-3.5 py-6 text-center text-fg-subtle"
                  colSpan={span}
                >
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              <>
                {virtual && first > 0 && (
                  // biome-ignore lint/a11y/noAriaHiddenOnFocusable: an empty spacer row that only holds the scroll height
                  <tr aria-hidden="true" style={{ height: first * rowPx }} className="border-0" />
                )}
                {pageRows.map((row, ri) => {
                  const key = rowKey(row);
                  const on = selection.isSelected(key);
                  const open = expandable && table.isExpanded(key);
                  const name = rowLabel(row);
                  const detailId = `${uid}-detail-${key}`;
                  const items = rowActions?.(row);
                  return (
                    <Fragment key={key}>
                      {/* The row is not focusable: the keyboard path to onRowClick is
                        the button in the first cell (or the Open button). */}
                      <TableRow
                        aria-rowindex={virtual ? first + ri + 2 : undefined}
                        data-state={on ? 'selected' : undefined}
                        data-clickable={onRowClick ? '' : undefined}
                        className={cn(
                          'hover:bg-hover [&>:first-child]:border-s-3',
                          onRowClick && 'cursor-pointer',
                          // a selected row gets a leading accent bar, never a wash: a wash pulls
                          // coloured cell text (Badge up/down) under 4.5:1; the checkbox and the
                          // bar show the state
                          on
                            ? '[&>:first-child]:border-s-brand'
                            : '[&>:first-child]:border-s-transparent',
                        )}
                        onClick={onRowClick ? openRow(row) : undefined}
                      >
                        {selectable && (
                          <TableCell className={cn('ui-table-select w-[1%] pe-0', pad)}>
                            <Checkbox
                              aria-label={`Select ${name}`}
                              checked={on}
                              onChange={(e) => selection.toggle(key, e.target.checked)}
                            />
                          </TableCell>
                        )}
                        {expandable && (
                          <TableCell className={cn('ui-table-expand w-[1%] pe-0', pad)}>
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-controls={open ? detailId : undefined}
                              aria-label={`Details for ${name}`}
                              className="inline-flex size-6 cursor-pointer items-center justify-center rounded-xs border-0 bg-transparent p-0 text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
                              onClick={() => table.toggleExpanded(key)}
                            >
                              <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} />
                            </button>
                          </TableCell>
                        )}
                        {columns.map((c, i) => {
                          const content = c.cell ? c.cell(row) : plain(field(row, c.key));
                          const opener = onRowClick && !rowOpenButton && i === 0;
                          return (
                            <TableCell
                              key={c.key}
                              data-align={c.align}
                              style={colStyle(c.key)}
                              className={cn(
                                pad,
                                end(c),
                                widths[c.key] !== undefined && 'truncate',
                                pinCls(c.key),
                              )}
                            >
                              {opener ? (
                                <button
                                  type="button"
                                  data-row-open=""
                                  className="ui-row-open -mx-1 min-h-6 pointer-coarse:min-h-12 cursor-pointer rounded-xs border-0 bg-transparent px-1 text-left [font:inherit] text-inherit underline-offset-4 hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
                                >
                                  {content}
                                </button>
                              ) : (
                                content
                              )}
                            </TableCell>
                          );
                        })}
                        {onRowClick && rowOpenButton && (
                          <TableCell className={cn('w-[1%]', pad)}>
                            <button
                              type="button"
                              data-row-open=""
                              aria-label={`Open ${name}`}
                              className="ui-row-open inline-flex min-h-6 pointer-coarse:min-h-12 pointer-coarse:min-w-12 pointer-coarse:justify-center cursor-pointer items-center rounded-xs border-0 bg-transparent px-1.5 [font:var(--t-small)] text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
                            >
                              Open
                            </button>
                          </TableCell>
                        )}
                        {rowActions && (
                          <TableCell className={cn('ui-row-actions-cell w-[1%]', pad)}>
                            {items && items.length > 0 && (
                              <Menu
                                label={`Actions for ${name}`}
                                icon="more"
                                iconOnly
                                items={items}
                                align="end"
                                className="ui-row-actions"
                              />
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                      {open && renderExpanded && (
                        <TableRow id={detailId} className="ui-table-detail">
                          <TableCell colSpan={span} className="bg-hover px-3.5">
                            {renderExpanded(row)}
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  );
                })}
                {virtual && last < allPageRows.length && (
                  // biome-ignore lint/a11y/noAriaHiddenOnFocusable: an empty spacer row that only holds the scroll height
                  <tr
                    aria-hidden="true"
                    style={{ height: (allPageRows.length - last) * rowPx }}
                    className="border-0"
                  />
                )}
              </>
            )}
          </TableBody>
          {hasFooter && (
            <tfoot className="ui-table-foot border-0 border-t border-solid border-border-strong font-medium">
              <tr>
                {lead > 0 && <TableCell colSpan={lead} />}
                {columns.map((c) => (
                  <TableCell
                    key={c.key}
                    data-align={c.align}
                    style={colStyle(c.key)}
                    className={cn(pad, end(c), pinCls(c.key))}
                  >
                    {c.footer?.(table.rows)}
                  </TableCell>
                ))}
                {trail > 0 && <TableCell colSpan={trail} />}
              </tr>
            </tfoot>
          )}
        </Table>
      )}
    </LiquidGlass>
  );
}
