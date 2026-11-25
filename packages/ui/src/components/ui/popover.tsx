import { PopoverContent as PopoverPart, PopoverTrigger } from '@ui-sdk/react/popover';
import * as React from 'react';
import { cn } from '../../lib/cn';

export { Popover } from '@ui-sdk/react/popover';

/* The popover parts on Vercel's UI SDK (@ui-sdk/react/popover), on our tokens.
   The surface is the same as the menu's: in the glass skin the tokens make it
   the glass material (translucent --raised, the --chrome-filter blur, the
   --glass-rim); enterprise keeps the calm popover. The SDK renders the panel
   in place, in the browser's top layer, so it shows above a modal <dialog>
   too and needs no portal. `portal` is accepted and ignored, for callers
   written for the old portal. */
const popoverSurface =
  'z-50 m-0 w-72 max-w-[calc(100vw-1rem)] rounded-md border border-solid border-border bg-overlay p-3 text-fg [box-shadow:var(--elev-2)] glass-chrome focus-visible:outline-none forced-colors:border-[CanvasText]';

const PopoverContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof PopoverPart> & { portal?: boolean }
>(
  (
    { className, align = 'start', sideOffset = 4, collisionPadding = 8, portal: _portal, ...props },
    ref,
  ) => (
    <PopoverPart
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      collisionPadding={collisionPadding}
      className={cn(popoverSurface, className)}
      {...props}
    />
  ),
);
PopoverContent.displayName = 'PopoverContent';

export { PopoverContent, PopoverTrigger };
