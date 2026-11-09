import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo } from 'react';
import { api, type RealtimeNotification, type RealtimeNotificationsRead } from '~/core/api';
import { useEventStream } from '~/core/realtime';
import { toast } from '~/core/ui';
import { setUnreadCount, useUnreadCount } from './unread-store';

/* NotificationsProvider — keeps the unread count true for the signed-in app.

   - Loads the count when it mounts, and again on `resync` (the stream came back from a gap; the
     server does not replay what was missed, so the count is asked for again).
   - On a live `notification` event: takes the count the server sent and shows a toast. The toast is
     the kit's polite, non-modal one: it does not take focus and is announced politely.
   - On `notifications.read` (read in another tab): takes the count.
   Mount it inside <RealtimeProvider>. The count itself lives in unread-store.ts. */
interface NotificationsContextValue {
  unreadCount: number;
  /** Asks the server for the count (after an action that may have changed it). */
  refresh(): Promise<void>;
}

const NotificationsContext = createContext<NotificationsContextValue>({
  unreadCount: 0,
  refresh: async () => {},
});

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const unreadCount = useUnreadCount();

  const refresh = useCallback(async () => {
    try {
      setUnreadCount((await api.unreadCount()).unreadCount);
    } catch {
      // keep the last count: the bell must not flicker to zero because of a network blip
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => setUnreadCount(0);
  }, [refresh]);

  useEventStream('resync', () => void refresh());
  useEventStream<RealtimeNotification>('notification', (data) => {
    setUnreadCount(data.unreadCount);
    toast.info(data.notification.title, {
      ...(data.notification.body ? { description: data.notification.body } : {}),
      duration: 6000,
    });
  });
  useEventStream<RealtimeNotificationsRead>('notifications.read', (data) => {
    setUnreadCount(data.unreadCount);
  });

  const value = useMemo(() => ({ unreadCount, refresh }), [unreadCount, refresh]);
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/** The unread count and a way to refresh it. Works (as zero) without the provider. */
export function useNotificationCount(): NotificationsContextValue {
  return useContext(NotificationsContext);
}
