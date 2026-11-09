import { Tabs as TabsPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../../lib/cn';

/* shadcn tabs on our tokens: a sunken track with a raised pill on the active
   tab. In the glass skin the tokens make the track the glass material
   (blur, --glass-rim) and the pill a lifted glass chip (--raised fill,
   rim, highlight); enterprise keeps the calm shadcn look. The active tab is
   told apart by the pill's >= 3:1 outline and a heavier weight, not colour
   alone. */
const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-solid border-border bg-sunken p-[3px] [box-shadow:var(--elev-0)] forced-colors:border-[CanvasText]',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = 'TabsList';

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex min-h-7 pointer-coarse:min-h-12 cursor-pointer items-center justify-center whitespace-nowrap rounded-md border border-solid border-transparent bg-transparent px-3 py-1 font-sans text-[13px] font-medium text-fg-muted transition-[color,background-color,box-shadow] duration-(--dur-fast) ease-(--ease-out) hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring-inset)] active:bg-pressed disabled:pointer-events-none disabled:text-disabled-fg motion-reduce:transition-none',
      'data-[state=active]:border-brand data-[state=active]:bg-selected data-[state=active]:font-semibold data-[state=active]:text-fg',
      'forced-colors:data-[state=active]:[outline:2px_solid_Highlight]',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'rounded-sm pt-4 focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = 'TabsContent';

export { Tabs, TabsContent, TabsList, TabsTrigger };
