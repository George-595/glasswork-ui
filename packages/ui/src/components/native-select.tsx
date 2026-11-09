import { forwardRef, type SelectHTMLAttributes } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { fieldClasses } from './input';

/* NativeSelect — shadcn's native-select: a styled native <select>. The
   browser's own listbox gives the best keyboard and screen-reader support,
   so forms use this, not a custom menu. Glass like Input in the glass skin;
   the open list is the browser's, on a solid surface. The browser's own
   arrow is hidden (it sits cramped against the border and ignores the
   theme); the kit's chevron takes its place with room either side, in the
   muted ink, and lets taps through to the select. */
export const NativeSelect = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function NativeSelect({ className, ...props }, ref) {
    const stretch = /(^|\s)w-full(\s|$)/.test(className ?? '');
    return (
      <span
        className={cn(
          'ui-select-wrap relative max-w-full items-center',
          stretch ? 'grid w-full' : 'inline-grid',
        )}
      >
        <select
          ref={ref}
          className={cn(
            'ui-select',
            fieldClasses,
            'col-start-1 row-start-1 cursor-pointer appearance-none py-[5px] ps-3 pe-9',
            '[&_option]:bg-surface-solid [&_option]:text-fg',
            className,
          )}
          {...props}
        />
        <Icon
          name="chevron-down"
          size={16}
          className="pointer-events-none col-start-1 row-start-1 me-3 justify-self-end text-fg-muted"
        />
      </span>
    );
  },
);
