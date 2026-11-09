import { type ComponentType, Suspense, useState } from 'react';
import { useInitialData } from '~/core/api';
import { useAuth } from '~/core/auth';
import { useHydrated } from '~/core/hooks';
import { lazyResolved } from '~/core/lazy';
import { Link } from '~/core/router';
import {
  ActionItem,
  ActionList,
  ChartGrid,
  ChartGridItem,
  Grid,
  type IconName,
  LoadingRegion,
  Page,
  PageHero,
  Panel,
  Section,
  SegmentedControl,
  Skeleton,
} from '~/core/ui';
import { toISODate } from '~/core/utils';
import { RANGE_OPTIONS, RANGES, type Range } from './range';

/* The overview. A greeting and a 7/30/90-day range at the top; below it four KPI tiles,
   revenue against costs (with the period before as a dashed line), the spend split, the
   recent-activity feed and a few quick actions. The range drives the KPIs and the revenue
   chart. Each panel loads on its own, so one slow or failed request never blanks the rest.

   The figures (HomeSections.tsx) are a file of their own: the chart library and the tiles'
   sparklines are most of what this page weighs, and the frame, the greeting and the range need
   none of it. Each panel is behind its own Suspense boundary, over that one shared file. The
   server and the browser wait for the file before the first render (`ready`, below), so the page
   is sent, and hydrated, with every panel drawn and no fallback. Reaching this page from another
   starts the file's fetch with the page's own, and the skeletons stand in until it arrives.

   The clock is a prop (`now`) so a test can fix the greeting and the relative times; the
   page itself never reads Date.now. */

const loadSections = () => import('./HomeSections');
const part = <P extends object>(
  pick: (m: Awaited<ReturnType<typeof loadSections>>) => ComponentType<P>,
) => lazyResolved<P>(() => loadSections().then((m) => ({ default: pick(m) })));
const kpis = part((m) => m.KpiSection);
const revenue = part((m) => m.RevenuePanel);
const spend = part((m) => m.SpendPanel);
const insights = part((m) => m.TransactionInsights);
const activity = part((m) => m.ActivityPanel);
const KpiSection = kpis.Component;
const RevenuePanel = revenue.Component;
const SpendPanel = spend.Component;
const TransactionInsights = insights.Component;
const ActivityPanel = activity.Component;
// start fetching the figures now, in step with this file, not when the first panel asks
void loadSections();

/** Settles when every panel's file has arrived. A server render awaits it before rendering and the
    browser before it hydrates (routes.ts `PageModule`), so the panels are drawn in place. */
export const ready = () =>
  Promise.all([kpis, revenue, spend, insights, activity].map((p) => p.load()));

/* What stands in for a panel until its file arrives: the panel's size, so nothing jumps. */
function KpiFallback() {
  return (
    <LoadingRegion label="key figures">
      <Grid cols={{ base: 1, sm: 2, lg: 4 }} gap={4}>
        {['a', 'b', 'c', 'd'].map((id) => (
          <Skeleton key={id} height={96} radius="md" />
        ))}
      </Grid>
    </LoadingRegion>
  );
}

function PanelFallback({ label, height }: { label: string; height: number }) {
  return (
    <LoadingRegion label={label}>
      <Skeleton height={height} radius="md" />
    </LoadingRegion>
  );
}

/* The hour of day. The server draws the first screen and the browser hydrates it, and they can be
   in different time zones, so the first render (both of them) uses London time, this app's own
   clock (dates elsewhere in the app are UK days too); once hydrated, the reader's own zone. */
const LONDON = 'Europe/London';
function hourOf(now: Date, timeZone: string | undefined): number {
  if (timeZone === undefined) return now.getHours();
  return Number(
    new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone }).format(now),
  );
}

function greetingFor(now: Date, timeZone?: string): string {
  const h = hourOf(now, timeZone);
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

interface QuickAction {
  to: string;
  label: string;
  hint: string;
  icon: IconName;
  adminOnly?: boolean;
}

const QUICK_ACTIONS: readonly QuickAction[] = [
  {
    to: '/admin/users',
    label: 'New invite',
    hint: 'Add someone to the team',
    icon: 'plus',
    adminOnly: true,
  },
  {
    to: '/table',
    label: 'Export transactions',
    hint: 'Filter, then download a CSV',
    icon: 'table',
  },
  { to: '/tool-1', label: 'Open calculator', hint: 'Project savings growth', icon: 'wrench' },
  { to: '/assistant', label: 'Ask the assistant', hint: 'Chat with the model', icon: 'sparkles' },
];

function QuickActions({ isAdmin }: { isAdmin: boolean }) {
  const actions = QUICK_ACTIONS.filter((a) => !a.adminOnly || isAdmin);
  return (
    <Panel>
      <Section title="Quick actions" level={3} gap={2}>
        <ActionList aria-label="Quick actions">
          {actions.map((a) => (
            <ActionItem
              key={a.to}
              linkAs={Link}
              linkProps={{ to: a.to }}
              icon={a.icon}
              title={a.label}
              description={a.hint}
            />
          ))}
        </ActionList>
      </Section>
    </Panel>
  );
}

/* "Saturday 17 October 2026", put together from the parts: the server (Node) and the browser can
   hold different versions of the locale data, which disagree about a comma after the weekday, and
   the page they draw must be the same text. */
function dateLine(now: Date, timeZone: string | undefined): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${part('weekday')} ${part('day')} ${part('month')} ${part('year')}`;
}

export interface HomePageProps {
  /** The current time. Tests pass a fixed one; otherwise the server's instant when it drew the
      page (so hydration agrees with it), else the real clock, read once. */
  now?: Date;
}

export default function HomePage({ now: nowProp }: HomePageProps = {}) {
  const serverNow = useInitialData()?.now;
  const [clock] = useState(() => nowProp ?? (serverNow ? new Date(serverNow) : new Date()));
  const now = nowProp ?? clock;
  const zone = useHydrated() ? undefined : LONDON;
  const { user, isAdmin } = useAuth();
  const [days, setDays] = useState<Range>(30);
  const firstName = user?.name.split(/\s+/)[0];

  return (
    <Page title="Overview" eyebrow="Dashboard" description="Fake data: seeded, deterministic.">
      <PageHero
        title={`${greetingFor(now, zone)}${firstName ? `, ${firstName}` : ''}`}
        subtitle={<time dateTime={toISODate(now)}>{dateLine(now, zone)}</time>}
        actions={
          <SegmentedControl
            label="Date range"
            size="sm"
            options={RANGE_OPTIONS}
            value={String(days)}
            onValueChange={(v) => setDays(RANGES.find((d) => String(d) === v) ?? 30)}
          />
        }
      />

      <Suspense fallback={<KpiFallback />}>
        <KpiSection days={days} />
      </Suspense>

      <ChartGrid>
        <ChartGridItem span="two-thirds">
          <Suspense fallback={<PanelFallback label="revenue" height={380} />}>
            <RevenuePanel days={days} />
          </Suspense>
        </ChartGridItem>
        <ChartGridItem span="third">
          <Suspense fallback={<PanelFallback label="spend" height={380} />}>
            <SpendPanel />
          </Suspense>
        </ChartGridItem>
        <Suspense
          fallback={
            <>
              <ChartGridItem span="two-thirds">
                <PanelFallback label="transactions per day" height={320} />
              </ChartGridItem>
              <ChartGridItem span="third">
                <PanelFallback label="payment success" height={320} />
              </ChartGridItem>
            </>
          }
        >
          <TransactionInsights />
        </Suspense>
        <ChartGridItem span="two-thirds">
          <Suspense fallback={<PanelFallback label="recent activity" height={380} />}>
            <ActivityPanel now={now} canViewAll={isAdmin} />
          </Suspense>
        </ChartGridItem>
        <ChartGridItem span="third">
          <QuickActions isAdmin={isAdmin} />
        </ChartGridItem>
      </ChartGrid>
    </Page>
  );
}
