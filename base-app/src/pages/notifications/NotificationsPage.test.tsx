import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { NotificationsProvider } from '~/core/notifications';
import { RealtimeProvider } from '~/core/realtime';
import { Toaster, toast } from '~/core/ui';
import { formatViolations, runAxe } from '~/test/axe';
import { click, getAllByRole, getByRole } from '~/test/dom';
import { FakeEventSource } from '~/test/fakeEventSource';
import { setLocation } from '~/test/location';
import { MOCK_NOTIFICATIONS, MOCK_PREFERENCES, mockApi, VIEWER } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import NotificationsPage from './NotificationsPage';

let view: Rendered | null = null;
beforeEach(() => {
  FakeEventSource.all = [];
});
afterEach(async () => {
  await view?.unmount();
  view = null;
  act(() => toast.dismiss());
});

async function mount(
  opts: { skin?: 'enterprise' | 'glass'; mode?: 'light' | 'dark'; tab?: 'preferences' } = {},
) {
  setLocation(opts.tab ? `/notifications?tab=${opts.tab}` : '/notifications');
  view = await render(
    <AuthProvider>
      <RealtimeProvider createEventSource={(url) => new FakeEventSource(url)}>
        <NotificationsProvider>
          <main>
            <NotificationsPage />
          </main>
          <Toaster />
        </NotificationsProvider>
      </RealtimeProvider>
    </AuthProvider>,
    { skin: opts.skin ?? 'enterprise', mode: opts.mode ?? 'light' },
  );
  await flush(5);
}

const titles = () =>
  Array.from(
    document.querySelectorAll('.ui-notification [data-notification-select]'),
    (b) => b.textContent?.replace(/\s+/g, ' ') ?? '',
  );
const buttonNamed = (name: string | RegExp) => getByRole(document.body, 'button', name);
const switchNamed = (name: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('[role="switch"]')).find(
    (s) =>
      s.getAttribute('aria-labelledby') &&
      document.getElementById(s.getAttribute('aria-labelledby') ?? '')?.textContent === name,
  ) as HTMLElement;

describe('Inbox', () => {
  it('lists the notifications newest first, grouped by day, with the page title and tabs', async () => {
    mockApi();
    await mount();
    expect(getByRole(document.body, 'heading', 'Notifications')).toBeTruthy();
    expect(getAllByRole(document.body, 'tab').map((t) => t.textContent)).toEqual([
      'Inbox',
      'Preferences',
    ]);
    const list = titles();
    expect(list).toHaveLength(MOCK_NOTIFICATIONS.length);
    expect(list[0]).toContain('New sign-in to your account');
    expect(document.title).toContain('Notifications');
  });

  it('filters to unread through the API', async () => {
    const api = mockApi();
    await mount();
    await click(getByRole(document.body, 'radio', 'Unread'));
    await flush(3);
    expect(api.calls.filter((c) => c === 'GET /api/notifications').length).toBe(2);
    expect(titles()).toHaveLength(2);
  });

  it('says so when there is nothing', async () => {
    mockApi({
      routes: {
        'GET /api/notifications': { body: { ok: true, notifications: [], nextCursor: null } },
      },
    });
    await mount();
    expect(document.body.textContent).toContain("You're all caught up");
  });

  it('loads more with the cursor, without repeating a row', async () => {
    const calls: string[] = [];
    mockApi({
      routes: {
        'GET /api/notifications': (req) => {
          calls.push(req.query.toString());
          const cursor = req.query.get('cursor');
          return cursor
            ? { body: { ok: true, notifications: MOCK_NOTIFICATIONS.slice(1), nextCursor: null } }
            : {
                body: {
                  ok: true,
                  notifications: MOCK_NOTIFICATIONS.slice(0, 2),
                  nextCursor: 'c1',
                },
              };
        },
      },
    });
    await mount();
    expect(titles()).toHaveLength(2);
    await click(buttonNamed('Load more'));
    await flush(3);
    expect(calls[1]).toContain('cursor=c1');
    expect(titles()).toHaveLength(3);
    expect(document.body.textContent).not.toContain('Load more');
  });

  it('marks one read from its button, and all read', async () => {
    const api = mockApi({
      routes: { 'POST /api/notifications/ntf-1/read': { body: { ok: true, unreadCount: 1 } } },
    });
    await mount();
    await click(buttonNamed('Mark as read: New sign-in to your account'));
    await flush(3);
    expect(api.calls).toContain('POST /api/notifications/ntf-1/read');
    expect(document.querySelectorAll('.ui-notification[data-unread]')).toHaveLength(1);

    await click(buttonNamed('Mark all as read'));
    await flush(3);
    expect(api.calls).toContain('POST /api/notifications/read-all');
    expect(document.querySelectorAll('.ui-notification[data-unread]')).toHaveLength(0);
  });

  it('shows a live notification at the top', async () => {
    mockApi();
    await mount();
    await act(async () =>
      FakeEventSource.current.emit('notification', {
        notification: {
          id: 'ntf-new',
          kind: 'system',
          title: 'Just now',
          body: null,
          link: null,
          createdAt: MOCK_NOTIFICATIONS[0]?.createdAt,
          readAt: null,
        },
        unreadCount: 3,
      }),
    );
    await flush(2);
    expect(titles()[0]).toContain('Just now');
  });

  it('offers admins a test notification, and nobody else', async () => {
    const api = mockApi({
      routes: { 'POST /api/admin/notifications/test': { body: { ok: true } } },
    });
    await mount();
    await click(buttonNamed('Send me a test'));
    await flush(2);
    expect(api.calls).toContain('POST /api/admin/notifications/test');
    await view?.unmount();

    mockApi({ user: VIEWER });
    await mount();
    expect(document.body.textContent).not.toContain('Send me a test');
  });

  it('shows an error with a retry when the list cannot be loaded', async () => {
    mockApi({
      routes: {
        'GET /api/notifications': {
          status: 500,
          body: { ok: false, error: { code: 'x', message: 'down' } },
        },
      },
    });
    await mount();
    expect(document.querySelector('[role="alert"]')).not.toBeNull();
    expect(buttonNamed(/Retry|Try again/)).toBeTruthy();
  });
});

describe('Preferences', () => {
  it('opens from the address, one card per kind with in-app and email switches', async () => {
    mockApi();
    await mount({ tab: 'preferences' });
    const names = Array.from(
      document.querySelectorAll('[role="switch"]'),
      (s) => document.getElementById(s.getAttribute('aria-labelledby') ?? '')?.textContent,
    );
    expect(names).toEqual(
      MOCK_PREFERENCES.flatMap((p) => [`${p.label}: in the app`, `${p.label}: by email`]),
    );
    expect(switchNamed('Security: in the app').hasAttribute('disabled')).toBe(true);
    expect(switchNamed('Security: in the app').getAttribute('aria-checked')).toBe('true');
    expect(document.body.textContent).toContain('Always shown in the app');
  });

  it('shows a save bar for a change, saves only what changed, and confirms', async () => {
    const bodies: unknown[] = [];
    const api = mockApi({
      routes: {
        'PUT /api/notifications/preferences': (req) => {
          bodies.push(req.body);
          return {
            body: {
              ok: true,
              preferences: MOCK_PREFERENCES.map((p) =>
                p.kind === 'team' ? { ...p, email: true } : { ...p },
              ),
            },
          };
        },
      },
    });
    await mount({ tab: 'preferences' });
    expect(document.querySelector('[aria-label="Unsaved changes"]')).toBeNull();
    await click(switchNamed('Team: by email'));
    expect(document.querySelector('[aria-label="Unsaved changes"]')?.textContent).toContain(
      '1 unsaved preference',
    );
    await click(buttonNamed('Save preferences'));
    await flush(3);
    expect(api.calls).toContain('PUT /api/notifications/preferences');
    expect(bodies).toEqual([{ preferences: [{ kind: 'team', inApp: true, email: true }] }]);
    expect(document.querySelector('[aria-label="Unsaved changes"]')).toBeNull();
    expect(switchNamed('Team: by email').getAttribute('aria-checked')).toBe('true');
    expect(document.querySelector('.ui-toast')?.textContent).toContain('saved');
  });

  it('a switch flipped while a save is in flight stays a draft, not wiped by the save', async () => {
    const api = mockApi({
      routes: {
        'PUT /api/notifications/preferences': {
          body: {
            ok: true,
            preferences: MOCK_PREFERENCES.map((p) =>
              p.kind === 'team' ? { ...p, email: true } : { ...p },
            ),
          },
        },
      },
    });
    await mount({ tab: 'preferences' });
    await click(switchNamed('Team: by email'));
    api.hold();
    await click(buttonNamed('Save preferences'));
    await click(switchNamed('Account: by email'));
    api.release();
    await flush(3);
    expect(switchNamed('Team: by email').getAttribute('aria-checked')).toBe('true');
    expect(switchNamed('Account: by email').getAttribute('aria-checked')).toBe('false');
    expect(document.querySelector('[aria-label="Unsaved changes"]')?.textContent).toContain(
      '1 unsaved preference',
    );
  });

  it('discard puts the switches back', async () => {
    mockApi();
    await mount({ tab: 'preferences' });
    await click(switchNamed('Account: by email'));
    expect(switchNamed('Account: by email').getAttribute('aria-checked')).toBe('false');
    await click(buttonNamed('Discard'));
    expect(switchNamed('Account: by email').getAttribute('aria-checked')).toBe('true');
  });

  it('keeps the draft and says so when the save fails', async () => {
    mockApi({
      routes: {
        'PUT /api/notifications/preferences': {
          status: 500,
          body: { ok: false, error: { code: 'x', message: 'down' } },
        },
      },
    });
    await mount({ tab: 'preferences' });
    await click(switchNamed('System: by email'));
    await click(buttonNamed('Save preferences'));
    await flush(3);
    expect(document.querySelector('[aria-label="Unsaved changes"]')).not.toBeNull();
    expect(document.querySelector('.ui-toast')?.textContent).toContain('Could not save');
  });
});

describe('a11y', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`inbox and preferences have no axe violations · ${skin} · ${mode}`, async () => {
        mockApi();
        await mount({ skin, mode });
        expect(formatViolations(await runAxe())).toBe('');
        await view?.unmount();
        mockApi();
        await mount({ skin, mode, tab: 'preferences' });
        expect(formatViolations(await runAxe())).toBe('');
      });
    }
  }
});
