import type { HTMLAttributes, ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* Breadcrumbs — the APG breadcrumb pattern: a <nav aria-label="Breadcrumb">
   holding an ordered list of links, the last item being the current page
   (aria-current="page", not a link). The separators are decorative
   (aria-hidden), so a screen reader hears "list, 3 items" and the names only.
   Long trails wrap rather than scroll. */
export interface BreadcrumbItem {
  label: ReactNode;
  /** Omit on the last item (the current page). */
  href?: string;
}

export interface BreadcrumbsProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  items: readonly BreadcrumbItem[];
  /** The nav's name. Default "Breadcrumb". */
  label?: string;
}

export function Breadcrumbs({
  items,
  label = 'Breadcrumb',
  className,
  ...props
}: BreadcrumbsProps) {
  return (
    <nav {...props} aria-label={label} className={cn('ui-breadcrumbs', className)}>
      <ol className="m-0 flex list-none flex-wrap items-center gap-x-1.5 gap-y-1 p-0 font-sans text-[13px]">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: a trail is positional and static
              key={i}
              className="ui-breadcrumb inline-flex items-center gap-1.5"
            >
              {last || !item.href ? (
                <span
                  aria-current={last ? 'page' : undefined}
                  className={cn('font-medium', last ? 'text-fg' : 'text-fg-muted')}
                >
                  {item.label}
                </span>
              ) : (
                <a
                  href={item.href}
                  className="inline-flex min-h-6 items-center rounded-xs text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
                >
                  {item.label}
                </a>
              )}
              {!last && (
                <span aria-hidden="true" className="ui-breadcrumb-sep text-fg-subtle">
                  <Icon name="chevron-right" size={13} />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
