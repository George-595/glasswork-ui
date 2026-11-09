import { useMemo, useState } from 'react';
import { type ActivityItem, api, type Kpi, useApiQuery } from '~/core/api';
import {
  ActivityHeatmap,
  AreaChart,
  BarChart,
  ChartCard,
  ChartFailure,
  ChartGrid,
  ChartGridItem,
  DonutChart,
  EmptyState,
  Gauge,
  Grid,
  KpiRow,
  Page,
  Panel,
  QueryView,
  Section,
  SegmentedControl,
  Skeleton,
  Timeline,
  TimelineItem,
  Treemap,
  UsageMeter,
} from '~/core/ui';
import {
  countByDay,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  paymentSuccess,
} from '~/core/utils';

/* The graphs gallery: key figures, revenue over three ranges (an area chart), monthly
   sign-ups, spend by category as horizontal bars, spend by category split by status
   (stacked bars), the category share (donut) and as a treemap, transactions per day (a
   calendar heatmap), payment health (two gauges), spend against a budget (a usage meter)
   and the latest activity (a timeline). Every chart sits in the kit's ChartCard,
   which owns the title, the loading and error states and the "Show data table" switch.
   Each panel loads on its own, so one failure never blanks the rest. Multi-series charts
   have legend toggles (the kit's own). */

type Range = 30 | 60 | 90;
const RANGES: readonly Range[] = [30, 60, 90];
const RANGE_OPTIONS = RANGES.map((d) => ({ value: String(d), label: `${d} days` }));
const KPI_DAYS = 30;

const money = (minor: number) => formatMoney(minor, 'GBP', { compact: true });

function kpiFormat(unit: Kpi['unit']): (n: number) => string {
  if (unit === 'money') return (n) => formatMoney(Math.round(n));
  if (unit === 'percent') return (n) => formatPercent(n);
  return (n) => formatNumber(Math.round(n));
}

function KpiSection() {
  const q = useApiQuery(() => api.kpis(KPI_DAYS).then((r) => r.kpis));
  const items =
    q.status === 'success'
      ? q.data.map((k) => ({
          id: k.id,
          label: k.label,
          value: k.value,
          format: kpiFormat(k.unit),
          previous: k.previous,
          trend: k.trend,
          footnote: `vs previous ${KPI_DAYS} days`,
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

/* Revenue and costs over a range. `days` is the query key, so a new range refetches once. */
function RevenueChart({ days, onDays }: { days: Range; onDays: (d: Range) => void }) {
  const q = useApiQuery(() => api.revenue(days), days);
  const data = q.status === 'success' ? q.data : null;

  return (
    <ChartCard
      eyebrow="Revenue"
      title="Revenue and costs"
      description={`Daily, last ${days} days.`}
      actions={
        <SegmentedControl
          label="Revenue range"
          size="sm"
          options={RANGE_OPTIONS}
          value={String(days)}
          onValueChange={(v) => onDays(RANGES.find((d) => String(d) === v) ?? 30)}
        />
      }
      loading={q.status === 'loading'}
      error={q.status === 'error' ? <ChartFailure what="revenue" onRetry={q.reload} /> : undefined}
      empty={data !== null && data.revenue.length === 0}
      height={280}
    >
      {data && (
        <AreaChart
          title={`Revenue and costs, last ${days} days`}
          description="Daily revenue and costs."
          height={280}
          yFormat={money}
          series={[
            { name: 'Revenue', points: data.revenue.map((p) => ({ x: p.date, y: p.value })) },
            { name: 'Costs', points: data.costs.map((p) => ({ x: p.date, y: p.value })) },
          ]}
        />
      )}
    </ChartCard>
  );
}

function SignupsChart() {
  const q = useApiQuery(() => api.signups().then((r) => r.signups));
  const data = q.status === 'success' ? q.data : null;

  return (
    <ChartCard
      eyebrow="Growth"
      title="New sign-ups by month"
      description="The last 12 months."
      loading={q.status === 'loading'}
      error={q.status === 'error' ? <ChartFailure what="sign-ups" onRetry={q.reload} /> : undefined}
      empty={data !== null && data.length === 0}
    >
      {data && (
        <BarChart
          title="New sign-ups by month"
          description="The last 12 months."
          data={data}
          valueFormat={(n) => formatNumber(n)}
        />
      )}
    </ChartCard>
  );
}

/* Spend by category: the horizontal bars and the donut share one query. */
function SpendCharts() {
  const q = useApiQuery(() => api.categories().then((r) => r.categories));
  const data = q.status === 'success' ? q.data : null;
  const shared = {
    loading: q.status === 'loading',
    empty: data !== null && data.length === 0,
  };
  const error =
    q.status === 'error' ? <ChartFailure what="spend by category" onRetry={q.reload} /> : undefined;

  return (
    <>
      <ChartGridItem span="half">
        <ChartCard
          {...shared}
          error={error}
          eyebrow="Spend"
          title="Spend by category"
          description="Total spend over the last 180 days."
          height={220}
        >
          {data && (
            <BarChart
              title="Spend by category"
              description="Total spend over the last 180 days."
              orientation="horizontal"
              height={220}
              data={data}
              valueFormat={money}
            />
          )}
        </ChartCard>
      </ChartGridItem>

      <ChartGridItem span="half">
        <ChartCard
          {...shared}
          error={error}
          eyebrow="Spend"
          title="Category share"
          description="Each category's share of all spend."
          height={220}
        >
          {data && (
            <DonutChart
              title="Category share"
              description="Each category's share of spend."
              data={data}
              valueFormat={money}
              centerLabel={money(data.reduce((a, c) => a + c.value, 0))}
            />
          )}
        </ChartCard>
      </ChartGridItem>
      <ChartGridItem span="half">
        <ChartCard
          {...shared}
          error={error}
          eyebrow="Spend"
          title="Spend treemap"
          description="Each category as an area, sized by its spend."
          height={220}
        >
          {data && (
            <Treemap
              title="Spend treemap"
              description="Each category as an area, sized by its spend."
              height={220}
              data={data}
              valueFormat={money}
            />
          )}
        </ChartCard>
      </ChartGridItem>
    </>
  );
}

/* Spend by category, stacked by transaction status: how much of each category is paid,
   still pending, failed or refunded. The server groups it in SQL. */
function SpendByStatusChart() {
  const q = useApiQuery(() => api.spendByStatus().then((r) => r.breakdown));
  const data = q.status === 'success' ? q.data : null;

  return (
    <ChartCard
      eyebrow="Spend"
      title="Spend by category and status"
      description="Each bar is a category; its colours are the status of the spend."
      loading={q.status === 'loading'}
      error={
        q.status === 'error' ? (
          <ChartFailure what="spend by status" onRetry={q.reload} />
        ) : undefined
      }
      empty={data?.every((s) => s.data.every((d) => d.value === 0))}
    >
      {data && (
        <BarChart
          title="Spend by category and status"
          description="Spend per category, stacked by transaction status."
          layout="stacked"
          valueFormat={money}
          series={data.map((s) => ({
            name: s.status.charAt(0).toUpperCase() + s.status.slice(1),
            data: s.data,
          }))}
        />
      )}
    </ChartCard>
  );
}

/* Two gauges (beside the treemap) and transactions per day (a full-width calendar heatmap), worked out client-side from the one
   transactions request the API already serves. */
function TransactionCharts() {
  const q = useApiQuery(() => api.transactions().then((r) => r.transactions));
  const rows = q.status === 'success' ? q.data : null;
  const days = useMemo(() => (rows ? countByDay(rows.map((t) => t.date)) : []), [rows]);

  return (
    <>
      <ChartGridItem span="half">
        <Panel>
          <Section
            title="Payment health"
            description="Success is paid against failed; refunds are a share of every payment."
            level={3}
            gap={3}
          >
            <QueryView
              generate
              query={q}
              what="payment health"
              loading={<Skeleton height={120} radius="md" />}
              isEmpty={(items) => items.length === 0}
              empty={
                <EmptyState
                  size="sm"
                  icon="chart"
                  title="No payments yet"
                  description="The rates appear once a payment is made."
                />
              }
            >
              {(items) => {
                const success = paymentSuccess(items);
                const refunds =
                  (items.filter((t) => t.status === 'refunded').length / items.length) * 100;
                return (
                  <Grid cols={{ base: 1, sm: 2 }} gap={4}>
                    {success && (
                      <Gauge
                        label="Payment success"
                        value={success.percent}
                        low={70}
                        high={85}
                        optimum={100}
                        formatValue={(v) => formatPercent(v / 100)}
                        caption={`${formatNumber(success.paid)} of ${formatNumber(success.settled)} settled`}
                      />
                    )}
                    <Gauge
                      label="Refund rate"
                      value={refunds}
                      low={5}
                      high={10}
                      optimum={0}
                      formatValue={(v) => formatPercent(v / 100)}
                      caption={`of ${formatNumber(items.length)} payments`}
                    />
                  </Grid>
                );
              }}
            </QueryView>
          </Section>
        </Panel>
      </ChartGridItem>
      <ChartGridItem span="wide">
        <ChartCard
          eyebrow="Activity"
          title="Transactions per day"
          description="One square per day, darker for busier days. Arrow keys move between days."
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
    </>
  );
}

/* An illustrative budget for the seeded data: the demo has no budget endpoint, so the allowance
   is a constant, in pence like every amount. Spend by status fills it. */
const BUDGET_MINOR = 60_000_000;

function BudgetPanel() {
  const q = useApiQuery(() => api.spendByStatus().then((r) => r.breakdown));
  return (
    <Panel>
      <Section
        title="Spend against budget"
        description={`An illustrative ${formatMoney(BUDGET_MINOR, 'GBP', { compact: true })} budget, filled by every payment.`}
        level={3}
        gap={3}
      >
        <QueryView
          generate
          query={q}
          what="spend against budget"
          loading={<Skeleton height={96} radius="md" />}
        >
          {(breakdown) => (
            <UsageMeter
              label="Budget used"
              limit={BUDGET_MINOR}
              formatValue={(v) => formatMoney(v, 'GBP', { compact: true })}
              segments={breakdown.map((s) => ({
                id: s.status,
                label: s.status.charAt(0).toUpperCase() + s.status.slice(1),
                value: s.data.reduce((a, d) => a + d.value, 0),
              }))}
            />
          )}
        </QueryView>
      </Section>
    </Panel>
  );
}

const KIND_TONE: Record<ActivityItem['kind'], 'success' | 'info' | 'warning' | 'neutral'> = {
  payment: 'success',
  signup: 'info',
  ticket: 'warning',
  deploy: 'neutral',
};

function LatestActivity() {
  const q = useApiQuery(() => api.activity().then((r) => r.activity.slice(0, 6)));
  return (
    <Panel>
      <Section title="Latest activity" description="The six most recent events." level={3} gap={3}>
        <QueryView
          generate
          query={q}
          what="latest activity"
          loading={<Skeleton height={180} radius="md" />}
          isEmpty={(items) => items.length === 0}
          empty={
            <EmptyState
              size="sm"
              icon="file-text"
              title="Nothing has happened yet"
              description="Events show up here as they happen."
            />
          }
        >
          {(items) => (
            <Timeline aria-label="Latest activity">
              {items.map((a) => (
                <TimelineItem
                  key={a.id}
                  tone={KIND_TONE[a.kind]}
                  title={a.summary}
                  meta={a.actor}
                  time={<time dateTime={a.at}>{formatDateTime(a.at)}</time>}
                />
              ))}
            </Timeline>
          )}
        </QueryView>
      </Section>
    </Panel>
  );
}

export default function GraphsPage() {
  const [range, setRange] = useState<Range>(30);

  return (
    <Page title="Graphs" description="Fake data: seeded, deterministic.">
      <KpiSection />

      <ChartGrid>
        <ChartGridItem span="wide">
          <RevenueChart days={range} onDays={setRange} />
        </ChartGridItem>
        <ChartGridItem span="half">
          <SignupsChart />
        </ChartGridItem>
        <ChartGridItem span="half">
          <SpendByStatusChart />
        </ChartGridItem>
        <SpendCharts />
        <TransactionCharts />
        <ChartGridItem span="half">
          <BudgetPanel />
        </ChartGridItem>
        <ChartGridItem span="half">
          <LatestActivity />
        </ChartGridItem>
      </ChartGrid>
    </Page>
  );
}
