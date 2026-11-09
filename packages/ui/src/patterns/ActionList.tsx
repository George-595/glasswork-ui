import type { HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { hasTarget, ROW_INTERACTIVE, ROW_TARGET, renderTarget, type TargetProps } from './shared';

/* ActionList / ActionItem — quick actions: a list of things to do next, each an icon, a title,
   a line saying what it does and a chevron. A real <ul>; each item is one link (`href`, or your
   router's link through `linkAs`) or one button (`onClick`), named by its title, with the
   description read after it. Put it in a Card or Panel under a Section heading, and name the
   list with `aria-labelledby` or `aria-label`. */
export interface ActionListProps extends HTMLAttributes<HTMLUListElement> {
  children?: ReactNode;
}

export function ActionList({ className, ...props }: ActionListProps) {
  return (
    <ul
      {...props}
      className={cn('ui-actions m-0 flex min-w-0 list-none flex-col gap-1 p-0', className)}
    />
  );
}

export interface ActionItemProps extends TargetProps {
  title: ReactNode;
  /** One line saying what it does. */
  description?: ReactNode;
  icon?: IconName | ReactNode;
  /** The trailing chevron. Default true. */
  chevron?: boolean;
  className?: string;
}

export function ActionItem({
  title,
  description,
  icon,
  chevron = true,
  className,
  ...target
}: ActionItemProps) {
  const interactive = hasTarget(target);
  return (
    <li className={cn('ui-action-item min-w-0', className)}>
      {renderTarget(
        target,
        cn(ROW_TARGET, interactive && ROW_INTERACTIVE),
        <>
          {icon && (
            <span
              aria-hidden="true"
              className="ui-action-icon inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-solid border-border bg-sunken text-fg"
            >
              {typeof icon === 'string' ? <Icon name={icon as IconName} size={16} /> : icon}
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="[font:var(--t-small)] font-medium text-fg">{title}</span>
            {description && (
              <span className="[font:var(--t-small)] text-fg-muted">{description}</span>
            )}
          </span>
          {chevron && interactive && (
            <Icon
              name="chevron-right"
              size={14}
              aria-hidden="true"
              className="shrink-0 text-fg-subtle"
            />
          )}
        </>,
      )}
    </li>
  );
}
