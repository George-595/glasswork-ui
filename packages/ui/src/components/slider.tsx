import { Slider as SliderPrimitive } from 'radix-ui';
import { type HTMLAttributes, useId, useState } from 'react';
import { cn } from '../lib/cn';

/* Slider — one number from a range, on Radix Slider: the thumb is
   role="slider", so the arrow keys step it, Page Up/Down take bigger steps and
   Home/End jump to the ends. The visible label names the thumb
   (aria-labelledby); `formatValue` turns the number into words for
   aria-valuetext ("£40", "3 of 5"), so a screen reader hears what a sighted
   reader sees. Ticks are decorative marks at each step (or at the values you
   give); the 24px thumb is its own target. Glass: the track is glass. */
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
  name,
  className,
  ...props
}: SliderProps) {
  const labelId = useId();
  const [inner, setInner] = useState(defaultValue ?? min);
  const current = value ?? inner;
  const span = max - min || 1;

  let marks: number[] = [];
  if (Array.isArray(ticks)) marks = [...ticks];
  else if (ticks) {
    const count = Math.floor(span / step);
    if (count <= MAX_TICKS) marks = Array.from({ length: count + 1 }, (_, i) => min + i * step);
  }

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
      <SliderPrimitive.Root
        name={name}
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={[current]}
        onValueChange={([v]) => {
          if (v === undefined) return;
          setInner(v);
          onValueChange?.(v);
        }}
        onValueCommit={([v]) => v !== undefined && onValueCommit?.(v)}
        className="ui-slider-root relative flex h-6 w-full touch-none items-center select-none"
      >
        <SliderPrimitive.Track className="relative h-1.5 grow overflow-hidden rounded-pill border border-solid border-border-input bg-sunken [box-shadow:var(--elev-0)] data-[disabled]:border-disabled-border data-[disabled]:bg-disabled forced-colors:border-[CanvasText]">
          <SliderPrimitive.Range className="absolute h-full bg-primary data-[disabled]:bg-disabled-fg forced-colors:bg-[Highlight]" />
        </SliderPrimitive.Track>
        {marks.length > 0 && (
          <span
            aria-hidden="true"
            className="ui-slider-ticks pointer-events-none absolute inset-x-3 top-1/2 h-3 -translate-y-1/2"
          >
            {marks.map((m) => (
              <span
                key={m}
                className="absolute top-1/2 h-1.5 w-px -translate-x-1/2 -translate-y-1/2 bg-border-strong"
                style={{ left: `${((m - min) / span) * 100}%` }}
              />
            ))}
          </span>
        )}
        <SliderPrimitive.Thumb
          aria-labelledby={labelId}
          aria-valuetext={formatValue(current)}
          className="ui-slider-thumb block size-6 cursor-grab rounded-full border-2 border-solid border-primary bg-raised [box-shadow:var(--elev-2)] transition-[background-color,border-color] duration-(--dur-fast) ease-(--ease-out) hover:border-primary-hover focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] active:cursor-grabbing active:bg-pressed data-[disabled]:cursor-not-allowed data-[disabled]:border-disabled-border data-[disabled]:bg-disabled motion-reduce:transition-none forced-colors:border-[Highlight]"
        />
      </SliderPrimitive.Root>
    </div>
  );
}
