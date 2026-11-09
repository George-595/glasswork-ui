import { type ReactNode, useId, useRef, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/card';
import { Skeleton } from '../components/skeleton';
import { Switch } from '../components/switch';
import type { GenerateRender } from '../effects/generate/reveal';
import { useGenerate } from '../effects/generate/useGenerate';
import { cn } from '../lib/cn';
import { ChartCardContext } from './ChartFrame';

/* ChartCard — the surface a chart sits on: a Card (real liquid glass in the glass
   skin) with a header (eyebrow, title, description, and an `actions` slot on the
   right for range controls), the chart as its body, and a footer holding the
   "Show data table" switch and any `footer` of your own.

   The chart inside keeps its own `title` (its accessible name and the data table's
   caption); in a card that caption is visually hidden because the card's heading
   already says it. The switch turns the chart's one data table from visually hidden
   to visible, so nothing is duplicated: ChartFigure reads the card's state.

   States: `loading` shows a skeleton in an aria-busy region that announces
   "Loading <title>"; `error` shows your node in a role="alert"; `empty` replaces
   the chart with a message (a chart given no data says so itself, too). In all
   three the table switch is disabled, as there is no table to show.

   When the data arrives after a loading state, the card is drawn in by generate(), by default
   in glyphs (`generate="ascii"`): the card and the chart's own marks (each line, bar and
   gridline) drawn by a pen plotter in enterprise, crystallised out of frost in glass, then
   the real card (src/effects/generate). `draft` is the drafting-table drawing instead. */
export interface ChartCardProps {
  title: string;
  description?: string;
  /** A small label above the title, e.g. "Revenue". */
  eyebrow?: string;
  /** Heading level for the title, so the card fits the page outline. Default h3. */
  headingLevel?: 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  /** Controls on the right of the header: a range select, a ToggleGroup, a Button. */
  actions?: ReactNode;
  /** Shown under the chart, beside the table switch. */
  footer?: ReactNode;
  loading?: boolean;
  /** Replaces the chart with this, announced as an alert. */
  error?: ReactNode;
  /** true shows "No data to show."; a node shows that instead. */
  empty?: boolean | ReactNode;
  /** Whether the data table is visible (controlled). */
  showTable?: boolean;
  defaultShowTable?: boolean;
  onShowTableChange?: (show: boolean) => void;
  /** Height of the loading skeleton in px, to match the chart. Default 240. */
  height?: number;
  className?: string;
  /** How the card is drawn in when its data arrives. Default ascii (the skin's look). */
  generate?: GenerateRender;
  /** The chart: LineChart, AreaChart, BarChart or DonutChart. */
  children?: ReactNode;
}

export function ChartCard({
  title,
  description,
  eyebrow,
  headingLevel = 'h3',
  actions,
  footer,
  loading,
  error,
  empty,
  showTable,
  defaultShowTable = false,
  onShowTableChange,
  height = 240,
  className,
  generate = 'ascii',
  children,
}: ChartCardProps) {
  const [inner, setInner] = useState(defaultShowTable);
  const headingId = useId();
  const hasError = error !== undefined && error !== null && error !== false;
  const isEmpty = empty !== undefined && empty !== false && empty !== null;
  const blocked = Boolean(loading) || hasError || isEmpty;
  const table = (showTable ?? inner) && !blocked;
  const card = useRef<HTMLDivElement>(null);
  useGenerate(card, !blocked, { traceSvg: true, maxParts: 90, render: generate });
  const setTable = (next: boolean) => {
    if (showTable === undefined) setInner(next);
    onShowTableChange?.(next);
  };

  let body: ReactNode = children;
  if (loading) {
    body = (
      <div className="ui-chart-card-state min-w-0" aria-busy="true">
        <span role="status" className="ui-sr-only">
          Loading {title}
        </span>
        <Skeleton height={height} radius="md" />
      </div>
    );
  } else if (hasError) {
    body = (
      <div
        role="alert"
        className="ui-chart-card-state ui-chart-card-error min-w-0 rounded-xs border border-down px-4 py-3.5 text-[13px] leading-normal text-fg"
      >
        {error}
      </div>
    );
  } else if (isEmpty) {
    body = (
      <div className="ui-chart-card-state min-w-0">
        {empty === true ? (
          <p className="ui-chart-empty m-0 grid min-h-24 place-items-center rounded-xs border border-dashed border-border p-4 text-center text-[13px] leading-normal text-fg-muted">
            No data to show.
          </p>
        ) : (
          empty
        )}
      </div>
    );
  }

  return (
    <Card
      ref={card}
      className={cn('ui-chart-card [&_.ui-chart]:gap-3', className)}
      role="group"
      aria-labelledby={headingId}
    >
      <CardHeader className="ui-chart-card-header flex-row items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          {eyebrow && (
            <span className="ui-chart-card-eyebrow text-[11px]/[1.2] font-semibold tracking-[0.06em] text-fg-muted uppercase">
              {eyebrow}
            </span>
          )}
          <CardTitle as={headingLevel} id={headingId}>
            {title}
          </CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </div>
        {actions && (
          <div className="ui-chart-card-actions flex flex-none flex-wrap items-center gap-2">
            {actions}
          </div>
        )}
      </CardHeader>
      <CardContent>
        <ChartCardContext.Provider value={{ showTable: table }}>{body}</ChartCardContext.Provider>
      </CardContent>
      <CardFooter className="ui-chart-card-footer flex-wrap justify-between">
        <Switch
          label="Show data table"
          checked={table}
          onCheckedChange={setTable}
          disabled={blocked}
        />
        {footer && (
          <div className="ui-chart-card-footnote text-[13px] leading-normal text-fg-muted">
            {footer}
          </div>
        )}
      </CardFooter>
    </Card>
  );
}
