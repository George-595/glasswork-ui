import { type KeyboardEvent, type PointerEvent, useRef, useState } from 'react';
import {
  type ChartCommonProps,
  ChartFigure,
  Legend,
  Marker,
  PAINT,
  seriesColor,
  seriesDash,
  useSeriesToggle,
} from './ChartFrame';
import { HIDDEN, rovingIndex, useEntrance } from './motion';
import { defaultFormat, niceTicks } from './scale';
import { useMeasuredWidth } from './useMeasuredWidth';

/* RadarChart — a profile across five to ten measures on the same scale, for comparing the shape
   of two or three things (two candidates' skills, three plans' strengths).

   The shapes unfold from the centre when the chart arrives (none under reduced motion). Pointing
   anywhere picks the nearest spoke: it lights up, its name goes bold and a card lists every
   series' value on it. The spokes are a list with one tab stop, so arrows walk round the measures
   with the same card. Series differ by dash and marker shape as well as colour, and the legend
   hides and shows them. */
export interface RadarSeries {
  name: string;
  /** One value per axis, in the axes' order. */
  values: readonly number[];
}
export interface RadarChartProps extends ChartCommonProps {
  axes: readonly string[];
  series: readonly RadarSeries[];
  /** The outer ring's value. Default: a round number above the largest value. */
  max?: number;
  valueFormat?: (n: number) => string;
}

const LABEL_ROOM = 64;

export function RadarChart({
  axes,
  series,
  title,
  description,
  max,
  valueFormat = defaultFormat,
  height = 340,
  className,
  emptyMessage,
}: RadarChartProps) {
  const { width, ref } = useMeasuredWidth();
  const { isShown, toggle, shownCount } = useSeriesToggle(series.length);
  const grow = useEntrance(800);
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const list = useRef<SVGGElement>(null);

  const n = axes.length;
  const top = Math.max(0, ...series.flatMap((s) => s.values.filter(Number.isFinite)));
  const rings = niceTicks(0, max ?? top, 5).filter((t) => t > 0);
  const outer = max ?? rings[rings.length - 1] ?? 1;
  const size = Math.min(width, height);
  const cx = width / 2;
  const cy = height / 2;
  const R = Math.max(30, size / 2 - LABEL_ROOM / 1.4);
  const angle = (i: number) => -Math.PI / 2 + (i / n) * Math.PI * 2;
  const at = (i: number, v: number, k = 1) => {
    const r = (Math.max(0, v) / outer) * R * k;
    return [cx + Math.cos(angle(i)) * r, cy + Math.sin(angle(i)) * r] as const;
  };
  const ring = (v: number) =>
    `${axes
      .map((_, i) =>
        at(i, v)
          .map((c) => c.toFixed(1))
          .join(' '),
      )
      .join('L')}`;

  const shown = hover ?? (focused ? active : null);
  const pick = (e: PointerEvent<SVGRectElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const a = Math.atan2(e.clientY - box.top - cy, e.clientX - box.left - cx);
    const step = (Math.PI * 2) / n;
    setHover((((Math.round((a + Math.PI / 2) / step) % n) + n) % n) as number);
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const to = rovingIndex(e.key, i, n);
    if (to === null) return;
    e.preventDefault();
    setActive(to);
    list.current?.querySelector<SVGElement>(`[data-axis="${to}"]`)?.focus();
  };

  const best = (i: number) =>
    series.reduce((b, s, si) => ((s.values[i] ?? 0) > (series[b]?.values[i] ?? 0) ? si : b), 0);
  const summary = `${title}: ${series.length} series across ${n} measures, scale 0 to ${valueFormat(outer)}. ${series
    .map((s) => {
      const hi = s.values.indexOf(Math.max(...s.values));
      return `${s.name} is strongest on ${axes[hi] ?? ''}`;
    })
    .join('; ')}`;

  return (
    <ChartFigure
      title={title}
      description={description}
      className={className}
      empty={n < 3 || series.length === 0}
      emptyMessage={emptyMessage}
      data={{
        headers: ['Measure', ...series.map((s) => s.name)],
        rows: axes.map((a, i) => [a, ...series.map((s) => valueFormat(s.values[i] ?? 0))]),
      }}
      legend={
        series.length > 1 ? (
          <Legend
            items={series.map((s, i) => ({ label: s.name, index: i }))}
            isShown={isShown}
            onToggle={toggle}
            shownCount={shownCount}
          />
        ) : undefined
      }
    >
      <div ref={ref} className="ui-radar relative min-w-0" style={{ height }}>
        {/* biome-ignore lint/a11y/useSemanticElements: an SVG group is named by role, not a fieldset */}
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          aria-label={summary}
          role="group"
          className="block overflow-visible"
        >
          <g {...HIDDEN}>
            {rings.map((t, k) => (
              <path
                key={t}
                d={`M${ring(t)}Z`}
                fill={k % 2 ? 'transparent' : PAINT.grid}
                fillOpacity={0.35}
                stroke={PAINT.grid}
              />
            ))}
            {rings.map((t) => {
              const [x, y] = at(0, t);
              return (
                <text
                  key={`l${t}`}
                  x={x + 5}
                  y={y + 4}
                  className="fill-fg-subtle text-[10px] tabular-nums"
                >
                  {valueFormat(t)}
                </text>
              );
            })}
            {axes.map((a, i) => {
              const [x, y] = at(i, outer);
              const on = i === shown;
              return (
                <line
                  key={a}
                  x1={cx}
                  y1={cy}
                  x2={x}
                  y2={y}
                  stroke={on ? 'currentColor' : PAINT.grid}
                  strokeWidth={on ? 2 : 1}
                  className="text-brand transition-[stroke-width] duration-(--dur-fast)"
                />
              );
            })}
          </g>
          <g {...HIDDEN}>
            {series.map((s, si) =>
              isShown(si) ? (
                <g key={s.name}>
                  <path
                    d={`M${axes
                      .map((_, i) =>
                        at(i, s.values[i] ?? 0, grow)
                          .map((c) => c.toFixed(1))
                          .join(' '),
                      )
                      .join('L')}Z`}
                    fill={seriesColor(si)}
                    fillOpacity={0.14}
                    stroke={seriesColor(si)}
                    strokeWidth={2.25}
                    strokeDasharray={seriesDash(si)}
                    strokeLinejoin="round"
                  />
                  {axes.map((a, i) => {
                    const [x, y] = at(i, s.values[i] ?? 0, grow);
                    return <Marker key={a} i={si} x={x} y={y} color={seriesColor(si)} />;
                  })}
                </g>
              ) : null,
            )}
          </g>
          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            fill="transparent"
            {...HIDDEN}
            onPointerMove={pick}
            onPointerDown={pick}
            onPointerLeave={() => setHover(null)}
          />
          {/* biome-ignore lint/a11y/useSemanticElements: SVG has no list element */}
          {/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: a list of focusable measures */}
          <g
            ref={list}
            role="list"
            aria-label={`${title}: measures`}
            className="pointer-events-none"
          >
            {axes.map((a, i) => {
              const [x, y] = at(i, outer * 1.13);
              const cos = Math.cos(angle(i));
              const anchor = Math.abs(cos) < 0.2 ? 'middle' : cos > 0 ? 'start' : 'end';
              const on = i === shown;
              const w = a.length * 7 + 14;
              const bx = anchor === 'middle' ? x - w / 2 : anchor === 'start' ? x - 7 : x - w + 7;
              return (
                // biome-ignore lint/a11y/useSemanticElements: SVG has no list element
                // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: roving-focus measure of a read-only chart
                <g
                  key={a}
                  role="listitem"
                  data-axis={i}
                  tabIndex={i === active ? 0 : -1}
                  aria-label={`${a}: ${series.map((s) => `${s.name} ${valueFormat(s.values[i] ?? 0)}`).join(', ')}`}
                  className="group/axis outline-none"
                  onFocus={() => {
                    setActive(i);
                    setFocused(true);
                  }}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  <rect
                    x={bx}
                    y={y - 12}
                    width={w}
                    height={22}
                    rx={11}
                    className={
                      on
                        ? 'fill-brand-soft group-focus-visible/axis:stroke-focus group-focus-visible/axis:stroke-2'
                        : 'fill-transparent'
                    }
                  />
                  <text
                    x={x}
                    y={y + 4}
                    textAnchor={anchor}
                    className={on ? 'fill-fg text-xs font-semibold' : 'fill-fg-muted text-xs'}
                  >
                    {a}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
        {shown !== null && (
          <div
            {...HIDDEN}
            className="ui-radar-card pointer-events-none absolute top-2 right-2 flex min-w-36 flex-col gap-1 rounded-md border border-solid border-border bg-surface-solid px-3 py-2 text-xs tabular-nums [box-shadow:var(--elev-2)] glass:bg-overlay glass-chrome"
          >
            <strong className="text-[13px] font-semibold text-fg">{axes[shown]}</strong>
            {series.map((s, si) =>
              isShown(si) ? (
                <span key={s.name} className="flex items-center gap-2">
                  <svg width="14" height="10" viewBox="0 0 14 10" aria-hidden="true">
                    <Marker i={si} x={7} y={5} color={seriesColor(si)} />
                  </svg>
                  <span className="flex-1 text-fg-muted">{s.name}</span>
                  <span className={si === best(shown) ? 'font-semibold text-fg' : 'text-fg'}>
                    {valueFormat(s.values[shown] ?? 0)}
                  </span>
                </span>
              ) : null,
            )}
          </div>
        )}
      </div>
    </ChartFigure>
  );
}
