import { useMemo, useState } from 'react';
import {
  ApiError,
  api,
  type JobStatus,
  type JobSummary,
  type JobsResponse,
  useApiQuery,
} from '~/core/api';
import {
  Button,
  Code,
  type Column,
  type DataTableState,
  EmptyState,
  FormField,
  KpiRow,
  ListPage,
  type MenuItem,
  Page,
  SegmentedControl,
  Text,
  toast,
  useDataTable,
} from '~/core/ui';
import { formatDateTime } from '~/core/utils';
import { JobSheet } from './JobSheet';
import { JobStatusBadge, RETRYABLE, STATUS_LABEL, STATUSES } from './status';

/* The job queue: the work waiting to run, running, done and broken. Counts by status across the
   top, then a page of jobs (newest run time first) with a status filter. A failed or dead job has
   a Retry action (row menu and drawer): it goes back in the queue for a fresh set of attempts, and
   the retry is written to the audit log. Payloads are never shown: they can hold personal data. */
const COLUMNS: readonly Column<JobSummary>[] = [
  { key: 'kind', header: 'Job', cell: (j) => <Code>{j.kind}</Code> },
  { key: 'status', header: 'Status', cell: (j) => <JobStatusBadge status={j.status} /> },
  {
    key: 'attempts',
    header: 'Attempts',
    align: 'end',
    cell: (j) => `${j.attempts} of ${j.maxAttempts}`,
  },
  { key: 'runAt', header: 'Run at', cell: (j) => formatDateTime(j.runAt) },
  {
    key: 'lastError',
    header: 'Last error',
    cell: (j) =>
      j.lastError ? (
        <Text as="span" size="small" truncate>
          {j.lastError}
        </Text>
      ) : (
        <Text as="span" size="small" tone="muted">
          None
        </Text>
      ),
  },
];

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  ...STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
];
const PAGE_SIZES = [10, 25, 50, 100] as const;
const rowKey = (j: JobSummary) => j.id;
const NONE: readonly JobSummary[] = [];

export default function AdminJobsPage() {
  const [paging, setPaging] = useState({ page: 1, size: 25 });
  const [filter, setFilter] = useState<JobStatus | 'all'>('all');
  const [openId, setOpenId] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const query = useApiQuery(
    () =>
      api.jobs({
        ...(filter === 'all' ? {} : { status: filter }),
        page: paging.page,
        pageSize: paging.size,
      }),
    `${filter}:${paging.page}:${paging.size}`,
  );
  const [kept, setKept] = useState<JobsResponse | null>(null);
  if (query.status === 'success' && query.data !== kept) setKept(query.data);
  const current = query.status === 'success' ? query.data : kept;
  const loading = query.status === 'loading';

  const tableState = useMemo<Partial<DataTableState>>(
    () => ({ pageIndex: paging.page - 1, pageSize: paging.size }),
    [paging],
  );
  const table = useDataTable<JobSummary>({
    columns: COLUMNS,
    rows: current?.jobs ?? NONE,
    rowKey,
    rowLabel: (j) => `${j.kind} job`,
    state: tableState,
    onStateChange: (patch) =>
      setPaging((p) => ({
        page: patch.pageSize !== undefined ? 1 : (patch.pageIndex ?? p.page - 1) + 1,
        size: patch.pageSize ?? p.size,
      })),
    pageSizes: PAGE_SIZES,
    manual: { rowCount: current?.total ?? 0 },
  });

  async function retry(job: JobSummary) {
    if (retrying) return;
    setRetrying(job.id);
    try {
      await api.retryJob(job.id);
      toast.success('Job queued again', { description: `${job.kind} will run on the next pass.` });
      query.reload();
    } catch (err) {
      toast.error('Couldn’t retry the job', {
        description: err instanceof ApiError ? err.message : 'Try again in a moment.',
      });
      query.reload();
    } finally {
      setRetrying(null);
    }
  }

  const rowActions = (j: JobSummary): MenuItem[] =>
    RETRYABLE.includes(j.status)
      ? [{ id: 'retry', label: 'Retry', onSelect: () => void retry(j) }]
      : [];

  const counts = current?.counts;
  const open = current?.jobs.find((j) => j.id === openId) ?? null;

  return (
    <Page
      title="Jobs"
      eyebrow="Admin"
      description="Background work: emails to send, housekeeping, anything queued. A failed or dead job can be retried."
      actions={
        <Button variant="outline" size="sm" onClick={query.reload}>
          Refresh
        </Button>
      }
    >
      <KpiRow
        label="Jobs by status"
        cols={{ base: 2, sm: 3, lg: 5 }}
        skeletons={5}
        loading={counts === undefined && query.status !== 'error'}
        items={STATUSES.map((s) => ({
          id: s,
          label: STATUS_LABEL[s],
          value: counts?.[s] ?? 0,
          countUp: false,
        }))}
      />
      {current && (
        <Text role="status" className="sr-only">
          {`Showing ${table.range.from}–${table.range.to} of ${current.total} jobs`}
        </Text>
      )}
      <ListPage
        table={table}
        caption="Jobs"
        toolbarLabel="Job filters"
        filters={
          <FormField label="Status" hideLabel>
            <SegmentedControl
              label="Status"
              size="sm"
              options={FILTER_OPTIONS}
              value={filter}
              onValueChange={(v) => {
                setFilter(v as JobStatus | 'all');
                setPaging((p) => ({ ...p, page: 1 }));
              }}
            />
          </FormField>
        }
        loading={loading && current === null}
        busy={loading && current !== null}
        error={
          query.status === 'error'
            ? { what: 'the jobs', error: query.error, onRetry: query.reload }
            : null
        }
        pagination={current !== null}
        onRowClick={(j) => setOpenId(j.id)}
        rowOpenButton
        rowActions={rowActions}
        empty={
          <EmptyState
            size="sm"
            icon="wrench"
            title={
              filter === 'all' ? 'No jobs yet' : `No ${STATUS_LABEL[filter].toLowerCase()} jobs`
            }
            description={
              filter === 'all'
                ? 'Jobs appear here when the app queues work. Finished ones are cleared after 14 days.'
                : 'Try another status.'
            }
          />
        }
        detail={
          <JobSheet
            job={open}
            retrying={retrying === open?.id}
            onClose={() => setOpenId(null)}
            onRetry={(j) => void retry(j)}
          />
        }
      />
    </Page>
  );
}
