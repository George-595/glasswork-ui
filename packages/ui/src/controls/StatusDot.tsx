import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/* StatusDot — a small status mark that is never colour alone (WCAG 1.4.1): a shape per tone AND
   a word. success is a filled circle with a tick, warning a triangle, danger a filled diamond
   with "!", info a ring, neutral a hollow circle, active a filled circle. The word is `label`:
   visible by default; with `showLabel={false}` it is screen-reader-only, so the same word must
   be visible somewhere else. Every colour is a role. `pulse` draws a slow ring for "happening
   now"; it is not drawn under reduced motion. */
export type StatusTone = 'neutral' | 'success' | 'info' | 'warning' | 'danger' | 'active';
export type StatusDotSize = 'sm' | 'md' | 'lg';

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
  /** The word: 'Online', 'Offline', 'Armed'. */
  label: string;
  /** Default true. False keeps the label for assistive tech only. */
  showLabel?: boolean;
  /** A slow ring for "happening now". */
  pulse?: boolean;
  size?: StatusDotSize;
}

const PX: Record<StatusDotSize, number> = { sm: 12, md: 16, lg: 20 };
const TEXT: Record<StatusDotSize, string> = {
  sm: 'text-[12px]',
  md: 'text-[13px]',
  lg: 'text-[15px]',
};
// the colour of the shape (and of the pulse ring, which draws in currentColor)
const COLOUR: Record<StatusTone, string> = {
  neutral: 'text-fg-muted',
  success: 'text-success',
  info: 'text-info',
  warning: 'text-warning',
  danger: 'text-danger',
  active: 'text-brand',
};

function Shape({ tone }: { tone: StatusTone }) {
  switch (tone) {
    case 'success':
      return (
        <>
          <circle cx="8" cy="8" r="7" className="fill-success-solid" />
          <path
            d="m4.8 8.2 2.2 2.2 4.2-4.6"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-on-success"
          />
        </>
      );
    case 'warning':
      return (
        <>
          <path
            d="M8 2 14.5 13.5H1.5Z"
            fill="none"
            strokeWidth="1.6"
            strokeLinejoin="round"
            className="stroke-current"
          />
          <path
            d="M8 6.5v3M8 11.6v.01"
            fill="none"
            strokeWidth="1.6"
            strokeLinecap="round"
            className="stroke-current"
          />
        </>
      );
    case 'danger':
      return (
        <>
          <path d="M8 0.8 15.2 8 8 15.2 0.8 8Z" className="fill-danger-solid" />
          <path
            d="M8 4.6v4M8 10.9v.01"
            fill="none"
            strokeWidth="1.8"
            strokeLinecap="round"
            className="stroke-on-danger"
          />
        </>
      );
    case 'info':
      return (
        <circle cx="8" cy="8" r="5.6" fill="none" strokeWidth="2" className="stroke-current" />
      );
    case 'neutral':
      return (
        <circle cx="8" cy="8" r="5.8" fill="none" strokeWidth="1.4" className="stroke-current" />
      );
    default:
      return <circle cx="8" cy="8" r="6" className="fill-current" />;
  }
}

/* decorative: the word beside it names the state */
function Glyph({ tone, px }: { tone: StatusTone; px: number }) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 16 16"
      aria-hidden="true"
      focusable="false"
      className="ui-status-glyph shrink-0"
      data-glyph={tone}
    >
      <Shape tone={tone} />
    </svg>
  );
}

export function StatusDot({
  tone,
  label,
  showLabel = true,
  pulse,
  size = 'md',
  className,
  ...props
}: StatusDotProps) {
  const px = PX[size];
  return (
    <span
      {...props}
      data-tone={tone}
      className={cn(
        'ui-status-dot inline-flex items-center gap-1.5 font-sans font-medium text-fg',
        TEXT[size],
        className,
      )}
    >
      <span className={cn('relative inline-flex shrink-0', COLOUR[tone])}>
        {pulse && (
          <span
            aria-hidden="true"
            data-pulse=""
            className="ui-status-pulse absolute inset-0 rounded-full border-2 border-solid border-current motion-safe:animate-ping motion-reduce:hidden forced-colors:hidden"
          />
        )}
        <Glyph tone={tone} px={px} />
      </span>
      <span className={showLabel ? undefined : 'sr-only'}>{label}</span>
    </span>
  );
}
