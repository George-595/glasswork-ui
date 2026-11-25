import { type KeyboardEvent, type PointerEvent, useMemo, useRef, useState } from 'react';
import { Button } from '../components/button';
import { Icon } from '../icons/Icon';
import {
  type ChartCommonProps,
  ChartFigure,
  Legend,
  Marker,
  PAINT,
  Readout,
  seriesColor,
  useSafeId,
  useSeriesToggle,
} from './ChartFrame';
import { HIDDEN, rovingIndex, useTweened } from './motion';
import { defaultFormat, niceTicks } from './scale';
import { useMeasuredWidth } from './useMeasuredWidth';

/* ScatterChart — two measures per thing, one dot per thing, for "is there a pattern?" questions
   (price against size, time against effort).

   The special part is zooming by drawing: drag a box over the dots and the axes glide in to it
   (a 420 ms ease, none under reduced motion); "Back" steps out one zoom and "Show all" goes home.
   While the box is drawn the dots inside it swell and a live count says how many it holds.
   Without a pointer: the dots are a list with one tab stop (arrows, Home, End), "Zoom in" closes
   in on the focused dot, and the crosshair, axis pills and readout follow focus as they follow
   the pointer.

   Access: each series has its own marker shape as well as colour (the line charts' markers), the
   legend toggles series, the svg's label sums the data up, and every point is in the data table. */
export interface ScatterPoint {
  x: number;
  y: number;
  /** Names the dot in the readout and the table: "Flat 4". */
  label?: string;
}
export interface ScatterSeries {
  name: string;
  points: readonly ScatterPoint[];
}
export interface ScatterChartProps extends ChartCommonProps {
  series: readonly ScatterSeries[];
  xLabel: string;
  yLabel: string;
  xFormat?: (n: number) => string;
  yFormat?: (n: number) => string;
}

const M = { l: 52, r: 16, t: 14, b: 40 } as const;
const MIN_BRUSH = 10;

type Domain = readonly [number, number, number, number];

export function ScatterChart({
  series,
  title,
  description,
  xLabel,
  yLabel,
  xFormat = defaultFormat,
  yFormat = defaultFormat,
  height = 320,
  className,
  emptyMessage,
}: ScatterChartProps) {
  const clip = useSafeId('sc');
  const { width, ref } = useMeasuredWidth();
  const { isShown, toggle, shownCount } = useSeriesToggle(series.length);
  const [zooms, setZooms] = useState<readonly Domain[]>([]);
  const [brush, setBrush] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const list = useRef<SVGGElement>(null);

  const all = useMemo(
    () =>
      series.flatMap((s, si) =>
        s.points
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
          .map((p) => ({ ...p, si, name: s.name })),
      ),
    [series],
  );
  const full = useMemo<Domain>(() => {
    if (all.length === 0) return [0, 1, 0, 1];
    const xs = niceTicks(Math.min(...all.map((p) => p.x)), Math.max(...all.map((p) => p.x)));
    const ys = niceTicks(Math.min(...all.map((p) => p.y)), Math.max(...all.map((p) => p.y)));
    return [xs[0] ?? 0, xs[xs.length - 1] ?? 1, ys[0] ?? 0, ys[ys.length - 1] ?? 1];
  }, [all]);
  const target = zooms[zooms.length - 1] ?? full;
  const [x0, x1, y0, y1] = useTweened(target) as unknown as Domain;

  const pw = Math.max(40, width - M.l - M.r);
  const ph = Math.max(40, height - M.t - M.b);
  const sx = (v: number) => M.l + ((v - x0) / (x1 - x0 || 1)) * pw;
  const sy = (v: number) => M.t + ph - ((v - y0) / (y1 - y0 || 1)) * ph;
  const vx = (px: number) => x0 + ((px - M.l) / pw) * (x1 - x0);
  const vy = (py: number) => y0 + ((M.t + ph - py) / ph) * (y1 - y0);

  // the dots in view, in reading order (left to right), for the roving focus
  const [tx0, tx1, ty0, ty1] = target;
  const visible = useMemo(
    () =>
      all
        .filter((p) => isShown(p.si) && p.x >= tx0 && p.x <= tx1 && p.y >= ty0 && p.y <= ty1)
        .sort((a, b) => a.x - b.x || b.y - a.y),
    [all, isShown, tx0, tx1, ty0, ty1],
  );
  const tabbable = Math.min(active, visible.length - 1);
  const shown = hover ?? (focused ? tabbable : null);
  const current = shown === null ? undefined : visible[shown];

  const inBrush = (p: ScatterPoint) => {
    if (!brush) return false;
    const [ax, bx] = [Math.min(brush.x0, brush.x1), Math.max(brush.x0, brush.x1)];
    const [ay, by] = [Math.min(brush.y0, brush.y1), Math.max(brush.y0, brush.y1)];
    const px = sx(p.x);
    const py = sy(p.y);
    return px >= ax && px <= bx && py >= ay && py <= by;
  };
  const caught = brush ? visible.filter(inBrush).length : 0;

  const local = (e: PointerEvent<SVGElement>) => {
    const box =
      e.currentTarget.ownerSVGElement?.getBoundingClientRect() ??
      e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(M.l, Math.min(M.l + pw, e.clientX - box.left)),
      y: Math.max(M.t, Math.min(M.t + ph, e.clientY - box.top)),
    };
  };
  const onDown = (e: PointerEvent<SVGRectElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = local(e);
    setBrush({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
    setHover(null);
  };
  const onMove = (e: PointerEvent<SVGRectElement>) => {
    const p = local(e);
    if (brush) {
      setBrush({ ...brush, x1: p.x, y1: p.y });
      return;
    }
    // nearest dot within 28px follows the pointer
    let best = -1;
    let dist = 28 * 28;
    visible.forEach((d, i) => {
      const dd = (sx(d.x) - p.x) ** 2 + (sy(d.y) - p.y) ** 2;
      if (dd < dist) {
        dist = dd;
        best = i;
      }
    });
    setHover(best < 0 ? null : best);
  };
  const onUp = () => {
    if (!brush) return;
    const w = Math.abs(brush.x1 - brush.x0);
    const h = Math.abs(brush.y1 - brush.y0);
    if (w >= MIN_BRUSH && h >= MIN_BRUSH) {
      const a = [vx(Math.min(brush.x0, brush.x1)), vx(Math.max(brush.x0, brush.x1))] as const;
      const b = [vy(Math.max(brush.y0, brush.y1)), vy(Math.min(brush.y0, brush.y1))] as const;
      setZooms((z) => [...z, [a[0], a[1], b[0], b[1]]]);
      setActive(0);
    }
    setBrush(null);
  };

  const zoomIn = () => {
    const p = visible[tabbable];
    const [a, b, c, d] = target;
    const cx = p ? p.x : (a + b) / 2;
    const cy = p ? p.y : (c + d) / 2;
    const hw = (b - a) / 4;
    const hh = (d - c) / 4;
    setZooms((z) => [...z, [cx - hw, cx + hw, cy - hh, cy + hh]]);
  };

  const move = (to: number) => {
    setActive(to);
    list.current?.querySelector<SVGElement>(`[data-dot="${to}"]`)?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const to = rovingIndex(e.key, i, visible.length);
    if (to === null) return;
    e.preventDefault();
    move(to);
  };

  const xt = niceTicks(x0, x1, Math.max(3, Math.floor(pw / 90))).filter((t) => t >= x0 && t <= x1);
  const yt = niceTicks(y0, y1, Math.max(3, Math.floor(ph / 56))).filter((t) => t >= y0 && t <= y1);
  const zoomed = zooms.length > 0;
  const summary = `${title}: ${all.length} points in ${series.length} series; ${xLabel} from ${xFormat(full[0])} to ${xFormat(full[1])}, ${yLabel} from ${yFormat(full[2])} to ${yFormat(full[3])}${zoomed ? `. Zoomed to ${xFormat(target[0])}–${xFormat(target[1])} by ${yFormat(target[2])}–${yFormat(target[3])}` : ''}`;
  const cx = current ? sx(current.x) : 0;
  const cy = current ? sy(current.y) : 0;

  return (
    <ChartFigure
      title={title}
      description={description}
      className={className}
      empty={all.length === 0}
      emptyMessage={emptyMessage}
      data={{
        headers: ['Series', 'Point', xLabel, yLabel],
        rows: all.map((p) => [p.name, p.label ?? '', xFormat(p.x), yFormat(p.y)]),
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
      <div className="ui-scatter flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="m-0 text-[13px] text-fg-muted" aria-live="polite">
            {brush
              ? `${caught} of ${visible.length} in the box`
              : zoomed
                ? `Zoomed in ${zooms.length} ${zooms.length === 1 ? 'step' : 'steps'}: ${visible.length} points in view`
                : 'Drag a box over the dots to zoom in'}
          </p>
          <div className="flex gap-1.5">
            <Button size="sm" variant="outline" onClick={zoomIn} disabled={visible.length === 0}>
              <Icon name="zoom-in" size={14} />
              Zoom in
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setZooms((z) => z.slice(0, -1))}
              disabled={!zoomed}
            >
              Back
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setZooms([])} disabled={!zoomed}>
              <Icon name="maximize" size={14} />
              Show all
            </Button>
          </div>
        </div>
        <div ref={ref} className="relative min-w-0 select-none" style={{ height }}>
          {/* biome-ignore lint/a11y/useSemanticElements: an SVG group is named by role, not a fieldset */}
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-label={summary}
            role="group"
            className="block overflow-visible"
          >
            <defs>
              <clipPath id={clip}>
                <rect x={M.l} y={M.t - 6} width={pw + 6} height={ph + 12} />
              </clipPath>
            </defs>
            <g {...HIDDEN} className="text-[11px] tabular-nums">
              {yt.map((t) => (
                <g key={`y${t}`}>
                  <line x1={M.l} x2={M.l + pw} y1={sy(t)} y2={sy(t)} stroke={PAINT.grid} />
                  <text x={M.l - 8} y={sy(t) + 4} textAnchor="end" className="fill-fg-subtle">
                    {yFormat(t)}
                  </text>
                </g>
              ))}
              {xt.map((t) => (
                <g key={`x${t}`}>
                  <line x1={sx(t)} x2={sx(t)} y1={M.t} y2={M.t + ph} stroke={PAINT.grid} />
                  <text x={sx(t)} y={M.t + ph + 16} textAnchor="middle" className="fill-fg-subtle">
                    {xFormat(t)}
                  </text>
                </g>
              ))}
              <line x1={M.l} x2={M.l + pw} y1={M.t + ph} y2={M.t + ph} stroke={PAINT.axisLine} />
              <text
                x={M.l + pw}
                y={height - 4}
                textAnchor="end"
                className="fill-fg-muted text-xs font-medium"
              >
                {xLabel} →
              </text>
              <text x={4} y={M.t - 2} className="fill-fg-muted text-xs font-medium">
                ↑ {yLabel}
              </text>
            </g>
            {/* the brush surface: draw a box to zoom; it also tracks the nearest dot */}
            <rect
              x={M.l}
              y={M.t}
              width={pw}
              height={ph}
              fill="transparent"
              className="cursor-crosshair touch-none"
              {...HIDDEN}
              onPointerDown={onDown}
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => setBrush(null)}
              onPointerLeave={() => !brush && setHover(null)}
            />
            {current && !brush && (
              <g {...HIDDEN} className="pointer-events-none">
                <line
                  x1={cx}
                  x2={cx}
                  y1={M.t}
                  y2={M.t + ph}
                  className="stroke-fg-subtle"
                  strokeDasharray="3 4"
                />
                <line
                  x1={M.l}
                  x2={M.l + pw}
                  y1={cy}
                  y2={cy}
                  className="stroke-fg-subtle"
                  strokeDasharray="3 4"
                />
                <AxisPill x={cx} y={M.t + ph + 3} text={xFormat(current.x)} anchor="top" />
                <AxisPill x={M.l - 3} y={cy} text={yFormat(current.y)} anchor="right" />
              </g>
            )}
            <g clipPath={`url(#${clip})`} className="pointer-events-none">
              {/* biome-ignore lint/a11y/useSemanticElements: SVG has no list element */}
              {/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: a list of focusable dots */}
              <g ref={list} role="list" aria-label={`${title}: points in view`}>
                {visible.map((p, i) => {
                  const on = i === shown;
                  const caughtNow = inBrush(p);
                  const col = seriesColor(p.si);
                  return (
                    // biome-ignore lint/a11y/useSemanticElements: SVG has no list element
                    // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: roving-focus dot of a read-only chart
                    <g
                      key={`${p.si}-${p.x}-${p.y}-${p.label ?? ''}`}
                      role="listitem"
                      data-dot={i}
                      tabIndex={i === tabbable ? 0 : -1}
                      aria-label={`${p.label ? `${p.label}, ` : ''}${p.name}: ${xLabel} ${xFormat(p.x)}, ${yLabel} ${yFormat(p.y)}`}
                      className="ui-scatter-dot group/dot outline-none"
                      data-on={on || undefined}
                      data-caught={caughtNow || undefined}
                      onFocus={() => {
                        setActive(i);
                        setFocused(true);
                      }}
                      onBlur={() => setFocused(false)}
                      onKeyDown={(e) => onKey(e, i)}
                    >
                      {on && (
                        <circle
                          cx={sx(p.x)}
                          cy={sy(p.y)}
                          r={11}
                          fill={col}
                          fillOpacity={0.18}
                          className="group-focus-visible/dot:stroke-focus group-focus-visible/dot:stroke-2"
                        />
                      )}
                      <g
                        className="ui-scatter-mark"
                        style={{ transformOrigin: `${sx(p.x)}px ${sy(p.y)}px` }}
                      >
                        <Marker i={p.si} x={sx(p.x)} y={sy(p.y)} color={col} />
                      </g>
                    </g>
                  );
                })}
              </g>
            </g>
            {brush && (
              <rect
                {...HIDDEN}
                x={Math.min(brush.x0, brush.x1)}
                y={Math.min(brush.y0, brush.y1)}
                width={Math.abs(brush.x1 - brush.x0)}
                height={Math.abs(brush.y1 - brush.y0)}
                rx={4}
                className="pointer-events-none fill-brand stroke-brand"
                fillOpacity={0.1}
                strokeDasharray="5 4"
                strokeWidth={1.5}
              />
            )}
          </svg>
          {current && !brush && (
            <Readout
              state={{
                x: cx,
                y: cy - 12,
                flip: cx > width / 2,
                title: current.label ?? current.name,
                rows: [
                  ...(current.label
                    ? [
                        {
                          key: 's',
                          label: 'Series',
                          value: current.name,
                          color: seriesColor(current.si),
                        },
                      ]
                    : []),
                  { key: 'x', label: xLabel, value: xFormat(current.x) },
                  { key: 'y', label: yLabel, value: yFormat(current.y) },
                ],
              }}
            />
          )}
        </div>
      </div>
    </ChartFigure>
  );
}

/** A value pill on an axis, under the crosshair. */
function AxisPill({
  x,
  y,
  text,
  anchor,
}: {
  x: number;
  y: number;
  text: string;
  anchor: 'top' | 'right';
}) {
  const w = text.length * 6.6 + 12;
  const rx = anchor === 'top' ? x - w / 2 : x - w;
  const ry = anchor === 'top' ? y : y - 9;
  return (
    <g>
      <rect x={rx} y={ry} width={w} height={18} rx={9} className="fill-fg" />
      <text
        x={rx + w / 2}
        y={ry + 13}
        textAnchor="middle"
        className="fill-surface-solid text-[11px] font-semibold tabular-nums"
      >
        {text}
      </text>
    </g>
  );
}
