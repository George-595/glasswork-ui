import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/* Progress — how far a task has got: role="progressbar" with aria-valuenow, or,
   with no `value`, an indeterminate bar (no aria-valuenow, so assistive tech
   says "busy" rather than inventing a number). The bar is named by `label`; the
   percentage is also written out as text, so it is not the fill alone that
   says it (WCAG 1.4.1). The indeterminate sweep stops under reduced motion and
   the bar then shows a static partial fill. For a measurement against a range
   (disk used, score), use Meter instead. */
export type ProgressTone = 'accent' | 'up' | 'down' | 'warn';

export interface ProgressProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** What is progressing. Required: a bar needs a name. */
  label: string;
  /** Omit for indeterminate. */
  value?: number;
  max?: number;
  /** Show the percentage as text beside the label. Default true. */
  showValue?: boolean;
  tone?: ProgressTone;
  size?: 'sm' | 'md';
}

const TONE: Record<ProgressTone, string> = {
  accent: 'bg-primary',
  up: 'bg-up',
  down: 'bg-down',
  warn: 'bg-warning',
};

export function Progress({
  label,
  value,
  max = 100,
  showValue = true,
  tone = 'accent',
  size = 'md',
  className,
  ...props
}: ProgressProps) {
  const determinate = typeof value === 'number' && Number.isFinite(value);
  const ratio = determinate ? Math.min(1, Math.max(0, (value as number) / (max || 1))) : 0;
  const percent = `${Math.round(ratio * 100)}%`;
  return (
    <div {...props} className={cn('ui-progress flex w-full flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3 font-sans text-[13px]">
        <span className="ui-progress-label font-medium text-fg">{label}</span>
        {showValue && determinate && (
          <span className="ui-progress-value font-mono text-[12.5px] text-fg-muted tabular-nums">
            {percent}
          </span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={determinate ? (value as number) : undefined}
        aria-valuetext={determinate ? percent : 'In progress'}
        data-state={determinate ? (ratio >= 1 ? 'complete' : 'loading') : 'indeterminate'}
        className={cn(
          'ui-progress-track relative overflow-hidden rounded-pill border border-solid border-border-input bg-sunken',
          '[box-shadow:var(--elev-0)] forced-colors:border-[CanvasText]',
          size === 'sm' ? 'h-1.5' : 'h-2.5',
        )}
      >
        <div
          className={cn(
            'ui-progress-fill relative h-full overflow-hidden rounded-pill forced-colors:bg-[Highlight]',
            // a soft light runs along the fill while work goes on (stops under reduced motion)
            'text-on-primary after:absolute after:inset-0 after:bg-linear-to-r after:from-transparent after:via-current after:to-transparent after:opacity-35 after:content-[""]',
            'motion-safe:after:animate-[ui-skeleton-shimmer_1.6s_var(--ease-in-out)_infinite] motion-reduce:after:hidden',
            determinate && ratio >= 1 && 'after:hidden',
            TONE[tone],
            determinate
              ? 'transition-[width] duration-(--dur-slow) ease-(--ease-out) motion-reduce:transition-none'
              : 'w-2/5 motion-safe:animate-[ui-progress-sweep_1.4s_var(--ease-in-out)_infinite]',
          )}
          style={determinate ? { width: percent } : undefined}
        />
      </div>
    </div>
  );
}

/* ProgressRing — the same progress as a ring, for a tile, a button or a small space: the figure
   sits in the middle. role="progressbar" with the same value rules as Progress; with no
   `value` the ring spins a quarter arc (still under reduced motion). */
export interface ProgressRingProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label: string;
  value?: number;
  max?: number;
  /** Diameter in px. Default 56. */
  size?: number;
  tone?: ProgressTone;
  /** Write the percentage in the middle. Default true (when there is room, 40px and up). */
  showValue?: boolean;
}

const RING_TONE: Record<ProgressTone, string> = {
  accent: 'stroke-primary',
  up: 'stroke-up',
  down: 'stroke-down',
  warn: 'stroke-warning',
};

export function ProgressRing({
  label,
  value,
  max = 100,
  size = 56,
  tone = 'accent',
  showValue = true,
  className,
  ...props
}: ProgressRingProps) {
  const determinate = typeof value === 'number' && Number.isFinite(value);
  const ratio = determinate ? Math.min(1, Math.max(0, (value as number) / (max || 1))) : 0.25;
  const percent = `${Math.round(ratio * 100)}%`;
  const stroke = Math.max(4, Math.round(size / 10));
  const r = (size - stroke) / 2;
  return (
    <div
      {...props}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={determinate ? (value as number) : undefined}
      aria-valuetext={determinate ? percent : 'In progress'}
      data-state={determinate ? (ratio >= 1 ? 'complete' : 'loading') : 'indeterminate'}
      className={cn('ui-progress-ring relative inline-grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        focusable="false"
        className={cn(
          '-rotate-90',
          !determinate && 'motion-safe:animate-spin [animation-duration:1.1s]',
        )}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-sunken"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${ratio * 100} 100`}
          className={cn(
            RING_TONE[tone],
            ratio === 0 && 'hidden',
            'transition-[stroke-dasharray] duration-(--dur-slow) ease-(--ease-out) motion-reduce:transition-none forced-colors:[forced-color-adjust:none]',
          )}
        />
      </svg>
      {showValue && determinate && size >= 40 && (
        <span
          aria-hidden="true"
          className="absolute font-mono font-semibold text-fg tabular-nums"
          style={{ fontSize: Math.round(size * 0.22) }}
        >
          {percent}
        </span>
      )}
    </div>
  );
}

/* ProgressSteps — progress through a known number of steps, as segments: "Step 2 of 4,
   Payment". An ordered list (each step's name and state are read), the current step marked
   aria-current="step"; done, current and to come differ by fill AND a word. */
export interface ProgressStepsProps extends Omit<HTMLAttributes<HTMLOListElement>, 'children'> {
  /** Names the list ("Checkout"). */
  label: string;
  steps: readonly string[];
  /** The step in progress, from 0. `steps.length` means all done. */
  current: number;
}

export function ProgressSteps({ label, steps, current, className, ...props }: ProgressStepsProps) {
  const at = Math.min(steps.length, Math.max(0, current));
  return (
    <div className={cn('ui-progress-steps flex w-full flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3 font-sans text-[13px]">
        <span className="font-medium text-fg">{label}</span>
        <span className="font-mono text-[12.5px] text-fg-muted tabular-nums" aria-hidden="true">
          {at >= steps.length ? 'Done' : `Step ${at + 1} of ${steps.length}`}
        </span>
      </div>
      <ol
        {...props}
        aria-label={label}
        className="m-0 grid list-none gap-1.5 p-0"
        style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}
      >
        {steps.map((step, i) => {
          const state = i < at ? 'done' : i === at ? 'current' : 'todo';
          return (
            <li
              key={step}
              aria-current={state === 'current' ? 'step' : undefined}
              data-state={state}
              className="group flex min-w-0 flex-col gap-1"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'h-1.5 rounded-pill border border-solid',
                  state === 'done' && 'border-transparent bg-primary',
                  state === 'current' &&
                    'border-primary bg-linear-to-r from-primary from-50% to-sunken to-50%',
                  state === 'todo' && 'border-border-input bg-sunken',
                )}
              />
              <span
                className={cn(
                  'truncate text-[12px]',
                  state === 'todo' ? 'text-fg-subtle' : 'text-fg',
                  state === 'current' && 'font-semibold',
                )}
              >
                {step}
                <span className="ui-sr-only">
                  {state === 'done'
                    ? ', done'
                    : state === 'current'
                      ? ', in progress'
                      : ', to come'}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
