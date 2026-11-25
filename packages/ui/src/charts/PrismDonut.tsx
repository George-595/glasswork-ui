import { type KeyboardEvent, useRef, useState } from 'react';
import {
  type ChartCommonProps,
  ChartFigure,
  PAINT,
  PatternDefs,
  patternFill,
  seriesColor,
  useSafeId,
} from './ChartFrame';
import { HIDDEN, rovingIndex, useEntrance, useTweened } from './motion';
import { defaultFormat } from './scale';

/* PrismDonut — parts of a whole, up to eight, as a solid glass ring seen from above at an angle.

   The ring sweeps round into place when it arrives. Pointing at a slice (or focusing it, or its
   row in the key) lifts it out of the ring, and the number in the middle counts to its value and
   share. Painted back to front from the angle, so it stays correct at any split: the inside wall
   of the far half, then the outside wall of the near half, then the top with its fill pattern,
   a frosted sheen and a lit rim.

   Access: every slice has a fill pattern as well as a colour (the bar patterns), the slices are a
   list with one tab stop (arrows, Home, End), each says its name, value and share, the key below
   repeats them as text, and the data table has them all. */
export interface PrismDonutProps extends Omit<ChartCommonProps, 'height'> {
  data: readonly { label: string; value: number }[];
  valueFormat?: (n: number) => string;
  /** The word under the total in the middle. Default "Total". */
  totalLabel?: string;
}

const W = 360;
const H = 262;
const CX = W / 2;
const CY = 104;
const RO = 156;
const RI = 92;
const TILT = 0.5;
const DEPTH = 30;
const TAU = Math.PI * 2;
const START = -Math.PI / 2;
const percent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1 });

const pt = (a: number, r: number, dz = 0) =>
  `${(CX + Math.cos(a) * r).toFixed(2)} ${(CY + Math.sin(a) * r * TILT + dz).toFixed(2)}`;

/** Points along an arc from a0 to a1 (either direction). */
function arc(a0: number, a1: number, r: number, dz = 0) {
  const steps = Math.max(2, Math.ceil((Math.abs(a1 - a0) / TAU) * 72));
  return Array.from({ length: steps + 1 }, (_, k) => pt(a0 + ((a1 - a0) * k) / steps, r, dz));
}
const band = (a0: number, a1: number, r: number) =>
  `M${[...arc(a0, a1, r), ...arc(a1, a0, r, DEPTH)].join('L')}Z`;

/** The parts of [a0, a1] that fall in a range, as [lo, hi] pairs. */
function within(a0: number, a1: number, ranges: readonly (readonly [number, number])[]) {
  return ranges.flatMap(([lo, hi]) => {
    const a = Math.max(a0, lo);
    const b = Math.min(a1, hi);
    return a < b ? [[a, b] as const] : [];
  });
}
const NEAR = [[0, Math.PI]] as const; // the outside wall we can see
const FAR = [
  [START, 0],
  [Math.PI, START + TAU],
] as const; // the inside wall we can see, through the hole

export function PrismDonut({
  data,
  title,
  description,
  className,
  emptyMessage,
  valueFormat = defaultFormat,
  totalLabel = 'Total',
}: PrismDonutProps) {
  const prefix = useSafeId('pd');
  const sweep = useEntrance(900);
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const list = useRef<SVGGElement>(null);

  const parts = data.filter((d) => d.value > 0);
  const total = parts.reduce((a, d) => a + d.value, 0);
  const slices = parts.map((d, i) => {
    const before = parts.slice(0, i).reduce((a, p) => a + p.value, 0);
    const a0 = START + (before / (total || 1)) * TAU * sweep;
    const a1 = a0 + (d.value / (total || 1)) * TAU * sweep;
    return { ...d, i, a0, a1, mid: (a0 + a1) / 2 };
  });
  const lit = hover ?? (focused ? active : null);
  const litSlice = lit === null ? undefined : slices[lit];
  const [shownValue, shownShare] = useTweened([
    litSlice ? litSlice.value : total,
    litSlice ? litSlice.value / (total || 1) : 1,
  ]);
  const painted = [...slices].sort((a, b) => Math.sin(a.mid) - Math.sin(b.mid));

  const onKey = (e: KeyboardEvent, i: number) => {
    const to = rovingIndex(e.key, i, slices.length);
    if (to === null) return;
    e.preventDefault();
    setActive(to);
    list.current?.querySelector<SVGElement>(`[data-slice="${to}"]`)?.focus();
  };
  const summary = `${title}: ${slices.length} parts of ${valueFormat(total)}. ${slices
    .map((s) => `${s.label} ${percent.format(s.value / total)}`)
    .join(', ')}`;

  return (
    <ChartFigure
      title={title}
      description={description}
      className={className}
      empty={slices.length === 0}
      emptyMessage={emptyMessage}
      data={{
        headers: ['Part', 'Value', 'Share'],
        rows: slices.map((s) => [s.label, valueFormat(s.value), percent.format(s.value / total)]),
      }}
    >
      <div className="ui-prism flex min-w-0 flex-col items-center gap-4">
        <PatternDefs prefix={prefix} />
        {/* biome-ignore lint/a11y/useSemanticElements: an SVG group is named by role, not a fieldset */}
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="block h-auto w-full max-w-md overflow-visible"
          aria-label={summary}
          role="group"
        >
          <defs>
            <linearGradient
              id={`${prefix}-sheen`}
              gradientUnits="userSpaceOnUse"
              x1={0}
              y1={CY - RO * TILT}
              x2={0}
              y2={CY + RO * TILT}
            >
              <stop offset="0" stopColor={PAINT.gap} stopOpacity={0.55} />
              <stop offset="0.55" stopColor={PAINT.gap} stopOpacity={0.08} />
              <stop offset="1" stopColor={PAINT.gap} stopOpacity={0} />
            </linearGradient>
          </defs>
          <ellipse
            {...HIDDEN}
            cx={CX}
            cy={CY + DEPTH + 18}
            rx={RO * 0.92}
            ry={RO * TILT * 0.7}
            className="fill-fg"
            fillOpacity={0.07}
          />
          {/* biome-ignore lint/a11y/useSemanticElements: SVG has no list element */}
          {/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: a list of focusable slices */}
          <g ref={list} role="list" aria-label={`${title}: parts`}>
            {painted.map((s) => {
              const on = s.i === lit;
              const dx = on ? Math.cos(s.mid) * 14 : 0;
              const dy = on ? Math.sin(s.mid) * 14 * TILT - 8 : 0;
              const top = `M${[...arc(s.a0, s.a1, RO), ...arc(s.a1, s.a0, RI)].join('L')}Z`;
              return (
                // biome-ignore lint/a11y/useSemanticElements: SVG has no list element
                // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: roving-focus slice of a read-only chart
                <g
                  key={s.label}
                  role="listitem"
                  data-slice={s.i}
                  tabIndex={s.i === active ? 0 : -1}
                  aria-label={`${s.label}: ${valueFormat(s.value)}, ${percent.format(s.value / total)}`}
                  className="ui-prism-slice group/slice cursor-default outline-none forced-colors:[forced-color-adjust:none]"
                  style={{ transform: `translate(${dx}px, ${dy}px)` }}
                  onFocus={() => {
                    setActive(s.i);
                    setFocused(true);
                  }}
                  onBlur={() => setFocused(false)}
                  onKeyDown={(e) => onKey(e, s.i)}
                  onPointerEnter={() => setHover(s.i)}
                  onPointerLeave={() => setHover(null)}
                >
                  {within(s.a0, s.a1, FAR).map(([a, b]) => (
                    <g key={`in${a}`}>
                      <path d={band(a, b, RI)} fill={seriesColor(s.i)} />
                      <path d={band(a, b, RI)} className="fill-fg" fillOpacity={0.34} />
                    </g>
                  ))}
                  {within(s.a0, s.a1, NEAR).map(([a, b]) => (
                    <g key={`out${a}`}>
                      <path d={band(a, b, RO)} fill={seriesColor(s.i)} />
                      <path d={band(a, b, RO)} className="fill-fg" fillOpacity={0.2} />
                    </g>
                  ))}
                  <path
                    d={top}
                    fill={patternFill(prefix, s.i)}
                    stroke={PAINT.gap}
                    strokeWidth={1.5}
                  />
                  <path d={top} fill={`url(#${prefix}-sheen)`} className="pointer-events-none" />
                  <path
                    d={`M${arc(s.a0, s.a1, RO - 1.5).join('L')}`}
                    fill="none"
                    stroke={PAINT.gap}
                    strokeOpacity={0.7}
                    strokeWidth={1.25}
                    className="pointer-events-none"
                  />
                  <path
                    d={top}
                    fill="none"
                    strokeWidth={3}
                    className="pointer-events-none stroke-transparent group-focus-visible/slice:stroke-focus"
                  />
                </g>
              );
            })}
          </g>
          <g {...HIDDEN} className="pointer-events-none">
            <text
              x={CX}
              y={CY + 12}
              textAnchor="middle"
              className="fill-fg text-[26px] font-semibold tabular-nums"
            >
              {valueFormat(Math.round(shownValue ?? 0))}
            </text>
            <text x={CX} y={CY + 32} textAnchor="middle" className="fill-fg-muted text-xs">
              {litSlice ? `${litSlice.label} · ${percent.format(shownShare ?? 0)}` : totalLabel}
            </text>
          </g>
        </svg>
        <ul
          {...HIDDEN}
          className="ui-prism-key m-0 grid w-full max-w-md list-none grid-cols-1 gap-1 p-0 sm:grid-cols-2"
        >
          {slices.map((s) => (
            <li
              key={s.label}
              data-on={s.i === lit || undefined}
              className="flex flex-col gap-1 rounded-md px-2 py-1.5 transition-colors duration-(--dur-fast) data-on:bg-hover"
              onPointerEnter={() => setHover(s.i)}
              onPointerLeave={() => setHover(null)}
            >
              <span className="flex items-center gap-2 text-[13px]">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <rect width="14" height="14" rx="3.5" fill={patternFill(prefix, s.i)} />
                </svg>
                <span className="min-w-0 flex-1 truncate text-fg">{s.label}</span>
                <span className="text-fg-muted tabular-nums">
                  {percent.format(s.value / total)}
                </span>
              </span>
              <span className="block h-1 overflow-hidden rounded-pill bg-sunken">
                <span
                  className="block h-full rounded-pill transition-[width] duration-(--dur-slow) ease-(--ease-out)"
                  style={{ width: `${(s.value / total) * 100}%`, background: seriesColor(s.i) }}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFigure>
  );
}
