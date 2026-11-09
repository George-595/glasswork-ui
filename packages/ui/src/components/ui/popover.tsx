import { Popover as PopoverPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../../lib/cn';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;

/* shadcn's popover on our tokens. The surface is the same as the dropdown
   menu's: in the glass skin the tokens make it the glass material
   (translucent --raised, the --chrome-filter blur, the --glass-rim);
   enterprise keeps the calm popover. `portal={false}` renders it in place. */
const popoverSurface =
  'z-50 w-72 max-w-[calc(100vw-1rem)] rounded-md border border-solid border-border bg-overlay p-3 text-fg [box-shadow:var(--elev-2)] glass-chrome focus-visible:outline-none forced-colors:border-[CanvasText]';

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> & { portal?: boolean }
>(({ className, align = 'start', sideOffset = 4, portal = true, ...props }, ref) => {
  const content = (
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn(popoverSurface, className)}
      {...props}
    />
  );
  return portal ? <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal> : content;
});
PopoverContent.displayName = 'PopoverContent';

export { Popover, PopoverAnchor, PopoverContent, PopoverTrigger };
