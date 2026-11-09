import type { HTMLAttributes } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { PatternDefs, patternFill, seriesColor, useSafeId } from './ChartFrame';
import { useMeasuredWidth } from './useMeasuredWidth';

/* UsageMeter — a fixed allowance (storage, seats, a budget) filled by several parts, so people
   see what takes the room and how close they are to the limit. Adapted from Arc's usage-meter
   (MIT, (c) Elia Kuratli; see THIRD_PARTY_NOTICES.md): the segmented bar, the legend with
   values, the almost-full and over-limit states.

   Why not Meter: Meter is one value in a range with a good/poor tone; this is several parts of
   one total against a limit. Segments are told apart by a fill pattern as well as a colour (the
   bar patterns), the legend repeats each with its value and share, and the state is a word with
   an icon ("Almost full", "Over limit"), never colour alone.

   The bar is role="meter" (value = total used, clamped to the limit; the text names every
   part). Over the limit the bar is full and a line marks where the limit was. */
export interface UsageSegment {
  /** Stable key. */
  id: string;
  label: string;
  value: number;
}

export interface UsageMeterProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** What is measured, e.g. "Spend against budget". */
  label: string;
  /** Used amounts, in display order. Up to eight (one pattern each). */
  segments: readonly UsageSegment[];
  /** The allowance, in the same unit as the segments. */
  limit: number;
  /** Text for an amount. Default: en-GB number. */
  formatValue?: (value: number) => string;
  /** Share of the limit at which the meter says it is almost full. Default 0.9. */
  warnAt?: number;
  /** Name for the unused part of the bar. Default "Free". */
  freeLabel?: string;
}

const grouped = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 0 });
const BAR_H = 12;
const GAP = 2;

export function UsageMeter({
  label,
  segments,
  limit,
  formatValue = (v) => grouped.format(v),
  warnAt = 0.9,
  freeLabel = 'Free',
  className,
  ...props
}: UsageMeterProps) {
  const prefix = useSafeId('um');
  const { width, ref } = useMeasuredWidth();
  const parts = segments.map((s, i) => ({ ...s, index: i, value: Math.max(0, s.value) }));
  const used = parts.reduce((a, s) => a + s.value, 0);
  const free = Math.max(0, limit - used);
  const over = used > limit;
  const state = over ? 'over' : limit > 0 && used / limit >= warnAt ? 'warn' : 'ok';
  const scale = Math.max(limit, used);
  const unit = scale > 0 ? width / scale : 0;

  const bars = parts
    .map((s, i) => ({
      ...s,
      w: s.value * unit,
      x: parts.slice(0, i).reduce((a, p) => a + p.value, 0) * unit,
    }))
    .filter((b) => b.w > 0);

  const summary = `${formatValue(used)} of ${formatValue(limit)} used (${percent.format(limit > 0 ? used / limit : 0)}). ${parts
    .filter((s) => s.value > 0)
    .map((s) => `${s.label} ${formatValue(s.value)}`)
    .join(', ')}${over ? '. Over the limit' : state === 'warn' ? '. Almost full' : ''}`;

  return (
    <div {...props} className={cn('ui-usage flex w-full min-w-0 flex-col gap-2', className)}>
      <PatternDefs prefix={prefix} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-[13px]">
        <span className="ui-usage-label font-medium text-fg">{label}</span>
        <span className="ui-usage-figure font-mono text-[12.5px] text-fg-muted tabular-nums">
          {formatValue(used)} of {formatValue(limit)} used
          {state !== 'ok' && (
            <span
              className={cn(
                'ml-2 inline-flex items-center gap-1 font-sans font-semibold',
                state === 'over' ? 'text-danger' : 'text-warning',
              )}
            >
              <Icon name="alert" size={13} />
              {state === 'over' ? 'Over limit' : 'Almost full'}
            </span>
          )}
        </span>
      </div>
      <div ref={ref} className="min-w-0">
        {/* biome-ignore lint/a11y/useSemanticElements: <meter> cannot draw patterned segments */}
        <div
          role="meter"
          aria-label={label}
          aria-valuemin={0}
          aria-valuemax={limit}
          aria-valuenow={Math.min(used, limit)}
          aria-valuetext={summary}
          data-state={state}
        >
          <svg
            width={width}
            height={BAR_H}
            viewBox={`0 0 ${width} ${BAR_H}`}
            aria-hidden="true"
            focusable="false"
            className="block"
          >
            <rect
              x={0.5}
              y={0.5}
              width={Math.max(0, width - 1)}
              height={BAR_H - 1}
              rx={BAR_H / 2}
              className="fill-sunken stroke-border-input forced-colors:[forced-color-adjust:none]"
            />
            {bars.map((b, i) => (
              <rect
                key={b.id}
                x={b.x + (i === 0 ? 0 : GAP / 2)}
                y={0}
                width={Math.max(0, b.w - (i === 0 ? GAP / 2 : GAP))}
                height={BAR_H}
                rx={2}
                fill={patternFill(prefix, b.index)}
                className="forced-colors:[forced-color-adjust:none]"
              />
            ))}
            {over && limit > 0 && (
              <line
                x1={limit * unit}
                x2={limit * unit}
                y1={-2}
                y2={BAR_H + 2}
                strokeWidth={2}
                className="stroke-fg"
              />
            )}
          </svg>
        </div>
      </div>
      <ul className="ui-usage-legend m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-[13px] text-fg-muted">
        {parts.map((s) => (
          <li key={s.id} className="inline-flex items-center gap-1.5">
            <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" focusable="false">
              <rect
                x="1"
                y="1"
                width="20"
                height="10"
                rx="2"
                fill={patternFill(prefix, s.index)}
                stroke={seriesColor(s.index)}
                strokeWidth="1.5"
              />
            </svg>
            <span>{s.label}</span>
            <span className="font-mono tabular-nums text-fg">{formatValue(s.value)}</span>
            <span className="tabular-nums text-fg-subtle">
              {percent.format(limit > 0 ? s.value / limit : 0)}
            </span>
          </li>
        ))}
        <li className="inline-flex items-center gap-1.5">
          <svg width="22" height="12" viewBox="0 0 22 12" aria-hidden="true" focusable="false">
            <rect
              x="1"
              y="1"
              width="20"
              height="10"
              rx="2"
              className="fill-sunken stroke-border-input"
              strokeWidth="1.5"
            />
          </svg>
          <span>{freeLabel}</span>
          <span className="font-mono tabular-nums text-fg">{formatValue(free)}</span>
        </li>
      </ul>
    </div>
  );
}
