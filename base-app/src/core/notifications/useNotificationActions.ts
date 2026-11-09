import { useCallback } from 'react';
import { api, type Notification } from '~/core/api';
import { navigate } from '~/core/router';
import { setUnreadCount } from './unread-store';

/* What a person can do with a notification, shared by the bell and the /notifications page: mark
   one or all read (the server answers with the new count, which goes to the store), and open one
   (marks it read, then follows its link when it is an in-app path). */

/** A link the router can follow: "/admin/users", never another site or a protocol-relative "//". */
export function isInternalLink(link: string | null | undefined): link is string {
  return typeof link === 'string' && /^\/(?!\/)[^\s]*$/.test(link);
}

export interface NotificationActions {
  /** Resolves true when it worked. */
  markRead(id: string): Promise<boolean>;
  markAllRead(): Promise<boolean>;
  /** Marks it read (if unread) and goes to its link. `onRead` hears about the mark so a list can update. */
  open(notification: Notification, onRead?: (id: string) => void): Promise<void>;
}

export function useNotificationActions(): NotificationActions {
  const markRead = useCallback(async (id: string) => {
    try {
      setUnreadCount((await api.markNotificationRead(id)).unreadCount);
      return true;
    } catch {
      return false;
    }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      setUnreadCount((await api.markAllNotificationsRead()).unreadCount);
      return true;
    } catch {
      return false;
    }
  }, []);

  const open = useCallback(
    async (notification: Notification, onRead?: (id: string) => void) => {
      if (isInternalLink(notification.link)) navigate(notification.link);
      if (notification.readAt === null && (await markRead(notification.id))) {
        onRead?.(notification.id);
      }
    },
    [markRead],
  );

  return { markRead, markAllRead, open };
}
