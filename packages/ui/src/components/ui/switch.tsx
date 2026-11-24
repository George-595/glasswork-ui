import { Switch as SwitchRoot, SwitchThumb } from '@ui-sdk/react/switch';
import * as React from 'react';
import { cn } from '../../lib/cn';

/* The UI SDK switch on our tokens: a 36x20 track (24px target with its
   margin) and a 14px thumb. The off track keeps a >= 3:1 boundary
   (border-border-input); on, it fills with the primary role. In the glass skin the
   tokens make the off track glass (translucent sunken fill, blur, rim) and
   the on track a lit glass pill (the same roles, differently valued). Forced
   colours paint it with system colours. */
const Switch = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<typeof SwitchRoot>
>(({ className, ...props }, ref) => (
  <SwitchRoot
    ref={ref}
    className={cn(
      'peer relative my-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-pill border border-solid border-border-input bg-sunken p-0 [box-shadow:var(--elev-0)] transition-[background-color,border-color] duration-(--dur-base) ease-(--ease-out) not-disabled:data-unchecked:hover:border-fg-muted not-disabled:data-checked:hover:bg-primary-hover focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled not-disabled:data-checked:border-primary not-disabled:data-checked:bg-primary motion-reduce:transition-none',
      'forced-colors:[forced-color-adjust:none] forced-colors:border-[CanvasText] forced-colors:bg-[Canvas] forced-colors:data-checked:border-[Highlight] forced-colors:data-checked:bg-[Highlight]',
      className,
    )}
    {...props}
  >
    <SwitchThumb
      className={cn(
        'pointer-events-none block size-3.5 translate-x-[2px] rounded-full bg-fg-muted data-[disabled]:bg-disabled-fg [box-shadow:var(--elev-1)] transition-transform duration-(--dur-base) ease-(--ease-spring) data-checked:translate-x-[18px] not-data-[disabled]:data-checked:bg-on-primary motion-reduce:transition-none',
        'forced-colors:bg-[CanvasText] forced-colors:data-checked:bg-[HighlightText]',
      )}
    />
  </SwitchRoot>
));
Switch.displayName = 'Switch';

export { Switch };
