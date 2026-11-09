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
            'ui-progress-fill h-full rounded-pill forced-colors:bg-[Highlight]',
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
