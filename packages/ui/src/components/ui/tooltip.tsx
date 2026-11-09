import { Tooltip as TooltipPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../../lib/cn';

const TooltipProvider = TooltipPrimitive.Provider;
const Tooltip = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

/* The tip. In the glass skin the tokens make it the glass material
   (translucent --raised, the --chrome-filter blur, the --glass-rim);
   enterprise keeps the calm popover. `portal={false}` renders it in place:
   Radix's portal mounts on the client only, so a tip that must appear in
   server-rendered HTML needs it. */
const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> & { portal?: boolean }
>(({ className, sideOffset = 6, portal = true, ...props }, ref) => {
  const content = (
    <TooltipPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 w-max max-w-60 rounded-sm border border-solid border-border bg-overlay px-2.5 py-1.5 font-sans text-[12px] leading-[1.4] text-fg [box-shadow:var(--elev-2)] glass-chrome forced-colors:border-[CanvasText]',
        className,
      )}
      {...props}
    />
  );
  return portal ? <TooltipPrimitive.Portal>{content}</TooltipPrimitive.Portal> : content;
});
TooltipContent.displayName = 'TooltipContent';

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger };
