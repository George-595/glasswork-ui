import { Separator as SeparatorRoot } from '@ui-sdk/react/separator';
import * as React from 'react';
import { cn } from '../../lib/cn';

const Separator = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof SeparatorRoot>
>(({ className, orientation = 'horizontal', decorative = true, ...props }, ref) => (
  <SeparatorRoot
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
