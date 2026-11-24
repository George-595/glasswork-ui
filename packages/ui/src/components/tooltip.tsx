import type { ReactElement } from 'react';
import { TooltipContent, Tooltip as TooltipRoot, TooltipTrigger } from './ui/tooltip';
import { useIsClient } from './ui/use-is-client';

/* Tooltip — a short text hint for a control, on Vercel's UI SDK tooltip.
   It shows on hover (after 300ms) and at once on keyboard focus, and meets
   WCAG 1.4.13 (content on hover or focus):
   - dismissible: Esc hides it without moving focus or the pointer;
   - hoverable: the pointer can move onto the tip without it closing;
   - persistent: it stays until hover and focus leave, or Esc.
   The child is described by the tip (aria-describedby). Keep it to a hint:
   never put the only name of a control, or anything interactive, in a
   tooltip. The child must be focusable and take a ref. In the glass skin
   the tip is the glass material.

   `defaultOpen` shows it from the start. The SDK renders the tip in place,
   so it is in the server-rendered HTML the a11y gate scans; `data-static`
   marks it until the client has hydrated, for the CSS that places it
   there. */
export interface TooltipProps {
  content: string;
  children: ReactElement<{ 'aria-describedby'?: string }>;
  /** Which side of the child the tip appears on. Default 'top'. */
  side?: 'top' | 'bottom';
  /** Render shown from the start (showcase and tests). */
  defaultOpen?: boolean;
}

export function Tooltip({ content, children, side = 'top', defaultOpen = false }: TooltipProps) {
  const client = useIsClient();
  return (
    <span className="ui-tooltip-wrap relative inline-flex">
      <TooltipRoot defaultOpen={defaultOpen} delay={300} type="description">
        <TooltipTrigger render={children} />
        <TooltipContent side={side} className="ui-tooltip" data-static={client ? undefined : ''}>
          {content}
        </TooltipContent>
      </TooltipRoot>
    </span>
  );
}
