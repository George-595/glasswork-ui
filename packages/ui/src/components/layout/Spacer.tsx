import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

/* Spacer — takes the room left in a Cluster, pushing what follows to the far end:
   <Cluster><Title/><Spacer/><Button/></Cluster>. Decorative. */
export function Spacer({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span aria-hidden="true" {...props} className={cn('ui-spacer min-w-0 flex-1', className)} />
  );
}
