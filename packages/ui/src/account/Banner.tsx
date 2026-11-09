import type { HTMLAttributes, ReactNode } from 'react';
import { Button } from '../components/button';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';

/* Banner — an app-wide announcement bar for the top of the shell ("Scheduled maintenance at
   22:00", "You are offline"). Not a Notice: a Notice is a bordered box about the thing next to
   it, while a Banner spans the full width, has no corners, and can carry one `action` and a
   dismiss button. The tone (info, warning, danger) is a role on the rule under the bar and on
   the icon, and the words carry the meaning; an icon backs them up. `danger` is announced at
   once (role="alert"), the others politely (role="status"). `onDismiss` adds a Dismiss button
   (the page decides whether it stays dismissed). */
export type BannerTone = 'info' | 'warning' | 'danger';

export interface BannerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: BannerTone;
  /** A short bold lead-in before the message. */
  title?: ReactNode;
  /** One action: a Button or link (size sm). */
  action?: ReactNode;
  onDismiss?: () => void;
  dismissLabel?: string;
}

const RULE: Record<BannerTone, string> = {
  info: 'border-b-info',
  warning: 'border-b-warning',
  danger: 'border-b-danger',
};
const ICON: Record<BannerTone, { name: IconName; className: string }> = {
  info: { name: 'info', className: 'text-info' },
  warning: { name: 'alert', className: 'text-warning' },
  danger: { name: 'alert', className: 'text-danger' },
};

export function Banner({
  tone = 'info',
  title,
  action,
  onDismiss,
  dismissLabel = 'Dismiss announcement',
  role,
  className,
  children,
  ...props
}: BannerProps) {
  return (
    <div
      role={role ?? (tone === 'danger' ? 'alert' : 'status')}
      data-tone={tone}
      {...props}
      className={cn(
        'ui-banner flex w-full flex-wrap items-center gap-x-3 gap-y-1 border-0 border-b-[3px] border-solid bg-surface px-4 py-2 text-fg [font:var(--t-small)]',
        RULE[tone],
        className,
      )}
    >
      <Icon name={ICON[tone].name} size={16} className={cn('shrink-0', ICON[tone].className)} />
      <p className="m-0 min-w-0 flex-1">
        {title && <span className="font-semibold">{title} </span>}
        {children}
      </p>
      {action}
      {onDismiss && (
        <Button variant="ghost" size="icon" aria-label={dismissLabel} onClick={onDismiss}>
          <Icon name="x" size={16} />
        </Button>
      )}
    </div>
  );
}
