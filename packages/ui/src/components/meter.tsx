import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/* Meter — a measurement inside a known range (disk used, password strength,
   a score): role="meter", with the HTML <meter> semantics for low / high /
   optimum. Where the value falls relative to `optimum` gives its tone:

     same region as optimum      -> good    (success, "Good")
     the next region over        -> caution (warning, "Caution")
     the far region              -> poor    (danger,  "Poor")

   The region is also written as a word, visibly and in aria-valuetext, so the
   tone is never carried by colour alone (WCAG 1.4.1). Without low/high/optimum
   the meter is neutral (accent) and says nothing about good or bad. For a task
   that is advancing, use Progress. */
export type MeterTone = 'good' | 'caution' | 'poor' | 'neutral';

export interface MeterProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label: string;
  value: number;
  min?: number;
  max?: number;
  /** Upper edge of the "low" region. */
  low?: number;
  /** Lower edge of the "high" region. */
  high?: number;
  /** The best value, deciding which region is good. */
  optimum?: number;
  /** Text for a value. Default: the number. */
  formatValue?: (value: number) => string;
  showValue?: boolean;
}

type Region = 0 | 1 | 2;

/** The tone for a value, by the HTML <meter> rules. */
export function meterTone(
  value: number,
  {
    min = 0,
    max = 100,
    low,
    high,
    optimum,
  }: Pick<MeterProps, 'min' | 'max' | 'low' | 'high' | 'optimum'>,
): MeterTone {
  if (low === undefined && high === undefined && optimum === undefined) return 'neutral';
  const lo = low ?? min;
  const hi = high ?? max;
  const regionOf = (n: number): Region => (n < lo ? 0 : n > hi ? 2 : 1);
  const best = regionOf(optimum ?? (min + max) / 2);
  const gap = Math.abs(regionOf(value) - best);
  return gap === 0 ? 'good' : gap === 1 ? 'caution' : 'poor';
}

const WORD: Record<MeterTone, string | null> = {
  good: 'Good',
  caution: 'Caution',
  poor: 'Poor',
  neutral: null,
};
const FILL: Record<MeterTone, string> = {
  good: 'bg-success',
  caution: 'bg-warning',
  poor: 'bg-danger',
  neutral: 'bg-primary',
};
const TEXT: Record<MeterTone, string> = {
  good: 'text-success',
  caution: 'text-warning',
  poor: 'text-danger',
  neutral: 'text-fg-muted',
};

export function Meter({
  label,
  value,
  min = 0,
  max = 100,
  low,
  high,
  optimum,
  formatValue = (v) => String(v),
  showValue = true,
  className,
  ...props
}: MeterProps) {
  const clamped = Math.min(max, Math.max(min, value));
  const ratio = max === min ? 0 : (clamped - min) / (max - min);
  const tone = meterTone(clamped, { min, max, low, high, optimum });
  const word = WORD[tone];
  const text = formatValue(clamped);
  return (
    <div {...props} className={cn('ui-meter flex w-full flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3 font-sans text-[13px]">
        <span className="ui-meter-label font-medium text-fg">{label}</span>
        {showValue && (
          <span
            className={cn('ui-meter-value font-mono text-[12.5px] tabular-nums', TEXT[tone])}
            aria-hidden="true"
          >
            {text}
            {word && <span className="font-sans font-semibold"> · {word}</span>}
          </span>
        )}
      </div>
      {/* biome-ignore lint/a11y/useSemanticElements: <meter> cannot carry the tone fill, the word or the glass track */}
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={clamped}
        aria-valuetext={word ? `${text}, ${word}` : text}
        data-tone={tone}
        className={cn(
          'ui-meter-track relative h-2.5 overflow-hidden rounded-pill border border-solid border-border-input bg-sunken',
          '[box-shadow:var(--elev-0)] forced-colors:border-[CanvasText]',
        )}
      >
        <div
          className={cn(
            'ui-meter-fill h-full rounded-pill transition-[width] duration-(--dur-slow) ease-(--ease-out) motion-reduce:transition-none forced-colors:bg-[Highlight]',
            FILL[tone],
          )}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
    </div>
  );
}
