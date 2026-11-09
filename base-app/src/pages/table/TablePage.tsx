import { useEffect, useMemo, useRef, useState } from 'react';
import {
  type ApiError,
  api,
  apiPaths,
  fromServer,
  type Transaction,
  type TransactionsPageResponse,
  type TransactionsQuery,
  type TransactionsResponse,
  useApiQuery,
} from '~/core/api';
import { useUrlState } from '~/core/router';
import {
  Button,
  Cluster,
  type CsvSink,
  type DataTableState,
  DateRangePicker,
  downloadCsv,
  EmptyState,
  Eyebrow,
  FormField,
  ListPage,
  type MenuItem,
  Page,
  SegmentedControl,
  type SortKey,
  Text,
  toast,
  useDataTable,
} from '~/core/ui';
import { buildColumns, ID_COLUMN, isCategory, isStatus } from './columns';
import { boundsOf, SCHEMA, tableQuery, toSortKeys, toWire, type Url } from './query';
import { cleanDay, ukDay } from './range';
import { TransactionSheet } from './TransactionSheet';

/* The transactions table, as the showcase of the table system.

   SERVER MODE is the default: the API sorts, filters and pages (GET /api/transactions
   in table mode), the facet counts come from its `facets`, and the table runs in the
   kit's `manual` mode. BROWSER MODE loads the plain list once and lets useDataTable do
   all of it client-side. The UI is the same either way; only where the work happens
   differs, and the "Page total" footer says which rows it adds up.

   All the table state lives in the URL (useUrlState), so a reload or a pasted link
   restores the view: search, both facets, sort, page, page size, density, hidden
   columns, the date range and the mode. The table is controlled by that state; the hook's
   onStateChange writes it back. Search is debounced by TableSearch, so one pause in
   typing is one request. */

const PAGE_SIZES = [10, 25, 50, 100] as const;
const EXPORT_PAGE_SIZE = 100;
const NONE: readonly Transaction[] = [];

/** What a request brought back: one server page, or the whole list. */
type Loaded =
  | { kind: 'server'; page: TransactionsPageResponse }
  | { kind: 'browser'; rows: readonly Transaction[] };

const rowKey = (t: Transaction) => t.id;
const rowLabel = (t: Transaction) => `${t.customer} (${t.id})`;

/** Every page of a query, for the CSV: pages of the API's maximum size until the total is read. */
async function fetchAll(params: TransactionsQuery): Promise<Transaction[]> {
  const all: Transaction[] = [];
  let page = 1;
  for (;;) {
    const res = await api.transactionsPage({ ...params, page, pageSize: EXPORT_PAGE_SIZE });
    all.push(...res.transactions);
    if (res.transactions.length === 0 || all.length >= res.total) return all;
    page += 1;
  }
}

async function copyId(id: string) {
  try {
    await navigator.clipboard.writeText(id);
    toast.success('Copied the ID', { description: id });
  } catch {
    toast.error('Couldn’t copy the ID', { description: `Open the details and select ${id}.` });
  }
}

export interface TablePageProps {
  /** Where CSV files go. Default: a browser download. Tests pass their own. */
  csvSink?: CsvSink;
}

export default function TablePage({ csvSink }: TablePageProps = {}) {
  const [url, setUrl] = useUrlState(SCHEMA);
  const sort = useMemo(() => toSortKeys(url.sort), [url.sort]);
  // the date range: UK days in the URL, instants for the API
  const bounds = useMemo(() => boundsOf({ from: url.from, to: url.to }), [url.from, url.to]);
  const params = useMemo<TransactionsQuery>(
    () => tableQuery(url, sort, bounds),
    [url, sort, bounds],
  );

  /* Server mode re-asks on every change of the query; browser mode asks once (its key
     never changes), so filtering there costs no request. */
  const query = useApiQuery<Loaded>(
    () =>
      url.mode === 'server'
        ? api.transactionsPage(params).then((page) => ({ kind: 'server', page }))
        : api.transactions().then((r) => ({ kind: 'browser', rows: r.transactions })),
    url.mode === 'server' ? JSON.stringify(params) : 'browser',
    // a server render answered the first call ahead of the browser (query.ts `tablePrefetch`)
    url.mode === 'server'
      ? fromServer(apiPaths.transactionsPage(params), (page: TransactionsPageResponse) => ({
          kind: 'server' as const,
          page,
        }))
      : fromServer(apiPaths.transactions, (r: TransactionsResponse) => ({
          kind: 'browser' as const,
          rows: r.transactions,
        })),
  );

  /* The last answer stays on screen while the next one loads, so paging or typing
     never flashes a skeleton; only the very first load does. */
  const [kept, setKept] = useState<Loaded | null>(null);
  if (query.status === 'success' && query.data !== kept) setKept(query.data);
  const current = query.status === 'success' ? query.data : kept;
  const loaded = current && current.kind === url.mode ? current : null;
  const loading = query.status === 'loading';

  // a link to a page past the end (the data shrank, or the URL was edited): go to the last
  const overflow =
    loaded?.kind === 'server' &&
    query.status === 'success' &&
    loaded.page.transactions.length === 0 &&
    loaded.page.total > 0 &&
    url.page > 1
      ? Math.ceil(loaded.page.total / loaded.page.pageSize)
      : null;
  useEffect(() => {
    if (overflow !== null) setUrl({ page: overflow });
  }, [overflow, setUrl]);

  const [reviewed, setReviewed] = useState<ReadonlySet<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <Page
      title="Transactions"
      eyebrow="Table"
      description="Search, filter, sort and page through every transaction. Your view lives in the address bar, so a reload or a shared link brings it back."
      actions={
        <Cluster gap={2}>
          <Eyebrow aria-hidden="true">Mode</Eyebrow>
          <SegmentedControl
            label="Data mode"
            size="sm"
            value={url.mode}
            options={[
              { value: 'server', label: 'Server' },
              { value: 'browser', label: 'Browser' },
            ]}
            onValueChange={(m) => setUrl({ mode: m === 'browser' ? 'browser' : 'server', page: 1 })}
          />
        </Cluster>
      }
    >
      <Text size="small" tone="muted">
        {url.mode === 'server'
          ? 'Server mode: the API sorts, filters and pages, and sends the facet counts.'
          : 'Browser mode: every transaction is loaded once and the table does the rest itself.'}
      </Text>

      <TransactionsTable
        // a new mode, or the first rows arriving, starts the table afresh: the hook
        // then sees real rows from its first render and never resets the page from the URL
        key={`${url.mode}:${loaded ? 'ready' : 'wait'}`}
        url={url}
        setUrl={setUrl}
        sort={sort}
        params={params}
        bounds={bounds}
        loaded={loaded}
        firstLoad={loading && loaded === null}
        busy={loading && loaded !== null}
        error={query.status === 'error' ? query.error : null}
        reload={query.reload}
        reviewed={reviewed}
        onReview={(ids) => setReviewed((prev) => new Set([...prev, ...ids]))}
        onOpen={setOpenId}
        csvSink={csvSink}
      />

      <TransactionSheet
        id={openId}
        onClose={() => setOpenId(null)}
        onOpen={setOpenId}
        onFilterCustomer={(customer) => {
          setUrl({ q: customer, page: 1 });
          setOpenId(null);
        }}
        reviewed={reviewed}
      />
    </Page>
  );
}

interface TransactionsTableProps {
  url: Url;
  setUrl: ReturnType<typeof useUrlState<typeof SCHEMA>>[1];
  sort: readonly SortKey[];
  params: TransactionsQuery;
  bounds: { from?: string; before?: string };
  loaded: Loaded | null;
  firstLoad: boolean;
  busy: boolean;
  error: ApiError | null;
  reload: () => void;
  reviewed: ReadonlySet<string>;
  onReview: (ids: readonly string[]) => void;
  onOpen: (id: string) => void;
  csvSink: CsvSink | undefined;
}

function TransactionsTable({
  url,
  setUrl,
  sort,
  params,
  bounds,
  loaded,
  firstLoad,
  busy,
  error,
  reload,
  reviewed,
  onReview,
  onOpen,
  csvSink,
}: TransactionsTableProps) {
  const server = url.mode === 'server';
  // fixed for the life of the view, so the picker's "Last 7 days" does not drift
  const [today] = useState(() => ukDay(new Date()));
  // Browser mode narrows by date here, before the table sees the rows, so its search, facet
  // counts, paging and CSV all agree; in server mode the API has already done it.
  const rows = useMemo(() => {
    if (loaded?.kind === 'server') return loaded.page.transactions;
    if (loaded?.kind !== 'browser') return NONE;
    const { from, before } = bounds;
    if (!from && !before) return loaded.rows;
    return loaded.rows.filter((t) => (!from || t.date >= from) && (!before || t.date < before));
  }, [loaded, bounds]);
  const columns = useMemo(
    () =>
      buildColumns({
        reviewed,
        facets: loaded?.kind === 'server' ? loaded.page.facets : undefined,
        totalLabel: server ? 'Page total' : 'Total',
      }),
    [reviewed, loaded, server],
  );
  const csvColumns = useMemo(() => [ID_COLUMN, ...columns], [columns]);

  const tableState = useMemo<Partial<DataTableState>>(
    () => ({
      sort,
      search: url.q,
      facets: { status: url.status, category: url.category },
      pageIndex: url.page - 1,
      pageSize: url.size,
      hidden: url.hide,
      density: url.density,
    }),
    [sort, url],
  );

  // the table's changes go to the URL, which is the state; it comes back down as `state`
  const onStateChange = (patch: Partial<DataTableState>) => {
    const next: Partial<Url> = {};
    if (patch.sort) next.sort = toWire(patch.sort);
    if (patch.search !== undefined) next.q = patch.search;
    if (patch.facets) {
      next.status = (patch.facets.status ?? []).filter(isStatus);
      next.category = (patch.facets.category ?? []).filter(isCategory);
    }
    if (patch.pageIndex !== undefined) next.page = patch.pageIndex + 1;
    if (patch.pageSize !== undefined) next.size = patch.pageSize;
    if (patch.hidden) next.hide = patch.hidden;
    if (patch.density) next.density = patch.density;
    setUrl(next);
  };

  const table = useDataTable({
    columns,
    rows,
    rowKey,
    rowLabel,
    state: tableState,
    onStateChange,
    pageSizes: PAGE_SIZES,
    manual: server ? { rowCount: loaded?.kind === 'server' ? loaded.page.total : 0 } : undefined,
  });

  // Rows seen so far, so "Export selected" still finds a row picked on an earlier page.
  const seen = useRef(new Map<string, Transaction>());
  useEffect(() => {
    for (const t of rows) seen.current.set(t.id, t);
  }, [rows]);

  const [exporting, setExporting] = useState(false);
  const exportAll = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const all = server ? await fetchAll(params) : table.rows;
      downloadCsv('transactions.csv', csvColumns, all, csvSink);
      toast.success(`Exported ${all.length} transactions`, {
        description: 'transactions.csv has every row that matches the current filters.',
      });
    } catch {
      toast.error('Couldn’t export the transactions', { description: 'Try again in a moment.' });
    } finally {
      setExporting(false);
    }
  };

  const chosen = () => [...table.selection.selected].flatMap((id) => seen.current.get(id) ?? []);
  const exportSelected = () => {
    const picked = chosen();
    downloadCsv('transactions-selected.csv', csvColumns, picked, csvSink);
    toast.success(`Exported ${picked.length} selected transactions`);
  };
  const markReviewed = () => {
    const ids = [...table.selection.selected];
    onReview(ids);
    toast.success(`Marked ${ids.length} as reviewed`, {
      description: 'A demo: it stays in this tab and nothing is sent to the server.',
    });
    table.selection.clear();
  };

  const rowActions = (t: Transaction): MenuItem[] => [
    { id: 'view', label: 'View details', onSelect: () => onOpen(t.id) },
    { id: 'copy', label: 'Copy ID', onSelect: () => void copyId(t.id) },
    {
      id: 'customer',
      label: 'Filter by this customer',
      onSelect: () => setUrl({ q: t.customer, page: 1 }),
    },
  ];

  let total = 0;
  let from = 0;
  let to = 0;
  if (loaded?.kind === 'server') {
    const p = loaded.page;
    total = p.total;
    from = p.total === 0 ? 0 : (p.page - 1) * p.pageSize + 1;
    to = Math.min(p.total, p.page * p.pageSize);
  } else if (loaded) {
    total = table.rowCount;
    from = table.range.from;
    to = table.range.to;
  }

  return (
    <>
      {loaded && (
        <Text role="status" className="sr-only">
          {`Showing ${from}–${to} of ${total} transactions`}
        </Text>
      )}
      <ListPage
        table={table}
        caption="Transactions"
        toolbarLabel="Transaction filters"
        search={{ placeholder: 'Customer or description', debounce: 250 }}
        columnToggle
        densityToggle
        filters={
          <FormField label="Date range" hideLabel>
            <DateRangePicker
              size="sm"
              fit
              clearable
              value={{ from: cleanDay(url.from) || null, to: cleanDay(url.to) || null }}
              onValueChange={(r) => setUrl({ from: r.from ?? '', to: r.to ?? '', page: 1 })}
              today={today}
              placeholder="Any date"
              panelLabel="Choose the transaction date range"
            />
          </FormField>
        }
        toolbarActions={
          <Button variant="outline" size="sm" aria-disabled={exporting} onClick={exportAll}>
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        }
        selectable
        selectScope={server ? 'page' : 'filtered'}
        stickyHeader
        bulkActions={
          <>
            <Button variant="outline" size="sm" onClick={exportSelected}>
              Export selected
            </Button>
            <Button size="sm" onClick={markReviewed}>
              Mark as reviewed (demo)
            </Button>
          </>
        }
        loading={firstLoad}
        busy={busy}
        error={error ? { what: 'transactions', error, onRetry: reload } : null}
        pagination={loaded !== null}
        onRowClick={(t) => onOpen(t.id)}
        rowActions={rowActions}
        empty={
          <EmptyState
            size="sm"
            icon="search"
            title="No transactions match these filters"
            description="Try a different search, or remove a filter."
            action={
              table.activeFilters.length > 0 || bounds.from || bounds.before ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    table.clearFilters();
                    setUrl({ from: '', to: '', page: 1 });
                  }}
                >
                  Clear filters
                </Button>
              ) : undefined
            }
          />
        }
      />
    </>
  );
}
