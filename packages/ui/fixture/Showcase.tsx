/* Showcase — every component in its states, on one page. scripts/a11y-check.mjs
   renders it to static HTML and scans it with axe in each skin and mode.
   Add every new component here, or the gate does not cover it. */
import {
  ActionItem,
  ActionList,
  AppShell,
  AreaChart,
  Avatar,
  AvatarGroup,
  Badge,
  BarChart,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  ChartCard,
  ChartGrid,
  ChartGridItem,
  Checkbox,
  type Column,
  ConfirmDialog,
  DataTable,
  Delta,
  DescriptionList,
  DetailSection,
  DetailSheet,
  Dialog,
  DonutChart,
  EmptyState,
  ErrorBoundary,
  ErrorState,
  FeedItem,
  FeedList,
  FormActions,
  FormField,
  FormGrid,
  FormSection,
  Grid,
  Icon,
  ICON_NAMES,
  Input,
  Kbd,
  KpiRow,
  KpiTile,
  Label,
  LineChart,
  ListPage,
  LoadingRegion,
  Menu,
  type MenuItem,
  Meter,
  NativeSelect,
  PageHeader,
  PanelHeader,
  Photo,
  PointerLight,
  Progress,
  PromptDialog,
  RollingNumber,
  SaveBar,
  Section,
  type SectionDef,
  SectionNav,
  SegmentedControl,
  Separator,
  SettingsLayout,
  SettingsSection,
  ShaderAccent,
  Sheet,
  Sidebar,
  type SidebarGroup,
  Skeleton,
  SkeletonTable,
  SkeletonText,
  SkinSelect,
  Slider,
  Sparkline,
  Stack,
  StatTile,
  StatusPage,
  Switch,
  Tabs,
  Textarea,
  ThemeToggle,
  Toaster,
  ToolLayout,
  Tooltip,
  Topbar,
  useDataTable,
} from '../src/index';
import { BadgeMatrix, ButtonMatrix, InputStates, ToggleStates } from './ControlsMatrix';
import { AccountShowcase } from './ShowcaseAccount';
import { AiSection } from './ShowcaseAi';
import { InputsShowcase } from './ShowcaseInputs';
import { VizShowcase } from './VizShowcase';

const SECTIONS: SectionDef[] = [
  { id: 'home', title: 'Home', href: '#/', icon: 'home' },
  { id: 'table', title: 'Table', href: '#/table', icon: 'table' },
  { id: 'graphs', title: 'Graphs', href: '#/graphs', icon: 'chart' },
  { id: 'tool', title: 'Tool 1', href: '#/tool-1', icon: 'wrench' },
  { id: 'admin', title: 'Admin', href: '#/admin', icon: 'shield' },
];

const GROUPS: SidebarGroup[] = [
  { items: SECTIONS.slice(0, 4) },
  {
    label: 'Admin',
    items: [
      { id: 'users', title: 'Users', href: '#/admin/users', icon: 'users' },
      { id: 'settings', title: 'Settings', href: '#/admin/settings', icon: 'settings' },
      { id: 'audit', title: 'Audit log', href: '#/admin/audit', icon: 'file-text' },
    ],
  },
];

const ADMIN_MENU: MenuItem[] = [
  { id: 'users', label: 'Users', icon: 'users', href: '#/admin/users' },
  { id: 'settings', label: 'Settings', icon: 'settings', href: '#/admin/settings' },
  { separator: true },
  { id: 'signout', label: 'Sign out', icon: 'log-out', danger: true },
];

interface Order {
  id: string;
  customer: string;
  region: string;
  total: number;
  status: 'Paid' | 'Pending' | 'Refunded';
}
const REGIONS = ['North', 'South', 'East', 'West'];
const NAMES = ['Ada', 'Brook', 'Cato', 'Dee', 'Eli', 'Fay', 'Gil', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lu'];
const STATUSES: Order['status'][] = ['Paid', 'Pending', 'Refunded'];
const ORDERS: Order[] = Array.from({ length: 23 }, (_, i) => ({
  id: `ORD-${1001 + i}`,
  customer: `${NAMES[i % NAMES.length]} ${String.fromCharCode(65 + ((i * 7) % 26))}.`,
  region: REGIONS[i % REGIONS.length] as string,
  total: Math.round(((i * 37) % 90) * 13.7 + 40),
  status: STATUSES[i % 3] as Order['status'],
}));
const gbp = (n: number) =>
  n.toLocaleString('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
const COLUMNS: Column<Order>[] = [
  { key: 'id', header: 'Order', sortable: true },
  { key: 'customer', header: 'Customer', sortable: true },
  { key: 'region', header: 'Region', sortable: true },
  {
    key: 'status',
    header: 'Status',
    cell: (o) => (
      <Badge variant={o.status === 'Paid' ? 'up' : o.status === 'Refunded' ? 'down' : 'warn'}>
        {o.status}
      </Badge>
    ),
  },
  { key: 'total', header: 'Total', align: 'end', sortable: true, cell: (o) => gbp(o.total) },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const wave = (base: number, amp: number, k: number) =>
  MONTHS.map((x, i) => ({ x, y: Math.round(base + amp * Math.sin(i / k) + i * 3) }));
const REVENUE = [
  { name: 'Revenue', points: wave(120, 30, 2) },
  { name: 'Costs', points: wave(80, 18, 3) },
  { name: 'Forecast', points: wave(100, 10, 1.5) },
];

const REGION_SERIES = [
  {
    name: 'This year',
    data: ['North', 'South', 'East', 'West'].map((label, i) => ({
      label,
      value: [42, 28, 35, 19][i] ?? 0,
    })),
  },
  {
    name: 'Last year',
    data: ['North', 'South', 'East', 'West'].map((label, i) => ({
      label,
      value: [36, 31, 30, 22][i] ?? 0,
    })),
  },
];

const noop = () => {};

/** The fallback card, rendered directly: server rendering has no error boundaries. */
function ErrorFallbackSample() {
  const boundary = new ErrorBoundary({ name: 'Revenue chart' });
  boundary.state = { error: new Error('Failed to fetch /api/revenue (503)') };
  return <>{boundary.render()}</>;
}

const GBP = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'GBP',
  maximumFractionDigits: 0,
});

/* ---- Patterns: the page-level compositions (src/patterns) ---- */
const PATTERN_ROWS = [
  { id: 'a', name: 'Ada', status: 'Paid', total: 120 },
  { id: 'b', name: 'Grace', status: 'Pending', total: 80 },
];
const PATTERN_COLUMNS: Column<(typeof PATTERN_ROWS)[number]>[] = [
  { key: 'name', header: 'Customer', sortable: true },
  { key: 'status', header: 'Status', facet: true },
  { key: 'total', header: 'Total', align: 'end', sortable: true },
];

function PatternsSection() {
  const table = useDataTable({
    columns: PATTERN_COLUMNS,
    rows: PATTERN_ROWS,
    rowKey: (r) => r.id,
    rowLabel: (r) => r.name,
  });
  return (
    <Section title="Patterns" description="Page-level compositions of the core components.">
      <Stack gap={6}>
        <PageHeader
          title="Orders"
          eyebrow="Sales"
          description="Every order, newest first."
          actions={<Button size="sm">New order</Button>}
        />
        <ListPage
          table={table}
          caption="Pattern orders"
          search
          selectable
          densityToggle
          toolbarLabel="Pattern order filters"
          bulkActions={<Button size="sm">Archive</Button>}
          detail={
            <DetailSheet open={false} onOpenChange={noop} title="Order a">
              <DetailSection title="Customer" items={[{ term: 'Name', detail: 'Ada' }]} />
            </DetailSheet>
          }
        />
        <KpiRow
          label="Pattern key figures"
          items={[
            { label: 'Revenue', value: 120400, delta: 0.042 },
            { label: 'Orders', value: 842, previous: 790, href: '#/orders' },
            { label: 'Refunds', value: 12, delta: -0.1 },
            { label: 'Churn', value: 2, delta: 0 },
          ]}
        />
        <KpiRow loading skeletons={2} label="loading figures" />
        <ChartGrid>
          <ChartGridItem span="two-thirds">
            <ChartCard title="Pattern revenue" empty />
          </ChartGridItem>
          <ChartGridItem span="third">
            <ChartCard title="Pattern spend" empty />
          </ChartGridItem>
        </ChartGrid>
        <Stack gap={2}>
          <FeedList aria-label="Pattern activity">
            <FeedItem
              avatar="Ada Lovelace"
              title="Paid invoice 12"
              meta="1 Oct"
              trailing={<Badge>Payment</Badge>}
            />
            <FeedItem icon="database" title="Deployed v1.4" meta="2 Oct" href="#/deploys" />
          </FeedList>
          <ActionList aria-label="Pattern quick actions">
            <ActionItem icon="plus" title="New invite" description="Add someone" href="#/invite" />
            <ActionItem icon="table" title="Export" description="Download a CSV" onClick={noop} />
          </ActionList>
        </Stack>
        <SettingsLayout
          sections={[
            { id: 'general', label: 'General', icon: 'settings' },
            { id: 'appearance', label: 'Appearance' },
          ]}
          label="Pattern settings sections"
        >
          <SettingsSection title="General" description="The workspace name.">
            <FormSection title="Workspace">
              <FormGrid>
                <FormField label="Workspace name" description="Shown in the topbar." required>
                  <Input defaultValue="Acme" />
                </FormField>
                <FormField label="Contact email" error="Enter an email address.">
                  <Input defaultValue="nope" />
                </FormField>
              </FormGrid>
              <FormField label="About">
                <Textarea defaultValue="Hello" />
              </FormField>
              <FormActions divided>
                <Button variant="ghost">Cancel</Button>
                <Button>Save</Button>
              </FormActions>
            </FormSection>
          </SettingsSection>
        </SettingsLayout>
        <SaveBar count={2} onSave={noop} onDiscard={noop} />
        <Grid cols={3} gap={3}>
          {/* what a page puts in a photo's corner sits on the solid chip, so axe measures it there */}
          <Photo
            src={null}
            alt="Best match mattress"
            ratio="1/1"
            corner={<Badge variant="brand">Best match</Badge>}
          />
          <Photo
            src={null}
            alt="Scan-in mattress"
            ratio="1/1"
            corner={
              <Button variant="neutral" size="sm">
                Retake
              </Button>
            }
          />
          <Photo
            src={null}
            alt="Selectable sofa"
            ratio="1/1"
            corner={<Checkbox aria-label="Select sofa" />}
          />
        </Grid>
        <ToolLayout
          inputs={
            <FormField label="Monthly deposit">
              <Input defaultValue="200" />
            </FormField>
          }
          results={<KpiTile label="After 10 years" value={32400} />}
        />
        <StatusPage
          code="404"
          icon="search"
          title="We can't find that page"
          description="The address may be mistyped, or the page has moved."
          primaryAction={<Button>Go home</Button>}
          secondaryAction={<Button variant="outline">Go back</Button>}
        />
      </Stack>
    </Section>
  );
}

export function Showcase() {
  return (
    <div className="ui-app">
      <AppShell
        brand={<span>Base app</span>}
        sidebar={<Sidebar sections={GROUPS} current="table" />}
        topbar={
          <Topbar
            title="Component showcase"
            actions={
              <>
                <Menu label="Admin" icon="shield" items={ADMIN_MENU} align="end" defaultOpen />
                <ThemeToggle theme="dark" onToggle={noop} />
                <SkinSelect skin="enterprise" onChange={noop} />
              </>
            }
          />
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <h1 style={{ margin: 0, font: 'var(--t-h2)' }}>Component showcase</h1>
          <SectionNav sections={SECTIONS} current="table" label="Top" />

          <VizShowcase />
          <ButtonMatrix />
          <BadgeMatrix />
          <ToggleStates />
          <InputStates />
          <InputsShowcase />
          <AccountShowcase />

          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <StatTile
              label="Total equity"
              value={<RollingNumber to={48210} format={(v) => GBP.format(v)} />}
            />
            <StatTile label="CAGR" value="+12.4%" direction="up" />
            <StatTile label="Max drawdown" value="−18.2%" direction="down" />
            <StatTile label="Sharpe" value="1.31" direction="neutral" />
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PanelHeader title="Effects" />
            <PointerLight surface>
              <p style={{ margin: 0, padding: 16 }}>
                Light follows the pointer, and the edge nearest it catches it.
              </p>
            </PointerLight>
            {/* server-rendered: the accent's static gradient, behind ink text */}
            <div className="ui-shader-host" style={{ borderRadius: 'var(--r-lg)', padding: 24 }}>
              <ShaderAccent />
              <p style={{ margin: 0, color: 'var(--fg)' }}>A shader accent glows behind a hero.</p>
            </div>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PanelHeader title="Loading" />
            {/* the page owns the status region; skeleton shapes are aria-hidden */}
            <div role="status" aria-busy="true" aria-label="Loading accounts">
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
                <Skeleton width={40} height={40} radius="circle" />
                <SkeletonText lines={2} style={{ flex: 1 }} />
              </div>
              <SkeletonTable rows={3} columns={4} />
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle as="h2">Settings</CardTitle>
              <CardDescription>
                Fields, a select and checkboxes, each with a visible label.
              </CardDescription>
            </CardHeader>
            <CardContent style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Label htmlFor="sc-name">Display name</Label>
              <Input id="sc-name" placeholder="e.g. George" />
              <Label htmlFor="sc-notes">Notes</Label>
              <Textarea id="sc-notes" rows={3} placeholder="Anything to remember" />
              <Label htmlFor="sc-email">Email (invalid example)</Label>
              <Input
                id="sc-email"
                type="email"
                defaultValue="not-an-email"
                aria-invalid="true"
                aria-describedby="sc-email-err"
              />
              <p
                id="sc-email-err"
                style={{ margin: 0, font: 'var(--t-small)', color: 'var(--down)' }}
              >
                Enter an email address like name@example.com.
              </p>
              <Label htmlFor="sc-db">Database</Label>
              <NativeSelect id="sc-db" defaultValue="pg">
                <option value="pg">PostgreSQL</option>
                <option value="mssql">SQL Server</option>
              </NativeSelect>
              <Separator />
              <Checkbox label="Email me a weekly summary" defaultChecked />
              <Checkbox label="Include archived rows" />
              <Checkbox label="Select all (some selected)" indeterminate />
              <Checkbox label="Locked option" disabled />
            </CardContent>
            <CardFooter>
              <Button>Save</Button>
              <Separator orientation="vertical" />
              <Button variant="ghost">Cancel</Button>
            </CardFooter>
          </Card>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PanelHeader title="Icons" level={3} />
            <ul
              style={{
                display: 'flex',
                gap: 12,
                flexWrap: 'wrap',
                margin: 0,
                padding: 0,
                listStyle: 'none',
                color: 'var(--fg-muted)',
              }}
            >
              {ICON_NAMES.map((n) => (
                <li key={n}>
                  <Icon name={n} size={20} label={n} />
                </li>
              ))}
            </ul>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PanelHeader title="Tabs, switches and a tooltip" level={3} />
            <Tabs
              label="Settings sections"
              tabs={[
                {
                  id: 'general',
                  label: 'General',
                  content: (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      <Switch
                        checked
                        onCheckedChange={noop}
                        label="Email alerts"
                        description="Send a message when a job fails."
                      />
                      <Switch checked={false} onCheckedChange={noop} label="Compact rows" />
                      <Switch
                        checked={false}
                        onCheckedChange={noop}
                        label="Beta features"
                        disabled
                      />
                    </div>
                  ),
                },
                { id: 'billing', label: 'Billing', content: <p>Billing settings.</p> },
                { id: 'audit', label: 'Audit', content: <p>Audit settings.</p> },
              ]}
            />
            <div style={{ paddingTop: 40 }}>
              <Tooltip content="Copies the current filters into a share link." defaultOpen>
                <Button variant="neutral">Share view</Button>
              </Tooltip>
            </div>
          </section>

          <DataTable
            caption="Recent orders"
            columns={COLUMNS}
            rows={ORDERS}
            rowKey={(o) => o.id}
            pageSize={8}
            initialSort={{ key: 'total', dir: 'desc' }}
            selectable
            selected={new Set(['ORD-1003', 'ORD-1010'])}
            onSelectedChange={noop}
          />
          <DataTable
            caption="Archived orders"
            columns={COLUMNS}
            rows={[]}
            rowKey={(o) => o.id}
            emptyText="No archived orders yet."
            dense
          />

          <section
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 24 }}
          >
            <LineChart
              title="Revenue against costs"
              description="Monthly, £k, 2026."
              series={REVENUE}
              yFormat={(n) => `£${n}k`}
            />
            <BarChart
              title="Orders by region"
              data={REGIONS.map((label, i) => ({ label, value: [42, 28, 35, -6][i] ?? 0 }))}
            />
            <DonutChart
              title="Traffic sources"
              data={[
                { label: 'Search', value: 46 },
                { label: 'Direct', value: 24 },
                { label: 'Referral', value: 15 },
                { label: 'Social', value: 10 },
                { label: 'Email', value: 5 },
              ]}
              centerLabel="12.4k visits"
            />
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              Signups this month
              <Sparkline
                label="Daily signups, last 30 days"
                values={[3, 5, 4, 8, 7, 9, 12, 10, 14, 13]}
              />
            </p>
            <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
              Trend
              <Sparkline label="Churn, last 10 days" values={[14, 13, 11, 12, 9, 8]} tone="auto" />
            </p>
          </section>

          <section
            style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 24 }}
          >
            <ChartCard
              title="Revenue vs last year"
              eyebrow="Sales"
              description="Monthly, £k."
              actions={<Button size="sm">Last 12 months</Button>}
              footer="Updated 09:00"
            >
              <AreaChart
                title="Revenue vs last year"
                series={[
                  { name: 'This year', points: wave(120, 30, 2) },
                  { name: 'Last year', variant: 'comparison', points: wave(100, 20, 2) },
                ]}
              />
            </ChartCard>
            <ChartCard title="Orders by region" defaultShowTable>
              <BarChart title="Orders by region" series={REGION_SERIES} layout="stacked" />
            </ChartCard>
            <ChartCard title="Top pages">
              <BarChart
                title="Top pages"
                orientation="horizontal"
                data={[
                  { label: 'Home', value: 1240 },
                  { label: 'Pricing', value: 860 },
                  { label: 'Docs', value: 410 },
                ]}
              />
            </ChartCard>
            <ChartCard title="Orders by region (grouped)">
              <BarChart title="Orders by region (grouped)" series={REGION_SERIES} />
            </ChartCard>
            <ChartCard title="Loading chart" loading />
            <ChartCard title="Failed chart" error="Could not load the chart." />
            <ChartCard title="Empty chart" empty />
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PanelHeader title="Kit v2" />
            <Breadcrumbs
              items={[
                { label: 'Home', href: '#/' },
                { label: 'Orders', href: '#/table' },
                { label: 'Order 1001' },
              ]}
            />
            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}
            >
              <KpiTile
                label="Revenue"
                value={48210}
                format={(v) => GBP.format(v)}
                previous={44000}
                deltaLabel="vs last month"
                trend={[3, 5, 4, 8, 7, 9, 12]}
                icon="chart"
              />
              <KpiTile
                label="Orders"
                value={1284}
                href="#/table"
                delta={-0.021}
                footnote="Open the table"
              />
              <KpiTile label="Refunds" value={37} onClick={noop} delta={null} />
              <KpiTile label="Sessions" value={0} loading />
            </div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <SegmentedControl
                label="Range"
                defaultValue="30"
                options={[
                  { value: '7', label: '7 days' },
                  { value: '30', label: '30 days' },
                  { value: '90', label: '90 days' },
                ]}
              />
              <SegmentedControl
                label="Density"
                size="sm"
                defaultValue="comfortable"
                options={[
                  { value: 'compact', label: 'Compact' },
                  { value: 'comfortable', label: 'Comfortable' },
                  { value: 'off', label: 'Off', disabled: true },
                ]}
              />
              <Delta ratio={0.042} /> <Delta ratio={-0.031} /> <Delta ratio={null} />
              <span>
                Press <Kbd>Esc</Kbd> or <Kbd aria-label="Command">⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </div>
            <div
              style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 16 }}
            >
              <Slider
                label="Volume"
                defaultValue={40}
                ticks
                step={10}
                formatValue={(v) => `${v}%`}
              />
              <Slider label="Locked" defaultValue={10} disabled />
              <Progress label="Uploading" value={64} />
              <Progress label="Preparing" />
              <Meter
                label="Disk used"
                value={72}
                low={50}
                high={80}
                optimum={20}
                formatValue={(v) => `${v} GB`}
              />
              <Meter label="Disk used (nearly full)" value={93} low={50} high={80} optimum={20} />
            </div>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Avatar name="Ada Lovelace" />
              <Avatar name="Brook Mills" size="sm" />
              <Avatar name="Cato Nolan" size="lg" />
              <AvatarGroup
                label="Reviewers"
                people={['Ada L', 'Brook M', 'Cato N', 'Dee O', 'Eli P'].map((name) => ({ name }))}
                max={3}
              />
            </div>
            <DescriptionList
              columns={2}
              items={[
                { term: 'Status', detail: 'Active' },
                { term: 'Owner', detail: 'Ada Lovelace' },
                { term: 'Created', detail: '11 Oct 2026' },
                { term: 'Region', detail: 'North' },
              ]}
            />
            <EmptyState
              icon="search"
              title="No matching orders"
              description="Try a wider date range or clear the filters."
              action={<Button variant="outline">Clear filters</Button>}
            />
            <EmptyState size="sm" title="Nothing archived yet" />
            <ErrorState
              what="orders"
              error={{ message: 'Failed to fetch /api/orders (503)' }}
              onRetry={noop}
            />
            <LoadingRegion label="orders">
              <SkeletonText lines={2} />
            </LoadingRegion>
          </section>

          <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <PanelHeader title="Error boundary" level={3} />
            <ErrorBoundary name="Healthy panel">
              <p style={{ margin: 0, color: 'var(--fg-muted)' }}>This child rendered fine.</p>
            </ErrorBoundary>
            <ErrorFallbackSample />
          </section>
          <PatternsSection />
          <AiSection />
        </div>
      </AppShell>

      <Dialog
        open={false}
        onClose={noop}
        title="Delete saved chart?"
        description="This removes the chart for everyone. It cannot be undone."
        footer={
          <>
            <Button variant="outline" size="sm">
              Keep it
            </Button>
            <Button variant="danger" size="sm">
              Delete
            </Button>
          </>
        }
      >
        <p style={{ margin: 0, color: 'var(--fg-muted)' }}>
          “Q3 revenue by region” was last edited today.
        </p>
      </Dialog>
      <ConfirmDialog
        open={false}
        onClose={noop}
        title="Delete order?"
        description="This removes order 1001 for everyone."
        confirmLabel="Delete"
        destructive
        onConfirm={noop}
      />
      {/* a Sheet and the Toaster portal to <body>, which static rendering skips; they are scanned in tests/kit-v2.test.tsx */}
      <Toaster />
      <Sheet
        open={false}
        onOpenChange={noop}
        title="Order 1001"
        description="Everything about this order."
      />
      <PromptDialog
        open={false}
        title="Save view as…"
        label="View name"
        defaultValue="My view"
        onSubmit={noop}
        onClose={noop}
      />
    </div>
  );
}
