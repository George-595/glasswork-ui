# core/notifications

The client side of notifications, apart from the pages and the bell (those are `pages/notifications` and
`app/NotificationsMenu.tsx`).

- `unread-store.ts`: the unread count as a tiny store (`useUnreadCount`, `setUnreadCount`). It imports nothing
  from the app, because `Page` (core/ui) reads it for the tab title ("(3) Notifications · App") and the provider
  below imports core/ui.
- `NotificationsProvider`: loads the count on mount and on `resync`; on a live `notification` event takes the
  server's count and shows a kit toast (polite, no focus change); on `notifications.read` (another tab) takes the
  count. `useNotificationCount()` gives `{ unreadCount, refresh }`.
- `useNotificationActions()`: `markRead(id)`, `markAllRead()` (the answer's count goes to the store) and
  `open(notification)` (follows an in-app `link`, then marks it read). `isInternalLink` is the client's second
  check that a link is an in-app path.
- `toEntry(n)`: a notification plus the tone and icon its kind gets, in the shape the kit's `NotificationList` takes.

**May import:** `core/api`, `core/realtime`, `core/router`, `core/ui`. **Imported by:** `app/`, `pages/notifications`,
and `core/ui/Page.tsx` (only `unread-store.ts`).
