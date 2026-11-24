import { TooltipContent as TooltipPart, TooltipTrigger } from '@ui-sdk/react/tooltip';
import * as React from 'react';
import { cn } from '../../lib/cn';

export { Tooltip } from '@ui-sdk/react/tooltip';

/* The tip, on Vercel's UI SDK (@ui-sdk/react/tooltip). In the glass skin the
   tokens make it the glass material (translucent --raised, the
   --chrome-filter blur, the --glass-rim); enterprise keeps the calm popover.
   The SDK renders it in place, in the browser's top layer, so a tip shown
   from the start is in the server-rendered HTML too. */
const TooltipContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof TooltipPart>
>(({ className, sideOffset = 6, ...props }, ref) => (
  <TooltipPart
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 m-0 w-max max-w-60 rounded-sm border border-solid border-border bg-overlay px-2.5 py-1.5 font-sans text-[12px] leading-[1.4] text-fg [box-shadow:var(--elev-2)] glass-chrome forced-colors:border-[CanvasText]',
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = 'TooltipContent';

export { TooltipContent, TooltipTrigger };
