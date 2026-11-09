import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import * as React from 'react';
import { Icon } from '../../icons/Icon';
import { cn } from '../../lib/cn';

const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>
>(({ className, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(
      'peer size-4 shrink-0 cursor-pointer rounded-[4px] border border-solid border-border-strong bg-canvas focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:text-disabled-fg data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-on-primary',
      className,
    )}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Icon name="check" size={12} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
));
Checkbox.displayName = 'Checkbox';

export { Checkbox };
