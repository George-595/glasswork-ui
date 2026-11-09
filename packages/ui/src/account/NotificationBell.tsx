/* Adapted from BoardUI's notification-center (MIT, Mertcan Dundar Esmergul): header, list and
   footer of a notification panel. Rebuilt as a popover on our Popover, roles and icons.
   See THIRD_PARTY_NOTICES.md. */
import { forwardRef, type ReactNode, useEffect, useState } from 'react';
import { Button } from '../components/button';
import { ErrorState } from '../components/error-state';
import { Popover } from '../components/popover';
import { Skeleton } from '../components/skeleton';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import type { TimeInput } from '../lib/relative-time';
import { type NotificationEntry, NotificationList } from './NotificationList';

/* NotificationBell — an icon button with an unread count, opening a panel of notifications.

   The button's name carries the count ("Notifications, 3 unread"); the badge is a picture of it
   (9+ from ten, gone at zero). A polite status line announces a rise in the count, and, unless
   `pulse` is false, the badge rings once (a CSS keyframe that reduced motion removes). The
   panel is the kit's Popover: Esc closes it and returns focus to the bell; inside, Tab visits
   the controls and the arrow keys walk the rows (NotificationList). Props only: the page owns
   the data, the fetching and what a click does. */
export interface NotificationBellProps<T extends NotificationEntry = NotificationEntry> {
  items: readonly T[];
  unreadCount: number;
  onOpenChange?: (open: boolean) => void;
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  onSelect?: (item: T) => void;
  /** Where "View all" goes. */
  viewAllHref?: string;
  /** Draw "View all" with your router's link. Receives the className to apply. */
  renderLink?: (props: { href: string; className: string; children: ReactNode }) => ReactNode;
  loading?: boolean;
  /** A failed load; `onRetry` adds the Retry button. */
  error?: unknown;
  onRetry?: () => void;
  /** Ring the badge when the count rises (default true). Set false to never animate. */
  pulse?: boolean;
  group?: boolean;
  now?: TimeInput;
  /** Open on first render (showcase, tests). */
  defaultOpen?: boolean;
  open?: boolean;
  title?: string;
  className?: string;
}

const badgeText = (n: number) => (n > 9 ? '9+' : String(n));

const BellButton = forwardRef<
  HTMLButtonElement,
  { unreadCount: number; ringing: boolean; className?: string }
>(function BellButton({ unreadCount, ringing, className, ...props }, ref) {
  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
      className={cn('ui-bell relative min-h-8 min-w-8', className)}
      {...props}
    >
      <Icon name="bell" size={18} />
      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          data-testid="bell-badge"
          className="absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center"
        >
          {ringing && (
            <span className="absolute inset-0 rounded-pill bg-danger-solid motion-safe:animate-[ui-bell-ping_1s_var(--ease-out)_2] motion-reduce:hidden" />
          )}
          <span className="relative inline-flex h-4 min-w-4 items-center justify-center rounded-pill bg-danger-solid px-1 font-sans text-[10px] font-bold leading-none text-on-danger tabular-nums forced-colors:border forced-colors:border-[CanvasText]">
            {badgeText(unreadCount)}
          </span>
        </span>
      )}
    </Button>
  );
});

export function NotificationBell<T extends NotificationEntry = NotificationEntry>({
  items,
  unreadCount,
  onOpenChange,
  onMarkRead,
  onMarkAllRead,
  onSelect,
  viewAllHref,
  renderLink,
  loading,
  error,
  onRetry,
  pulse = true,
  group,
  now,
  defaultOpen,
  open,
  title = 'Notifications',
  className,
}: NotificationBellProps<T>) {
  const [seen, setSeen] = useState(unreadCount);
  const [ringing, setRinging] = useState(false);
  const [announce, setAnnounce] = useState('');

  // a rise in the count rings the badge once and is announced (state adjusted while rendering)
  if (unreadCount !== seen) {
    setSeen(unreadCount);
    if (unreadCount > seen) {
      setAnnounce(`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`);
      if (pulse) setRinging(true);
    }
  }
  useEffect(() => {
    if (!ringing) return;
    const timer = setTimeout(() => setRinging(false), 2200);
    return () => clearTimeout(timer);
  }, [ringing]);

  const linkClass =
    'inline-flex min-h-6 items-center rounded-sm text-link underline-offset-2 hover:underline focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] [font:var(--t-small)]';
  const viewAll = viewAllHref ? (
    renderLink ? (
      renderLink({ href: viewAllHref, className: linkClass, children: 'View all' })
    ) : (
      <a href={viewAllHref} className={linkClass}>
        View all
      </a>
    )
  ) : null;

  return (
    <>
      <Popover
        label={title}
        align="end"
        defaultOpen={defaultOpen}
        open={open}
        onOpenChange={onOpenChange}
        contentClassName="w-[min(24rem,calc(100vw-1rem))] p-0"
        customTrigger={
          <BellButton unreadCount={unreadCount} ringing={ringing} className={className} />
        }
      >
        <div className="flex flex-col">
          <div className="flex items-center justify-between gap-2 border-0 border-b border-solid border-border-subtle px-3 py-2">
            <h2 className="m-0 text-fg [font:var(--t-body)]">
              <span className="font-semibold">{title}</span>
            </h2>
            <Button
              variant="link"
              size="sm"
              aria-disabled={unreadCount === 0 || undefined}
              onClick={() => {
                if (unreadCount > 0) onMarkAllRead?.();
              }}
            >
              Mark all as read
            </Button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <div role="status" aria-busy="true" className="flex flex-col gap-3 p-3">
                <span className="ui-sr-only">Loading notifications…</span>
                {[0, 1, 2].map((n) => (
                  <Skeleton key={n} height={44} />
                ))}
              </div>
            ) : error ? (
              <div className="p-3">
                <ErrorState what="notifications" error={error} onRetry={onRetry} />
              </div>
            ) : (
              <NotificationList
                items={items}
                group={group}
                now={now}
                onSelect={onSelect}
                onMarkRead={onMarkRead}
                label={title}
              />
            )}
          </div>
          {viewAll && (
            <div className="flex justify-center border-0 border-t border-solid border-border-subtle px-3 py-2">
              {viewAll}
            </div>
          )}
        </div>
      </Popover>
      <span role="status" className="ui-sr-only">
        {announce}
      </span>
    </>
  );
}
