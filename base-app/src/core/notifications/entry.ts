import type { Notification, NotificationKind } from '~/core/api';
import type { IconName, NotificationTone } from '~/core/ui';

/* A notification as the kit's NotificationList wants it: the record plus the tone and icon its kind
   gets. The kit draws; the app decides what a kind looks like. */
const LOOK: Record<NotificationKind, { tone: NotificationTone; icon: IconName }> = {
  security: { tone: 'warning', icon: 'shield' },
  account: { tone: 'info', icon: 'user' },
  team: { tone: 'neutral', icon: 'users' },
  system: { tone: 'info', icon: 'bell' },
};

export type NotificationEntryData = Notification & { tone: NotificationTone; icon: IconName };

export function toEntry(n: Notification): NotificationEntryData {
  return { ...n, ...(LOOK[n.kind] ?? LOOK.system) };
}
