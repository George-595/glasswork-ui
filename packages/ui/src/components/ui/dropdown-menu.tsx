import {
  MenuContent,
  MenuItem,
  Menu as MenuRoot,
  MenuSeparator,
  MenuTrigger,
} from '@ui-sdk/react/menu';
import * as React from 'react';
import { cn } from '../../lib/cn';

/* The menu parts on Vercel's UI SDK (@ui-sdk/react/menu), on our tokens. The
   SDK gives the roles, roving focus, Up/Down (wrapping with `loop`),
   Home/End, type-ahead, Esc back to the trigger, an outside press, Tab and
   focus leaving to close, and ArrowUp on the trigger to open on the last
   item. It renders the content in the browser's top layer, in place, so there
   is no portal and an open menu is in server-rendered HTML as it is. */
const DropdownMenu = MenuRoot;
const DropdownMenuTrigger = MenuTrigger;

/* The menu surface. In the glass skin the tokens make it the glass material
   (translucent --raised, the --chrome-filter blur, the --glass-rim);
   enterprise keeps the calm popover. Menu lays LiquidGlass over it too. */
const menuSurface =
  'z-50 m-0 min-w-[8rem] overflow-hidden rounded-md border border-solid border-border bg-overlay p-1 text-fg [box-shadow:var(--elev-2)] glass-chrome forced-colors:border-[CanvasText]';

const DropdownMenuContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof MenuContent>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <MenuContent
    ref={ref}
    sideOffset={sideOffset}
    className={cn(menuSurface, className)}
    {...props}
  />
));
DropdownMenuContent.displayName = 'DropdownMenuContent';

const DropdownMenuItem = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof MenuItem>
>(({ className, ...props }, ref) => (
  <MenuItem
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-xs px-2 py-1.5 text-[13px] text-fg outline-none data-highlighted:bg-hover focus-visible:[box-shadow:var(--ring-inset)] data-checked:bg-selected data-checked:font-semibold data-disabled:pointer-events-none data-disabled:text-disabled-fg',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

const DropdownMenuSeparator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof MenuSeparator>
>(({ className, ...props }, ref) => (
  <MenuSeparator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-border-strong', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
