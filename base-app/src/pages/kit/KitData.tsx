import { useState } from 'react';
import {
  AreaChart,
  Badge,
  type BadgeVariant,
  BarChart,
  Button,
  ChartCard,
  Cluster,
  type Column,
  DataTable,
  DonutChart,
  Grid,
  Heading,
  LineChart,
  type MenuItem,
  PointerLight,
  RollingNumber,
  SegmentedControl,
  ShaderHero,
  Sparkline,
  Stack,
  Text,
  toast,
  useAppTheme,
} from '~/core/ui';
import {
  DEMO_COSTS,
  DEMO_ORDERS,
  DEMO_REVENUE,
  DEMO_SIGNUPS,
  DEMO_SPEND,
  DEMO_TREND,
  type DemoOrder,
  type OrderStatus,
} from './demo-data';
import { KitBlock, KitSection, useKitLoading } from './KitParts';

/* Sections 7 to 9: the table, the charts, and the effects. The table and chart data are local
   static arrays (demo-data.ts), because this page is a component reference rather than a data
   page. Every chart sits in a ChartCard, as it would in a real page. */

const money = (n: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n);
const compact = (n: number) =>
  `£${new Intl.NumberFormat('en-GB', { notation: 'compact' }).format(n)}`;

const STATUS_BADGE: Record<OrderStatus, BadgeVariant> = {
  paid: 'up',
  pending: 'warning',
  failed: 'down',
  refunded: 'neutral',
};
const STATUS_LABEL: Record<OrderStatus, string> = {
  paid: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
  refunded: 'Refunded',
};

const COLUMNS: readonly Column<DemoOrder>[] = [
  { key: 'id', header: 'Order', sortable: true },
  { key: 'customer', header: 'Customer', sortable: true, hideable: true },
  { key: 'plan', header: 'Plan', sortable: true, facet: true, hideable: true },
  { key: 'date', header: 'Date', sortable: true, hideable: true },
  {
    key: 'amount',
    header: 'Amount',
    align: 'end',
    sortable: true,
    sortValue: (o) => o.amount,
    cell: (o) => money(o.amount),
    footer: (rows) => `Total ${money(rows.reduce((sum, o) => sum + o.amount, 0))}`,
    csv: (o) => o.amount,
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    facet: true,
    facetLabel: (v) => STATUS_LABEL[v as OrderStatus] ?? v,
    cell: (o) => <Badge variant={STATUS_BADGE[o.status]}>{STATUS_LABEL[o.status]}</Badge>,
    csv: (o) => STATUS_LABEL[o.status],
  },
];

export function TablesSection() {
  const loading = useKitLoading();
  return (
    <KitSection
      id="tables"
      title="Tables"
      intro="DataTable with its toolbar: search, facet filters, column and density controls, paging, selection and CSV export."
    >
      <KitBlock
        title="DataTable"
        note="Try the search, the Plan and Status filters, the Columns menu and row selection."
        wide
      >
        <DataTable
          caption="Demo orders"
          columns={COLUMNS}
          rows={DEMO_ORDERS}
          rowKey={(o) => o.id}
          pageSize={6}
          pageSizes={[6, 12, 24]}
          initialSort={{ key: 'date', dir: 'desc' }}
          search={{ placeholder: 'Search orders' }}
          columnToggle
          densityToggle
          selectable
          exportCsv="demo-orders.csv"
          rowLabel={(o) => o.id}
          rowActions={(o): readonly MenuItem[] => [
            {
              id: 'view',
              label: 'View order',
              icon: 'file-text',
              onSelect: () => toast(`Viewing ${o.id}`),
            },
            {
              id: 'refund',
              label: 'Refund',
              icon: 'x',
              danger: true,
              onSelect: () => toast.error(`Refunded ${o.id}`),
            },
          ]}
          bulkActions={(selected) => (
            <Button
              size="sm"
              variant="outline"
              onClick={() => toast.success(`Archived ${selected.size} orders`)}
            >
              Archive
            </Button>
          )}
        />
      </KitBlock>

      <KitBlock
        title="Loading and empty"
        note="The table keeps its frame while it loads or when nothing matches."
        wide
      >
        <Grid minItemWidth={320} gap={4}>
          <DataTable
            caption="Orders that load"
            columns={COLUMNS.slice(0, 4)}
            rows={DEMO_ORDERS.slice(0, 3)}
            rowKey={(o) => o.id}
            pageSize={0}
            loading={loading}
          />
          <DataTable
            caption="No orders yet"
            columns={COLUMNS.slice(0, 4)}
            rows={[]}
            rowKey={(o) => o.id}
            emptyText="No orders yet."
          />
        </Grid>
      </KitBlock>
    </KitSection>
  );
}

export function ChartsSection() {
  const loading = useKitLoading();
  return (
    <KitSection
      id="charts"
      title="Charts"
      intro="Each chart sits in a ChartCard: a heading, a data-table switch for everyone who cannot read a plot, and loading, empty and error states."
    >
      <KitBlock title="LineChart" note="A line, with a comparison series dashed." wide>
        <ChartCard
          title="Revenue and costs"
          description="Daily, September 2026"
          eyebrow="Line"
          headingLevel="h4"
          height={260}
        >
          <LineChart
            title="Revenue and costs, September"
            description="Daily revenue and costs."
            yFormat={compact}
            series={[
              { name: 'Revenue', points: DEMO_REVENUE },
              { name: 'Costs', points: DEMO_COSTS, variant: 'comparison' },
            ]}
          />
        </ChartCard>
      </KitBlock>

      <KitBlock title="AreaChart">
        <ChartCard title="Revenue" eyebrow="Area" headingLevel="h4">
          <AreaChart
            title="Revenue, September (area)"
            yFormat={compact}
            series={[{ name: 'Revenue', points: DEMO_REVENUE }]}
          />
        </ChartCard>
      </KitBlock>

      <KitBlock title="BarChart">
        <ChartCard title="New sign-ups" eyebrow="Bar" headingLevel="h4">
          <BarChart title="New sign-ups by month" data={DEMO_SIGNUPS} />
        </ChartCard>
      </KitBlock>

      <KitBlock title="BarChart, horizontal">
        <ChartCard title="Spend by category" eyebrow="Horizontal" headingLevel="h4">
          <BarChart
            title="Spend by category"
            orientation="horizontal"
            data={DEMO_SPEND}
            valueFormat={compact}
            yFormat={compact}
          />
        </ChartCard>
      </KitBlock>

      <KitBlock title="DonutChart">
        <ChartCard title="Category share" eyebrow="Donut" headingLevel="h4">
          <DonutChart
            title="Category share of spend"
            data={DEMO_SPEND}
            valueFormat={compact}
            centerLabel="Spend"
          />
        </ChartCard>
      </KitBlock>

      <KitBlock
        title="Card states"
        note="Loading (switch it on at the top of the page), empty and error, as a ChartCard shows them."
      >
        <Stack gap={4}>
          <ChartCard title="Chart that loads" headingLevel="h4" loading={loading} height={120}>
            <BarChart
              title="Sign-ups, first four months"
              data={DEMO_SIGNUPS.slice(0, 4)}
              height={120}
            />
          </ChartCard>
          <ChartCard title="Empty chart" headingLevel="h4" empty height={120}>
            <BarChart title="Empty" data={[]} />
          </ChartCard>
          <ChartCard
            title="Failed chart"
            headingLevel="h4"
            error={<Text>Could not load the chart.</Text>}
            height={120}
          >
            <BarChart title="Failed" data={[]} />
          </ChartCard>
        </Stack>
      </KitBlock>

      <KitBlock
        title="Sparkline"
        note="Inline trends: accent, or auto (green when up, red when down, with the word in its name)."
      >
        <Cluster gap={3}>
          <Sparkline values={DEMO_TREND} label="Orders, last 12 weeks" />
          <Sparkline values={DEMO_TREND} label="Orders trend" width={140} height={40} />
          <Sparkline values={DEMO_TREND.toReversed()} label="Churn" tone="auto" />
        </Cluster>
      </KitBlock>
    </KitSection>
  );
}

const ACCENTS = [
  { value: 'mesh', label: 'Mesh' },
  { value: 'aurora-noise', label: 'Aurora' },
  { value: 'liquid-metal', label: 'Metal' },
  { value: 'glass-caustics', label: 'Caustics' },
] as const;
type AccentValue = (typeof ACCENTS)[number]['value'];

export function EffectsSection() {
  const { skin } = useAppTheme();
  const [accent, setAccent] = useState<AccentValue>('mesh');
  const [replay, setReplay] = useState(0);

  return (
    <KitSection
      id="effects"
      title="Effects"
      intro="Expressive touches. All of them stop under reduced motion and none carries meaning on its own."
    >
      <KitBlock
        title="RollingNumber"
        note="Each digit spins up on its own reel and settles, left to right, once in view. A screen reader hears only the final value."
      >
        <Cluster gap={5}>
          <Text size="display">
            <RollingNumber key={`a${replay}`} to={12840} />
          </Text>
          <Text size="display">
            <RollingNumber key={`b${replay}`} to={98.6} format={(n) => `${n.toFixed(1)}%`} />
          </Text>
          <Text size="display">
            <RollingNumber key={`c${replay}`} to={48250} format={money} />
          </Text>
        </Cluster>
        <Cluster>
          <Button size="sm" variant="outline" onClick={() => setReplay((n) => n + 1)}>
            Replay
          </Button>
        </Cluster>
      </KitBlock>

      <KitBlock
        title="PointerLight"
        note="A pool of light follows a mouse or pen, the edge nearest it catches the light, and one sheen crosses on arrival. Fine pointers only."
      >
        <PointerLight surface>
          <Text size="small" tone="muted">
            Move the pointer across this card.
          </Text>
        </PointerLight>
      </KitBlock>

      <KitBlock
        title="ShaderAccent"
        note="A bounded shader behind a hero. Glass skin only; WebGPU where available, a gradient otherwise."
        wide
      >
        <Cluster>
          <SegmentedControl
            label="Shader preset"
            size="sm"
            value={accent}
            onValueChange={(v) => setAccent(ACCENTS.find((a) => a.value === v)?.value ?? 'mesh')}
            options={ACCENTS}
          />
        </Cluster>
        <ShaderHero preset={accent} intensity={0.55} active={skin === 'glass'}>
          <Heading level={4} size={2}>
            A hero with a living backdrop
          </Heading>
          <Text size="small" tone="muted">
            {skin === 'glass'
              ? 'The accent sits behind this text and fades toward the edges.'
              : 'Switch to the glass skin at the top of the page to see the accent.'}
          </Text>
        </ShaderHero>
      </KitBlock>
    </KitSection>
  );
}
