import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/* Adapted from Arc Library's text-shimmer (MIT, Elia Kuratli); see THIRD_PARTY_NOTICES.md.
   TextShimmer — a short status line ("Thinking", "Searching the docs") with a soft band of
   light sweeping across it while work is going on. The band is a gradient from the muted to
   the full text role, painted through the text with background-clip, on the kit's own
   `ui-fx-sweep` keyframes (no JS loop, no motion library). Under prefers-reduced-motion the
   sweep stops and the line is plain muted text; when `active` is false it settles to solid.
   It is decorative motion on real text: the words are always in the DOM, so a screen reader
   reads them once. */
export interface TextShimmerProps extends HTMLAttributes<HTMLSpanElement> {
  /** Sweep while work is ongoing. Default true; false settles to plain text. */
  active?: boolean;
  /** Seconds for one sweep. Default 2. */
  duration?: number;
}

export function TextShimmer({
  active = true,
  duration = 2,
  className,
  style,
  children,
  ...props
}: TextShimmerProps) {
  return (
    <span
      {...props}
      data-active={active || undefined}
      style={active ? { animationDuration: `${duration}s`, ...style } : style}
      className={cn(
        'ui-text-shimmer inline-block',
        active
          ? [
              'bg-linear-90 from-fg-muted via-fg to-fg-muted bg-size-[200%_auto] bg-clip-text text-transparent',
              'animate-[ui-fx-sweep_2s_linear_infinite]',
              // no sweep, no gradient: plain muted text
              'motion-reduce:animate-none motion-reduce:bg-none motion-reduce:text-fg-muted',
              'forced-colors:bg-none forced-colors:text-fg-muted',
            ]
          : 'text-fg-muted',
        className,
      )}
    >
      {children}
    </span>
  );
}
