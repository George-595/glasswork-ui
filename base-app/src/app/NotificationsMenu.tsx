import { useCallback, useState } from 'react';
import { api, type Notification, type RealtimeNotification } from '~/core/api';
import { toEntry, useNotificationActions, useNotificationCount } from '~/core/notifications';
import { useEventStream } from '~/core/realtime';
import { hrefFor, Link } from '~/core/router';
import { NotificationBell } from '~/core/ui';

/* The bell in the top bar. The count comes from the shared store (loaded at sign-in, then live
   from the event stream); the list is fetched when the panel opens, so a closed bell costs
   nothing. While it is open a new notification is added to the top and a `resync` reloads it.
   Choosing a row marks it read and goes to its link; "View all" opens /notifications. */
const RECENT = 10;

type Load =
  | { status: 'idle'; items: Notification[] }
  | { status: 'loading'; items: Notification[] }
  | { status: 'error'; items: Notification[]; error: unknown };

export function NotificationsMenu() {
  const { unreadCount } = useNotificationCount();
  const actions = useNotificationActions();
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ status: 'idle', items: [] });

  const fetchRecent = useCallback(async () => {
    setLoad((l) => ({ status: 'loading', items: l.items }));
    try {
      const page = await api.notifications({ limit: RECENT });
      setLoad({ status: 'idle', items: page.notifications });
    } catch (error) {
      setLoad((l) => ({ status: 'error', items: l.items, error }));
    }
  }, []);

  useEventStream<RealtimeNotification>('notification', ({ notification }) => {
    setLoad((l) => ({
      ...l,
      items: [notification, ...l.items.filter((n) => n.id !== notification.id)].slice(0, RECENT),
    }));
  });
  useEventStream('resync', () => {
    if (open) void fetchRecent();
  });

  const markLocally = (ids: ReadonlySet<string> | 'all') => {
    const at = new Date().toISOString();
    setLoad((l) => ({
      ...l,
      items: l.items.map((n) =>
        n.readAt === null && (ids === 'all' || ids.has(n.id)) ? { ...n, readAt: at } : n,
      ),
    }));
  };

  return (
    <NotificationBell
      items={load.items.map(toEntry)}
      unreadCount={unreadCount}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) void fetchRecent();
      }}
      loading={load.status === 'loading' && load.items.length === 0}
      error={load.status === 'error' ? load.error : undefined}
      onRetry={() => void fetchRecent()}
      group
      onSelect={(item) => {
        setOpen(false);
        void actions.open(item, (id) => markLocally(new Set([id])));
      }}
      onMarkRead={(id) => {
        void actions.markRead(id).then((ok) => ok && markLocally(new Set([id])));
      }}
      onMarkAllRead={() => {
        void actions.markAllRead().then((ok) => ok && markLocally('all'));
      }}
      viewAllHref={hrefFor('/notifications')}
      renderLink={({ href, className, children }) => (
        <Link to={href.slice(1)} className={className} onClick={() => setOpen(false)}>
          {children}
        </Link>
      )}
    />
  );
}
