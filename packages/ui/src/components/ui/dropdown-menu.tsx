import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import * as React from 'react';
import { Icon } from '../../icons/Icon';
import { cn } from '../../lib/cn';

const DropdownMenu = DropdownMenuPrimitive.Root;
const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
const DropdownMenuGroup = DropdownMenuPrimitive.Group;
const DropdownMenuPortal = DropdownMenuPrimitive.Portal;
const DropdownMenuSub = DropdownMenuPrimitive.Sub;
const DropdownMenuRadioGroup = DropdownMenuPrimitive.RadioGroup;

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubTrigger> & { inset?: boolean }
>(({ className, inset, children, ...props }, ref) => (
  <DropdownMenuPrimitive.SubTrigger
    ref={ref}
    className={cn(
      'flex cursor-pointer select-none items-center gap-2 rounded-xs px-2 py-1.5 text-[13px] text-fg outline-none focus:bg-hover focus-visible:[box-shadow:var(--ring-inset)] data-[state=open]:bg-hover',
      inset && 'pl-8',
      className,
    )}
    {...props}
  >
    {children}
    <Icon name="chevron-right" size={13} className="ml-auto" />
  </DropdownMenuPrimitive.SubTrigger>
));
DropdownMenuSubTrigger.displayName = 'DropdownMenuSubTrigger';

/* The menu surface. In the glass skin the tokens make it the glass material
   (translucent --raised, the --chrome-filter blur, the --glass-rim);
   enterprise keeps the calm popover. Menu lays LiquidGlass over it too. */
const menuSurface =
  'z-50 min-w-[8rem] overflow-hidden rounded-md border border-solid border-border bg-overlay p-1 text-fg [box-shadow:var(--elev-2)] glass-chrome forced-colors:border-[CanvasText]';

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.SubContent ref={ref} className={cn(menuSurface, className)} {...props} />
));
DropdownMenuSubContent.displayName = 'DropdownMenuSubContent';

/* `portal={false}` renders the menu in place. Radix's portal mounts on the
   client only, so a menu that must appear in server-rendered HTML needs it. */
const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> & { portal?: boolean }
>(({ className, sideOffset = 4, portal = true, ...props }, ref) => {
  const content = (
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(menuSurface, className)}
      {...props}
    />
  );
  return portal ? <DropdownMenuPrimitive.Portal>{content}</DropdownMenuPrimitive.Portal> : content;
});
DropdownMenuContent.displayName = 'DropdownMenuContent';

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center gap-2 rounded-xs px-2 py-1.5 text-[13px] text-fg outline-none focus:bg-hover focus-visible:[box-shadow:var(--ring-inset)] data-[state=checked]:bg-selected data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:text-disabled-fg',
      inset && 'pl-8',
      className,
    )}
    {...props}
  />
));
DropdownMenuItem.displayName = 'DropdownMenuItem';

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => (
  <DropdownMenuPrimitive.CheckboxItem
    ref={ref}
    checked={checked}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-xs py-1.5 pl-8 pr-2 text-[13px] text-fg outline-none focus:bg-hover focus-visible:[box-shadow:var(--ring-inset)] data-[state=checked]:bg-selected data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:text-disabled-fg',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <Icon name="check" size={13} />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.CheckboxItem>
));
DropdownMenuCheckboxItem.displayName = 'DropdownMenuCheckboxItem';

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => (
  <DropdownMenuPrimitive.RadioItem
    ref={ref}
    className={cn(
      'relative flex cursor-pointer select-none items-center rounded-xs py-1.5 pl-8 pr-2 text-[13px] text-fg outline-none focus:bg-hover focus-visible:[box-shadow:var(--ring-inset)] data-[state=checked]:bg-selected data-[state=checked]:font-semibold data-[disabled]:pointer-events-none data-[disabled]:text-disabled-fg',
      className,
    )}
    {...props}
  >
    <span className="absolute left-2 flex size-3.5 items-center justify-center">
      <DropdownMenuPrimitive.ItemIndicator>
        <span aria-hidden="true" className="size-[7px] rounded-full bg-current" />
      </DropdownMenuPrimitive.ItemIndicator>
    </span>
    {children}
  </DropdownMenuPrimitive.RadioItem>
));
DropdownMenuRadioItem.displayName = 'DropdownMenuRadioItem';

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> & { inset?: boolean }
>(({ className, inset, ...props }, ref) => (
  <DropdownMenuPrimitive.Label
    ref={ref}
    className={cn(
      'px-2 py-1.5 text-[10.5px] uppercase tracking-[0.12em] text-fg-subtle',
      inset && 'pl-8',
      className,
    )}
    {...props}
  />
));
DropdownMenuLabel.displayName = 'DropdownMenuLabel';

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-border-strong', className)}
    {...props}
  />
));
DropdownMenuSeparator.displayName = 'DropdownMenuSeparator';

function DropdownMenuShortcut({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn('ml-auto font-mono text-[10.5px] tracking-widest text-fg-subtle', className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
};
