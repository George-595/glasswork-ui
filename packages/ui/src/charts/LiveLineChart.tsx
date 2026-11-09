import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button } from '../components/button';
import { Delta } from '../components/delta';
import { useReducedMotion } from '../effects/useReducedMotion';
import { cn } from '../lib/cn';
import {
  type ChartCommonProps,
  ChartFigure,
  PAINT,
  SVG_IMG,
  seriesColor,
  useSafeId,
} from './ChartFrame';
import { defaultFormat, monotoneX, niceTicks } from './scale';
import { useMeasuredWidth } from './useMeasuredWidth';

/* LiveLineChart — one value as it changes, the last minute (or `windowMs`) of it, sliding left as
   new readings arrive: a queue length, a sensor, requests a second. The idea is EasyUI's live line
   chart (github.com/Surajmaurya1/easyui, MIT); nothing of its code is used: it is drawn here on the
   kit's roles, frame and curve.

   It draws what it is given. The app owns the feed and passes the readings it has (`points`, oldest
   first); the chart keeps the ones inside the window that ends at the newest reading, so "now" is
   the data's own clock, never the browser's, and a test or the server draws the same thing.

   Motion: when a reading arrives the line glides left by the time that passed, one CSS transform
   on one group (no animation loop, nothing redrawn per frame), and the newest point's ring pulses
   once. Under reduced motion it steps instead.

   Access (WCAG 2.2.2): anything that updates on its own for more than five seconds beside other
   content must be able to stop, so the chart has a "Pause updates" toggle (aria-pressed). Paused,
   it holds the picture and counts the readings that came in meanwhile; Resume jumps to the latest.
   The plot is one role="img" whose name gives the latest value, its time and the window's low and
   high; it is not a live region, because a value read out every second would drown everything
   else. The latest value is also plain text above the plot, and the frame's data table lists every
   reading in the window. "Live" / "Paused" is a word, not a coloured dot. */
export interface LivePoint {
  /** When it was read: epoch milliseconds or an ISO timestamp. */
  t: number | string;
  value: number;
}

export interface LiveLineChartProps extends ChartCommonProps {
  points: readonly LivePoint[];
  /** How much time the plot shows, ending at the newest reading. Default 60 000 (a minute). */
  windowMs?: number;
  valueFormat?: (n: number) => string;
  /** IANA time zone for the times shown. Default: the reader's own. */
  timeZone?: string;
  /** Paused (controlled). Without it the chart owns its toggle. */
  paused?: boolean;
  onPausedChange?: (paused: boolean) => void;
  /** Show the change across the window beside the latest value. Default true. */
  showDelta?: boolean;
}

const MARGIN = { top: 8, right: 12, bottom: 22, left: 44 };
const ms = (t: number | string) => (typeof t === 'number' ? t : Date.parse(t));
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** "now", "15 s ago", "2 min ago": the x-axis labels, which stay put while the line moves. */
export function agoLabel(msAgo: number): string {
  if (msAgo <= 0) return 'now';
  if (msAgo < 120_000) return `${Math.round(msAgo / 1000)} s ago`;
  if (msAgo < 7_200_000) return `${Math.round(msAgo / 60_000)} min ago`;
  return `${Math.round(msAgo / 3_600_000)} h ago`;
}

/** The readings inside the window ending at the newest one, oldest first, with numeric times. */
export function inWindow(points: readonly LivePoint[], windowMs: number) {
  const read = points
    .map((p) => ({ t: ms(p.t), value: p.value }))
    .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.value))
    .toSorted((a, b) => a.t - b.t);
  const now = read[read.length - 1]?.t ?? 0;
  // keep one reading before the window so the line enters from the left edge
  const start = read.findIndex((p) => p.t >= now - windowMs);
  return { now, points: start > 0 ? read.slice(start - 1) : read };
}

export function LiveLineChart({
  points,
  title,
  description,
  height = 200,
  className,
  emptyMessage = 'Waiting for the first reading.',
  windowMs = 60_000,
  valueFormat = defaultFormat,
  timeZone,
  paused: pausedProp,
  onPausedChange,
  showDelta = true,
}: LiveLineChartProps) {
  const clip = useSafeId('live');
  const { width, ref } = useMeasuredWidth();
  const reduced = useReducedMotion();
  const [pausedInner, setPausedInner] = useState(false);
  const paused = pausedProp ?? pausedInner;
  const [frozen, setFrozen] = useState<readonly LivePoint[] | null>(null);
  // hold the picture from the moment of pausing (adjusted while rendering, ENGINEERING §14 rule 81)
  if (paused && frozen === null) setFrozen(points);
  if (!paused && frozen !== null) setFrozen(null);
  const shown = paused && frozen ? frozen : points;
  const waiting = paused && frozen ? Math.max(0, points.length - frozen.length) : 0;

  const setPaused = (next: boolean) => {
    if (pausedProp === undefined) setPausedInner(next);
    onPausedChange?.(next);
  };

  const view = useMemo(() => inWindow(shown, windowMs), [shown, windowMs]);
  const { now } = view;
  const latest = view.points[view.points.length - 1];
  const visible = view.points.filter((p) => p.t >= now - windowMs);
  const first = visible[0];
  const values = visible.map((p) => p.value);
  const lo = values.length ? Math.min(...values) : 0;
  const hi = values.length ? Math.max(...values) : 1;
  const ticks = niceTicks(lo, hi, 4);
  const y0 = ticks[0] ?? lo;
  const y1 = ticks[ticks.length - 1] ?? hi;

  const plotW = Math.max(1, width - MARGIN.left - MARGIN.right);
  const plotH = Math.max(1, height - MARGIN.top - MARGIN.bottom);
  const x = (t: number) => MARGIN.left + plotW - ((now - t) / windowMs) * plotW;
  const y = (v: number) => MARGIN.top + plotH - ((v - y0) / (y1 - y0 || 1)) * plotH;
  const line = monotoneX.line(view.points.map((p) => [x(p.t), y(p.value)] as const));

  // the glide: start shifted right by the time that passed, then ease back to rest
  const group = useRef<SVGGElement>(null);
  const lastNow = useRef(now);
  useIsoLayoutEffect(() => {
    const el = group.current;
    const before = lastNow.current;
    lastNow.current = now;
    if (!el || reduced || now <= before) return;
    const shift = ((now - before) / windowMs) * plotW;
    if (shift <= 0 || shift >= plotW) return;
    el.style.transition = 'none';
    el.style.transform = `translateX(${shift}px)`;
    const frame = requestAnimationFrame(() => {
      el.style.transition = `transform ${Math.min(1000, now - before)}ms linear`;
      el.style.transform = 'translateX(0)';
    });
    return () => cancelAnimationFrame(frame);
  }, [now, reduced, windowMs, plotW]);

  const clock = useMemo(
    () =>
      new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone,
      }),
    [timeZone],
  );
  const summary = latest
    ? `${title}: ${valueFormat(latest.value)} at ${clock.format(latest.t)}; over the last ${agoLabel(windowMs).replace(' ago', '')}, low ${valueFormat(lo)}, high ${valueFormat(hi)}${paused ? '. Paused' : ''}`
    : title;
  const xTicks = [windowMs, (windowMs * 2) / 3, windowMs / 3, 0];

  return (
    <ChartFigure
      title={title}
      description={description}
      className={className}
      empty={!latest}
      emptyMessage={emptyMessage}
      data={{
        headers: ['Time', 'Value'],
        rows: visible.map((p) => [clock.format(p.t), valueFormat(p.value)]),
      }}
    >
      <div className="ui-live-chart flex min-w-0 flex-col gap-2">
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="m-0 flex min-w-0 flex-wrap items-baseline gap-x-2 tabular-nums">
            <span className="ui-live-value text-2xl/[1.2] font-semibold text-fg">
              {latest ? valueFormat(latest.value) : '—'}
            </span>
            {showDelta && latest && first && first.value !== 0 && (
              <Delta
                ratio={(latest.value - first.value) / Math.abs(first.value)}
                className="text-[13px]"
              />
            )}
            {latest && (
              <span className="text-xs text-fg-subtle">
                at <time dateTime={new Date(latest.t).toISOString()}>{clock.format(latest.t)}</time>
              </span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <span
              className={cn(
                'ui-live-state inline-flex items-center gap-1.5 text-xs font-semibold',
                paused ? 'text-fg-muted' : 'text-success',
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  'size-2 rounded-full forced-colors:[forced-color-adjust:none]',
                  paused ? 'border border-solid border-fg-muted' : 'bg-success',
                )}
              />
              {paused ? (waiting > 0 ? `Paused · ${waiting} new` : 'Paused') : 'Live'}
            </span>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={paused}
              onClick={() => setPaused(!paused)}
              className="ui-live-pause"
            >
              Pause updates
            </Button>
          </div>
        </div>
        <div ref={ref} className="min-w-0" style={{ height }}>
          <svg
            {...SVG_IMG}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-label={summary}
            className="block overflow-visible font-sans text-[11px] tabular-nums"
          >
            <defs>
              <clipPath id={clip}>
                <rect x={MARGIN.left} y={0} width={plotW} height={height} />
              </clipPath>
            </defs>
            {ticks.map((v) => (
              <g key={v}>
                <line
                  x1={MARGIN.left}
                  x2={MARGIN.left + plotW}
                  y1={y(v)}
                  y2={y(v)}
                  stroke={PAINT.grid}
                />
                <text
                  x={MARGIN.left - 6}
                  y={y(v)}
                  dy="0.32em"
                  textAnchor="end"
                  className="fill-fg-subtle"
                >
                  {valueFormat(v)}
                </text>
              </g>
            ))}
            {xTicks.map((ago, i) => (
              <text
                key={ago}
                x={MARGIN.left + plotW - (ago / windowMs) * plotW}
                y={height - 6}
                textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'}
                className="fill-fg-subtle"
              >
                {agoLabel(ago)}
              </text>
            ))}
            <g clipPath={`url(#${clip})`}>
              <g ref={group} className="ui-live-line will-change-transform">
                <path
                  d={line}
                  fill="none"
                  stroke={seriesColor(0)}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  className="forced-colors:[forced-color-adjust:none]"
                />
                {latest && (
                  <>
                    <circle
                      key={latest.t}
                      cx={x(latest.t)}
                      cy={y(latest.value)}
                      r={4}
                      fill={seriesColor(0)}
                      className="origin-center [transform-box:fill-box] motion-safe:animate-[ui-bell-ping_var(--dur-slow)_var(--ease-out)_1_forwards] forced-colors:[forced-color-adjust:none]"
                    />
                    <circle
                      cx={x(latest.t)}
                      cy={y(latest.value)}
                      r={4}
                      fill={seriesColor(0)}
                      stroke={PAINT.gap}
                      strokeWidth={2}
                      className="forced-colors:[forced-color-adjust:none]"
                    />
                  </>
                )}
              </g>
            </g>
          </svg>
        </div>
      </div>
    </ChartFigure>
  );
}
