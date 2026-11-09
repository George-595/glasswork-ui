import { useMemo, useState } from 'react';
import { api, type EmailSummary, type EmailsResponse, useApiQuery } from '~/core/api';
import {
  Button,
  Code,
  type Column,
  type DataTableState,
  EmptyState,
  ListPage,
  Page,
  Text,
  useDataTable,
} from '~/core/ui';
import { formatDateTime } from '~/core/utils';
import { EmailSheet } from './EmailSheet';
import { EmailStatusBadge } from './EmailStatusBadge';

/* The mail outbox: every email the app has queued, newest first, 25 to a page. In development
   (MAIL_TRANSPORT=log) this is the mailbox: nothing is sent, so open a row to read the message and
   follow its link (an invite, a password reset). In production it is the audit of what went out:
   who, what and when, with the plain-text body. The server pages it (manual table mode); the
   order is the server's. */
const COLUMNS: readonly Column<EmailSummary>[] = [
  { key: 'to', header: 'To' },
  { key: 'subject', header: 'Subject' },
  { key: 'template', header: 'Template', cell: (e) => <Code>{e.template}</Code> },
  { key: 'status', header: 'Status', cell: (e) => <EmailStatusBadge status={e.status} /> },
  { key: 'createdAt', header: 'Queued', cell: (e) => formatDateTime(e.createdAt) },
];

const PAGE_SIZES = [10, 25, 50, 100] as const;
const rowKey = (e: EmailSummary) => e.id;
const NONE: readonly EmailSummary[] = [];

export default function AdminMailPage() {
  const [paging, setPaging] = useState({ page: 1, size: 25 });
  const [openId, setOpenId] = useState<string | null>(null);
  const query = useApiQuery(
    () => api.emails(paging.page, paging.size),
    `${paging.page}:${paging.size}`,
  );

  /* The last answer stays on screen while the next one loads, so paging never flashes a
     skeleton; only the very first load does. */
  const [kept, setKept] = useState<EmailsResponse | null>(null);
  if (query.status === 'success' && query.data !== kept) setKept(query.data);
  const current = query.status === 'success' ? query.data : kept;
  const loading = query.status === 'loading';

  const tableState = useMemo<Partial<DataTableState>>(
    () => ({ pageIndex: paging.page - 1, pageSize: paging.size }),
    [paging],
  );
  const table = useDataTable<EmailSummary>({
    columns: COLUMNS,
    rows: current?.emails ?? NONE,
    rowKey,
    rowLabel: (e) => `${e.subject} to ${e.to}`,
    state: tableState,
    onStateChange: (patch) =>
      setPaging((p) => ({
        page: patch.pageSize !== undefined ? 1 : (patch.pageIndex ?? p.page - 1) + 1,
        size: patch.pageSize ?? p.size,
      })),
    pageSizes: PAGE_SIZES,
    manual: { rowCount: current?.total ?? 0 },
  });

  return (
    <Page
      title="Mail"
      eyebrow="Admin"
      description="Every email the app has queued, newest first. In development nothing is sent: read the message here and follow its link."
      actions={
        <Button variant="outline" size="sm" onClick={query.reload}>
          Refresh
        </Button>
      }
    >
      {current && (
        <Text role="status" className="sr-only">
          {`Showing ${table.range.from}–${table.range.to} of ${current.total} emails`}
        </Text>
      )}
      <ListPage
        table={table}
        caption="Outbound emails"
        loading={loading && current === null}
        busy={loading && current !== null}
        error={
          query.status === 'error'
            ? { what: 'the emails', error: query.error, onRetry: query.reload }
            : null
        }
        pagination={current !== null}
        onRowClick={(e) => setOpenId(e.id)}
        rowOpenButton
        empty={
          <EmptyState
            size="sm"
            icon="file-text"
            title="No emails yet"
            description="Invitations, password resets and notification emails appear here as they are queued."
          />
        }
        detail={<EmailSheet id={openId} onClose={() => setOpenId(null)} />}
      />
    </Page>
  );
}
