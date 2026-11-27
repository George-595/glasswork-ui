import { type HTMLAttributes, useEffect, useId, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { useNow } from '../lib/use-now';

/* Countdown — the time left to a deadline, as text or as a ring: a delay before something
   happens, a request's expiry, a wait between steps.

   The figure ("0:42", "1:05:00") is `role="timer"` with `aria-live="off"`, so it is never read
   out second by second. A separate polite status line, mounted from the start so it is
   announced, speaks only when the time left crosses one of `announceAt` (default 30, 10 and 5
   seconds) and once at zero. `onElapsed` runs once when the deadline passes (once, also, if it
   had already passed on arrival). Pass `now` to fix the clock (tests, server rendering: the
   server's time first, so hydration matches); without it the clock is read and ticks every
   second. The ring's stroke is a role; under reduced motion it steps once a second with no
   easing. */
export type CountdownTone = 'neutral' | 'warning' | 'danger';

export interface CountdownProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The deadline (epoch ms or an ISO string). */
  until: number | string;
  /** The current time, epoch ms. Omit to use the clock, ticking every second. */
  now?: number;
  /** The whole span in ms, for the ring's proportion. Default: the time left on arrival. */
  total?: number;
  variant?: 'inline' | 'ring';
  size?: 'md' | 'lg';
  /** What is counting down: 'Exit delay', 'Approval expires'. */
  label: string;
  /** Polite announcements at these seconds left. Default [30, 10, 5]. */
  announceAt?: readonly number[];
  onElapsed?: () => void;
  tone?: CountdownTone;
}

/** Whole seconds left, never negative. */
export function secondsLeft(until: number | string, now: number): number {
  const end = typeof until === 'number' ? until : Date.parse(until);
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, Math.ceil((end - now) / 1000));
}

/** 42 → "0:42", 65 → "1:05", 3900 → "1:05:00". */
export function formatSeconds(total: number): string {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}

const spoken = (label: string, left: number) =>
  left <= 0
    ? `${label}: time is up`
    : `${label}: ${left} ${left === 1 ? 'second' : 'seconds'} left`;

const STROKE: Record<CountdownTone, string> = {
  neutral: 'stroke-brand',
  warning: 'stroke-warning',
  danger: 'stroke-danger',
};
const TEXT: Record<CountdownTone, string> = {
  neutral: 'text-fg',
  warning: 'text-warning',
  danger: 'text-danger',
};
const DEFAULT_ANNOUNCE: readonly number[] = [30, 10, 5];
const R = 46;
const CIRC = 2 * Math.PI * R;

export function Countdown({
  until,
  now,
  total,
  variant = 'inline',
  size = 'md',
  label,
  announceAt = DEFAULT_ANNOUNCE,
  onElapsed,
  tone = 'neutral',
  className,
  ...props
}: CountdownProps) {
  const clock = useNow(now, 1000) as number;
  const left = secondsLeft(until, clock);
  const labelId = useId();
  // the polite line: set when the time left crosses a threshold (derived while rendering, from the
  // change in `left`, so it is spoken once and no effect has to set state)
  const [line, setLine] = useState(() =>
    left === 0 || announceAt.includes(left) ? spoken(label, left) : '',
  );
  const [seen, setSeen] = useState(left);
  if (seen !== left) {
    setSeen(left);
    if (left === 0 || announceAt.some((t) => t > 0 && left <= t && t < seen)) {
      setLine(spoken(label, left));
    }
  }
  const firedFor = useRef<number | string | null>(null);
  // the ring's whole span when none is given: the time left when this deadline arrived
  const [spanOf, setSpanOf] = useState({ until, ms: left * 1000 });
  if (spanOf.until !== until) setSpanOf({ until, ms: left * 1000 });
  const span = spanOf.until === until ? spanOf.ms : left * 1000;
  const elapsed = useRef(onElapsed);
  useEffect(() => {
    elapsed.current = onElapsed;
  });
  useEffect(() => {
    if (left === 0 && firedFor.current !== until) {
      firedFor.current = until;
      elapsed.current?.();
    }
  }, [left, until]);

  const whole = total ?? span;
  const fraction = whole > 0 ? Math.min(1, (left * 1000) / whole) : 0;
  const figure = formatSeconds(left);

  const status = (
    <span role="status" className="sr-only">
      {line}
    </span>
  );

  if (variant === 'ring') {
    const box = size === 'lg' ? 'size-50' : 'size-30';
    return (
      <div
        {...props}
        data-variant="ring"
        data-size={size}
        className={cn('ui-countdown relative inline-grid place-items-center', box, className)}
      >
        <svg
          viewBox="0 0 100 100"
          aria-hidden="true"
          focusable="false"
          className="absolute inset-0 size-full -rotate-90"
        >
          <circle cx="50" cy="50" r={R} fill="none" strokeWidth="6" className="stroke-border" />
          <circle
            cx="50"
            cy="50"
            r={R}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={CIRC}
            strokeDashoffset={CIRC * (1 - fraction)}
            data-ring-progress=""
            className={cn(
              STROKE[tone],
              'transition-[stroke-dashoffset] duration-1000 ease-linear motion-reduce:transition-none forced-colors:stroke-[Highlight]',
            )}
          />
        </svg>
        <div className="relative flex flex-col items-center gap-0.5 text-center">
          <span
            role="timer"
            aria-live="off"
            aria-labelledby={labelId}
            className={cn(
              'font-sans font-semibold tabular-nums',
              size === 'lg' ? 'text-[40px] leading-none' : 'text-[24px] leading-none',
              TEXT[tone],
            )}
          >
            {figure}
          </span>
          <span id={labelId} className="font-sans text-[12px] text-fg-muted">
            {label}
          </span>
        </div>
        {status}
      </div>
    );
  }

  return (
    <div
      {...props}
      data-variant="inline"
      data-size={size}
      className={cn('ui-countdown inline-flex items-baseline gap-2 font-sans', className)}
    >
      <span id={labelId} className="text-[13px] text-fg-muted">
        {label}
      </span>
      <span
        role="timer"
        aria-live="off"
        aria-labelledby={labelId}
        className={cn(
          'font-semibold tabular-nums',
          size === 'lg' ? 'text-[24px]' : 'text-[15px]',
          TEXT[tone],
        )}
      >
        {figure}
      </span>
      {status}
    </div>
  );
}
