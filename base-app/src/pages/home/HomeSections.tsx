import { useMemo } from 'react';
import {
  type ActivityItem,
  type ActivityResponse,
  api,
  apiPaths,
  type CategoriesResponse,
  fromServer,
  type Kpi,
  type KpisResponse,
  type MetricPoint,
  type RevenueResponse,
  type TransactionsResponse,
  useApiQuery,
} from '~/core/api';
import { Link } from '~/core/router';
import {
  ActivityHeatmap,
  AreaChart,
  Badge,
  buttonAttrs,
  ChartCard,
  ChartFailure,
  ChartGridItem,
  DonutChart,
  EmptyState,
  FeedItem,
  FeedList,
  Gauge,
  Icon,
  KpiRow,
  Panel,
  QueryView,
  Section,
  Skeleton,
  Stack,
} from '~/core/ui';
import {
  countByDay,
  formatMoney,
  formatNumber,
  formatPercent,
  formatRelative,
  paymentSuccess,
} from '~/core/utils';
import type { Range } from './range';

/* The parts of the overview that draw figures: the key-figure tiles, the charts and the activity
   feed. They are a file of their own (HomePage.tsx loads it) because they are most of what the
   page weighs - the chart library, the tiles' sparklines, the plotting animation - and the page's
   frame, its greeting and its date range do not need them to be seen. The server draws them in
   the page it sends; the browser fetches this file while it hydrates the rest. Each panel loads
   its own data, so one slow or failed request never blanks the rest. */

const compactMoney = (n: number) => formatMoney(n, 'GBP', { compact: true });

const dayLabel = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
/** "3 Sept" for an ISO date; anything else is shown as given. */
function xFormat(x: string): string {
  const d = new Date(`${x}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? x : dayLabel.format(d);
}

function kpiFormat(unit: Kpi['unit']): (n: number) => string {
  if (unit === 'money') return (n) => formatMoney(Math.round(n));
  if (unit === 'percent') return (n) => formatPercent(n);
  return (n) => formatNumber(Math.round(n));
}

export function KpiSection({ days }: { days: Range }) {
  const q = useApiQuery(
    () => api.kpis(days).then((r) => r.kpis),
    days,
    fromServer(apiPaths.kpis(days), (r: KpisResponse) => r.kpis),
  );
  const items =
    q.status === 'success'
      ? q.data.map((k) => ({
          id: k.id,
          label: k.label,
          value: k.value,
          format: kpiFormat(k.unit),
          previous: k.previous,
          trend: k.trend,
          footnote: `vs previous ${days} days`,
        }))
      : [];
  return (
    <KpiRow
      label="key figures"
      items={items}
      loading={q.status === 'loading'}
      error={
        q.status === 'error' ? { what: 'key figures', error: q.error, onRetry: q.reload } : null
      }
    />
  );
}

/* The days before the range, drawn on the same x positions as the range itself: day n of
   the earlier period sits over day n of this one. If less history exists than a full period,
   what there is lines up with the end of the earlier period. */
function previousSeries(current: readonly MetricPoint[], previous: readonly MetricPoint[]) {
  const shift = current.length - previous.length;
  return previous.flatMap((p, i) => {
    const at = current[i + shift];
    return at ? [{ x: at.date, y: p.value }] : [];
  });
}

export function RevenuePanel({ days }: { days: Range }) {
  const q = useApiQuery(
    () => api.revenue(days, true),
    days,
    fromServer<RevenueResponse>(apiPaths.revenue(days, true)),
  );
  const data = q.status === 'success' ? q.data : null;
  const series = useMemo(() => {
    if (!data) return [];
    const base = [
      { name: 'Revenue', points: data.revenue.map((p) => ({ x: p.date, y: p.value })) },
      { name: 'Costs', points: data.costs.map((p) => ({ x: p.date, y: p.value })) },
    ];
    const before = previousSeries(data.revenue, data.previousRevenue ?? []);
    return before.length > 0
      ? [
          ...base,
          { name: 'Revenue, previous period', points: before, variant: 'comparison' as const },
        ]
      : base;
  }, [data]);

  return (
    <ChartCard
      eyebrow="Revenue"
      title="Revenue and costs"
      description={`Daily, last ${days} days, against the ${days} days before.`}
      loading={q.status === 'loading'}
      error={q.status === 'error' ? <ChartFailure what="revenue" onRetry={q.reload} /> : undefined}
      empty={data !== null && data.revenue.length === 0}
      height={280}
    >
      {data && (
        <AreaChart
          title={`Revenue and costs, last ${days} days`}
          height={280}
          yFormat={compactMoney}
          xFormat={xFormat}
          series={series}
        />
      )}
    </ChartCard>
  );
}

export function SpendPanel() {
  const q = useApiQuery(
    () => api.categories().then((r) => r.categories),
    '',
    fromServer(apiPaths.categories, (r: CategoriesResponse) => r.categories),
  );
  const data = q.status === 'success' ? q.data : null;
  const total = data?.reduce((a, c) => a + c.value, 0) ?? 0;

  return (
    <ChartCard
      eyebrow="Spend"
      title="Spend by category"
      description="Share of all spend, by category."
      loading={q.status === 'loading'}
      error={q.status === 'error' ? <ChartFailure what="spend" onRetry={q.reload} /> : undefined}
      empty={data !== null && data.length === 0}
      height={220}
    >
      {data && (
        <DonutChart
          title="Spend by category"
          data={data}
          valueFormat={compactMoney}
          centerLabel={compactMoney(total)}
        />
      )}
    </ChartCard>
  );
}

/* Transactions per day (a calendar heatmap) and the payment success rate (a gauge). Both are
   worked out client-side from the one transactions request the API already serves. */
export function TransactionInsights() {
  const q = useApiQuery(
    () => api.transactions().then((r) => r.transactions),
    '',
    fromServer(apiPaths.transactions, (r: TransactionsResponse) => r.transactions),
  );
  const rows = q.status === 'success' ? q.data : null;
  const days = useMemo(() => (rows ? countByDay(rows.map((t) => t.date)) : []), [rows]);

  return (
    <>
      <ChartGridItem span="two-thirds">
        <ChartCard
          eyebrow="Activity"
          title="Transactions per day"
          description="One square per day, darker for busier days."
          loading={q.status === 'loading'}
          error={
            q.status === 'error' ? (
              <ChartFailure what="transactions per day" onRetry={q.reload} />
            ) : undefined
          }
          empty={rows !== null && rows.length === 0}
          height={220}
        >
          <ActivityHeatmap
            title="Transactions per day"
            days={days}
            unit={{ one: 'transaction', other: 'transactions' }}
          />
        </ChartCard>
      </ChartGridItem>
      <ChartGridItem span="third">
        <Panel>
          <Section
            title="Payment success"
            description="Payments that settled, paid against failed."
            level={3}
            gap={3}
          >
            <QueryView
              generate
              query={q}
              what="payment success"
              loading={<Skeleton height={120} radius="md" />}
              isEmpty={(items) => paymentSuccess(items) === null}
              empty={
                <EmptyState
                  size="sm"
                  icon="chart"
                  title="Nothing has settled yet"
                  description="The rate appears once a payment is paid or has failed."
                />
              }
            >
              {(items) => {
                const success = paymentSuccess(items);
                return (
                  success && (
                    <Gauge
                      label="Payment success"
                      value={success.percent}
                      low={70}
                      high={85}
                      optimum={100}
                      formatValue={(v) => formatPercent(v / 100)}
                      caption={`${formatNumber(success.paid)} of ${formatNumber(success.settled)} settled payments`}
                    />
                  )
                );
              }}
            </QueryView>
          </Section>
        </Panel>
      </ChartGridItem>
    </>
  );
}

const KIND_LABEL: Record<ActivityItem['kind'], string> = {
  payment: 'Payment',
  signup: 'Sign-up',
  ticket: 'Ticket',
  deploy: 'Deploy',
};

const KIND_VARIANT: Record<ActivityItem['kind'], 'up' | 'info' | 'warning' | 'brand'> = {
  payment: 'up',
  signup: 'info',
  ticket: 'warning',
  deploy: 'brand',
};

export function ActivityPanel({ now, canViewAll }: { now: Date; canViewAll: boolean }) {
  const q = useApiQuery(
    () => api.activity().then((r) => r.activity),
    '',
    fromServer(apiPaths.activity, (r: ActivityResponse) => r.activity),
  );

  return (
    <Panel>
      <Section
        title="Recent activity"
        level={3}
        gap={2}
        actions={
          canViewAll && (
            // the audit log is admin-only, so only an admin is offered it
            <Link to="/admin/audit-log" {...buttonAttrs('link', 'sm')}>
              View all
              <span className="sr-only"> activity in the audit log</span>
              <Icon name="chevron-right" size={14} />
            </Link>
          )
        }
      >
        <QueryView
          generate
          query={q}
          what="recent activity"
          loading={
            <Stack gap={2}>
              {['a', 'b', 'c', 'd', 'e'].map((id) => (
                <Skeleton key={id} height={40} radius="md" />
              ))}
            </Stack>
          }
          isEmpty={(items) => items.length === 0}
          empty={
            <EmptyState
              size="sm"
              icon="file-text"
              title="Nothing has happened yet"
              description="Payments, sign-ups and deploys show up here as they happen."
            />
          }
        >
          {(items) => (
            <FeedList aria-label="Recent activity">
              {items.map((item) => (
                <FeedItem
                  key={item.id}
                  avatar={item.actor}
                  title={item.summary}
                  meta={
                    <>
                      {item.actor} · <time dateTime={item.at}>{formatRelative(item.at, now)}</time>
                    </>
                  }
                  trailing={
                    <Badge variant={KIND_VARIANT[item.kind]}>{KIND_LABEL[item.kind]}</Badge>
                  }
                />
              ))}
            </FeedList>
          )}
        </QueryView>
      </Section>
    </Panel>
  );
}
