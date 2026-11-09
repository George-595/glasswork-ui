import { useEffect, useState } from 'react';
import {
  ActivityHeatmap,
  BarChart,
  Button,
  ChartCard,
  Cluster,
  FunnelChart,
  Gauge,
  Generate,
  type GenerateRender,
  KpiTile,
  LiveLineChart,
  type LivePoint,
  SegmentedControl,
  Stack,
  Switch,
  Timeline,
  TimelineItem,
  Treemap,
  UsageMeter,
} from '~/core/ui';
import { DEMO_SPEND } from '../demo-data';
import { KitBlock, KitSection } from '../KitParts';

/* Section: data visualisation built from Arc and the kit's own effects: the generation reveal, the
   activity heatmap, gauges, usage meters, a treemap, a timeline and the KPI rolling figure.
   Fixed arrays, not the API: this page is a component reference. */

const money = (n: number) => `£${new Intl.NumberFormat('en-GB').format(n)}`;
const START = Date.parse('2026-05-04T00:00:00Z');
const HEAT = Array.from({ length: 168 }, (_, i) => ({
  date: new Date(START + i * 86_400_000).toISOString().slice(0, 10),
  count: (i * 7 + (i % 5) * 3) % 9 < 3 ? 0 : ((i * 13) % 8) + 1,
}));

/* The generation reveal: Replay puts the chart card back in its loading state for a moment,
   so it plays exactly as it does when a page's data arrives; "With the agent's notes" plays
   the texts mode (a spec sheet beside it, where there is room, and a step line). */
const RENDERS = [
  { value: 'ascii', label: 'ASCII · this skin' },
  { value: 'plot', label: 'Plot' },
  { value: 'frost', label: 'Frost' },
  { value: 'draft', label: 'Draft' },
] as const;

function GenerateDemo() {
  const [loading, setLoading] = useState(false);
  const [render, setRender] = useState<GenerateRender>('ascii');
  const [texts, setTexts] = useState(0);
  useEffect(() => {
    if (!loading) return;
    const t = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(t);
  }, [loading]);
  return (
    <Stack gap={3}>
      <Cluster gap={2}>
        <SegmentedControl
          label="Drawn as"
          size="sm"
          options={RENDERS}
          value={render}
          onValueChange={(v) => {
            setRender(v as GenerateRender);
            setLoading(true);
          }}
        />
        <Button variant="neutral" size="sm" onClick={() => setLoading(true)}>
          Replay
        </Button>
        <Button variant="outline" size="sm" onClick={() => setTexts((n) => n + 1)}>
          With the agent's notes
        </Button>
      </Cluster>
      <Generate
        key={texts}
        play={texts > 0}
        inView={false}
        mode="skeleton-texts"
        width="narrow"
        render="draft"
        traceSvg
        done="Spend chart ready"
      >
        <ChartCard
          title="Spend by category"
          description="Total spend this year."
          eyebrow="Spend"
          headingLevel="h4"
          loading={loading}
          generate={render}
          height={220}
        >
          <BarChart
            title="Spend by category"
            orientation="horizontal"
            height={220}
            data={DEMO_SPEND}
            valueFormat={money}
          />
        </ChartCard>
      </Generate>
    </Stack>
  );
}

/* The funnel: how many reached each step of signing up as a volunteer. */
const SIGN_UP = [
  { label: 'Saw the page', value: 4200 },
  { label: 'Started the form', value: 1800 },
  { label: 'Sent it', value: 1260 },
  { label: 'Did a first shift', value: 640 },
];

/* The live chart's feed: a reading every two seconds on the page's own clock, made up from a
   fixed start so it reads the same on every visit; the last 90 are kept. */
const LIVE_START = Date.parse('2026-10-12T09:00:00Z');
const reading = (i: number): LivePoint => ({
  t: LIVE_START + i * 2000,
  value: 12 + Math.round(6 * Math.sin(i / 5) + ((i * 7) % 5)),
});

function LiveDemo() {
  const [count, setCount] = useState(30);
  useEffect(() => {
    const id = window.setInterval(() => setCount((c) => c + 1), 2000);
    return () => window.clearInterval(id);
  }, []);
  const points = Array.from({ length: Math.min(count, 90) }, (_, k) =>
    reading(count - Math.min(count, 90) + k),
  );
  return (
    <ChartCard
      title="Queue length"
      description="People waiting, the last minute."
      headingLevel="h4"
    >
      <LiveLineChart title="Queue length" points={points} timeZone="UTC" />
    </ChartCard>
  );
}

export function VizSection() {
  const [countUp, setCountUp] = useState(true);
  return (
    <KitSection
      id="viz"
      title="Data visualisation"
      intro="The generation reveal, a calendar heatmap, gauges, usage meters, a treemap, a timeline and a KPI that counts up. Each has its data in a table and is told apart by more than colour."
    >
      <KitBlock
        title="Generate"
        note="When a chart card's data arrives it is drawn in from its own structure. ASCII (the default) takes the skin's look: enterprise draws it with a pen plotter, glass crystallises it out of frost and wipes the real card in. Draft is a drafting table, and the agent's notes add its spec sheet. Reduced motion gets a short fade."
        wide
      >
        <GenerateDemo />
      </KitBlock>

      <KitBlock
        title="ActivityHeatmap"
        note="Tab into the grid, then arrows move a day or a week; Home/End the row, Ctrl+Home/End the range."
        wide
      >
        <ChartCard
          title="Transactions per day"
          description="May to October 2026."
          eyebrow="Activity"
          headingLevel="h4"
        >
          <ActivityHeatmap
            title="Transactions per day"
            days={HEAT}
            unit={{ one: 'transaction', other: 'transactions' }}
          />
        </ChartCard>
      </KitBlock>

      <KitBlock
        title="Gauge"
        note="Tone follows low / high / optimum and is also written as a word."
      >
        <Cluster gap={4} align="start">
          <Gauge label="Payment success" value={91} low={70} high={85} optimum={100} />
          <Gauge label="Coverage" value={45} low={30} high={60} optimum={90} />
          <Gauge label="Refund rate" value={14} low={5} high={10} optimum={0} />
        </Cluster>
      </KitBlock>

      <KitBlock
        title="UsageMeter"
        note="Parts of one total against a limit; the state is a word with an icon."
      >
        <Stack gap={5}>
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
              { id: 'b', label: 'Editors', value: 34 },
              { id: 'c', label: 'Viewers', value: 7 },
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
        </Stack>
      </KitBlock>

      <KitBlock
        title="Treemap"
        note="Labels show where they fit; the readout and the data table name the rest."
      >
        <ChartCard title="Spend by category" headingLevel="h4">
          <Treemap title="Spend by category" data={DEMO_SPEND} valueFormat={money} />
        </ChartCard>
      </KitBlock>

      <KitBlock
        title="Timeline"
        note="One thing's history; every dot has a glyph and a word as well as a colour."
      >
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
        </Timeline>
      </KitBlock>

      <KitBlock
        title="FunnelChart"
        note="How many reached each step. Every stage gives its share of the first and of the one before; the biggest drop is marked in words."
        wide
      >
        <ChartCard title="Volunteer sign-up" description="October 2026." headingLevel="h4">
          <FunnelChart title="Volunteer sign-up" data={SIGN_UP} />
        </ChartCard>
      </KitBlock>

      <KitBlock
        title="LiveLineChart"
        note="A reading every two seconds slides in from the right. Pause updates holds the picture and counts what arrives meanwhile (WCAG 2.2.2); reduced motion steps instead of gliding."
        wide
      >
        <LiveDemo />
      </KitBlock>

      <KitBlock
        title="KpiTile count-up"
        note="The figure counts up when the tile scrolls into view (every KPI on Home and Graphs does); reduced motion and the switch show it at once. A screen reader hears the final figure only."
      >
        <Stack gap={3}>
          <Switch label="Count up" checked={countUp} onCheckedChange={setCountUp} />
          <KpiTile
            label="Revenue"
            value={128450}
            format={money}
            previous={118200}
            deltaLabel="vs last month"
            countUp={countUp}
          />
        </Stack>
      </KitBlock>
    </KitSection>
  );
}
