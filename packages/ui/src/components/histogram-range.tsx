import { useMemo, useState } from 'react';
import { cn } from '../lib/cn';
import { RangeSlider } from './slider';

/* HistogramRange — a range filter that shows where the values are (a price filter over 1,200
   listings): bars of how many items fall in each band sit on the track, the bars inside the
   chosen range in the brand colour and the rest muted, and the count of matches updates as the
   thumbs move ("312 of 1,200 match"). The control is the kit's RangeSlider (two native range
   inputs, keyboard and screen reader complete); the bars are a picture of the data for sight,
   and the count is a live region so the result is heard too. Bars grow in on first paint and
   ease between heights (still under reduced motion). */
export interface HistogramRangeProps {
  label: string;
  /** The raw values to count. */
  values: readonly number[];
  min: number;
  max: number;
  step?: number;
  /** How many bars. Default 32. */
  bins?: number;
  defaultValue?: readonly [number, number];
  onValueChange?: (value: [number, number]) => void;
  formatValue?: (value: number) => string;
  /** What one item is called, for the count: ["home", "homes"]. */
  noun?: readonly [string, string];
  className?: string;
}

export function HistogramRange({
  label,
  values,
  min,
  max,
  step = 1,
  bins = 32,
  defaultValue,
  onValueChange,
  formatValue = (v) => String(v),
  noun = ['item', 'items'],
  className,
}: HistogramRangeProps) {
  const [range, setRange] = useState<[number, number]>(
    defaultValue ? [defaultValue[0], defaultValue[1]] : [min, max],
  );
  const counts = useMemo(() => {
    const c = Array.from<number>({ length: bins }).fill(0);
    for (const v of values) {
      if (v < min || v > max) continue;
      const i = Math.min(bins - 1, Math.floor(((v - min) / (max - min)) * bins));
      c[i] = (c[i] ?? 0) + 1;
    }
    return c;
  }, [values, min, max, bins]);
  const peak = Math.max(1, ...counts);
  const matches = values.filter((v) => v >= range[0] && v <= range[1]).length;
  const nf = new Intl.NumberFormat('en-GB');
  return (
    <div
      className={cn('ui-histogram-range flex w-full min-w-0 flex-col gap-1 font-sans', className)}
    >
      <div aria-hidden="true" className="relative flex h-16 items-end gap-px px-3">
        {counts.map((c, i) => {
          const lo = min + ((max - min) * i) / bins;
          const hi = min + ((max - min) * (i + 1)) / bins;
          const inside = hi > range[0] && lo < range[1];
          return (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: one bar per band, in order
              key={i}
              className={cn(
                'ui-histogram-bar block min-h-px flex-1 origin-bottom rounded-t-[2px] transition-[background-color,height] duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none',
                inside ? 'bg-brand' : 'bg-border-strong opacity-50',
              )}
              style={{ height: `${(c / peak) * 100}%`, animationDelay: `${i * 12}ms` }}
            />
          );
        })}
      </div>
      <RangeSlider
        label={label}
        min={min}
        max={max}
        step={step}
        value={range}
        formatValue={formatValue}
        onValueChange={(v) => {
          setRange(v);
          onValueChange?.(v);
        }}
      />
      <p className="m-0 text-[12px] text-fg-muted tabular-nums" aria-live="polite">
        <span className="font-semibold text-fg">{nf.format(matches)}</span> of{' '}
        {nf.format(values.length)} {values.length === 1 ? noun[0] : noun[1]} match
      </p>
    </div>
  );
}
