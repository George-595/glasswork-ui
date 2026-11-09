import type { HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';

/* EmptyState — what a list, table or panel shows when there is nothing in it
   yet: an icon, a title, one line of help and, usually, the action that fills
   it. It is content, not an alert, so it is announced by nobody; the title is
   a real heading (set `as` to fit the page outline). It sits on a dashed
   hairline, which reads in both skins and in forced colours; the icon is
   decorative because the title says it all. */
export type EmptyStateSize = 'sm' | 'md';

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** An icon name, or your own decorative node. */
  icon?: IconName | ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** The next step, e.g. a Button. */
  action?: ReactNode;
  size?: EmptyStateSize;
  /** Heading level of the title. Default h3. */
  as?: 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  size = 'md',
  as: Heading = 'h3',
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      {...props}
      data-size={size}
      className={cn(
        'ui-empty-state flex flex-col items-center text-center',
        'rounded-lg border border-dashed border-border-strong bg-transparent',
        size === 'sm' ? 'gap-1.5 px-4 py-5' : 'gap-2 px-6 py-10',
        className,
      )}
    >
      {icon && (
        <span
          className={cn(
            'ui-empty-state-icon inline-flex items-center justify-center rounded-full border border-solid border-border bg-sunken text-fg-subtle',
            size === 'sm' ? 'size-8' : 'size-11',
          )}
          aria-hidden="true"
        >
          {typeof icon === 'string' ? (
            <Icon name={icon as IconName} size={size === 'sm' ? 16 : 20} />
          ) : (
            icon
          )}
        </span>
      )}
      <Heading
        className={cn(
          'ui-empty-state-title m-0 font-sans font-semibold text-fg',
          size === 'sm' ? 'text-[13px] leading-[1.3]' : 'text-[15px] leading-[1.3]',
        )}
      >
        {title}
      </Heading>
      {description && (
        <p className="ui-empty-state-description m-0 max-w-[44ch] text-[13px] leading-normal text-fg-subtle">
          {description}
        </p>
      )}
      {action && <div className="ui-empty-state-action mt-2 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}
