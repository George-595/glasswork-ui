import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

/* LoadingRegion wraps a page's skeleton while its data loads. The skeleton
   shapes are decorative (aria-hidden). The group is named "Loading <thing>" and
   marked aria-busy; a separate polite status says the same in words (a busy
   region would suppress its own announcements). Moved here from base-app. */
export interface LoadingRegionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** What is loading, e.g. "transactions". Read as "Loading transactions". */
  label: string;
  children: ReactNode;
}

export function LoadingRegion({ label, children, className, ...props }: LoadingRegionProps) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a loading region is not a form fieldset
    <div
      {...props}
      role="group"
      aria-busy="true"
      aria-label={`Loading ${label}`}
      className={cn('ui-loading-region flex flex-col gap-3', className)}
    >
      <span role="status" className="ui-sr-only">
        Loading {label}…
      </span>
      {children}
    </div>
  );
}
