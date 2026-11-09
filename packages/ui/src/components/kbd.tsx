import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/* Kbd — a keyboard key as a chip ("Esc", "⌘K"). A real <kbd>, so assistive
   tech knows it is a key. Chords are several Kbd side by side; spell symbols
   out for screen readers with aria-label when the glyph alone is unclear
   (`<Kbd aria-label="Command">⌘</Kbd>`). */
export type KbdProps = HTMLAttributes<HTMLElement>;

export function Kbd({ className, ...props }: KbdProps) {
  return (
    <kbd
      {...props}
      className={cn(
        'ui-kbd inline-flex min-h-5 min-w-5 items-center justify-center rounded-xs border border-solid border-border-strong bg-sunken px-1.5 font-mono text-[11px] leading-none font-medium text-fg-muted',
        'border-b-2 forced-colors:border-[CanvasText]',
        className,
      )}
    />
  );
}
