import { cssVar } from '@apps/colors';
import type { ChartPoint, ChartTheme } from '@tanstack/charts';
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useRef,
  useState,
} from 'react';
import { cn } from '../lib/cn';
import { markerPath, strokedMarker } from './markers';

/* The parts every chart shares. The charts draw with @tanstack/charts (its
   React adapter, SVG renderer); this file is the frame around them.

   Accessibility contract (WCAG 1.1.1, 1.3.1, 1.4.1, 1.4.11):
   - a <figure> whose <figcaption> holds the visible title and description;
   - the <svg> is role="img" with an aria-label that names the chart and sums
     it up, so assistive tech gets one image, not hundreds of shapes
     (TanStack's SVG renderer emits exactly that from `ariaLabel`);
   - the full data is in a visually hidden <table>, the real text alternative;
   - series are told apart by more than colour (dash patterns and marker
     shapes, fill patterns on bars, or numbered slices), and every series
     colour is >= 3:1 against the surface in each skin and mode
     (the roles chart-1..chart-8);
   - pointer readouts are aria-hidden extras: the table already has it all;
   - the legend of a multi-series chart is a row of real <button aria-pressed>
     toggles: a hidden series leaves the drawing and the readout but never the
     data table, and at least one series always stays visible;
   - "Show data table" (ChartCard) turns the same table from visually hidden
     to visible, in a focusable, labelled scroll region, caption included;
   - a chart with no data says so in words: no empty axes, no crash;
   - motion: TanStack's SVG tween respects prefers-reduced-motion, and
     the plot's classes stop every CSS transition under it too.

   Colour: roles only. Series are cssVar('chart-1'..'chart-8'); the guides, text, ring and
   readout are role utilities (border-subtle grid, fg-subtle axis text, surface-solid). The
   classes below are the charts' whole stylesheet: there is no charts.css. */
export interface ChartCommonProps {
  title: string;
  description?: string;
  /** Plot height in px. */
  height?: number;
  className?: string;
  /** What to say when there is nothing to draw. Default "No data to show." */
  emptyMessage?: string;
}

/** What a ChartCard tells the chart inside it. The card's own heading stands in for the
    caption, which stays in the page (visually hidden) as the chart's accessible name. */
export interface ChartCardState {
  showTable: boolean;
}
export const ChartCardContext = createContext<ChartCardState | null>(null);

export const SERIES_VARS = [
  cssVar('chart-1'),
  cssVar('chart-2'),
  cssVar('chart-3'),
  cssVar('chart-4'),
  cssVar('chart-5'),
  cssVar('chart-6'),
  cssVar('chart-7'),
  cssVar('chart-8'),
] as const;
export const seriesColor = (i: number) => SERIES_VARS[i % SERIES_VARS.length] as string;

/** Dash pattern per series, so lines differ by more than colour. */
export const DASHES = [
  '',
  '6 4',
  '2 3',
  '10 3 2 3',
  '1 5',
  '14 4',
  '4 2 1 2',
  '8 3 2 3 2 3',
] as const;
export const seriesDash = (i: number) => DASHES[i % DASHES.length] || undefined;

/** Dash for a comparison ("previous period") line: shorter than any primary dash. */
export const COMPARISON_DASH = '3 4';

/** Width used before the browser measures the container, and on the server. */
export const SSR_WIDTH = 640;

/** role="img" for an <svg> we draw ourselves. Spread, not written inline: the linter's
    prefer-tag-over-role would have an <img>, which cannot hold drawn shapes. */
export const SVG_IMG = { role: 'img' } as const;

/* ---- the charts' classes (Tailwind on roles; hooks `ui-chart-*` stay for tests and apps) ---- */
const TS = '[&_.ts-chart]';
export const CHART_PLOT = cn(
  'ui-chart-plot relative min-w-0 text-fg-subtle',
  '[&_.ts-chart-host]:rounded-xs',
  `${TS}:font-sans ${TS}:tabular-nums [&_.ts-chart:focus]:outline-none`,
  '[&_.ts-chart-host:has(.ts-chart:focus-visible)]:[box-shadow:var(--ring)]',
  '[&_.ts-chart__grid_line]:stroke-border-subtle [&_.ts-chart__grid_line]:[stroke-opacity:1]',
  '[&_.ts-chart__axes_text]:fill-fg-subtle [&_.ts-chart__axes_text]:text-[11px]',
  'motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:animate-none',
  'forced-colors:[&_.ts-chart_path]:[forced-color-adjust:none] forced-colors:[&_.ts-chart_rect]:[forced-color-adjust:none]',
);
const TEXT_SMALL = 'text-[13px] leading-normal';

/** Scene paint from the roles. Text is currentColor, which the plot sets to `text-fg-subtle`. */
export const CHART_THEME: Partial<ChartTheme> = {
  foreground: 'currentColor',
  muted: 'currentColor',
  grid: cssVar('border-subtle'),
  background: 'transparent',
  palette: SERIES_VARS,
  focusRing: { fill: cssVar('surface-solid'), strokeWidth: 2.5 },
};

/** The roles the drawing code hands to SVG paint (one place, so a chart never names a colour). */
export const PAINT = {
  grid: cssVar('border-subtle'),
  axisLine: cssVar('border-strong'),
  label: cssVar('fg-muted'),
  strong: cssVar('fg'),
  gap: cssVar('surface-solid'),
  up: cssVar('up'),
  down: cssVar('down'),
} as const;

/** Guide styling shared by the Cartesian charts: solid role grid, full-opacity tick text. */
export const GRID = { stroke: PAINT.grid, strokeOpacity: 1 } as const;
export const TICK_LABELS = { opacity: 1 } as const;
/** SVG tween on data change; TanStack skips it under prefers-reduced-motion. */
export const SVG_ANIMATION = {
  duration: 350,
  easing: 'ease-out',
  respectReducedMotion: true,
} as const;

/** The plot's width in px, for layout the definition needs up front (how many tick labels
    fit). SSR_WIDTH until measured, and rounded to 16px so a drag-resize does not rebuild
    the chart on every pixel. Attach `measure` to the plot element (merge it with the
    readout's ref). A static definition built from this keeps TanStack's first-arrow
    keyboard behaviour, which TanStack's responsive (function) form does not. */
export function useChartWidth() {
  const [width, setWidth] = useState(SSR_WIDTH);
  const observer = useRef<ResizeObserver | null>(null);
  const measure = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = () => {
      const w = Math.round(el.clientWidth / 16) * 16;
      if (w > 0) setWidth(w);
    };
    read();
    observer.current = new ResizeObserver(read);
    observer.current.observe(el);
  }, []);
  return { width, measure };
}

/** A DOM-safe id fragment from useId (which returns ":r1:"). */
export function useSafeId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
}

export interface DataTableSpec {
  headers: readonly string[];
  rows: readonly (readonly ReactNode[])[];
}

export function ChartFigure({
  title,
  description,
  className,
  data,
  legend,
  showTable,
  empty,
  emptyMessage = 'No data to show.',
  children,
}: {
  title: string;
  description?: string;
  className?: string;
  data: DataTableSpec;
  legend?: ReactNode;
  /** Show the data table instead of hiding it visually. Defaults to the ChartCard's switch. */
  showTable?: boolean;
  /** Nothing to draw: say so instead of rendering the chart. */
  empty?: boolean;
  emptyMessage?: string;
  children?: ReactNode;
}) {
  const card = useContext(ChartCardContext);
  const visible = showTable ?? card?.showTable ?? false;
  return (
    <figure
      className={cn('ui-chart m-0 flex min-w-0 flex-col gap-2.5', className)}
      data-in-card={card ? '' : undefined}
    >
      <figcaption className={cn('ui-chart-caption flex flex-col gap-0.5', card && 'ui-sr-only')}>
        <span className="ui-chart-title text-sm/[1.3] font-semibold text-fg">{title}</span>
        {description && (
          <span className={cn('ui-chart-description text-fg-subtle', TEXT_SMALL)}>
            {description}
          </span>
        )}
      </figcaption>
      {empty ? (
        <p
          className={cn(
            'ui-chart-empty m-0 grid min-h-24 place-items-center rounded-xs border border-dashed border-border p-4 text-center text-fg-muted',
            TEXT_SMALL,
          )}
        >
          {emptyMessage}
        </p>
      ) : (
        <>
          {children}
          {legend}
          <ChartTable title={title} data={data} visible={visible} />
        </>
      )}
    </figure>
  );
}

const CELL = 'border-t border-border px-2.5 py-1.5 text-right whitespace-nowrap';

/* The scroll box must take focus so a keyboard user can scroll a wide table (WCAG 2.1.1;
   axe scrollable-region-focusable). Spread, as in DataTable, because the linters'
   no-noninteractive-tabindex rule does not know that case. */
const SCROLL_FOCUS = { tabIndex: 0 } as const;

/** The one data table. Visually hidden by default; visible, it sits in a labelled,
    focusable scroll region so a wide table can be read by keyboard at any width. */
function ChartTable({
  title,
  data,
  visible,
}: {
  title: string;
  data: DataTableSpec;
  visible: boolean;
}) {
  const th = visible ? CELL : undefined;
  const table = (
    <table
      className={
        visible
          ? cn('ui-chart-table w-full border-collapse tabular-nums text-fg', TEXT_SMALL)
          : 'ui-sr-only'
      }
    >
      <caption
        className={visible ? 'px-2.5 py-2 text-left font-semibold text-fg-muted' : undefined}
      >
        {title}: data
      </caption>
      <thead>
        <tr>
          {data.headers.map((h) => (
            <th
              key={h}
              scope="col"
              className={
                visible
                  ? cn(CELL, 'sticky top-0 bg-surface-solid text-fg-muted font-semibold')
                  : undefined
              }
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {data.rows.map((r, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a static rendering of the data, never reordered
          <tr key={i}>
            {r.map((c, j) =>
              j === 0 ? (
                <th
                  // biome-ignore lint/suspicious/noArrayIndexKey: cells by position
                  key={j}
                  scope="row"
                  className={visible ? cn(CELL, 'text-left font-medium') : undefined}
                >
                  {c}
                </th>
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: cells by position
                <td key={j} className={th}>
                  {c}
                </td>
              ),
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
  return visible ? (
    <section
      className="ui-chart-table-wrap max-h-70 overflow-auto rounded-xs border border-border focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
      aria-label={`${title}: data table`}
      {...SCROLL_FOCUS}
    >
      {table}
    </section>
  ) : (
    // a table ignores the 1px box of .ui-sr-only (it sizes to its content), so a clipped
    // block holds it: otherwise its full width widens the page on a phone
    <div className="ui-sr-only">{table}</div>
  );
}

/** A marker shape per series: circle, square, triangle, diamond, cross. */
export function Marker({ i, x, y, color }: { i: number; x: number; y: number; color: string }) {
  return strokedMarker(i) ? (
    <path d={markerPath(i, x, y)} fill="none" stroke={color} strokeWidth={2} />
  ) : (
    <path d={markerPath(i, x, y)} fill={color} stroke={PAINT.gap} strokeWidth={1.5} />
  );
}

/* ---- bar fill patterns -----------------------------------------------------
   Bars of different series differ by more than colour: a pattern per series,
   drawn over the series colour in the surface colour. The <pattern>s live in
   one hidden zero-size <svg> beside the chart (a fill references them by id,
   document-wide), so the same fills paint the bars and the legend swatches. */
export const PATTERN_COUNT = 8;
export const patternFill = (prefix: string, i: number) => `url(#${prefix}-p${i % PATTERN_COUNT})`;

const HATCH = { stroke: PAINT.gap, strokeWidth: 2, strokeOpacity: 0.6 } as const;
const DIAGONAL = 'M-2,2L2,-2M0,8L8,0M6,10L10,6';

export function PatternDefs({ prefix }: { prefix: string }) {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      focusable="false"
      className="ui-chart-patterns pointer-events-none absolute"
    >
      <defs>
        {SERIES_VARS.map((color, i) => (
          <pattern
            key={color}
            id={`${prefix}-p${i}`}
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
          >
            <rect width="8" height="8" fill={color} />
            {i === 1 && <path d={DIAGONAL} {...HATCH} />}
            {i === 2 && (
              <>
                <circle cx="2" cy="2" r="1.4" fill={PAINT.gap} fillOpacity="0.7" />
                <circle cx="6" cy="6" r="1.4" fill={PAINT.gap} fillOpacity="0.7" />
              </>
            )}
            {i === 3 && (
              <path d={`${DIAGONAL}M-2,6L2,10M0,0L8,8M6,-2L10,2`} {...HATCH} strokeWidth={1.4} />
            )}
            {i === 4 && <path d="M0,2H8M0,6H8" {...HATCH} strokeWidth={1.6} />}
            {i === 5 && <path d="M2,0V8M6,0V8" {...HATCH} strokeWidth={1.6} />}
            {i === 6 && <path d="M10,2L2,10M8,-2L-2,8M12,6L6,12" {...HATCH} />}
            {i === 7 && (
              <>
                <circle cx="4" cy="4" r="2.2" fill={PAINT.gap} fillOpacity="0.7" />
                <path d="M0,0H8V8H0Z" fill="none" {...HATCH} strokeWidth={1} />
              </>
            )}
          </pattern>
        ))}
      </defs>
    </svg>
  );
}

/* ---- which series are drawn -------------------------------------------------
   Indices are positions in the full series list, which a hidden series keeps, so
   a series keeps its colour, dash, marker and pattern whatever else is toggled. */
export function useSeriesToggle(count: number) {
  const [hidden, setHidden] = useState<ReadonlySet<number>>(() => new Set());
  const toggle = useCallback(
    (i: number) =>
      setHidden((prev) => {
        const next = new Set(Array.from(prev).filter((n) => n < count));
        if (next.has(i)) next.delete(i);
        else if (count - next.size > 1) next.add(i);
        return next;
      }),
    [count],
  );
  const live = Array.from(hidden).filter((n) => n < count).length;
  const reset = live >= count; // the list shrank under us: show everything
  // a new function only when the set of hidden series changes, so it is a fair dependency
  const isShown = useCallback((i: number) => reset || !hidden.has(i), [reset, hidden]);
  return { isShown, toggle, shownCount: reset ? count : count - live };
}

export interface LegendItem {
  label: string;
  /** Position in the full series list: fixes its colour, dash, marker and pattern. */
  index?: number;
  /** 'bar' draws a filled swatch (with `fill`); 'comparison' a muted dashed line. */
  kind?: 'line' | 'bar' | 'comparison';
  fill?: string;
}

/** A legend: one row per series with its colour, line style and marker (or bar pattern).
    With `onToggle` each row is a <button aria-pressed> that hides or shows its series. */
export function Legend({
  items,
  isShown,
  onToggle,
  shownCount = items.length,
}: {
  items: readonly LegendItem[];
  isShown?: (index: number) => boolean;
  onToggle?: (index: number) => void;
  shownCount?: number;
}) {
  return (
    <ul
      className={cn(
        'ui-chart-legend m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-fg-muted',
        TEXT_SMALL,
      )}
    >
      {items.map((it, row) => {
        const i = it.index ?? row;
        const on = isShown ? isShown(i) : true;
        const comparison = it.kind === 'comparison';
        const body = (
          <>
            <svg
              width="26"
              height="12"
              viewBox="0 0 26 12"
              aria-hidden="true"
              focusable="false"
              className="group-data-[off]/legend:opacity-45"
            >
              {it.kind === 'bar' ? (
                <rect
                  x="3"
                  y="1"
                  width="20"
                  height="10"
                  rx="2"
                  fill={it.fill ?? seriesColor(i)}
                  stroke={seriesColor(i)}
                  strokeWidth="1.5"
                />
              ) : (
                <>
                  <line
                    x1="1"
                    x2="25"
                    y1="6"
                    y2="6"
                    stroke={seriesColor(i)}
                    strokeWidth={comparison ? 1.5 : 2}
                    strokeDasharray={comparison ? COMPARISON_DASH : seriesDash(i)}
                  />
                  {!comparison && <Marker i={i} x={13} y={6} color={seriesColor(i)} />}
                </>
              )}
            </svg>
            <span className="ui-chart-legend-label group-data-[off]/legend:line-through">
              {it.label}
            </span>
          </>
        );
        return (
          <li
            key={it.label}
            data-off={on ? undefined : ''}
            className="group/legend inline-flex items-center gap-1.5"
          >
            {onToggle ? (
              <button
                type="button"
                className="ui-chart-legend-btn -mx-2 -my-0.5 inline-flex min-h-6 pointer-coarse:min-h-12 cursor-pointer items-center gap-1.5 rounded-xs border-0 bg-transparent px-2 py-0.5 font-[inherit] text-inherit hover:bg-ghost-hover focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
                aria-pressed={on}
                aria-disabled={on && shownCount <= 1 ? true : undefined}
                onClick={() => onToggle(i)}
              >
                {body}
              </button>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

/* ---- the pointer readout ---------------------------------------------------
   TanStack's built-in tooltip is a live region (role="status"); ours is an
   aria-hidden extra, because the data table already carries every value. It
   follows TanStack's focus (pointer or keyboard) through onFocusGroupChange. */

export interface ReadoutRow {
  key: string;
  label: string;
  value: string;
  color?: string;
}
export interface ReadoutContent {
  title: string;
  rows: readonly ReadoutRow[];
}
export interface ReadoutState extends ReadoutContent {
  x: number;
  y: number;
  /** Open to the left of the point, when it sits in the right half. */
  flip: boolean;
}

/** State for a readout: `show(points)` maps TanStack's focused points to content (or null to hide). */
export function useReadout(
  describe: (points: readonly ChartPoint[]) => (ReadoutContent & { x: number; y: number }) | null,
) {
  const plot = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<ReadoutState | null>(null);
  const show = useCallback(
    (points: readonly ChartPoint[]) => {
      const content = points.length ? describe(points) : null;
      if (!content) return setState(null);
      const width = plot.current?.clientWidth ?? 0;
      setState({ ...content, flip: width > 0 && content.x > width / 2 });
    },
    [describe],
  );
  return { plot, readout: state, show };
}

export function Readout({ state }: { state: ReadoutState | null }) {
  if (!state) return null;
  return (
    <div
      className={cn(
        'ui-chart-readout pointer-events-none absolute z-[1] ml-3 flex min-w-32 flex-col gap-[3px] whitespace-nowrap rounded-xs border border-border bg-surface-solid px-2.5 py-[7px] font-sans text-xs/[1.4] tabular-nums text-fg [box-shadow:var(--shadow-md)]',
        'data-[flip]:-ml-3 data-[flip]:-translate-x-full',
        'motion-safe:[transition:left_var(--t-fast),top_var(--t-fast)]',
      )}
      aria-hidden="true"
      data-flip={state.flip || undefined}
      style={{ left: state.x, top: Math.max(0, state.y) }}
    >
      <strong className="font-semibold">{state.title}</strong>
      {state.rows.map((r) => (
        <span
          key={r.key}
          className="ui-chart-readout-row grid grid-cols-[auto_1fr_auto] items-center gap-2"
        >
          {r.color && (
            <i
              className="ui-chart-readout-swatch size-2.5 rounded-[2px] forced-colors:[forced-color-adjust:none]"
              style={{ background: r.color }}
            />
          )}
          <span className="ui-chart-readout-label col-start-2 text-fg-muted">{r.label}</span>
          <span className="ui-chart-readout-value font-medium">{r.value}</span>
        </span>
      ))}
    </div>
  );
}
