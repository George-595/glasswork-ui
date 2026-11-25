import { useEffect, useState } from 'react';
import {
  type ActivityDay,
  ActivityHeatmap,
  ApprovalCard,
  type ApprovalDecision,
  Avatar,
  AvatarGroup,
  Badge,
  BarChart,
  Button,
  ButtonGroup,
  ChartCard,
  ChatMessage,
  ChatThread,
  Cluster,
  type Column,
  Combobox,
  type ComboOption,
  Composer,
  type ComposerAttachment,
  DataTable,
  DateRangePicker,
  type DayRange,
  DonutChart,
  EmptyState,
  ErrorState,
  FileDropzone,
  FormField,
  Gauge,
  KpiTile,
  LineChart,
  Progress,
  ProgressRing,
  ProgressSteps,
  RangeSlider,
  SeaGlassDock,
  SeaGlassRating,
  Select,
  ShaderHero,
  SkeletonSwap,
  Slider,
  SplitButton,
  Stack,
  Tabs,
  Text,
  Thinking,
  ToolChip,
  ToolTimeline,
  toast,
} from '~/core/ui';
import { DEMO_ORDERS, DEMO_REVENUE, DEMO_SIGNUPS, DEMO_SPEND, type DemoOrder } from '../demo-data';
import { KitBlock, KitSection } from '../KitParts';

/* What's new: every component improved in the November 2026 pass, each in the state that shows
   the change. Everything here is live: drag, type, press, hover. */

const TODAY = '2026-10-12';
const money = (n: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n);
const compact = (n: number) =>
  new Intl.NumberFormat('en-GB', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const PEOPLE: readonly ComboOption[] = [
  {
    value: 'ada',
    label: 'Ada Lovelace',
    description: 'Engineering',
    hint: 'Owner',
    leading: <Avatar name="Ada Lovelace" size="xs" />,
  },
  {
    value: 'grace',
    label: 'Grace Hopper',
    description: 'Platform',
    hint: 'Admin',
    leading: <Avatar name="Grace Hopper" size="xs" />,
  },
  {
    value: 'alan',
    label: 'Alan Turing',
    description: 'Research',
    hint: 'Member',
    leading: <Avatar name="Alan Turing" size="xs" />,
  },
  {
    value: 'katherine',
    label: 'Katherine Johnson',
    description: 'Data',
    hint: 'Member',
    leading: <Avatar name="Katherine Johnson" size="xs" />,
  },
];

const COUNTRIES = [
  'United Kingdom',
  'Ireland',
  'France',
  'Germany',
  'Spain',
  'Italy',
  'Netherlands',
  'Portugal',
  'Sweden',
  'Norway',
].map((c) => ({ value: c.toLowerCase().replace(/\s/g, '-'), label: c }));

const COSTS = DEMO_REVENUE.map((p, i) => ({
  x: p.x,
  y: Math.round(p.y * (0.55 + (i % 5) * 0.03)),
}));
const PROFIT = DEMO_REVENUE.map((p, i) => ({ x: p.x, y: p.y - (COSTS[i]?.y ?? 0) }));

/* A year of activity, deterministic. */
const DAYS: readonly ActivityDay[] = Array.from({ length: 182 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 3, 14 + i));
  const wave = Math.sin(i / 9) + Math.cos(i / 4);
  return {
    date: d.toISOString().slice(0, 10),
    count: Math.max(
      0,
      Math.round(3 + wave * 3 + ((i * 7) % 5) - (d.getUTCDay() % 6 === 0 ? 4 : 0)),
    ),
  };
});

const MANY_ORDERS: readonly DemoOrder[] = Array.from({ length: 2000 }, (_, i) => {
  const base = DEMO_ORDERS[i % DEMO_ORDERS.length] as DemoOrder;
  return { ...base, id: `ORD-${String(10001 + i)}`, amount: base.amount + (i % 17) };
});

const COLUMNS: readonly Column<DemoOrder>[] = [
  { key: 'id', header: 'Order', sortable: true, width: 140 },
  { key: 'customer', header: 'Customer', sortable: true, facet: true },
  { key: 'plan', header: 'Plan', sortable: true, facet: true, hideable: true },
  { key: 'date', header: 'Date', sortable: true, hideable: true },
  {
    key: 'amount',
    header: 'Amount',
    align: 'end',
    sortable: true,
    sortValue: (o) => o.amount,
    cell: (o) => money(o.amount),
  },
  {
    key: 'status',
    header: 'Status',
    sortable: true,
    facet: true,
    cell: (o) => (
      <Badge variant={o.status === 'paid' ? 'up' : o.status === 'failed' ? 'down' : 'neutral'}>
        {o.status}
      </Badge>
    ),
  },
];

const REPLY = `Here is **September** at a glance.

### Revenue by plan
| Plan | Orders | Revenue |
| --- | --- | --- |
| Starter | 12 | £696 |
| Team | 12 | £2,856 |
| Business | 12 | £11,736 |

Three things stand out:
1. Business is *80%* of revenue.
2. Two payments failed on the 14th.
3. Refunds are down to \`0.8%\`.

\`\`\`sql
select plan, count(*), sum(amount)
from orders
where date >= '2026-09-01'
group by plan;
\`\`\`

> The failed payments retry on their own tomorrow.`;

function useTicker(on: boolean, step = 0.07) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setV((x) => (x >= 1 ? 0 : Math.min(1, x + step))), 260);
    return () => clearInterval(t);
  }, [on, step]);
  return v;
}

export function ImprovedSection() {
  const [person, setPerson] = useState<string | null>('ada');
  const [country, setCountry] = useState<string>('united-kingdom');
  const [price, setPrice] = useState<[number, number]>([120, 640]);
  const [quality, setQuality] = useState(60);
  const [period, setPeriod] = useState<DayRange>({ from: '2026-10-06', to: TODAY });
  const [files, setFiles] = useState<File[]>([]);
  const upload = useTicker(files.length > 0, 0.05);
  const [attachments, setAttachments] = useState<ComposerAttachment[]>([
    { id: 'a1', name: 'september-orders.csv', detail: '24 KB' },
  ]);
  const [streaming, setStreaming] = useState(false);
  const [listening, setListening] = useState(false);
  const [decision, setDecision] = useState<ApprovalDecision | undefined>();
  const [expires] = useState(() => Date.now() + 90_000);
  const [loadingKpi, setLoadingKpi] = useState(false);
  const [step, setStep] = useState(1);
  const [rating, setRating] = useState(4);
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState(REPLY);
  const [typing, setTyping] = useState(false);

  // replay the reply word by word, so the streaming caret can be seen
  useEffect(() => {
    if (!typing) return;
    const words = REPLY.split(/(?<=\s)/);
    let n = 0;
    const t = setInterval(() => {
      n += 3;
      setReply(words.slice(0, n).join(''));
      if (n >= words.length) {
        clearInterval(t);
        setTyping(false);
      }
    }, 70);
    return () => clearInterval(t);
  }, [typing]);

  return (
    <KitSection
      id="improved"
      title="What's new"
      intro="Every element from the improvement list, live: drag, type, hover and press to try them."
    >
      <KitBlock
        title="1. Combobox"
        note="Full width in glass, the arrow sits inside, rows carry an avatar and a hint."
      >
        <FormField label="Owner">
          <Combobox options={PEOPLE} value={person} onValueChange={setPerson} clearable />
        </FormField>
      </KitBlock>

      <KitBlock
        title="8. Select"
        note="Styled with search on a mouse; the phone's own picker on touch."
      >
        <FormField label="Country">
          <Select
            options={COUNTRIES}
            value={country}
            onValueChange={(v) => setCountry(v ?? 'united-kingdom')}
          />
        </FormField>
      </KitBlock>

      <KitBlock
        title="2. Line and area chart"
        note="A colour per series, a crosshair with a glass readout, drag across to zoom, double-click to reset."
        wide
      >
        <ChartCard title="Revenue, costs and profit" eyebrow="September" headingLevel="h4">
          <LineChart
            title="Revenue, costs and profit, September"
            yFormat={compact}
            series={[
              { name: 'Revenue', points: DEMO_REVENUE },
              { name: 'Costs', points: COSTS },
              { name: 'Profit', points: PROFIT },
            ]}
          />
        </ChartCard>
      </KitBlock>

      <KitBlock title="2. Bar chart" note="One colour per bar when there is one series.">
        <ChartCard title="Sign-ups by month" headingLevel="h4">
          <BarChart title="Sign-ups by month" data={DEMO_SIGNUPS} colorBy="category" />
        </ChartCard>
      </KitBlock>

      <KitBlock
        title="17. Donut"
        note="Rounded slices, the hovered one lifts, the total in the middle."
      >
        <ChartCard title="Spend by category" headingLevel="h4">
          <DonutChart
            title="Spend by category"
            data={DEMO_SPEND}
            valueFormat={compact}
            centerLabel="Total spend"
          />
        </ChartCard>
      </KitBlock>

      <KitBlock title="19. Gauge" note="The needle swings in; the triangle is the target.">
        <Cluster gap={4}>
          <Gauge
            label="Uptime"
            value={97.2}
            min={90}
            max={100}
            target={99}
            formatValue={(v) => `${v}%`}
          />
          <Gauge label="Quality" value={quality} target={75} formatValue={(v) => `${v}`} />
        </Cluster>
        <Slider label="Quality score" value={quality} onValueChange={setQuality} />
      </KitBlock>

      <KitBlock
        title="11. KPI tiles"
        note="Bigger figures, a bigger trend line with a dashed target."
      >
        <Stack gap={3}>
          <KpiTile
            label="Revenue"
            value={48250}
            format={money}
            previous={42100}
            deltaLabel="vs last month"
            trend={[31, 34, 33, 37, 36, 40, 43, 41, 45, 44, 48, 50]}
            target={46}
          />
          <SkeletonSwap loading={loadingKpi} label="conversion" skeleton={<KpiTile.Skeleton />}>
            <KpiTile
              label="Conversion"
              value={4.2}
              format={(n) => `${n.toFixed(1)}%`}
              delta={0.031}
            />
          </SkeletonSwap>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setLoadingKpi(true);
              setTimeout(() => setLoadingKpi(false), 1600);
            }}
          >
            13. Reload: skeleton sweep, then Generate
          </Button>
        </Stack>
      </KitBlock>

      <KitBlock title="12. Progress" note="Ring and step forms; unknown length shimmers.">
        <Stack gap={4}>
          <Cluster gap={4}>
            <ProgressRing label="Upload" value={68} showValue />
            <ProgressRing label="Sync" value={100} tone="up" showValue />
            <ProgressRing label="Preparing" />
          </Cluster>
          <ProgressSteps
            label="Checkout"
            steps={['Basket', 'Delivery', 'Payment', 'Done']}
            current={step}
          />
          <Cluster gap={2}>
            <Button size="sm" variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))}>
              Back
            </Button>
            <Button size="sm" onClick={() => setStep((s) => Math.min(3, s + 1))}>
              Next step
            </Button>
          </Cluster>
          <Progress label="Indexing" />
        </Stack>
      </KitBlock>

      <KitBlock
        title="14. Empty states"
        note="A small sea glass picture for each, a quieter second action."
      >
        <Stack gap={4}>
          <EmptyState
            art="search"
            title="No results"
            description="Try a different search, or clear the filters."
            action={<Button size="sm">Clear filters</Button>}
            secondaryAction={
              <Button size="sm" variant="ghost">
                Search tips
              </Button>
            }
          />
          <EmptyState size="sm" art="done" title="All caught up" description="Nothing needs you." />
        </Stack>
      </KitBlock>

      <KitBlock title="15. Error state" note="Lighter; copy the reference; the details fold away.">
        <ErrorState
          what="the invoices"
          error={{
            message: 'The server did not answer in time.',
            code: 'timeout',
            errorId: 'e_8f3a21',
          }}
          onRetry={() => toast.info('Retrying…')}
        />
      </KitBlock>

      <KitBlock
        title="16. Avatars"
        note="Clean cut-outs instead of muddy rings, a status dot, photos."
      >
        <Stack gap={3}>
          <AvatarGroup
            label="Project team"
            size="md"
            people={[
              { name: 'Ada Lovelace', status: 'online' },
              { name: 'Grace Hopper', status: 'away' },
              { name: 'Alan Turing', status: 'busy' },
              { name: 'Katherine Johnson' },
              { name: 'Edsger Dijkstra' },
            ]}
            max={4}
          />
          <Cluster gap={3}>
            <Avatar name="Ada Lovelace" size="lg" status="online" />
            <Avatar name="Grace Hopper" size="lg" status="away" />
            <Avatar name="Alan Turing" size="lg" status="offline" />
          </Cluster>
        </Stack>
      </KitBlock>

      <KitBlock
        title="24. Buttons"
        note="A button group, a split button, loading with a progress fill."
      >
        <Stack gap={3}>
          <ButtonGroup label="Text alignment">
            <Button variant="outline">Left</Button>
            <Button variant="outline">Centre</Button>
            <Button variant="outline">Right</Button>
          </ButtonGroup>
          <SplitButton
            label="Save"
            onClick={() => toast.success('Saved')}
            items={[
              { id: 'draft', label: 'Save as draft', onSelect: () => toast('Draft saved') },
              { id: 'copy', label: 'Save a copy', onSelect: () => toast('Copy saved') },
            ]}
          />
          <Button
            loading={busy}
            progress={busy ? upload : undefined}
            onClick={() => {
              setBusy(true);
              setTimeout(() => setBusy(false), 4000);
            }}
          >
            Export report
          </Button>
        </Stack>
      </KitBlock>

      <KitBlock
        title="6. Toasts"
        note="They stack and fan out on hover; swipe to dismiss; a promise toast."
      >
        <Cluster gap={2}>
          <Button variant="outline" onClick={() => toast.success('Invoice sent')}>
            Add a toast
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.promise(new Promise((r) => setTimeout(r, 2200)), {
                loading: 'Uploading the file…',
                success: 'Uploaded',
                error: 'Upload failed',
              })
            }
          >
            Promise toast
          </Button>
        </Cluster>
      </KitBlock>

      <KitBlock title="7. Tabs" note="A sliding pill; arrows appear when the tabs overflow.">
        <Tabs
          label="Report sections"
          tabs={[
            'Overview',
            'Revenue',
            'Customers',
            'Products',
            'Refunds',
            'Payouts',
            'Taxes',
            'Settings',
          ].map((t) => ({
            id: t.toLowerCase(),
            label: t,
            content: <Text tone="muted">The {t.toLowerCase()} section.</Text>,
          }))}
        />
      </KitBlock>

      <KitBlock title="9. Sliders" note="Two thumbs, labelled ticks, a liquid glass thumb.">
        <Stack gap={4}>
          <RangeSlider
            label="Price"
            value={price}
            onValueChange={setPrice}
            min={0}
            max={1000}
            step={10}
            minStepsBetween={5}
            formatValue={(v) => `£${v}`}
            ticks={[0, 250, 500, 750, 1000]}
            tickLabels
          />
          <Slider label="Volume" defaultValue={40} ticks={[0, 50, 100]} tickLabels />
        </Stack>
      </KitBlock>

      <KitBlock
        title="10. Date range"
        note="Presets as chips; two months side by side on a desktop."
      >
        <FormField label="Reporting period">
          <DateRangePicker value={period} onValueChange={setPeriod} today={TODAY} clearable />
        </FormField>
      </KitBlock>

      <KitBlock
        title="18. Activity heatmap"
        note="Big cells on phones, and a 3D glass city view."
        wide
      >
        <ChartCard title="Deploys" headingLevel="h4">
          <ActivityHeatmap
            title="Deploys per day"
            days={DAYS}
            unit={{ one: 'deploy', other: 'deploys' }}
            viewSwitch
            view="city"
          />
        </ChartCard>
      </KitBlock>

      <KitBlock
        title="3. Data table"
        note="Bigger text, drag a header edge to resize, pin a column, save a view, and 2,000 rows scrolling smoothly."
        wide
      >
        <DataTable
          caption="2,000 orders"
          columns={COLUMNS}
          rows={MANY_ORDERS}
          rowKey={(o) => o.id}
          pageSize={0}
          search
          resizable
          pinnable
          savedViews
          densityToggle
          virtual={{ height: 420 }}
          renderExpanded={(o) => (
            <Text size="small">
              {o.customer} bought {o.plan} on {o.date} for {money(o.amount)}.
            </Text>
          )}
        />
      </KitBlock>

      <KitBlock
        title="23. File dropzone"
        note="Thumbnails, a bar per file, and paste an image anywhere."
      >
        <FileDropzone
          files={files}
          onFilesChange={setFiles}
          accept="image/*,.pdf,.csv"
          hint="Images, PDF or CSV. You can also paste a screenshot."
          acceptPaste
          progressOf={(f) => Math.min(1, upload + (f.size % 7) / 20)}
        />
      </KitBlock>

      <KitBlock
        title="5. Conversation"
        note="Markdown, tables and code blocks, a streaming caret, copy, retry and branch on hover."
        wide
      >
        <ChatThread label="Improved conversation">
          <ChatMessage from="user" timestamp="2026-10-12T09:05:00Z">
            How did September go?
          </ChatMessage>
          <ChatMessage
            from="assistant"
            timestamp="2026-10-12T09:05:08Z"
            streaming={typing}
            onRetry={() => setTyping(true)}
            onBranch={() => toast('Branched into a new chat')}
          >
            {reply}
          </ChatMessage>
        </ChatThread>
        <Button size="sm" variant="outline" onClick={() => setTyping(true)}>
          Replay the reply
        </Button>
      </KitBlock>

      <KitBlock
        title="4. Composer"
        note="Attach files, type / for commands or @ for people, dictate, and it glows while sending."
        wide
      >
        <Composer
          onSend={(text) => {
            toast(`Sent: ${text}`);
            setStreaming(true);
            setTimeout(() => setStreaming(false), 3000);
          }}
          onStop={() => setStreaming(false)}
          streaming={streaming}
          onAttach={(picked) =>
            setAttachments((a) => [
              ...a,
              ...picked.map((f, i) => ({
                id: `${f.name}-${Date.now()}-${i}`,
                name: f.name,
                detail: `${Math.max(1, Math.round(f.size / 1000))} KB`,
              })),
            ])
          }
          attachments={attachments}
          onRemoveAttachment={(id) => setAttachments((a) => a.filter((x) => x.id !== id))}
          commands={[
            { value: 'summarise', description: 'Summarise this conversation' },
            { value: 'chart', description: 'Draw a chart from the data' },
            { value: 'table', description: 'Show the rows as a table' },
          ]}
          mentions={PEOPLE.map((p) => ({ value: p.value, label: p.label, leading: p.leading }))}
          onVoice={() => setListening((l) => !l)}
          listening={listening}
        />
      </KitBlock>

      <KitBlock title="20. Tool calls" note="Arguments, how long each took, and a timeline.">
        <Stack gap={3}>
          <ToolChip
            name="query_orders"
            status="done"
            summary="36 rows"
            args={{ month: '2026-09', status: 'paid' }}
            durationMs={412}
          />
          <ToolTimeline
            label="What the agent did"
            steps={[
              { id: '1', name: 'read_calendar', status: 'done', durationMs: 220 },
              {
                id: '2',
                name: 'query_orders',
                status: 'done',
                durationMs: 1340,
                args: { month: '2026-09' },
              },
              { id: '3', name: 'draw_chart', status: 'running' },
            ]}
          />
        </Stack>
      </KitBlock>

      <KitBlock
        title="21. Approvals"
        note="See the change first, press Y or N, it runs out in 90 seconds."
      >
        <ApprovalCard
          title="Change the refund limit"
          description="The agent wants to update a setting."
          changes={[{ label: 'Refund limit', before: '£250', after: '£500' }]}
          shortcuts
          expiresAt={expires}
          decision={decision}
          onApprove={() => setDecision('approved')}
          onDeny={() => setDecision('denied')}
          onExpire={() => setDecision('expired')}
        />
      </KitBlock>

      <KitBlock title="22. Thinking" note="A streaming list of steps with the time each took.">
        <Thinking
          active
          steps={[
            { id: 'a', label: 'Read the calendar', status: 'done', durationMs: 800 },
            { id: 'b', label: 'Queried September orders', status: 'done', durationMs: 1400 },
            { id: 'c', label: 'Drawing the chart', status: 'active' },
          ]}
        >
          Working it out
        </Thinking>
      </KitBlock>

      <KitBlock
        title="25. Shader accent"
        note="Without WebGPU it now shows the scene's real colours, drifting."
      >
        <ShaderHero>
          <Stack gap={2}>
            <Text>A soft glow behind a card or hero.</Text>
            <Text size="small" tone="muted">
              In the enterprise skin; glass already has its moving backdrop.
            </Text>
          </Stack>
        </ShaderHero>
      </KitBlock>

      <KitBlock
        title="26. Sea glass rating and dock"
        note="Pebbles as a rating, and a dock that swells as you pass."
      >
        <Stack gap={4}>
          <SeaGlassRating
            label="How was your delivery?"
            value={rating}
            onValueChange={setRating}
            labels={['Poor', 'Fair', 'Good', 'Great', 'Superb']}
          />
          <SeaGlassDock
            label="Apps"
            items={[
              {
                id: 'home',
                label: 'Home',
                icon: 'home',
                current: true,
                onSelect: () => toast('Home'),
              },
              { id: 'mail', label: 'Mail', icon: 'mail', onSelect: () => toast('Mail') },
              { id: 'chart', label: 'Reports', icon: 'chart', onSelect: () => toast('Reports') },
              { id: 'users', label: 'People', icon: 'users', onSelect: () => toast('People') },
              {
                id: 'settings',
                label: 'Settings',
                icon: 'settings',
                onSelect: () => toast('Settings'),
              },
            ]}
          />
        </Stack>
      </KitBlock>
    </KitSection>
  );
}
