import { useMemo, useState } from 'react';
import { type AuditEvent, api, useApiQuery } from '~/core/api';
import {
  Badge,
  Button,
  Code,
  type Column,
  DateRangePicker,
  type DayRange,
  DetailSection,
  DetailSheet,
  downloadCsv,
  EMPTY_RANGE,
  EmptyState,
  FormField,
  ListPage,
  Page,
  Stack,
  Text,
  useDataTable,
} from '~/core/ui';
import { formatDateTime } from '~/core/utils';
import { AUDIT_RANGE_PRESETS, dayKey, inDayRange } from './logic';

/* The audit log: one table of events, newest first, in the kit's ListPage. Search (actor,
   action, target, IP), Actor / Action / Outcome facets with counts and removable chips come
   from the table; the date range is a DateRangePicker (quick ranges plus a calendar) beside
   them that narrows the rows by UK day before the table sees them, so the counts, the status
   line and "Export CSV" always agree.
   A row opens its full record in a DetailSheet (the fields, and the raw JSON). */
const ZONE = 'Europe/London';
const whenFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: ZONE,
});

function Outcome({ outcome }: { outcome: AuditEvent['outcome'] }) {
  return outcome === 'success' ? (
    <Badge variant="up">Success</Badge>
  ) : (
    <Badge variant="down">Failure</Badge>
  );
}

const COLUMNS: readonly Column<AuditEvent>[] = [
  {
    key: 'at',
    header: 'When',
    sortable: true,
    searchable: false,
    cell: (e) => whenFormat.format(new Date(e.at)),
    csv: (e) => e.at,
  },
  { key: 'actor', header: 'Actor', sortable: true, searchable: true, facet: true },
  {
    key: 'action',
    header: 'Action',
    sortable: true,
    searchable: true,
    facet: true,
    cell: (e) => <Code>{e.action}</Code>,
  },
  { key: 'target', header: 'Target', sortable: true, searchable: true },
  {
    key: 'ip',
    header: 'IP address',
    searchable: true,
    hideable: true,
    defaultHidden: true,
  },
  {
    key: 'outcome',
    header: 'Outcome',
    sortable: true,
    searchable: false,
    facet: true,
    cell: (e) => <Outcome outcome={e.outcome} />,
  },
];

/* The CSV has every field, not just the columns the table shows. */
const CSV_COLUMNS: readonly Column<AuditEvent>[] = [
  { key: 'at', header: 'When' },
  { key: 'actor', header: 'Actor' },
  { key: 'action', header: 'Action' },
  { key: 'target', header: 'Target' },
  { key: 'ip', header: 'IP' },
  { key: 'outcome', header: 'Outcome' },
  { key: 'id', header: 'Event ID' },
];

function EventDetails({ event }: { event: AuditEvent }) {
  return (
    <Stack gap={5}>
      <DetailSection
        title="Event"
        columns={2}
        items={[
          { term: 'Event ID', detail: <Code>{event.id}</Code> },
          { term: 'When', detail: formatDateTime(event.at) },
          { term: 'Actor', detail: event.actor },
          { term: 'Action', detail: <Code>{event.action}</Code> },
          { term: 'Target', detail: event.target },
          { term: 'IP address', detail: <Code>{event.ip}</Code> },
          { term: 'Outcome', detail: <Outcome outcome={event.outcome} /> },
        ]}
      />
      <DetailSection title="Raw event">
        <Code block aria-label={`Raw event ${event.id}`}>
          {JSON.stringify(event, null, 2)}
        </Code>
      </DetailSection>
    </Stack>
  );
}

export default function AuditLogPage() {
  const log = useApiQuery(() => api.auditLog().then((r) => r.events));
  const [range, setRange] = useState<DayRange>(EMPTY_RANGE);
  const [openId, setOpenId] = useState<string | null>(null);
  // Fixed for the life of the page, so "Today" and "Last 7 days" do not drift under the reader.
  const [today] = useState(() => dayKey(new Date()));

  const events = log.status === 'success' ? log.data : null;
  const inRange = useMemo(
    () => (events ?? []).filter((e) => inDayRange(e.at, range)),
    [events, range],
  );

  const table = useDataTable<AuditEvent>({
    columns: COLUMNS,
    rows: inRange,
    rowKey: (e) => e.id,
    rowLabel: (e) => `${e.action} by ${e.actor}`,
    initialState: { pageSize: 25, sort: [{ key: 'at', dir: 'desc' }] },
  });
  const open = (events ?? []).find((e) => e.id === openId) ?? null;

  const empty =
    events !== null && events.length === 0 ? (
      <EmptyState
        size="sm"
        icon="shield"
        title="No events yet"
        description="Sign-ins and changes made by admins will be recorded here."
      />
    ) : (
      <EmptyState
        size="sm"
        icon="search"
        title="No events match these filters"
        description="Try a wider date range or clear a filter."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              table.clearFilters();
              setRange(EMPTY_RANGE);
            }}
          >
            Clear all
          </Button>
        }
      />
    );

  return (
    <Page title="Audit log" eyebrow="Admin" description="Who did what, and when. Newest first.">
      <ListPage
        table={table}
        caption="Audit events"
        toolbarLabel="Audit log filters"
        search={{ label: 'Search audit events', placeholder: 'Search actor, action, target or IP' }}
        columnToggle
        filters={
          <FormField label="Date range" hideLabel>
            <DateRangePicker
              size="sm"
              fit
              clearable
              value={range}
              onValueChange={setRange}
              today={today}
              presets={AUDIT_RANGE_PRESETS}
              placeholder="All time"
              panelLabel="Choose the audit log's date range"
            />
          </FormField>
        }
        toolbarActions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => downloadCsv('audit-log.csv', CSV_COLUMNS, table.rows)}
          >
            Export CSV
          </Button>
        }
        loading={log.status === 'loading'}
        error={
          log.status === 'error'
            ? { what: 'the audit log', error: log.error, onRetry: log.reload }
            : null
        }
        empty={empty}
        onRowClick={(e) => setOpenId(e.id)}
        rowOpenButton
        detail={
          <DetailSheet
            open={open !== null}
            onOpenChange={(isOpen) => !isOpen && setOpenId(null)}
            title={open ? open.action : 'Event'}
            subtitle={open ? `${open.actor} · ${formatDateTime(open.at)}` : undefined}
          >
            {open && <EventDetails event={open} />}
          </DetailSheet>
        }
      />
      {events !== null && (
        <Text role="status" size="small" tone="muted">
          {table.rows.length} of {events.length} events shown
        </Text>
      )}
    </Page>
  );
}
