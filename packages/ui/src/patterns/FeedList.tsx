import type { HTMLAttributes, ReactNode } from 'react';
import { Avatar } from '../components/avatar';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { hasTarget, ROW_INTERACTIVE, ROW_TARGET, renderTarget, type TargetProps } from './shared';

/* FeedList / FeedItem — an activity or timeline list: who or what (an avatar or an icon), a
   title, a line of meta (the actor, a <time>), and a trailing Badge. It is a real <ul> of
   <li>, so a screen reader announces "list, 5 items". Name the list with `aria-label` or
   `aria-labelledby`.

   An item with an `href`, `onClick` or `linkAs` becomes one link (or button) around its whole
   row, one tab stop with the title as its name; without one it is plain text. */
export interface FeedListProps extends HTMLAttributes<HTMLUListElement> {
  children?: ReactNode;
}

export function FeedList({ className, ...props }: FeedListProps) {
  return (
    <ul
      {...props}
      className={cn('ui-feed m-0 flex min-w-0 list-none flex-col gap-0.5 p-0', className)}
    />
  );
}

export interface FeedItemProps extends TargetProps {
  /** The main line. */
  title: ReactNode;
  /** The second line: an actor, a time, a place. */
  meta?: ReactNode;
  /** A person's name: draws their Avatar. */
  avatar?: string;
  /** An icon name or node, when it is not a person. Ignored when `avatar` is given. */
  icon?: IconName | ReactNode;
  /** At the end of the row: a Badge, an amount. */
  trailing?: ReactNode;
  className?: string;
}

export function FeedItem({
  title,
  meta,
  avatar,
  icon,
  trailing,
  className,
  ...target
}: FeedItemProps) {
  const interactive = hasTarget(target);
  const lead = avatar ? (
    <Avatar name={avatar} size="sm" />
  ) : icon ? (
    <span
      aria-hidden="true"
      className="ui-feed-icon inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-solid border-border bg-sunken text-fg-subtle"
    >
      {typeof icon === 'string' ? <Icon name={icon as IconName} size={15} /> : icon}
    </span>
  ) : null;

  return (
    <li className={cn('ui-feed-item min-w-0', className)}>
      {renderTarget(
        target,
        cn(ROW_TARGET, interactive && ROW_INTERACTIVE),
        <>
          {lead}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="[font:var(--t-small)] font-medium text-fg [overflow-wrap:anywhere]">
              {title}
            </span>
            {meta && <span className="[font:var(--t-small)] text-fg-muted">{meta}</span>}
          </span>
          {trailing && <span className="ml-auto shrink-0">{trailing}</span>}
        </>,
      )}
    </li>
  );
}
