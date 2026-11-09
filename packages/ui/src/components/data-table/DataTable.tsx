import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Button } from '../button';
import type { MenuItem } from '../menu';
import { DataTableView } from './DataTableView';
import {
  BulkActionBar,
  ColumnToggle,
  DataTableToolbar,
  DensityToggle,
  FacetFilter,
  FilterChips,
  TablePagination,
  TableSearch,
} from './parts';
import { type Column, type Density, downloadCsv, type SortDir } from './table-core';
import { type DataTableState, useDataTable } from './useDataTable';

/* DataTable — the batteries-included table: useDataTable for the state,
   DataTableView for the <table>, and the parts laid out in the usual order
   (toolbar, active-filter chips, bulk bar, table, pagination).

   With only the props it always had, it is the same table as before: a
   caption, sortable columns, paging with a live "Page x of y" line, a
   checkbox per row. Everything newer is opt in: `search`, facets (a column
   with `facet`), `columnToggle`, `densityToggle`, `footer` cells,
   `renderExpanded`, `onRowClick`, `rowActions`, `bulkActions`, `exportCsv`,
   `loading`, `stickyHeader`, `pageSizes`. For a different layout, or state in
   the URL or on a server, use the hook and the parts directly (see the
   README's Tables section); this component also forwards `state`,
   `onStateChange`, `initialState` and `manual` for the same purpose. */
export type { Column, SortDir };

export interface TableSearchOptions {
  label?: string;
  placeholder?: string;
  /** Milliseconds. Default 200. */
  debounce?: number;
}

export interface DataTableProps<T> {
  caption: string;
  columns: readonly Column<T>[];
  rows: readonly T[];
  rowKey: (row: T) => string;
  /** Rows per page. Default 10; 0 shows every row. */
  pageSize?: number;
  initialSort?: { key: string; dir: SortDir };
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (selected: Set<string>) => void;
  /** Names each row's checkbox ("Select …"). Default: the first column's value, then the key. */
  rowLabel?: (row: T) => string;
  emptyText?: string;
  dense?: boolean;
  className?: string;

  /** A search field in the toolbar. `true` for the defaults. */
  search?: boolean | TableSearchOptions;
  /** A filter button per column that has `facet`. Default true. */
  facets?: boolean;
  /** A "Columns" button for the columns that are `hideable`. */
  columnToggle?: boolean;
  /** The starting row density. `dense` is the same as 'compact'. */
  density?: Density;
  /** A Density select in the toolbar. */
  densityToggle?: boolean;
  /** Draws the columns' `footer` cells. Default true. */
  footer?: boolean;
  renderExpanded?: (row: T) => ReactNode;
  onRowClick?: (row: T) => void;
  rowOpenButton?: boolean;
  rowActions?: (row: T) => readonly MenuItem[];
  /** Shows the skeleton in the table's frame. */
  loading?: boolean;
  stickyHeader?: boolean;
  /** Choices for "Rows per page"; passing them also shows the select and First/Last buttons. */
  pageSizes?: readonly number[];
  /** Shown when no row passes, instead of `emptyText`. */
  empty?: ReactNode;
  /** The actions in the bulk bar, which shows while rows are selected. */
  bulkActions?: ReactNode | ((selected: ReadonlySet<string>) => ReactNode);
  /** A file name ("orders.csv"): adds an Export CSV button for the filtered rows. */
  exportCsv?: string;
  /** More buttons on the right of the toolbar. */
  toolbarActions?: ReactNode;

  /** Controlled state, any subset; see useDataTable. */
  state?: Partial<DataTableState>;
  onStateChange?: (patch: Partial<DataTableState>, next: DataTableState) => void;
  initialState?: Partial<DataTableState>;
  /** Server-driven: rows are the page the server sent; the table only reports state changes. */
  manual?: { rowCount: number };
}

export function DataTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  pageSize = 10,
  initialSort,
  selectable = false,
  selected,
  onSelectedChange,
  rowLabel,
  emptyText = 'No rows to show.',
  dense = false,
  className,
  search,
  facets: showFacets = true,
  columnToggle = false,
  density,
  densityToggle = false,
  footer = true,
  renderExpanded,
  onRowClick,
  rowOpenButton,
  rowActions,
  loading,
  stickyHeader,
  pageSizes,
  empty,
  bulkActions,
  exportCsv,
  toolbarActions,
  state,
  onStateChange,
  initialState,
  manual,
}: DataTableProps<T>) {
  const startDensity = density ?? (dense ? 'compact' : 'normal');
  const table = useDataTable<T>({
    columns,
    rows,
    rowKey,
    rowLabel,
    pageSizes,
    manual,
    initialState: {
      pageSize,
      density: startDensity,
      ...(initialSort ? { sort: [initialSort] } : {}),
      ...initialState,
    },
    state: selected === undefined ? state : { ...state, selected },
    onStateChange: (patch, next) => {
      if (patch.selected) onSelectedChange?.(new Set(patch.selected));
      onStateChange?.(patch, next);
    },
  });

  const searchOpts = search === true ? {} : search || undefined;
  const facetList = showFacets ? table.facets : [];
  const hasHideable = columnToggle && columns.some((c) => c.hideable);
  const actions = (
    <>
      {hasHideable && <ColumnToggle table={table} />}
      {densityToggle && <DensityToggle value={table.state.density} onChange={table.setDensity} />}
      {exportCsv && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => downloadCsv(exportCsv, table.visibleColumns, table.rows)}
        >
          Export CSV
        </Button>
      )}
      {toolbarActions}
    </>
  );
  const hasActions = hasHideable || densityToggle || exportCsv !== undefined || !!toolbarActions;
  const hasToolbar = searchOpts !== undefined || facetList.length > 0 || hasActions;
  const filtering = searchOpts !== undefined || facetList.length > 0;

  const paged = table.paged;
  const bulk =
    typeof bulkActions === 'function' ? bulkActions(table.selection.selected) : bulkActions;
  const fixedDensity = densityToggle || state?.density !== undefined ? undefined : startDensity;
  const emptyNode =
    empty ?? (table.activeFilters.length > 0 ? 'No rows match these filters.' : emptyText);

  return (
    <div
      className={cn('ui-datatable flex flex-col gap-2.5', className)}
      data-dense={dense || undefined}
    >
      {hasToolbar && (
        <DataTableToolbar actions={hasActions ? actions : undefined}>
          {searchOpts && (
            <TableSearch value={table.search} onChange={table.setSearch} {...searchOpts} />
          )}
          {facetList.map((f) => (
            <FacetFilter key={f.key} facet={f} />
          ))}
        </DataTableToolbar>
      )}
      {filtering && <FilterChips filters={table.activeFilters} onClearAll={table.clearFilters} />}
      {selectable && bulkActions !== undefined && (
        <BulkActionBar count={table.selection.count} onClear={table.selection.clear}>
          {bulk}
        </BulkActionBar>
      )}
      <DataTableView
        table={table}
        caption={caption}
        selectable={selectable}
        stickyHeader={stickyHeader}
        renderExpanded={renderExpanded}
        onRowClick={onRowClick}
        rowOpenButton={rowOpenButton}
        rowActions={rowActions}
        loading={loading}
        empty={emptyNode}
        footer={footer}
        density={fixedDensity}
      />
      {(paged || selectable || pageSizes !== undefined) && (
        <TablePagination
          table={table}
          selectedCount={selectable ? table.selection.count : undefined}
          edges={pageSizes !== undefined}
          pageSizeSelect={pageSizes !== undefined}
        />
      )}
    </div>
  );
}
