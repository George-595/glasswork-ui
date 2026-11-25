/* The studio set for the showcase's axe gate (all four skin × mode passes): every component new
   in the November 2026 pass, in its resting state. Deterministic: no clock, no random. Their
   interactions are covered in tests/studio.test.tsx. */
import {
  Accordion,
  AgentCopilot,
  AgentOrb,
  ColourPicker,
  ContextMenu,
  Coverflow,
  DropletSlider,
  DropletSwitch,
  FrostReveal,
  GlassHeatmap,
  HistogramRange,
  HoverCard,
  Kanban,
  LiveIsland,
  Menubar,
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
  SnapDrawer,
  TimeField,
  TimeRange,
  Toolbar,
  TreeView,
  WeekScheduler,
  WorkflowCanvas,
} from '../src/index';

const grid = { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 24 } as const;

export function StudioShowcase() {
  return (
    <section aria-label="Studio set" style={grid}>
      <ResizableGroup height={220}>
        <ResizablePane defaultSize={40}>
          <PaneHeader title="Files" />
          <TreeView
            label="Files"
            defaultExpanded={['src']}
            items={[
              {
                id: 'src',
                label: 'src',
                children: [
                  { id: 'a', label: 'accordion.tsx', icon: 'file', badge: 'new' },
                  { id: 'b', label: 'button.tsx', icon: 'file' },
                ],
              },
              { id: 'r', label: 'README.md', icon: 'file' },
            ]}
          />
        </ResizablePane>
        <ResizableHandle aria-label="Resize the file list" />
        <ResizablePane defaultSize={60}>
          <PaneHeader title="Preview" />
        </ResizablePane>
      </ResizableGroup>
      <Accordion
        defaultValue={['a']}
        items={[
          { id: 'a', title: 'Who owns the code?', icon: 'shield', content: 'You do.' },
          { id: 'b', title: 'Is it accessible?', meta: 'WCAG 2.2 AA', content: 'Yes.' },
        ]}
      />
      <p>
        Kept by{' '}
        <HoverCard
          href="#ada"
          content={<ProfilePreview name="Ada Lovelace" job="Design engineer" initials="AL" />}
        >
          Ada Lovelace
        </HoverCard>
      </p>
      <Menubar
        label="Editor"
        menus={[
          { id: 'file', label: 'File', items: [{ id: 'new', label: 'New file', shortcut: '⌘N' }] },
          { id: 'edit', label: 'Edit', items: [{ id: 'undo', label: 'Undo' }] },
        ]}
      />
      <ContextMenu
        label="Report"
        items={[
          { id: 'open', label: 'Open' },
          { type: 'checkbox', id: 'pin', label: 'Pin', defaultChecked: true },
        ]}
      >
        Report.pdf
      </ContextMenu>
      <Toolbar
        label="Text formatting"
        items={[
          { type: 'toggle', id: 'b', label: 'Bold', icon: 'bold', defaultPressed: true },
          { type: 'toggle', id: 'i', label: 'Italic', icon: 'italic' },
          { type: 'separator', id: 's' },
          { type: 'button', id: 'l', label: 'Add a link', icon: 'link' },
        ]}
      />
      <AgentCopilot
        plans={[
          {
            id: 'p',
            prompt: 'Dim the lights',
            steps: [{ ref: 'Brightness', action: 'setValue', args: [30] }],
          },
        ]}
      />
      <SnapDrawer trigger="Open the order" title="Order" description="Two chairs.">
        Details
      </SnapDrawer>
      <TimeField label="Reminder" defaultValue="09:30" />
      <TimeRange label="Opening hours" defaultStart="08:30" defaultEnd="17:45" />
      <HistogramRange
        label="Price"
        values={[200, 220, 260, 300, 310, 340, 420, 500, 610]}
        min={150}
        max={650}
        defaultValue={[250, 520]}
      />
      <ColourPicker label="Brand colour" />
      <PhotoCropper src="lake.jpg" label="Cover photo" alt="A lake at dusk" />
      <Kanban
        label="Work"
        columns={[
          {
            id: 't',
            title: 'To do',
            cards: [
              {
                id: 'c',
                title: 'Write the brief',
                tag: { label: 'Design', tone: 2 },
                due: '28 Nov',
              },
            ],
          },
          { id: 'd', title: 'Done', limit: 2, cards: [] },
        ]}
      />
      <WeekScheduler
        label="This week"
        days={[
          { name: 'Mon', date: 23 },
          { name: 'Tue', date: 24 },
        ]}
        hours={[9, 12]}
        today={1}
        now={10 * 60}
        events={[{ id: 'e', title: 'Stand-up', day: 0, start: 9 * 60, end: 9 * 60 + 30, tone: 1 }]}
      />
      <WorkflowCanvas
        label="Enquiry workflow"
        nodes={[
          { id: 'a', title: 'New enquiry', kind: 'trigger', x: 0, y: 0 },
          { id: 'b', title: 'Reply', kind: 'output', x: 260, y: 0 },
        ]}
        edges={[{ from: 'a', to: 'b' }]}
      />
      <ScatterChart
        title="Size against price"
        xLabel="Area"
        yLabel="Price"
        series={[
          {
            name: 'Flats',
            points: [
              { x: 40, y: 180 },
              { x: 55, y: 220 },
            ],
          },
          {
            name: 'Houses',
            points: [
              { x: 90, y: 330 },
              { x: 120, y: 420 },
            ],
          },
        ]}
      />
      <RadarChart
        title="Effort"
        axes={['Design', 'Build', 'Test', 'Access']}
        series={[
          { name: 'Kit', values: [9, 8, 8, 10] },
          { name: 'Template', values: [6, 5, 3, 4] },
        ]}
        max={10}
      />
      <PrismDonut
        title="Spend"
        data={[
          { label: 'Hosting', value: 240 },
          { label: 'Tools', value: 180 },
          { label: 'Models', value: 420 },
        ]}
      />
      <NetworkGraph
        title="Team"
        groups={['People', 'Server']}
        nodes={[
          { id: 'a', label: 'Lead', group: 0 },
          { id: 'b', label: 'API', group: 1 },
          { id: 'c', label: 'Client', group: 0 },
        ]}
        links={[
          { source: 'a', target: 'b' },
          { source: 'a', target: 'c' },
        ]}
      />
      <GlassHeatmap
        title="Visits"
        rows={['Mon', 'Tue']}
        columns={['9am', '12pm', '3pm']}
        values={[
          [3, 9, 4],
          [0, 6, 12],
        ]}
      />
      <GlassHeatmap
        title="Visits, flat"
        rows={['Mon', 'Tue']}
        columns={['9am', '12pm']}
        values={[
          [3, 9],
          [0, 6],
        ]}
        defaultView="flat"
      />
      <AgentOrb state="thinking" label="Co-pilot" caption />
      <AgentOrb state="idle" label="Co-pilot" onPress={() => {}} />
      <LiveIsland
        activities={[
          { id: 'd', icon: 'zap', title: 'Deploying', progress: 0.4, trailing: '40%' },
          { id: 'm', icon: 'music', title: 'Focus mix', trailing: '2:14' },
        ]}
      />
      <LiveIsland
        label="Live activity, open"
        defaultExpanded
        activities={[
          {
            id: 'd',
            icon: 'zap',
            title: 'Deploying',
            detail: 'Step 2 of 5',
            progress: 0.4,
            actions: [{ label: 'View logs', onSelect: () => {} }],
          },
        ]}
      />
      <Coverflow
        label="Recent work"
        defaultIndex={1}
        items={[
          { id: 'a', title: 'Inventory', tone: 1, mark: 'Stock' },
          { id: 'b', title: 'Booking', subtitle: 'Mobile first', tone: 3 },
          { id: 'c', title: 'Photo', image: 'lake.jpg' },
        ]}
      />
      <FrostReveal label="Account balance">£12,480.55</FrostReveal>
      <DropletSlider label="Volume" defaultValue={60} />
      <DropletSwitch label="Wi-Fi" description="Join known networks" defaultChecked />
    </section>
  );
}
