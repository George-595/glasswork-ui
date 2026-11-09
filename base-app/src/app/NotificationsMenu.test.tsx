/* The bell through the real providers: the count loads and goes live, the list is fetched on open,
   choosing a row marks it read and navigates, a new notification toasts, a reconnect resyncs. */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotificationsProvider } from '~/core/notifications';
import { RealtimeProvider } from '~/core/realtime';
import { Toaster, toast } from '~/core/ui';
import { formatViolations, runAxe } from '~/test/axe';
import { click, getAllByRole, getByRole } from '~/test/dom';
import { FakeEventSource } from '~/test/fakeEventSource';
import { locationNow } from '~/test/location';
import { MOCK_NOTIFICATIONS, mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import { NotificationsMenu } from './NotificationsMenu';

let view: Rendered | null = null;
beforeEach(() => {
  FakeEventSource.all = [];
});
afterEach(async () => {
  await view?.unmount();
  view = null;
  act(() => toast.dismiss());
  vi.useRealTimers();
});

async function mount() {
  view = await render(
    <RealtimeProvider createEventSource={(url) => new FakeEventSource(url)}>
      <NotificationsProvider>
        <main>
          <NotificationsMenu />
        </main>
        <Toaster />
      </NotificationsProvider>
    </RealtimeProvider>,
  );
  await flush(4);
}

const bell = () => document.querySelector<HTMLButtonElement>('button[aria-label^="Notifications"]');
const panel = () => document.querySelector('.ui-popover, [role="dialog"]');
const rowTitles = () =>
  Array.from(
    document.querySelectorAll('.ui-notification'),
    (li) => li.querySelector('[data-notification-select]')?.textContent?.replace(/\s+/g, ' ') ?? '',
  );

describe('the bell', () => {
  it('shows the unread count from the API, in its name', async () => {
    mockApi();
    await mount();
    expect(bell()?.getAttribute('aria-label')).toBe('Notifications, 2 unread');
  });

  it('fetches the list only when opened, newest first', async () => {
    const api = mockApi();
    await mount();
    expect(api.calls).not.toContain('GET /api/notifications');
    await click(bell() as HTMLElement);
    await flush(3);
    expect(api.calls).toContain('GET /api/notifications');
    const titles = rowTitles();
    expect(titles).toHaveLength(3);
    expect(titles[0]).toContain('New sign-in to your account');
    expect(panel()).not.toBeNull();
  });

  it('marks a row read and goes to its link when chosen', async () => {
    const api = mockApi({
      routes: {
        'POST /api/notifications/ntf-2/read': { body: { ok: true, unreadCount: 1 } },
      },
    });
    await mount();
    await click(bell() as HTMLElement);
    await flush(3);
    const row = Array.from(
      document.querySelectorAll<HTMLElement>('[data-notification-select]'),
    ).find((b) => b.textContent?.includes('Invitation sent')) as HTMLElement;
    await click(row);
    await flush(3);
    expect(api.calls).toContain('POST /api/notifications/ntf-2/read');
    expect(locationNow()).toBe('/admin/users');
    expect(bell()?.getAttribute('aria-label')).toBe('Notifications, 1 unread');
  });

  it('marks everything read', async () => {
    const api = mockApi();
    await mount();
    await click(bell() as HTMLElement);
    await flush(3);
    await click(getByRole(document.body, 'button', 'Mark all as read'));
    await flush(3);
    expect(api.calls).toContain('POST /api/notifications/read-all');
    expect(bell()?.getAttribute('aria-label')).toBe('Notifications');
  });

  it('links "View all" to /notifications', async () => {
    mockApi();
    await mount();
    await click(bell() as HTMLElement);
    await flush(3);
    const link = getAllByRole(document.body, 'link', 'View all')[0];
    expect(link?.getAttribute('href')).toBe('/notifications');
  });

  it('a live notification raises the count and shows a toast', async () => {
    mockApi();
    await mount();
    await act(async () => FakeEventSource.current.emit('ready'));
    await act(async () =>
      FakeEventSource.current.emit('notification', {
        notification: {
          id: 'ntf-9',
          kind: 'system',
          title: 'Planned downtime',
          body: 'Saturday 02:00.',
          link: null,
          createdAt: MOCK_NOTIFICATIONS[0]?.createdAt,
          readAt: null,
        },
        unreadCount: 3,
      }),
    );
    await flush(2);
    expect(bell()?.getAttribute('aria-label')).toBe('Notifications, 3 unread');
    expect(document.querySelector('.ui-toast')?.textContent).toContain('Planned downtime');
    // polite: the toast did not take focus
    expect(document.activeElement?.closest('.ui-toast')).toBeNull();
  });

  it('puts a live notification at the top of an open list', async () => {
    mockApi();
    await mount();
    await click(bell() as HTMLElement);
    await flush(3);
    await act(async () =>
      FakeEventSource.current.emit('notification', {
        notification: {
          id: 'ntf-10',
          kind: 'team',
          title: 'Fresh one',
          body: null,
          link: null,
          createdAt: MOCK_NOTIFICATIONS[0]?.createdAt,
          readAt: null,
        },
        unreadCount: 3,
      }),
    );
    await flush(2);
    expect(rowTitles()[0]).toContain('Fresh one');
  });

  it('follows another tab reading everything', async () => {
    mockApi();
    await mount();
    await act(async () => FakeEventSource.current.emit('notifications.read', { unreadCount: 0 }));
    expect(bell()?.getAttribute('aria-label')).toBe('Notifications');
  });

  it('asks for the count again after the stream comes back from a gap', async () => {
    const api = mockApi();
    await mount();
    const before = api.calls.filter((c) => c === 'GET /api/notifications/unread-count').length;
    vi.useFakeTimers();
    await act(async () => FakeEventSource.current.fail());
    await act(async () => void vi.advanceTimersByTime(60_000));
    vi.useRealTimers();
    await act(async () => FakeEventSource.current.emit('ready'));
    await flush(3);
    const after = api.calls.filter((c) => c === 'GET /api/notifications/unread-count').length;
    expect(after).toBeGreaterThan(before);
  });

  it('a11y: the open panel has no axe violations', async () => {
    mockApi();
    await mount();
    await click(bell() as HTMLElement);
    await flush(3);
    const violations = await runAxe();
    expect(formatViolations(violations)).toBe('');
  });
});
