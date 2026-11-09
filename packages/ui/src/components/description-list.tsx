import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../lib/cn';

/* DescriptionList — term/detail pairs ("Status — Active"), the right markup
   for a record's fields in a detail drawer: a real <dl>, each pair wrapped in
   a <div> (valid in a dl), so a screen reader hears the terms as labels for
   their details. One column stacks term over detail on a hairline; two columns
   share the width and collapse to one on a narrow screen. */
export interface DescriptionItem {
  term: ReactNode;
  detail: ReactNode;
}

export interface DescriptionListProps extends Omit<HTMLAttributes<HTMLDListElement>, 'children'> {
  items: readonly DescriptionItem[];
  columns?: 1 | 2;
}

export function DescriptionList({ items, columns = 1, className, ...props }: DescriptionListProps) {
  return (
    <dl
      {...props}
      data-columns={columns}
      className={cn(
        'ui-description-list m-0 grid gap-x-6 gap-y-0',
        columns === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
        className,
      )}
    >
      {items.map((item, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: terms may be nodes; the list is positional
          key={i}
          className="ui-description-pair flex flex-col gap-0.5 border-0 border-b border-solid border-border-subtle py-2.5"
        >
          <dt className="m-0 font-sans text-[10.5px] leading-[1.3] font-medium tracking-[0.1em] text-fg-subtle uppercase">
            {item.term}
          </dt>
          <dd className="m-0 text-[13.5px] leading-normal text-fg">{item.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
