/* The data-viz imports in every state, for the showcase's axe gate (all four skin × mode
   passes): the activity heatmap (with data, and empty), the gauge in each tone, the usage meter
   (ok, almost full, over), the treemap, the funnel, the live line and the timeline.
   Deterministic: no clock, no random. */
import {
  ActivityHeatmap,
  ChartCard,
  FunnelChart,
  Gauge,
  LiveLineChart,
  Timeline,
  TimelineItem,
  Treemap,
  UsageMeter,
} from '../src/index';

const START = Date.parse('2026-05-04T00:00:00Z');
export const HEAT_DAYS = Array.from({ length: 150 }, (_, i) => ({
  date: new Date(START + i * 86_400_000).toISOString().slice(0, 10),
  count: (i * 7 + (i % 5) * 3) % 9 < 3 ? 0 : ((i * 13) % 8) + 1,
}));

const money = (n: number) => `£${new Intl.NumberFormat('en-GB').format(n)}`;

export function VizShowcase() {
  return (
    <section
      aria-label="Data visualisation"
      style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 24 }}
    >
      <ChartCard title="Transactions per day" description="Heatmap, May to September 2026.">
        <ActivityHeatmap
          title="Transactions per day"
          days={HEAT_DAYS}
          unit={{ one: 'transaction', other: 'transactions' }}
        />
      </ChartCard>
      <ActivityHeatmap title="Quiet period" days={[]} emptyMessage="No activity yet." />
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
        <Gauge
          label="Payment success"
          value={91}
          low={70}
          high={85}
          optimum={100}
          caption="of 240"
        />
        <Gauge
          label="Refund rate"
          value={14}
          low={5}
          high={10}
          optimum={0}
          formatValue={(v) => `${v}%`}
        />
        <Gauge label="Coverage" value={45} low={30} high={60} optimum={50} />
        <Gauge label="Neutral" value={0} />
      </div>
      <UsageMeter
        label="Storage"
        limit={100}
        formatValue={(v) => `${v} GB`}
        segments={[
          { id: 'docs', label: 'Documents', value: 32 },
          { id: 'img', label: 'Images', value: 21 },
          { id: 'vid', label: 'Video', value: 12 },
        ]}
      />
      <UsageMeter
        label="Seats"
        limit={50}
        segments={[
          { id: 'a', label: 'Admins', value: 6 },
          { id: 'b', label: 'Editors', value: 30 },
          { id: 'c', label: 'Viewers', value: 11 },
        ]}
      />
      <UsageMeter
        label="API calls"
        limit={1000}
        segments={[
          { id: 'r', label: 'Reads', value: 800 },
          { id: 'w', label: 'Writes', value: 450 },
        ]}
      />
      <ChartCard title="Spend by category" description="Treemap.">
        <Treemap
          title="Spend by category"
          valueFormat={money}
          data={[
            { label: 'Software', value: 48200 },
            { label: 'Hardware', value: 31900 },
            { label: 'Services', value: 22400 },
            { label: 'Travel', value: 9800 },
            { label: 'Office', value: 4100 },
            { label: 'Training', value: 1200 },
          ]}
        />
      </ChartCard>
      <ChartCard title="Volunteer sign-up" description="Funnel.">
        <FunnelChart
          title="Volunteer sign-up"
          data={[
            { label: 'Visited', value: 3000 },
            { label: 'Signed up', value: 1200 },
            { label: 'First shift', value: 900 },
            { label: 'Came back', value: 300 },
          ]}
        />
      </ChartCard>
      <LiveLineChart
        title="Queue length"
        timeZone="UTC"
        points={Array.from({ length: 20 }, (_, i) => ({
          t: START + i * 5000,
          value: 10 + ((i * 7) % 5),
        }))}
      />
      <Timeline aria-label="Order 1001 history">
        <TimelineItem
          title="Order placed"
          time={<time dateTime="2026-09-01T09:00">1 Sept, 09:00</time>}
          meta="Web checkout"
        />
        <TimelineItem
          tone="success"
          title="Payment captured"
          time={<time dateTime="2026-09-01T09:01">1 Sept, 09:01</time>}
        />
        <TimelineItem
          tone="warning"
          title="Address check needs a review"
          time={<time dateTime="2026-09-02T10:20">2 Sept, 10:20</time>}
        />
        <TimelineItem
          tone="danger"
          title="Delivery attempt failed"
          time={<time dateTime="2026-09-03T14:05">3 Sept, 14:05</time>}
          meta="Nobody home"
        />
        <TimelineItem tone="info" title="Rebooked for Monday" />
      </Timeline>
    </section>
  );
}
