import { Switch as SwitchPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../../lib/cn';

/* shadcn's switch on our tokens: a 36x20 track (24px target with its
   margin) and a 14px thumb. The off track keeps a >= 3:1 boundary
   (border-border-input); on, it fills with the primary role. In the glass skin the
   tokens make the off track glass (translucent sunken fill, blur, rim) and
   the on track a lit glass pill (the same roles, differently valued). Forced
   colours paint it with system colours. */
const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer relative my-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-pill border border-solid border-border-input bg-sunken p-0 [box-shadow:var(--elev-0)] transition-[background-color,border-color] duration-(--dur-base) ease-(--ease-out) not-disabled:data-[state=unchecked]:hover:border-fg-muted not-disabled:data-[state=checked]:hover:bg-primary-hover focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled not-disabled:data-[state=checked]:border-primary not-disabled:data-[state=checked]:bg-primary motion-reduce:transition-none',
      'forced-colors:[forced-color-adjust:none] forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:data-[state=checked]:border-[Highlight] forced-colors:data-[state=checked]:bg-[Highlight]',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        'pointer-events-none block size-3.5 translate-x-[2px] rounded-full bg-fg-muted data-[disabled]:bg-disabled-fg [box-shadow:var(--elev-1)] transition-transform duration-(--dur-base) ease-(--ease-spring) data-[state=checked]:translate-x-[18px] not-data-[disabled]:data-[state=checked]:bg-on-primary motion-reduce:transition-none',
        'forced-colors:bg-[CanvasText] forced-colors:data-[state=checked]:bg-[HighlightText]',
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

export { Switch };
