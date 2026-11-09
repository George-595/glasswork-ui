import type { HTMLAttributes } from 'react';
import { type MeterTone, meterTone } from '../components/meter';
import { cn } from '../lib/cn';

/* Gauge — one value on a half-circle dial, for a score or a rate with a known range (a pass
   rate, a health score). Adapted from Arc's gauge (MIT, (c) Elia Kuratli; see
   THIRD_PARTY_NOTICES.md): the semicircle arc and the value-in-the-middle layout.

   It reads like Meter, and shares its tone rules: `low` / `high` / `optimum` decide whether
   the value is good, caution or poor (the HTML <meter> regions), drawn in the success /
   warning / danger roles AND written as a word under the figure, so the tone is never colour
   alone (WCAG 1.4.1). Small ticks on the dial mark `low` and `high`. Without them the arc is
   neutral (the accent) and says nothing about good or bad.

   The element is role="meter" (name, range, value and tone word in aria-valuetext); the SVG is
   decoration. The arc eases to a new value, and not at all under reduced motion. */
export interface GaugeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** What is measured, e.g. "Payment success". */
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
  /** Text for a value. Default: en-GB number. */
  formatValue?: (value: number) => string;
  /** Small text under the figure, e.g. "of 240 payments". */
  caption?: string;
}

const WORD: Record<MeterTone, string | null> = {
  good: 'Good',
  caution: 'Caution',
  poor: 'Poor',
  neutral: null,
};
const ARC: Record<MeterTone, string> = {
  good: 'stroke-success',
  caution: 'stroke-warning',
  poor: 'stroke-danger',
  neutral: 'stroke-brand',
};
const TEXT: Record<MeterTone, string> = {
  good: 'text-success',
  caution: 'text-warning',
  poor: 'text-danger',
  neutral: 'text-fg-muted',
};

const CX = 100;
const CY = 100;
const R = 80;
const STROKE = 14;
const num = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 1 });

/** A point on the dial at fraction t (0 = left end, 1 = right end), `r` from the centre. */
const at = (t: number, r: number) => {
  const a = Math.PI * (1 - t);
  return [CX + r * Math.cos(a), CY - r * Math.sin(a)] as const;
};

export function Gauge({
  label,
  value,
  min = 0,
  max = 100,
  low,
  high,
  optimum,
  formatValue = (v) => num.format(v),
  caption,
  className,
  ...props
}: GaugeProps) {
  const clamped = Math.min(max, Math.max(min, value));
  const span = max - min;
  const ratio = span === 0 ? 0 : (clamped - min) / span;
  const tone = meterTone(clamped, { min, max, low, high, optimum });
  const word = WORD[tone];
  const text = formatValue(clamped);
  const frac = (v: number) => (span === 0 ? 0 : Math.min(1, Math.max(0, (v - min) / span)));
  const ticks = [low, high].flatMap((v) => (v === undefined ? [] : [frac(v)]));
  const arc = `M${CX - R} ${CY}A${R} ${R} 0 0 1 ${CX + R} ${CY}`;

  return (
    // biome-ignore lint/a11y/useSemanticElements: <meter> cannot hold the dial, the word or the glass look
    <div
      {...props}
      role="meter"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={clamped}
      aria-valuetext={word ? `${text}, ${word}` : text}
      data-tone={tone}
      className={cn('ui-gauge mx-auto flex w-full max-w-64 flex-col items-center gap-1', className)}
    >
      <div className="relative w-full">
        <svg viewBox="0 0 200 112" aria-hidden="true" focusable="false" className="block w-full">
          <path
            d={arc}
            pathLength={100}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            className="stroke-sunken"
          />
          <path
            d={arc}
            pathLength={100}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${ratio * 100} 100`}
            className={cn(
              ARC[tone],
              ratio === 0 && 'hidden',
              'transition-[stroke-dasharray] duration-(--dur-slow) ease-(--ease-out) motion-reduce:transition-none forced-colors:[forced-color-adjust:none]',
            )}
          />
          {ticks.map((t) => {
            const [x1, y1] = at(t, R - STROKE / 2 - 3);
            const [x2, y2] = at(t, R + STROKE / 2 + 3);
            return (
              <line
                key={t}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={2}
                className="stroke-fg-subtle"
              />
            );
          })}
        </svg>
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center leading-tight">
          <span
            aria-hidden="true"
            className="ui-gauge-value font-mono text-2xl font-semibold text-fg tabular-nums"
          >
            {text}
          </span>
          {word && (
            <span
              aria-hidden="true"
              className={cn('ui-gauge-word text-[13px] font-semibold', TEXT[tone])}
            >
              {word}
            </span>
          )}
        </div>
      </div>
      <span aria-hidden="true" className="ui-gauge-label text-[13px] font-medium text-fg">
        {label}
      </span>
      {caption && (
        <span aria-hidden="true" className="ui-gauge-caption text-xs text-fg-subtle">
          {caption}
        </span>
      )}
    </div>
  );
}
