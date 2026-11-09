import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { Separator as SeparatorPrimitive } from './ui/separator';

/* Separator — the vendored shadcn separator (Radix). Decorative by default
   (role="none", hidden from assistive tech); pass decorative={false} when it
   divides content meaningfully, and it becomes role="separator". */
export interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'horizontal' | 'vertical';
  decorative?: boolean;
}

export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <SeparatorPrimitive
      orientation={orientation}
      decorative={decorative}
      className={cn(
        'ui-separator m-0 border-0',
        orientation === 'vertical' && 'h-auto min-h-[18px] self-stretch',
        className,
      )}
      {...props}
    />
  );
}
