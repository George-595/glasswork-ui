import type { ReactNode } from 'react';
import { Button } from '../components/button';
import { Card } from '../components/card';
import {
  BulkActionBar,
  ColumnToggle,
  type DataTableApi,
  DataTableToolbar,
  DataTableView,
  type DataTableViewProps,
  DensityToggle,
  FacetFilter,
  FilterChips,
  TablePagination,
  TableSearch,
  type TableSearchOptions,
} from '../components/data-table';
import { EmptyState } from '../components/empty-state';
import { ErrorState } from '../components/error-state';
import { Cluster } from '../components/layout/Cluster';
import { Stack } from '../components/layout/Stack';
import { cn } from '../lib/cn';
import type { LoadError } from './shared';

/* ListPage — the whole list screen as one composition: header actions, the toolbar (search,
   facets, filter chips, columns, density, export), an optional bulk bar, the table with its
   pagination, the loading / error / empty states, and a `detail` slot for a DetailSheet.

   It lays things out and wires states; it does not re-implement table logic. Pass the object
   `useDataTable` returns (URL-backed, server-driven, or plain) as `table`; everything the
   toolbar shows comes from it. Rows, columns and paging stay yours.

     const table = useDataTable({ columns, rows, rowKey, … });
     <ListPage table={table} caption="Users" search selectable
       actions={<Button>Invite</Button>} bulkActions={…}
       loading={q.status === 'loading'} error={…} detail={<DetailSheet … />} />

   States, in the order they win: `error` replaces the table with an ErrorState (and Retry);
   `loading` (first load) draws the skeleton in the table's frame; `busy` (reloading, rows
   kept) dims the table and sets aria-busy; no rows shows `empty`, or, by default, a message
   that offers "Clear filters" when filters are on. */
export interface ListPageProps<T>
  extends Pick<
    DataTableViewProps<T>,
    | 'selectScope'
    | 'stickyHeader'
    | 'renderExpanded'
    | 'onRowClick'
    | 'rowOpenButton'
    | 'rowActions'
    | 'footer'
  > {
  table: DataTableApi<T>;
  /** Names the table for assistive tech ("Users"). */
  caption: string;
  /** Buttons for the whole list (Invite, Export), end-aligned above the toolbar. */
  actions?: ReactNode;
  /** A search field in the toolbar. `true` for the defaults. */
  search?: boolean | TableSearchOptions;
  /** A filter button per column that has `facet`. Default true. */
  facets?: boolean;
  /** A "Columns" button. */
  columnToggle?: boolean;
  /** A Density select. */
  densityToggle?: boolean;
  /** More controls on the right of the toolbar (an Export button). */
  toolbarActions?: ReactNode;
  /** Extra controls on the left of the toolbar, after search and facets (a date range). */
  filters?: ReactNode;
  /** Names the toolbar group for assistive tech. Default "Table controls". */
  toolbarLabel?: string;
  /** Adds the checkbox column. */
  selectable?: boolean;
  /** The actions in the bulk bar, which shows while rows are selected. */
  bulkActions?: ReactNode | ((selected: ReadonlySet<string>) => ReactNode);
  /** First load: the skeleton in the table's frame. */
  loading?: boolean;
  /** Reloading with rows kept on screen: dims the table, sets aria-busy. */
  busy?: boolean;
  /** A failed load: replaces the table with an ErrorState. */
  error?: LoadError | null;
  /** Shown when no row passes. Default: a message, with "Clear filters" when filters are on. */
  empty?: ReactNode;
  /** Pagination under the table. Default true (hidden while loading). */
  pagination?: boolean;
  /** The "Rows per page" select. Default true. */
  pageSizeSelect?: boolean;
  /** A DetailSheet (or any overlay) for the row that is open. */
  detail?: ReactNode;
  className?: string;
}

export function ListPage<T>({
  table,
  caption,
  actions,
  search,
  facets: showFacets = true,
  columnToggle = false,
  densityToggle = false,
  toolbarActions,
  filters,
  toolbarLabel,
  selectable = false,
  bulkActions,
  loading = false,
  busy = false,
  error,
  empty,
  pagination = true,
  pageSizeSelect = true,
  detail,
  className,
  selectScope,
  stickyHeader,
  renderExpanded,
  onRowClick,
  rowOpenButton,
  rowActions,
  footer,
}: ListPageProps<T>) {
  const searchOpts = search === true ? {} : search || undefined;
  const facetList = showFacets ? table.facets : [];
  const rightSide = columnToggle || densityToggle || Boolean(toolbarActions);
  const hasToolbar =
    searchOpts !== undefined || facetList.length > 0 || Boolean(filters) || rightSide;
  const filtering = searchOpts !== undefined || facetList.length > 0;
  const bulk =
    typeof bulkActions === 'function' ? bulkActions(table.selection.selected) : bulkActions;
  const filtered = table.activeFilters.length > 0;

  const emptyNode = empty ?? (
    <EmptyState
      size="sm"
      icon="search"
      title={filtered ? 'Nothing matches these filters' : 'Nothing here yet'}
      description={filtered ? 'Try a different search, or remove a filter.' : undefined}
      action={
        filtered ? (
          <Button variant="outline" size="sm" onClick={table.clearFilters}>
            Clear filters
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <Stack gap={3} className={cn('ui-list-page', className)}>
      {actions && (
        <Cluster justify="end" gap={2} className="ui-list-actions">
          {actions}
        </Cluster>
      )}

      {hasToolbar && (
        <Card padding="sm" className="ui-list-toolbar">
          <Stack gap={2}>
            <DataTableToolbar
              label={toolbarLabel}
              actions={
                rightSide ? (
                  <>
                    {columnToggle && <ColumnToggle table={table} />}
                    {densityToggle && (
                      <DensityToggle value={table.state.density} onChange={table.setDensity} />
                    )}
                    {toolbarActions}
                  </>
                ) : undefined
              }
            >
              {searchOpts && (
                <TableSearch value={table.search} onChange={table.setSearch} {...searchOpts} />
              )}
              {facetList.map((f) => (
                <FacetFilter key={f.key} facet={f} />
              ))}
              {filters}
            </DataTableToolbar>
            {filtering && (
              <FilterChips filters={table.activeFilters} onClearAll={table.clearFilters} />
            )}
          </Stack>
        </Card>
      )}

      {selectable && bulkActions !== undefined && (
        <BulkActionBar count={table.selection.count} onClear={table.selection.clear}>
          {bulk}
        </BulkActionBar>
      )}

      {error ? (
        <Card>
          <ErrorState what={error.what} error={error.error} onRetry={error.onRetry} />
        </Card>
      ) : (
        <>
          <div
            aria-busy={busy}
            className="ui-list-frame min-w-0 transition-opacity duration-(--dur-base) motion-reduce:transition-none aria-busy:opacity-60"
          >
            <DataTableView
              table={table}
              caption={caption}
              selectable={selectable}
              selectScope={selectScope}
              stickyHeader={stickyHeader}
              renderExpanded={renderExpanded}
              onRowClick={onRowClick}
              rowOpenButton={rowOpenButton}
              rowActions={rowActions}
              loading={loading}
              empty={emptyNode}
              footer={footer}
            />
          </div>
          {pagination && !loading && (
            <TablePagination
              table={table}
              selectedCount={selectable ? table.selection.count : undefined}
              pageSizeSelect={pageSizeSelect}
            />
          )}
        </>
      )}

      {detail}
    </Stack>
  );
}
