import { useState } from 'react';
import {
  Avatar,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Cluster,
  ConfirmDialog,
  Delta,
  Dialog,
  EmptyState,
  ErrorState,
  Grid,
  Icon,
  KpiTile,
  KpiTileSkeleton,
  LoadingRegion,
  Menu,
  Meter,
  PointerLight,
  Popover,
  ProductTour,
  Progress,
  PromptDialog,
  Sheet,
  type SheetSide,
  Skeleton,
  SkeletonTable,
  SkeletonText,
  Stack,
  StatTile,
  Text,
  toast,
  Tooltip,
} from '~/core/ui';
import { DEMO_TREND, DEMO_TREND_DOWN } from './demo-data';
import { KitBlock, KitSection, useKitLoading } from './KitParts';

/* Sections 4 to 6: cards and tiles, feedback states, and overlays. Overlays are opened by
   buttons here, so each one can be tried with the keyboard: Esc closes, focus returns to the
   button that opened it. */

const money = (n: number) =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
    maximumFractionDigits: 0,
  }).format(n);

export function CardsSection() {
  const loading = useKitLoading();
  return (
    <KitSection
      id="cards"
      title="Cards and tiles"
      intro="Surfaces for grouping content, and the tiles that put one number up front."
    >
      <KitBlock
        title="Card"
        note="Header, content and footer slots; real liquid glass in the glass skin."
      >
        <Card>
          <CardHeader>
            <CardTitle as="h4">Team plan</CardTitle>
            <CardDescription>Up to 30 seats, billed monthly.</CardDescription>
          </CardHeader>
          <CardContent>
            <Text size="small" tone="muted">
              24 seats in use. Add more at any time; we pro-rate the change.
            </Text>
          </CardContent>
          <CardFooter>
            <Button size="sm">Manage plan</Button>
            <Button size="sm" variant="ghost">
              Cancel
            </Button>
          </CardFooter>
        </Card>
      </KitBlock>

      <KitBlock title="StatTile" note="Direction is an arrow and a word, not just green and red.">
        <Grid minItemWidth={144} gap={3}>
          <StatTile label="Active users" value="1,284" direction="up" />
          <StatTile label="Churn" value="2.1%" direction="down" />
          <StatTile label="Open tickets" value="37" />
        </Grid>
      </KitBlock>

      <KitBlock title="KpiTile" note="A figure, its change, a sparkline and a footnote." wide>
        <Grid minItemWidth={224} gap={3}>
          <KpiTile
            label="Revenue"
            value={48250}
            format={money}
            previous={42100}
            deltaLabel="vs last month"
            trend={DEMO_TREND}
            formatTrend={money}
            icon="chart"
            footnote="Rolling 30 days"
          />
          <KpiTile
            label="Refund rate"
            value={3.4}
            format={(n) => `${n.toFixed(1)}%`}
            delta={-0.18}
            deltaLabel="vs last month"
            trend={DEMO_TREND_DOWN}
            icon="alert"
          />
          <KpiTile
            label="Open invoices"
            value={12}
            icon="file-text"
            href="/table"
            footnote="Open the table"
          />
          {loading ? (
            <KpiTileSkeleton label="Loading conversion" />
          ) : (
            <KpiTile
              label="Conversion"
              value={4.2}
              format={(n) => `${n.toFixed(1)}%`}
              delta={0.031}
              deltaLabel="vs last month"
              icon="users"
            />
          )}
        </Grid>
      </KitBlock>

      <KitBlock title="Delta and PointerLight">
        <Stack gap={4}>
          <Cluster gap={3}>
            <Delta ratio={0.124} />
            <Delta ratio={-0.057} />
            <Delta ratio={0} />
            <Delta ratio={null} />
          </Cluster>
          <PointerLight surface>
            <Text size="small" tone="muted">
              Move the pointer over this card: a soft light follows it and the edge catches it.
            </Text>
          </PointerLight>
        </Stack>
      </KitBlock>
    </KitSection>
  );
}

export function FeedbackSection() {
  const loading = useKitLoading();
  const [progress, setProgress] = useState(35);
  return (
    <KitSection
      id="feedback"
      title="Feedback and states"
      intro="What the interface says when there is nothing, something went wrong, or it is still working."
    >
      <KitBlock title="EmptyState" note="Two sizes; the action is whatever fills it.">
        <Stack gap={4}>
          <EmptyState
            icon="search"
            title="No results"
            description="Try a different search, or clear the filters."
            action={<Button size="sm">Clear filters</Button>}
          />
          <EmptyState
            size="sm"
            icon="users"
            title="No teammates yet"
            description="Invite someone to get started."
          />
        </Stack>
      </KitBlock>

      <KitBlock
        title="ErrorState"
        note="Names what failed and offers a retry; the technical detail stays small."
      >
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
        title="Skeletons and loading regions"
        note="A loading region is aria-busy with an announced label (switch it on at the top of the page); the shapes are decorative."
      >
        <Stack gap={4}>
          {loading ? (
            <LoadingRegion label="profile">
              <Stack gap={3}>
                <Skeleton width={44} height={44} radius="circle" />
                <SkeletonText lines={2} />
              </Stack>
            </LoadingRegion>
          ) : (
            <Cluster gap={3}>
              <Avatar name="Ada Admin" />
              <Text size="small" tone="muted">
                Ada Admin, administrator. Last seen today.
              </Text>
            </Cluster>
          )}
          {/* the bare shapes are aria-hidden; only the region around them is busy */}
          <SkeletonTable rows={3} columns={4} />
        </Stack>
      </KitBlock>

      <KitBlock
        title="Progress and meter"
        note="Progress is a task under way; a meter is a measured level."
      >
        <Stack gap={4}>
          <Progress label="Upload" value={progress} showValue />
          <Progress label="Import" tone="up" value={100} showValue />
          <Progress label="Sync failed at" tone="down" value={62} size="sm" />
          <Progress label="Preparing" />
          <Cluster gap={3}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setProgress((p) => Math.max(0, p - 15))}
            >
              Less
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setProgress((p) => Math.min(100, p + 15))}
            >
              More
            </Button>
          </Cluster>
          <Meter label="Disk used" value={32} low={60} high={85} optimum={20} showValue />
          <Meter label="Memory used" value={74} low={60} high={85} optimum={20} showValue />
          <Meter label="CPU used" value={93} low={60} high={85} optimum={20} showValue />
        </Stack>
      </KitBlock>

      <KitBlock
        title="Toasts"
        note="Polite by default; errors are assertive and stay until dismissed. Undo counts down, pauses while hovered or focused, and Ctrl+Z (Cmd+Z) takes it back."
      >
        <Cluster gap={3}>
          <Button variant="outline" onClick={() => toast('Draft saved')}>
            Default
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.success('Invoice sent', { description: 'Delivered to billing@northwind.test.' })
            }
          >
            Success
          </Button>
          <Button variant="outline" onClick={() => toast.info('A new version is available')}>
            Info
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.error('Payment failed', {
                description: 'The card was declined.',
                action: { label: 'Retry', onClick: () => toast.success('Retried') },
              })
            }
          >
            Error with action
          </Button>
          <Button
            variant="outline"
            onClick={() =>
              toast.undo('Moved to the bin', {
                description: 'Undo, or press Ctrl+Z, within eight seconds.',
                onUndo: () => undefined,
              })
            }
          >
            Undo
          </Button>
        </Cluster>
      </KitBlock>
    </KitSection>
  );
}

const TOUR = [
  { title: 'This is the kit', body: 'Every component the apps are built from, on one page.' },
  {
    target: '#buttons',
    title: 'Buttons first',
    body: 'Each variant, size and state, as a page would use it.',
  },
  { target: '#charts', title: 'Charts', body: 'Every chart has its numbers in a table too.' },
  {
    target: 'nav[aria-label="Kit sections"]',
    title: 'Jump around',
    body: 'The section list takes you anywhere on the page.',
  },
];

const SHEET_SIDES: readonly SheetSide[] = ['right', 'left', 'bottom'];

export function OverlaysSection() {
  const [dialog, setDialog] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [prompt, setPrompt] = useState(false);
  const [sheet, setSheet] = useState<SheetSide | null>(null);
  const [tour, setTour] = useState(false);

  return (
    <KitSection
      id="overlays"
      title="Overlays"
      intro="Dialogs trap focus and return it; popovers, menus and tooltips stay out of the way."
    >
      <KitBlock
        title="Dialogs"
        note="Dialog, ConfirmDialog (destructive, with a pending state) and PromptDialog."
      >
        <Cluster gap={3}>
          <Button variant="outline" onClick={() => setDialog(true)}>
            Open dialog
          </Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            Delete project…
          </Button>
          <Button variant="outline" onClick={() => setPrompt(true)}>
            Rename…
          </Button>
        </Cluster>
        <Dialog
          open={dialog}
          onClose={() => setDialog(false)}
          title="Invite a teammate"
          description="They will get an email with a link to join."
          footer={
            <>
              <Button variant="ghost" onClick={() => setDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setDialog(false);
                  toast.success('Invite sent');
                }}
              >
                Send invite
              </Button>
            </>
          }
        >
          <Text size="small" tone="muted">
            Teammates can view everything and edit what you share with them.
          </Text>
        </Dialog>
        <ConfirmDialog
          open={confirm}
          onClose={() => setConfirm(false)}
          title="Delete this project?"
          description="Its files and history are removed for everyone. This cannot be undone."
          confirmLabel="Delete project"
          destructive
          onConfirm={async () => {
            await new Promise((r) => setTimeout(r, 800));
            setConfirm(false);
            toast.success('Project deleted');
          }}
        />
        <PromptDialog
          open={prompt}
          title="Rename project"
          label="Project name"
          defaultValue="Quarterly report"
          submitText="Rename"
          onClose={() => setPrompt(false)}
          onSubmit={(v) => {
            setPrompt(false);
            toast.success(`Renamed to ${v}`);
          }}
        />
      </KitBlock>

      <KitBlock title="Sheets" note="A panel from the edge: right, left or bottom.">
        <Cluster gap={3}>
          {SHEET_SIDES.map((side) => (
            <Button key={side} variant="outline" onClick={() => setSheet(side)}>
              From the {side}
            </Button>
          ))}
        </Cluster>
        <Sheet
          open={sheet !== null}
          onOpenChange={(open) => !open && setSheet(null)}
          side={sheet ?? 'right'}
          title="Filters"
          description="Narrow the list by status and date."
          footer={<Button onClick={() => setSheet(null)}>Apply filters</Button>}
        >
          <Text size="small" tone="muted">
            Sheets suit longer forms and details that need the page behind them kept in view.
          </Text>
        </Sheet>
      </KitBlock>

      <KitBlock
        title="ProductTour"
        note="Dims the page but one part, says what it is, and steps on. Esc or Skip ends it; arrows go back and on; focus returns here."
      >
        <Button variant="outline" onClick={() => setTour(true)}>
          Take the tour
        </Button>
        <ProductTour open={tour} onClose={() => setTour(false)} steps={TOUR} />
      </KitBlock>

      <KitBlock title="Popover, menu and tooltip">
        <Cluster gap={3}>
          <Popover
            trigger="Filters"
            label="Filters"
            icon="search"
            footer={
              <Button size="sm" variant="ghost">
                Reset
              </Button>
            }
          >
            <Text size="small" tone="muted">
              Non-modal: Tab moves on through the panel and out of it.
            </Text>
          </Popover>
          <Menu
            label="Actions"
            icon="more"
            items={[
              { id: 'edit', label: 'Edit', icon: 'settings', onSelect: () => toast('Edit') },
              {
                id: 'share',
                label: 'Share link',
                icon: 'users',
                onSelect: () => toast('Link copied'),
              },
              { separator: true },
              {
                id: 'delete',
                label: 'Delete',
                icon: 'x',
                danger: true,
                onSelect: () => toast.error('Deleted'),
              },
            ]}
          />
          <Tooltip content="Appears on hover and on keyboard focus">
            <Button variant="outline">
              <Icon name="alert" size={14} />
              Hover or focus me
            </Button>
          </Tooltip>
        </Cluster>
      </KitBlock>
    </KitSection>
  );
}
