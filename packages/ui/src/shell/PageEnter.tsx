import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/* PageEnter — a soft fade and a short rise when it mounts. Key it by the route
   (`<PageEnter key={route.id}>`) and each page change plays it once. Off under
   prefers-reduced-motion; `backwards` only holds the first frame, so nothing is left on the
   element afterwards (a lingering transform would trap fixed-position children). */
export function PageEnter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn('ui-page-enter', className)} />;
}
