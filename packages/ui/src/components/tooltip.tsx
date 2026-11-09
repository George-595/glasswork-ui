import type { ReactElement } from 'react';
import {
  TooltipContent,
  TooltipProvider,
  Tooltip as TooltipRoot,
  TooltipTrigger,
} from './ui/tooltip';
import { useIsClient } from './ui/use-is-client';

/* Tooltip — a short text hint for a control, on Radix Tooltip (shadcn).
   It shows on hover (after 300ms) and at once on keyboard focus, and meets
   WCAG 1.4.13 (content on hover or focus):
   - dismissible: Esc hides it without moving focus or the pointer;
   - hoverable: the pointer can move onto the tip without it closing (Radix
     keeps a grace area between the child and the tip);
   - persistent: it stays until hover and focus leave, or Esc.
   While shown, the child is described by the tip (aria-describedby).
   Keep it to a hint: never put the only name of a control, or anything
   interactive, in a tooltip. The child must be focusable and take a ref.
   In the glass skin the tip is the glass material.

   `defaultOpen` shows it from the start; on the server (and while
   hydrating) the open tip renders in place, since Radix's portal mounts on
   the client only, so it is in the static HTML the a11y gate scans. */
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
      <TooltipProvider delayDuration={300}>
        <TooltipRoot defaultOpen={defaultOpen}>
          <TooltipTrigger asChild>{children}</TooltipTrigger>
          <TooltipContent
            side={side}
            portal={client}
            className="ui-tooltip"
            data-side={side}
            data-static={client ? undefined : ''}
          >
            {content}
          </TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    </span>
  );
}
