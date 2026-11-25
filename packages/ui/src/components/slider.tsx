import {
  SliderControl,
  SliderIndicator,
  Slider as SliderRoot,
  SliderThumb,
  SliderTrack,
} from '@ui-sdk/react/slider';
import { type HTMLAttributes, useId, useState } from 'react';
import { cn } from '../lib/cn';

/* Slider — one number from a range, on Vercel's UI SDK slider: the thumb
   holds a native range input, the slider screen readers know (phones' swipe
   gestures included), so the arrow keys step it, Page Up/Down take bigger
   steps and Home/End jump to the ends. The visible label names it
   (aria-labelledby); `formatValue` turns the number into words for
   aria-valuetext ("£40", "3 of 5"), so a screen reader hears what a sighted
   reader sees. Ticks are decorative marks at each step (or at the values you
   give), with their values written under them when `tickLabels` is set; the
   24px thumb is its own target. Glass: the track is glass and the thumb a
   drop of liquid glass (a bright lens highlight and the sheen rim).

   RangeSlider is the same with two thumbs, a low and a high end ("£20 to
   £80"): each thumb is its own range input with its own name ("Minimum
   price", "Maximum price"), and they cannot cross. */
export interface SliderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  label: string;
  value?: number;
  defaultValue?: number;
  onValueChange?: (value: number) => void;
  onValueCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  /** Text for a value: shown beside the label and used as aria-valuetext. */
  formatValue?: (value: number) => string;
  /** Show the value beside the label. Default true. */
  showValue?: boolean;
  /** Keep the label for assistive tech only (a text box beside it already says what it is). */
  hideLabel?: boolean;
  /** Marks along the track: true for one per step, or the values to mark. */
  ticks?: boolean | readonly number[];
  /** Write each tick's value under it (through `formatValue`). The words are a sighted
      reader's ruler; the thumb's aria-valuetext already says where it is. */
  tickLabels?: boolean;
  name?: string;
}

const MAX_TICKS = 25;

export function Slider({
  label,
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  disabled,
  formatValue = (v) => String(v),
  showValue = true,
  hideLabel,
  ticks,
  tickLabels,
  name,
  className,
  ...props
}: SliderProps) {
  const labelId = useId();
  const [inner, setInner] = useState(defaultValue ?? min);
  const current = value ?? inner;
  const marks = marksOf(ticks, min, max, step);

  return (
    <div
      {...props}
      className={cn('ui-slider flex w-full flex-col gap-2', className)}
      data-disabled={disabled || undefined}
    >
      <div
        className={cn(
          'ui-slider-head flex items-baseline justify-between gap-3',
          hideLabel && 'sr-only',
        )}
      >
        <span id={labelId} className="ui-slider-label font-sans text-[13px] font-medium text-fg">
          {label}
        </span>
        {showValue && (
          <span
            className="ui-slider-value font-mono text-[12.5px] text-fg-muted tabular-nums"
            aria-hidden="true"
          >
            {formatValue(current)}
          </span>
        )}
      </div>
      <SliderRoot
        name={name}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={current}
        format={(v: number) => formatValue(v)}
        onValueChange={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          if (n === undefined) return;
          setInner(n);
          onValueChange?.(n);
        }}
        onValueCommit={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          if (n !== undefined) onValueCommit?.(n);
        }}
        className="ui-slider-root w-full"
      >
        <SliderControl className="relative flex h-6 w-full touch-none items-center select-none">
          <SliderTrack className="relative mx-3 h-1.5 grow rounded-pill border border-solid border-border-input bg-sunken [box-shadow:var(--elev-0)] data-disabled:border-disabled-border data-disabled:bg-disabled forced-colors:border-[CanvasText]">
            <SliderIndicator className="h-full rounded-pill bg-primary data-disabled:bg-disabled-fg forced-colors:bg-[Highlight]" />
            <Ticks marks={marks} min={min} max={max} />
            <SliderThumb aria-labelledby={labelId} className={THUMB} />
          </SliderTrack>
        </SliderControl>
      </SliderRoot>
      {tickLabels && <TickLabels marks={marks} min={min} max={max} format={formatValue} />}
    </div>
  );
}

function marksOf(
  ticks: boolean | readonly number[] | undefined,
  min: number,
  max: number,
  step: number,
): number[] {
  const span = max - min || 1;
  if (Array.isArray(ticks)) return [...ticks];
  if (!ticks) return [];
  const count = Math.floor(span / step);
  return count <= MAX_TICKS ? Array.from({ length: count + 1 }, (_, i) => min + i * step) : [];
}

const THUMB = cn(
  'ui-slider-thumb relative box-border block size-6 cursor-grab rounded-full border-2 border-solid border-primary bg-raised [box-shadow:var(--elev-2)]',
  "pointer-coarse:before:absolute pointer-coarse:before:-inset-3.5 pointer-coarse:before:content-['']",
  'transition-[background-color,border-color,scale] duration-(--dur-fast) ease-(--ease-out) hover:border-primary-hover has-focus-visible:[box-shadow:var(--ring)]',
  'active:cursor-grabbing active:bg-pressed data-dragging:cursor-grabbing data-disabled:cursor-not-allowed data-disabled:border-disabled-border data-disabled:bg-disabled motion-reduce:transition-none forced-colors:border-[Highlight]',
  // glass: a drop of liquid glass — a clear body, a bright lens highlight up and left, the sheen
  // rim, and it swells a little while held
  'glass:border-border-strong glass:bg-radial-[at_32%_28%] glass:from-seaglass-paper glass:from-[8%] glass:via-raised glass:via-[42%] glass:to-surface',
  'glass:[box-shadow:var(--sheen),var(--elev-2)] glass:data-dragging:scale-115 glass:active:scale-115',
);

function Ticks({ marks, min, max }: { marks: readonly number[]; min: number; max: number }) {
  if (marks.length === 0) return null;
  const span = max - min || 1;
  return (
    <span
      aria-hidden="true"
      className="ui-slider-ticks pointer-events-none absolute inset-x-0 top-1/2 h-3 -translate-y-1/2"
    >
      {marks.map((m) => (
        <span
          key={m}
          className="absolute top-1/2 h-1.5 w-px -translate-x-1/2 -translate-y-1/2 bg-border-strong"
          style={{ left: `${((m - min) / span) * 100}%` }}
        />
      ))}
    </span>
  );
}

function TickLabels({
  marks,
  min,
  max,
  format,
}: {
  marks: readonly number[];
  min: number;
  max: number;
  format: (v: number) => string;
}) {
  if (marks.length === 0) return null;
  const span = max - min || 1;
  return (
    <span aria-hidden="true" className="ui-slider-tick-labels relative mx-3 -mt-1 block h-4">
      {marks.map((m, i) => (
        <span
          key={m}
          className={cn(
            'absolute top-0 font-mono text-[11px] whitespace-nowrap text-fg-subtle tabular-nums',
            i === 0 ? '' : i === marks.length - 1 ? '-translate-x-full' : '-translate-x-1/2',
          )}
          style={{ left: `${((m - min) / span) * 100}%` }}
        >
          {format(m)}
        </span>
      ))}
    </span>
  );
}

export interface RangeSliderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  label: string;
  value?: readonly [number, number];
  defaultValue?: readonly [number, number];
  onValueChange?: (value: [number, number]) => void;
  onValueCommit?: (value: [number, number]) => void;
  min?: number;
  max?: number;
  step?: number;
  /** The least gap between the two ends, in steps. Default 1. */
  minStepsBetween?: number;
  disabled?: boolean;
  formatValue?: (value: number) => string;
  /** Names of the two thumbs. Default "Minimum <label>" / "Maximum <label>". */
  thumbLabels?: readonly [string, string];
  showValue?: boolean;
  ticks?: boolean | readonly number[];
  tickLabels?: boolean;
  name?: string;
}

export function RangeSlider({
  label,
  value,
  defaultValue,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  minStepsBetween = 1,
  disabled,
  formatValue = (v) => String(v),
  thumbLabels,
  showValue = true,
  ticks,
  tickLabels,
  name,
  className,
  ...props
}: RangeSliderProps) {
  const labelId = useId();
  const [inner, setInner] = useState<[number, number]>(
    defaultValue ? [defaultValue[0], defaultValue[1]] : [min, max],
  );
  const current: [number, number] = value ? [value[0], value[1]] : inner;
  const marks = marksOf(ticks, min, max, step);
  const lower = label.charAt(0).toLowerCase() + label.slice(1);
  const names = thumbLabels ?? [`Minimum ${lower}`, `Maximum ${lower}`];
  const pair = (v: number | number[]): [number, number] | null =>
    Array.isArray(v) && v.length === 2 ? [v[0] as number, v[1] as number] : null;

  return (
    <div
      {...props}
      className={cn('ui-slider ui-range-slider flex w-full flex-col gap-2', className)}
      data-disabled={disabled || undefined}
    >
      <div className="ui-slider-head flex items-baseline justify-between gap-3">
        <span id={labelId} className="ui-slider-label font-sans text-[13px] font-medium text-fg">
          {label}
        </span>
        {showValue && (
          <span
            className="ui-slider-value font-mono text-[12.5px] text-fg-muted tabular-nums"
            aria-hidden="true"
          >
            {formatValue(current[0])} – {formatValue(current[1])}
          </span>
        )}
      </div>
      <SliderRoot
        name={name}
        min={min}
        max={max}
        step={step}
        minStepsBetweenThumbs={minStepsBetween}
        disabled={disabled}
        value={current}
        format={(v: number) => formatValue(v)}
        onValueChange={(v) => {
          const p = pair(v);
          if (!p) return;
          setInner(p);
          onValueChange?.(p);
        }}
        onValueCommit={(v) => {
          const p = pair(v);
          if (p) onValueCommit?.(p);
        }}
        aria-labelledby={labelId}
        className="ui-slider-root w-full"
      >
        <SliderControl className="relative flex h-6 w-full touch-none items-center select-none">
          <SliderTrack className="relative mx-3 h-1.5 grow rounded-pill border border-solid border-border-input bg-sunken [box-shadow:var(--elev-0)] data-disabled:border-disabled-border data-disabled:bg-disabled forced-colors:border-[CanvasText]">
            <SliderIndicator className="h-full rounded-pill bg-primary data-disabled:bg-disabled-fg forced-colors:bg-[Highlight]" />
            <Ticks marks={marks} min={min} max={max} />
            <SliderThumb index={0} aria-label={names[0]} className={THUMB} />
            <SliderThumb index={1} aria-label={names[1]} className={THUMB} />
          </SliderTrack>
        </SliderControl>
      </SliderRoot>
      {tickLabels && <TickLabels marks={marks} min={min} max={max} format={formatValue} />}
    </div>
  );
}
