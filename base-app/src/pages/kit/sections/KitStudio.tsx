import { useEffect, useState } from 'react';
import {
  Accordion,
  AgentCopilot,
  AgentOrb,
  type AgentOrbState,
  Badge,
  Button,
  Cluster,
  ColourPicker,
  ContextMenu,
  Coverflow,
  type CoverflowItem,
  DropletSlider,
  DropletSwitch,
  FrostReveal,
  GlassHeatmap,
  HistogramRange,
  HoverCard,
  type IslandActivity,
  Kanban,
  type KanbanColumn,
  LiveIsland,
  Menubar,
  type MenubarMenu,
  type MenuEntry,
  NetworkGraph,
  PaneHeader,
  PhotoCropper,
  PrismDonut,
  ProfilePreview,
  RadarChart,
  ResizableGroup,
  ResizableHandle,
  ResizablePane,
  ScatterChart,
  type ScheduleEvent,
  SegmentedControl,
  Slider,
  SnapDrawer,
  Stack,
  Text,
  TimeField,
  TimeRange,
  Toggle,
  Toolbar,
  type ToolbarItem,
  type TreeNode,
  TreeView,
  WeekScheduler,
  WorkflowCanvas,
  type WorkflowEdge,
  type WorkflowNode,
} from '~/core/ui';
import lake from '../assets/lake.jpg';
import { KitBlock, KitSection } from '../KitParts';

/* The studio set: twenty-two components new in the November 2026 pass, each live. Layout and
   menus, pickers, boards, charts, and the specials. All demo data is made up and fixed. */

const FAQ = [
  {
    id: 'own',
    title: 'Who owns the code?',
    icon: 'shield' as const,
    content: (
      <Text>
        You do, once it is paid for: the repository, the design and every line, with no licence to
        renew.
      </Text>
    ),
  },
  {
    id: 'a11y',
    title: 'Is it accessible?',
    icon: 'eye-off' as const,
    meta: 'WCAG 2.2 AA',
    content: (
      <Text>
        Every component passes axe in both skins, light and dark, and works from the keyboard and
        with a screen reader.
      </Text>
    ),
  },
  {
    id: 'stack',
    title: 'What is it built on?',
    icon: 'layers' as const,
    content: (
      <Text>
        React, Tailwind v4 and Vercel's UI SDK primitives, with every colour a theme role.
      </Text>
    ),
  },
];

const FILES: readonly TreeNode[] = [
  {
    id: 'src',
    label: 'src',
    children: [
      {
        id: 'components',
        label: 'components',
        children: [
          { id: 'button', label: 'button.tsx', icon: 'file' },
          { id: 'accordion', label: 'accordion.tsx', icon: 'file', badge: 'new' },
          { id: 'tree', label: 'tree-view.tsx', icon: 'file', badge: 'new' },
        ],
      },
      {
        id: 'charts',
        label: 'charts',
        children: [
          { id: 'scatter', label: 'ScatterChart.tsx', icon: 'file', badge: 'new' },
          { id: 'radar', label: 'RadarChart.tsx', icon: 'file', badge: 'new' },
        ],
      },
      { id: 'index', label: 'index.ts', icon: 'file' },
    ],
  },
  { id: 'readme', label: 'README.md', icon: 'file' },
];

const CARD_MENU: readonly MenuEntry[] = [
  { id: 'open', label: 'Open', icon: 'folder-open', shortcut: '↵' },
  { id: 'rename', label: 'Rename', shortcut: 'F2' },
  { id: 'dup', label: 'Duplicate', shortcut: '⌘D' },
  { type: 'separator', id: 's1' },
  { type: 'checkbox', id: 'pin', label: 'Pin to sidebar', defaultChecked: true },
  {
    type: 'radio',
    id: 'sort',
    label: 'Sort by',
    defaultValue: 'name',
    options: [
      { value: 'name', label: 'Name' },
      { value: 'date', label: 'Date modified' },
    ],
  },
  {
    type: 'sub',
    id: 'share',
    label: 'Share',
    icon: 'link',
    items: [
      { id: 'copy', label: 'Copy link' },
      { id: 'email', label: 'Email a copy' },
    ],
  },
  { type: 'separator', id: 's2' },
  { id: 'delete', label: 'Delete', danger: true, shortcut: '⌫' },
];

const MENUS: readonly MenubarMenu[] = [
  {
    id: 'file',
    label: 'File',
    items: [
      { id: 'new', label: 'New file', shortcut: '⌘N' },
      { id: 'open', label: 'Open…', shortcut: '⌘O' },
      { type: 'separator', id: 's' },
      { id: 'export', label: 'Export as PDF' },
    ],
  },
  {
    id: 'edit',
    label: 'Edit',
    items: [
      { id: 'undo', label: 'Undo', shortcut: '⌘Z' },
      { id: 'redo', label: 'Redo', shortcut: '⇧⌘Z' },
    ],
  },
  {
    id: 'view',
    label: 'View',
    items: [
      { type: 'checkbox', id: 'grid', label: 'Show grid', defaultChecked: true },
      { type: 'checkbox', id: 'rulers', label: 'Show rulers' },
    ],
  },
];

const FORMAT: readonly ToolbarItem[] = [
  { type: 'toggle', id: 'bold', label: 'Bold', icon: 'bold', shortcut: '⌘B', defaultPressed: true },
  { type: 'toggle', id: 'italic', label: 'Italic', icon: 'italic', shortcut: '⌘I' },
  { type: 'toggle', id: 'underline', label: 'Underline', icon: 'underline', shortcut: '⌘U' },
  { type: 'separator', id: 's1' },
  {
    type: 'choice',
    id: 'align',
    label: 'Alignment',
    defaultValue: 'list',
    options: [
      { value: 'list', label: 'List', icon: 'list' },
      { value: 'code', label: 'Code', icon: 'code' },
    ],
  },
  { type: 'separator', id: 's2' },
  { type: 'button', id: 'link', label: 'Add a link', icon: 'link', shortcut: '⌘K' },
];

/* House prices: a skewed spread, fixed. */
const PRICES = Array.from({ length: 420 }, (_, i) => {
  const u = ((i * 7919) % 1000) / 1000;
  const v = ((i * 104729) % 997) / 997;
  return Math.round((180 + 520 * u ** 1.8 + 90 * v) / 5) * 5;
});

const BOARD: readonly KanbanColumn[] = [
  {
    id: 'todo',
    title: 'To do',
    cards: [
      {
        id: 'k1',
        title: 'Write the brief for the booking flow',
        tag: { label: 'Design', tone: 2 },
        assignee: { initials: 'AL', tone: 1 },
        due: '28 Nov',
      },
      {
        id: 'k2',
        title: 'Price the hosting for three clients',
        tag: { label: 'Ops', tone: 5 },
        assignee: { initials: 'GH', tone: 3 },
      },
    ],
  },
  {
    id: 'doing',
    title: 'In progress',
    limit: 2,
    cards: [
      {
        id: 'k3',
        title: 'Build the stock-take screen',
        tag: { label: 'Build', tone: 1 },
        assignee: { initials: 'AT', tone: 2 },
        progress: 0.6,
        due: '26 Nov',
      },
      {
        id: 'k4',
        title: 'Accessibility pass on the forms',
        tag: { label: 'A11y', tone: 4 },
        assignee: { initials: 'KJ', tone: 4 },
        progress: 0.3,
      },
    ],
  },
  {
    id: 'done',
    title: 'Done',
    cards: [
      {
        id: 'k5',
        title: 'Set up the database backups',
        tag: { label: 'Ops', tone: 5 },
        assignee: { initials: 'GH', tone: 3 },
        progress: 1,
      },
    ],
  },
];

const DAYS = [
  { name: 'Mon', date: 23 },
  { name: 'Tue', date: 24 },
  { name: 'Wed', date: 25 },
  { name: 'Thu', date: 26 },
  { name: 'Fri', date: 27 },
];
const EVENTS: readonly ScheduleEvent[] = [
  { id: 'e1', title: 'Stand-up', day: 0, start: 9 * 60, end: 9 * 60 + 15, tone: 1 },
  {
    id: 'e2',
    title: 'Design review',
    day: 0,
    start: 11 * 60,
    end: 12 * 60,
    tone: 2,
    where: 'Studio',
  },
  { id: 'e3', title: 'Client call', day: 1, start: 14 * 60, end: 15 * 60 + 30, tone: 3 },
  { id: 'e4', title: 'Deep work', day: 2, start: 9 * 60 + 30, end: 12 * 60 + 30, tone: 4 },
  { id: 'e5', title: 'Lunch', day: 2, start: 12 * 60 + 30, end: 13 * 60 + 15, tone: 6 },
  { id: 'e6', title: 'Pairing', day: 2, start: 10 * 60, end: 11 * 60, tone: 5 },
  { id: 'e7', title: 'Demo day', day: 4, start: 15 * 60, end: 17 * 60, tone: 7, where: 'Hall' },
];

const FLOW_NODES: readonly WorkflowNode[] = [
  {
    id: 'form',
    title: 'New enquiry',
    detail: 'Contact form',
    kind: 'trigger',
    icon: 'zap',
    x: 24,
    y: 120,
  },
  {
    id: 'ai',
    title: 'Read and sort',
    detail: 'Assistant',
    kind: 'ai',
    icon: 'bot',
    x: 280,
    y: 120,
  },
  { id: 'check', title: 'Is it a quote?', kind: 'condition', icon: 'branch', x: 536, y: 120 },
  {
    id: 'quote',
    title: 'Draft a quote',
    detail: 'From the price list',
    kind: 'action',
    x: 792,
    y: 30,
  },
  { id: 'reply', title: 'Send a reply', detail: 'Email', kind: 'output', x: 1040, y: 200 },
];
const FLOW_EDGES: readonly WorkflowEdge[] = [
  { from: 'form', to: 'ai' },
  { from: 'ai', to: 'check' },
  { from: 'check', to: 'quote', label: 'Yes' },
  { from: 'check', to: 'reply', label: 'No' },
  { from: 'quote', to: 'reply' },
];

/* Size against price, three kinds of home, fixed. */
const SCATTER = ['Flats', 'Terraces', 'Detached'].map((name, s) => ({
  name,
  points: Array.from({ length: 26 }, (_, i) => {
    const size = 40 + s * 35 + ((i * 37 + s * 11) % 60);
    const noise = ((i * 53 + s * 17) % 41) - 20;
    return {
      x: size,
      y: Math.round(size * (3.1 + s * 0.4) + 60 + noise * 3.5),
      label: `${name.slice(0, -1)} ${i + 1}`,
    };
  }),
}));

const SKILLS = ['Design', 'Front end', 'Back end', 'Testing', 'Access', 'Speed'];
const PROFILES = [
  { name: 'This kit', values: [9, 9, 7, 8, 10, 8] },
  { name: 'A typical template', values: [7, 6, 5, 3, 4, 6] },
];

const TEAM = {
  nodes: [
    { id: 'gl', label: 'Lead', group: 0 },
    { id: 'ds', label: 'Design', group: 1 },
    { id: 'fe', label: 'Front end', group: 1 },
    { id: 'be', label: 'API', group: 2 },
    { id: 'db', label: 'Database', group: 2 },
    { id: 'ai', label: 'Assistant', group: 3 },
    { id: 'qa', label: 'Testing', group: 1 },
    { id: 'ops', label: 'Hosting', group: 2 },
    { id: 'cl', label: 'Client', group: 0 },
    { id: 'ax', label: 'Access', group: 3 },
  ],
  links: [
    { source: 'gl', target: 'ds' },
    { source: 'gl', target: 'fe' },
    { source: 'gl', target: 'be' },
    { source: 'gl', target: 'cl' },
    { source: 'ds', target: 'fe' },
    { source: 'fe', target: 'be' },
    { source: 'be', target: 'db' },
    { source: 'be', target: 'ai' },
    { source: 'fe', target: 'ai' },
    { source: 'qa', target: 'fe' },
    { source: 'qa', target: 'be' },
    { source: 'ops', target: 'be' },
    { source: 'ops', target: 'db' },
    { source: 'ax', target: 'fe' },
    { source: 'ax', target: 'ds' },
    { source: 'cl', target: 'ds' },
  ],
  groups: ['People', 'Interface', 'Server', 'Quality'],
};

const SPEND = [
  { label: 'Hosting', value: 240 },
  { label: 'Design tools', value: 180 },
  { label: 'AI models', value: 420 },
  { label: 'Domains', value: 60 },
  { label: 'Testing', value: 130 },
];

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = ['8am', '10am', '12pm', '2pm', '4pm', '6pm', '8pm', '10pm'];
const VISITS = WEEKDAYS.map((_, d) =>
  HOURS.map((_, h) => {
    const work = d < 5 ? 1 : 0.55;
    const peak =
      Math.exp(-((h - 3.2) ** 2) / 5) + (d < 5 ? 0.25 * Math.exp(-((h - 6) ** 2) / 2) : 0);
    return Math.round((20 + 140 * peak * work + ((d * 13 + h * 7) % 17)) / 2) * 2;
  }),
);

const COVERS: readonly CoverflowItem[] = [
  {
    id: 'c1',
    title: 'Furniture inventory',
    subtitle: 'A charity stock system',
    tone: 1,
    mark: 'Stock',
  },
  {
    id: 'c2',
    title: 'Lake at dusk',
    subtitle: 'A photo cover',
    image: lake,
    alt: 'Mountains over a lake at dusk',
  },
  { id: 'c3', title: 'Booking flow', subtitle: 'Mobile first', tone: 3, mark: 'Book' },
  { id: 'c4', title: 'Markets dashboard', subtitle: 'Charts and alerts', tone: 2, mark: 'Charts' },
  { id: 'c5', title: 'Smart home hub', subtitle: 'Devices and scenes', tone: 5, mark: 'Home' },
  {
    id: 'c6',
    title: 'Portfolio site',
    subtitle: 'Chat-style, phone first',
    tone: 6,
    mark: 'Folio',
  },
  { id: 'c7', title: 'Agent console', subtitle: 'Many agents at once', tone: 4, mark: 'Agents' },
];

const ORB_STATES: readonly { value: AgentOrbState; label: string }[] = [
  { value: 'idle', label: 'Idle' },
  { value: 'listening', label: 'Listen' },
  { value: 'thinking', label: 'Think' },
  { value: 'speaking', label: 'Speak' },
  { value: 'done', label: 'Done' },
  { value: 'error', label: 'Error' },
];

const gbpK = (n: number) => `£${n}k`;
const gbp = (n: number) => `£${new Intl.NumberFormat('en-GB').format(n)}`;

export function StudioSection() {
  return (
    <KitSection
      id="studio"
      title="New components"
      intro="Twenty-two new parts: layout and menus, pickers, boards, charts and a few specials. Everything here is live: drag it, type in it, right-click it, use the keyboard."
    >
      <LayoutBlocks />
      <PickerBlocks />
      <BoardBlocks />
      <ChartBlocks />
      <SpecialBlocks />
    </KitSection>
  );
}

function LayoutBlocks() {
  const [picked, setPicked] = useState('accordion');
  return (
    <>
      <KitBlock
        title="Resizable panes and tree view"
        note="Drag the handles (or focus one and use the arrows). The tree: arrows, Home, End, type to find."
        wide
      >
        <ResizableGroup height={300}>
          <ResizablePane defaultSize={30} minSize={18}>
            <PaneHeader title="Files" />
            <TreeView
              items={FILES}
              label="Files"
              defaultExpanded={['src', 'components']}
              value={picked}
              onValueChange={(id) => {
                if (id) setPicked(id);
              }}
            />
          </ResizablePane>
          <ResizableHandle aria-label="Resize the file list" />
          <ResizablePane defaultSize={45} minSize={25}>
            <PaneHeader title={`${picked}.tsx`} />
            <Stack gap={2}>
              <Text tone="muted">
                The selected file is {picked}. Panes keep their share as the window changes, and a
                double click on a handle puts it back.
              </Text>
            </Stack>
          </ResizablePane>
          <ResizableHandle aria-label="Resize the preview" />
          <ResizablePane defaultSize={25} minSize={15}>
            <PaneHeader title="Preview" />
            <Text tone="muted">A third pane, for a preview or an inspector.</Text>
          </ResizablePane>
        </ResizableGroup>
      </KitBlock>
      <KitBlock title="Accordion" note="Cards lift as they open; Enter or Space toggles.">
        <Accordion items={FAQ} defaultValue={['own']} />
      </KitBlock>
      <KitBlock
        title="Hover card"
        note="Point at the name (or focus it) and a preview opens after a moment."
      >
        <Text>
          The kit is kept by{' '}
          <HoverCard
            href="#studio"
            content={
              <ProfilePreview
                name="Ada Lovelace"
                job="Design engineer"
                initials="AL"
                tone={2}
                about="Builds the components and keeps them accessible."
                stats={[
                  { label: 'Components', value: '140' },
                  { label: 'Since', value: '2025' },
                ]}
              />
            }
          >
            Ada Lovelace
          </HoverCard>
          , who reviews every change.
        </Text>
      </KitBlock>
      <KitBlock
        title="Context menu and menubar"
        note="Right-click (or press the menu key on) the card. The menubar: arrows move between menus."
      >
        <Stack gap={3}>
          <Menubar menus={MENUS} label="Editor" />
          <ContextMenu items={CARD_MENU} label="Quarterly report">
            <Stack gap={1}>
              <Text weight="semibold">Quarterly report.pdf</Text>
              <Text tone="muted" size="small">
                Right-click for its menu
              </Text>
            </Stack>
          </ContextMenu>
        </Stack>
      </KitBlock>
      <KitBlock
        title="Toolbar"
        note="One tab stop; arrows move along it. Hover for names and shortcuts."
      >
        <Toolbar items={FORMAT} label="Text formatting" />
      </KitBlock>
      <KitBlock
        title="Agent co-pilot"
        note="Pick a prompt and watch the agent use the controls below. It asks before turning on Night mode."
        wide
      >
        <CopilotDemo />
      </KitBlock>
    </>
  );
}

function CopilotDemo() {
  return (
    <Stack gap={4}>
      <AgentCopilot
        plans={[
          {
            id: 'evening',
            prompt: 'Make it cosy for the evening',
            steps: [
              { ref: 'Brightness', action: 'setValue', args: [35], say: 'Dim Brightness to 35%' },
              {
                ref: 'Light colour',
                action: 'setValue',
                args: ['warm'],
                say: 'Set Light colour to Warm',
              },
              { ref: 'Night mode', action: 'setPressed', args: [true], say: 'Turn on Night mode' },
            ],
          },
          {
            id: 'work',
            prompt: 'Set up for focused work',
            steps: [
              { ref: 'Brightness', action: 'setValue', args: [90], say: 'Raise Brightness to 90%' },
              {
                ref: 'Light colour',
                action: 'setValue',
                args: ['daylight'],
                say: 'Set Light colour to Daylight',
              },
            ],
          },
        ]}
        confirm={['Night mode']}
        hint="The agent changes the real controls, through their own actions; Undo puts back only what it changed."
      />
      <Cluster gap={4}>
        <Slider label="Brightness" defaultValue={70} formatValue={(v) => `${v}%`} />
        <SegmentedControl
          label="Light colour"
          defaultValue="cool"
          options={[
            { value: 'warm', label: 'Warm' },
            { value: 'cool', label: 'Cool' },
            { value: 'daylight', label: 'Daylight' },
          ]}
        />
        <Toggle aria-label="Night mode">Night mode</Toggle>
      </Cluster>
    </Stack>
  );
}

function PickerBlocks() {
  return (
    <>
      <KitBlock
        title="Snap drawer"
        note="Drag it between three heights; below the first the page stays usable."
      >
        <SnapDrawer
          trigger="Open the order"
          title="Order ORD-10421"
          description="Two chairs and a table, paid on 24 Nov."
          footer={<Button>Mark as delivered</Button>}
        >
          <Stack gap={2}>
            <Text>Pick-up from the warehouse, then delivery to the customer.</Text>
            <Text tone="muted">Drag the handle up to see everything, down to peek.</Text>
          </Stack>
        </SnapDrawer>
      </KitBlock>
      <KitBlock title="Time field and range" note="Type, or use the arrows on each part.">
        <Stack gap={4}>
          <TimeField label="Reminder" defaultValue="09:30" hint="Every weekday" />
          <TimeRange label="Opening hours" defaultStart="08:30" defaultEnd="17:45" />
        </Stack>
      </KitBlock>
      <KitBlock
        title="Histogram range"
        note="The bars show where the prices are; the count follows the handles."
      >
        <HistogramRange
          label="Price"
          values={PRICES}
          min={150}
          max={850}
          step={5}
          defaultValue={[250, 520]}
          formatValue={gbpK}
          noun={['home', 'homes']}
        />
      </KitBlock>
      <KitBlock title="Colour picker" note="With a live contrast check against the page.">
        <ColourPicker label="Brand colour" />
      </KitBlock>
      <KitBlock title="Photo cropper" note="Drag the box or its corners, zoom, turn, mirror.">
        <PhotoCropper src={lake} label="Cover photo" alt="Mountains over a lake at dusk" />
      </KitBlock>
    </>
  );
}

function BoardBlocks() {
  return (
    <>
      <KitBlock
        title="Kanban board"
        note="Drag cards between columns, or focus one, press Space and use the arrows."
        wide
      >
        <Kanban columns={BOARD} label="Studio work" />
      </KitBlock>
      <KitBlock
        title="Week planner"
        note="Drag to move, pull the bottom edge to resize, drag an empty slot to add."
        wide
      >
        <WeekScheduler
          events={EVENTS}
          days={DAYS}
          today={2}
          now={11 * 60 + 20}
          hours={[8, 18]}
          label="This week"
        />
      </KitBlock>
      <KitBlock
        title="Workflow canvas"
        note="Pan, zoom, drag the steps, wire from a port; Run plays it."
        wide
      >
        <WorkflowCanvas nodes={FLOW_NODES} edges={FLOW_EDGES} label="Enquiry workflow" />
      </KitBlock>
    </>
  );
}

function ChartBlocks() {
  return (
    <>
      <KitBlock title="Scatter chart" note="Drag a box over the dots to zoom in." wide>
        <ScatterChart
          title="Size against price"
          description="Each dot is a home sold this year."
          series={SCATTER}
          xLabel="Floor area (m²)"
          yLabel="Price (£k)"
          xFormat={(n) => `${n}`}
          yFormat={gbpK}
        />
      </KitBlock>
      <KitBlock title="Radar chart" note="Point anywhere, or Tab in and walk the measures.">
        <RadarChart
          title="Where the effort goes"
          description="Out of ten."
          axes={SKILLS}
          series={PROFILES}
          max={10}
        />
      </KitBlock>
      <KitBlock title="Prism donut" note="Point at a slice to lift it out.">
        <PrismDonut title="Monthly spend" data={SPEND} valueFormat={gbp} totalLabel="A month" />
      </KitBlock>
      <KitBlock
        title="Network graph"
        note="Point at a node to trace it; drag one and the rest follow."
        wide
      >
        <NetworkGraph
          title="Who works with whom"
          nodes={TEAM.nodes}
          links={TEAM.links}
          groups={TEAM.groups}
        />
      </KitBlock>
      <KitBlock
        title="Glass heatmap"
        note="A city of glass blocks: turn it, or flatten it to a grid."
        wide
      >
        <GlassHeatmap
          title="Visits by hour"
          description="A normal week."
          rows={WEEKDAYS}
          columns={HOURS}
          values={VISITS}
          noun="visits"
          rowsLabel="Day"
        />
      </KitBlock>
    </>
  );
}

function SpecialBlocks() {
  const [orb, setOrb] = useState<AgentOrbState>('thinking');
  const [level, setLevel] = useState(0);
  const [deploy, setDeploy] = useState(0.42);
  const [volume, setVolume] = useState(64);

  // a pretend voice while listening, and a pretend deploy creeping along
  useEffect(() => {
    if (orb !== 'listening') return;
    let t = 0;
    const id = setInterval(() => {
      t += 1;
      setLevel(Math.abs(Math.sin(t / 2.3) * Math.cos(t / 5.1)));
    }, 90);
    return () => clearInterval(id);
  }, [orb]);
  useEffect(() => {
    const id = setInterval(() => setDeploy((d) => (d >= 1 ? 0.05 : Math.min(1, d + 0.03))), 900);
    return () => clearInterval(id);
  }, []);

  const activities: IslandActivity[] = [
    {
      id: 'deploy',
      icon: 'zap',
      title: deploy >= 1 ? 'Deployed' : 'Deploying the site',
      detail:
        deploy >= 1
          ? 'Live on the production address'
          : `Building the client · step ${Math.min(5, Math.ceil(deploy * 5))} of 5`,
      progress: deploy,
      trailing: `${Math.round(deploy * 100)}%`,
      tone: deploy >= 1 ? 'success' : 'brand',
      actions: [
        { label: 'View logs', onSelect: () => {} },
        { label: 'Cancel', onSelect: () => setDeploy(0.05) },
      ],
    },
    {
      id: 'music',
      icon: 'music',
      title: 'Focus mix',
      detail: 'Playing',
      trailing: '2:14',
      tone: 'success',
    },
  ];

  return (
    <>
      <KitBlock title="Agent orb" note="Each state has its own rhythm. Press the orb to talk.">
        <Stack gap={4}>
          <Cluster gap={4}>
            <AgentOrb state={orb} level={level} size="lg" label="Co-pilot" />
            <AgentOrb
              state={orb}
              level={level}
              size="md"
              label="Co-pilot"
              caption
              onPress={() => setOrb((s) => (s === 'listening' ? 'thinking' : 'listening'))}
            />
          </Cluster>
          <SegmentedControl
            label="Orb state"
            size="sm"
            value={orb}
            onValueChange={(v) => setOrb(v as AgentOrbState)}
            options={ORB_STATES}
          />
        </Stack>
      </KitBlock>
      <KitBlock
        title="Live island"
        note="Press it to open; the bubble swaps the second activity in."
      >
        <LiveIsland activities={activities} />
      </KitBlock>
      <KitBlock title="Coverflow" note="Drag, swipe, press a side cover, or use the arrows." wide>
        <Coverflow items={COVERS} label="Recent work" defaultIndex={2} />
      </KitBlock>
      <KitBlock title="Frost reveal" note="Wipe the glass, or press Show.">
        <FrostReveal label="Account balance">
          <Stack gap={1}>
            <Text tone="muted" size="small">
              Available balance
            </Text>
            <Text size="title" weight="semibold">
              £12,480.55
            </Text>
            <Cluster gap={2}>
              <Badge variant="success">+£320 this week</Badge>
            </Cluster>
          </Stack>
        </FrostReveal>
      </KitBlock>
      <KitBlock title="Droplet slider and switch" note="Move it fast and the drop stretches.">
        <Stack gap={4}>
          <DropletSlider
            label="Volume"
            value={volume}
            onValueChange={setVolume}
            format={(v) => `${v}%`}
          />
          <DropletSwitch label="Wi-Fi" description="Join known networks" defaultChecked />
          <DropletSwitch label="Do not disturb" />
        </Stack>
      </KitBlock>
    </>
  );
}
