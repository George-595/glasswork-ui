import { Separator as SeparatorPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../../lib/cn';

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorPrimitive.Root
    ref={ref}
    decorative={decorative}
    orientation={orientation}
    className={cn(
      'shrink-0 bg-border-strong',
      orientation === 'horizontal' ? 'h-px w-full' : 'h-[18px] w-px',
      className,
    )}
    {...props}
  />
));
Separator.displayName = 'Separator';

export { Separator };
