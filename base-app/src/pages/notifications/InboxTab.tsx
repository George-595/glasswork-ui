import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  type Notification,
  type NotificationsResponse,
  type RealtimeNotification,
} from '~/core/api';
import { useAuth } from '~/core/auth';
import { toEntry, useNotificationActions, useUnreadCount } from '~/core/notifications';
import { useEventStream } from '~/core/realtime';
import {
  Button,
  Card,
  Cluster,
  ErrorState,
  LoadingRegion,
  NotificationList,
  SegmentedControl,
  SkeletonText,
  Stack,
  toast,
} from '~/core/ui';

/* The inbox: the caller's notifications newest first, grouped by day, All or Unread. The first
   page loads on mount and when the filter changes; "Load more" follows the server's cursor. A live
   `notification` is added at the top, and a `resync` (the stream came back) or a read in another tab
   reloads the list quietly, keeping what is on screen until the answer lands. */
type Filter = 'all' | 'unread';
const PAGE_SIZE = 20;
const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
] as const;

interface ListState {
  /** Which filter this data answers; until it matches the chosen one the list shows as loading. */
  for: Filter | null;
  status: 'loading' | 'ready' | 'error';
  items: Notification[];
  next: string | null;
  more: boolean;
  error?: unknown;
}

export function InboxTab() {
  const { isAdmin } = useAuth();
  const unreadCount = useUnreadCount();
  const actions = useNotificationActions();
  const [filter, setFilter] = useState<Filter>('all');
  const [state, setState] = useState<ListState>({
    for: null,
    status: 'loading',
    items: [],
    next: null,
    more: false,
  });
  // Each fetch takes a number; only the latest may write its answer.
  const latest = useRef(0);

  /* Puts the answer for `which` into state, unless a newer fetch has started since. */
  const settle = useCallback(
    (
      turn: number,
      which: Filter,
      outcome: { page: NotificationsResponse } | { error: unknown },
    ) => {
      if (turn !== latest.current) return;
      if ('page' in outcome) {
        setState({
          for: which,
          status: 'ready',
          items: outcome.page.notifications,
          next: outcome.page.nextCursor,
          more: false,
        });
        return;
      }
      setState((s) => ({
        for: which,
        status: 'error',
        items: s.for === which ? s.items : [],
        next: s.for === which ? s.next : null,
        more: false,
        error: outcome.error,
      }));
    },
    [],
  );

  const load = useCallback(
    (which: Filter) => {
      const turn = ++latest.current;
      api.notifications({ unreadOnly: which === 'unread', limit: PAGE_SIZE }).then(
        (page) => settle(turn, which, { page }),
        (error: unknown) => settle(turn, which, { error }),
      );
    },
    [settle],
  );

  // The first page, and again whenever the filter changes.
  useEffect(() => {
    load(filter);
  }, [filter, load]);

  useEventStream<RealtimeNotification>('notification', ({ notification }) => {
    setState((s) =>
      s.status === 'ready'
        ? { ...s, items: [notification, ...s.items.filter((n) => n.id !== notification.id)] }
        : s,
    );
  });
  useEventStream('resync', () => load(filter));
  useEventStream('notifications.read', () => load(filter));

  async function loadMore() {
    if (!state.next || state.more) return;
    const cursor = state.next;
    setState((s) => ({ ...s, more: true }));
    try {
      const page = await api.notifications({
        cursor,
        unreadOnly: filter === 'unread',
        limit: PAGE_SIZE,
      });
      setState((s) => ({
        ...s,
        more: false,
        next: page.nextCursor,
        items: [
          ...s.items,
          ...page.notifications.filter((n) => !s.items.some((o) => o.id === n.id)),
        ],
      }));
    } catch {
      setState((s) => ({ ...s, more: false }));
      toast.error('Could not load more notifications.');
    }
  }

  const markLocally = (ids: ReadonlySet<string> | 'all') => {
    const at = new Date().toISOString();
    setState((s) => {
      const all = ids === 'all';
      const items = s.items
        .map((n) => (n.readAt === null && (all || ids.has(n.id)) ? { ...n, readAt: at } : n))
        // in the Unread view a notification that was just read leaves the list
        .filter((n) => filter === 'all' || n.readAt === null);
      return { ...s, items };
    });
  };

  async function sendTest() {
    try {
      await api.sendTestNotification();
    } catch {
      toast.error('Could not send the test notification.');
    }
  }

  // Data for another filter is not shown: the list reads as loading until its own answer lands.
  const view: ListState =
    state.for === filter
      ? state
      : { for: filter, status: 'loading', items: [], next: null, more: false };

  return (
    <Stack gap={4}>
      <Cluster justify="between" gap={3}>
        <SegmentedControl
          label="Show"
          size="sm"
          options={FILTERS}
          value={filter}
          onValueChange={(v) => setFilter(v as Filter)}
        />
        <Cluster gap={2}>
          {isAdmin && (
            <Button variant="outline" size="sm" onClick={() => void sendTest()}>
              Send me a test
            </Button>
          )}
          <Button
            variant="neutral"
            size="sm"
            disabled={unreadCount === 0}
            onClick={() => void actions.markAllRead().then((ok) => ok && markLocally('all'))}
          >
            Mark all as read
          </Button>
        </Cluster>
      </Cluster>

      {view.status === 'loading' && (
        <LoadingRegion label="notifications">
          <SkeletonText lines={5} />
        </LoadingRegion>
      )}
      {view.status === 'error' && view.items.length === 0 && (
        <ErrorState
          what="notifications"
          error={view.error}
          onRetry={() => {
            setState((s) => ({ ...s, for: null }));
            load(filter);
          }}
        />
      )}
      {(view.status === 'ready' || (view.status === 'error' && view.items.length > 0)) && (
        <Card>
          <NotificationList
            items={view.items.map(toEntry)}
            group
            label="Notifications"
            emptyTitle={filter === 'unread' ? 'Nothing unread' : "You're all caught up"}
            emptyDescription={
              filter === 'unread'
                ? 'Everything has been read.'
                : 'New notifications will appear here as they happen.'
            }
            onSelect={(item) => void actions.open(item, (id) => markLocally(new Set([id])))}
            onMarkRead={(id) =>
              void actions.markRead(id).then((ok) => ok && markLocally(new Set([id])))
            }
          />
        </Card>
      )}
      {view.next && (
        <Cluster justify="center">
          <Button
            variant="outline"
            aria-disabled={view.more || undefined}
            onClick={() => void loadMore()}
          >
            {view.more ? 'Loading…' : 'Load more'}
          </Button>
        </Cluster>
      )}
    </Stack>
  );
}
