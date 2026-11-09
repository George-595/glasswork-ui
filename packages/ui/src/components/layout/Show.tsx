import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/* Show — shows its children only on some screen widths, by CSS, so the markup is the same at
   every width. `from="lg"` shows them from 1024px up; `below="sm"` shows them only under
   640px. The wrapper takes no space of its own (`display: contents`) so the children sit in
   the parent's row or column as if it were not there. Use it for room-saving, never to hide
   something a keyboard or screen-reader user needs: what CSS hides is not in the tab order. */
type Breakpoint = 'sm' | 'md' | 'lg' | 'xl';

export interface ShowProps extends HTMLAttributes<HTMLDivElement> {
  /** Visible from this width up. */
  from?: Breakpoint;
  /** Visible only under this width. */
  below?: Breakpoint;
}

const FROM: Record<Breakpoint, string> = {
  sm: 'hidden sm:contents',
  md: 'hidden md:contents',
  lg: 'hidden lg:contents',
  xl: 'hidden xl:contents',
};
const BELOW: Record<Breakpoint, string> = {
  sm: 'contents sm:hidden',
  md: 'contents md:hidden',
  lg: 'contents lg:hidden',
  xl: 'contents xl:hidden',
};

export function Show({ from, below, className, ...props }: ShowProps) {
  return (
    <div
      {...props}
      className={cn('ui-show', from && FROM[from], !from && below && BELOW[below], className)}
    />
  );
}
