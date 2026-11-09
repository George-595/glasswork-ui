// @vitest-environment jsdom
/* The account parts: NotificationBell, NotificationList, SessionList, AvatarPicker,
   PasswordStrength, Banner, and the pure helpers behind them (relative time, user-agent
   parsing, password scoring, avatar validation, notification grouping). Behaviour and keyboard
   for each, then an axe pass over all of them in every skin x mode. jsdom has no layout, so
   colour-contrast is off here (the token gate and `npm run check:a11y` hold contrast). */
import axe from 'axe-core';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccountShowcase } from '../fixture/ShowcaseAccount';
import { clearMaterialMaps } from '../src/glass';
import {
  AvatarPicker,
  Banner,
  describeUserAgent,
  formatRelativeTime,
  groupNotifications,
  NotificationBell,
  type NotificationEntry,
  NotificationList,
  PasswordStrength,
  type SessionEntry,
  SessionList,
  scorePassword,
  validateAvatarFile,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const g = globalThis as { ResizeObserver?: unknown };
  g.ResizeObserver ??= ResizeObserverStub;
  const proto = Element.prototype as Partial<{
    hasPointerCapture: (id: number) => boolean;
    releasePointerCapture: (id: number) => void;
    setPointerCapture: (id: number) => void;
    scrollIntoView: () => void;
  }>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
  const dlg = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;
  dlg.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  dlg.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    setTimeout(() => this.dispatchEvent(new Event('close')), 0);
  };
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  clearMaterialMaps();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-skin');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function render(node: ReactNode) {
  act(() => root.render(node));
  return host;
}
const $ = <E extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as E;
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const active = () => document.activeElement as HTMLElement;
const click = (el: Element) => act(() => (el as HTMLElement).click());
const byText = (text: string, sel = 'button') =>
  $$(sel).find((el) => el.textContent?.trim() === text) as HTMLElement;
function key(el: Element, k: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
}
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

const NOW = '2026-10-12T12:00:00Z';
const ITEMS: NotificationEntry[] = [
  { id: 'a', title: 'Invoice paid', body: 'Acme paid', createdAt: '2026-10-12T11:30:00Z' },
  { id: 'b', title: 'New sign-in', createdAt: '2026-10-11T10:00:00Z', tone: 'warning' },
  {
    id: 'c',
    title: 'Welcome',
    createdAt: '2026-09-01T10:00:00Z',
    readAt: '2026-09-01T11:00:00Z',
  },
];

describe('formatRelativeTime', () => {
  const at = (iso: string) => formatRelativeTime(iso, NOW);
  it('speaks in en-GB units', () => {
    expect(at('2026-10-12T11:59:40Z')).toBe('just now');
    expect(at('2026-10-12T11:55:00Z')).toBe('5 minutes ago');
    expect(at('2026-10-12T11:59:00Z')).toBe('1 minute ago');
    expect(at('2026-10-12T09:00:00Z')).toBe('3 hours ago');
    expect(at('2026-10-11T12:00:00Z')).toBe('yesterday');
    expect(at('2026-10-09T12:00:00Z')).toBe('3 days ago');
    expect(at('2026-09-28T12:00:00Z')).toBe('2 weeks ago');
  });
  it('falls back to a date from five weeks, and for the future', () => {
    expect(at('2026-08-01T12:00:00Z')).toBe('1 Aug 2026');
    expect(at('2026-12-25T12:00:00Z')).toBe('25 Dec 2026');
    expect(at('nonsense')).toBe('');
  });
});

describe('describeUserAgent', () => {
  const cases: Array<[string, string]> = [
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
      'Chrome on macOS',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
      'Edge on Windows',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0', 'Firefox on Linux'],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
      'Safari on iOS',
    ],
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
      'Safari on macOS',
    ],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
      'Chrome on Android',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
      'Opera on Windows',
    ],
    [
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36',
      'Chrome on Linux',
    ],
    ['curl/8.7.1', 'curl'],
    ['', 'Unknown device'],
  ];
  for (const [ua, label] of cases) {
    it(`${label}`, () => expect(describeUserAgent(ua).label).toBe(label));
  }
  it('survives null and gibberish, and tells phones from computers', () => {
    expect(describeUserAgent(null).label).toBe('Unknown device');
    expect(describeUserAgent('zzz').label).toBe('Unknown device');
    expect(describeUserAgent('(Windows)').label).toBe('Unknown browser on Windows');
    expect(describeUserAgent(cases[3]?.[0]).kind).toBe('phone');
    expect(describeUserAgent(cases[0]?.[0]).kind).toBe('computer');
  });
});

describe('scorePassword', () => {
  it('scores length first, then variety', () => {
    expect(scorePassword('').score).toBe(0);
    expect(scorePassword('abc').score).toBe(1);
    expect(scorePassword('abcdefghij').score).toBe(1);
    expect(scorePassword('abcdefghijklmn').score).toBe(2);
    expect(scorePassword('Abcdefghij1').score).toBe(3);
    expect(scorePassword('Abcdefghij1!xyz').score).toBe(4);
    expect(scorePassword('correct horse battery staple').score).toBe(4);
    expect(scorePassword('correcthorsebatterystaple').score).toBe(3);
  });
  it('marks common and repeated passwords weak whatever their length', () => {
    expect(scorePassword('password123').score).toBe(1);
    expect(scorePassword('aaaaaaaaaaaaaaaaaaaa').score).toBe(1);
    expect(scorePassword('aaaaaaaaaaaaaaaaaaaa').hint).toMatch(/common or repeated/);
  });
  it('reports each requirement and a hint, and honours minLength', () => {
    const r = scorePassword('Ab1', 12);
    expect(r.checks).toEqual({
      length: false,
      lower: true,
      upper: true,
      number: true,
      symbol: false,
    });
    expect(r.hint).toBe('Use at least 12 characters.');
    expect(scorePassword('Abcdefghijkl', 12).checks.length).toBe(true);
    expect(scorePassword('Abcdefghij1!xyzqwer').hint).toBe('');
  });
});

describe('validateAvatarFile', () => {
  const f = (type: string, size: number, name = 'me.png') => ({ type, size, name });
  it('accepts png, jpeg and webp under the limit', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(validateAvatarFile(f(t, 1000))).toBeNull();
    }
  });
  it('says why it refuses', () => {
    expect(validateAvatarFile(f('image/gif', 10, 'a.gif'))).toBe(
      'a.gif is not a PNG, JPEG or WebP image.',
    );
    expect(validateAvatarFile(f('image/png', 3 * 1024 * 1024))).toBe(
      'me.png is too large. The limit is 2 MB.',
    );
    expect(validateAvatarFile(f('image/png', 0))).toBe('me.png is empty.');
    expect(validateAvatarFile(f('image/png', 600_000), 500_000)).toMatch(/limit is 0.5 MB/);
  });
});

describe('groupNotifications', () => {
  it('splits by calendar day into Today / Yesterday / Earlier, keeping order and dropping empties', () => {
    const groups = groupNotifications(ITEMS, NOW, 'UTC');
    expect(groups.map((g) => [g.name, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['a']],
      ['Yesterday', ['b']],
      ['Earlier', ['c']],
    ]);
    expect(groupNotifications([ITEMS[0] as NotificationEntry], NOW, 'UTC').length).toBe(1);
  });
});

describe('NotificationList', () => {
  it('shows an unread item with more than colour, and a read one without', () => {
    render(<NotificationList items={ITEMS} now={NOW} onMarkRead={() => {}} />);
    const rows = $$('li.ui-notification');
    expect(rows.length).toBe(3);
    expect(rows[0]?.textContent).toContain('Unread:');
    expect(rows[0]?.querySelector('time')?.textContent).toBe('30 minutes ago');
    expect(rows[0]?.querySelector('time')?.getAttribute('dateTime')).toBe(
      '2026-10-12T11:30:00.000Z',
    );
    expect(rows[2]?.textContent).not.toContain('Unread');
    expect(rows[2]?.querySelector('[aria-label^="Mark as read"]')).toBeNull();
    // the body is clamped to two lines
    expect(rows[0]?.querySelector('.line-clamp-2')?.textContent).toBe('Acme paid');
  });
  it('selects on click and Enter (a real button), and marks one read without selecting', () => {
    const onSelect = vi.fn<(...args: unknown[]) => void>();
    const onMarkRead = vi.fn<(...args: unknown[]) => void>();
    render(
      <NotificationList items={ITEMS} now={NOW} onSelect={onSelect} onMarkRead={onMarkRead} />,
    );
    click($$('[data-notification-select]')[1] as HTMLElement);
    expect(onSelect).toHaveBeenCalledWith(ITEMS[1]);
    click($('[aria-label="Mark as read: Invoice paid"]'));
    expect(onMarkRead).toHaveBeenCalledWith('a');
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
  it('walks the rows with the arrow keys, Home and End', () => {
    render(<NotificationList items={ITEMS} now={NOW} />);
    const rows = $$('[data-notification-select]');
    act(() => rows[0]?.focus());
    key(active(), 'ArrowDown');
    expect(active()).toBe(rows[1]);
    key(active(), 'End');
    expect(active()).toBe(rows[2]);
    key(active(), 'ArrowDown');
    expect(active()).toBe(rows[2]);
    key(active(), 'ArrowUp');
    expect(active()).toBe(rows[1]);
    key(active(), 'Home');
    expect(active()).toBe(rows[0]);
  });
  it('groups under headings when asked, and says when it is empty', () => {
    render(<NotificationList items={ITEMS} now={NOW} group timeZone="UTC" />);
    expect(
      $$('ul')
        .map((u) => u.getAttribute('aria-labelledby'))
        .filter(Boolean).length,
    ).toBe(3);
    expect(host.textContent).toContain('Yesterday');
    render(<NotificationList items={[]} />);
    expect(host.textContent).toContain("You're all caught up");
    expect($$('li').length).toBe(0);
  });
});

describe('NotificationBell', () => {
  const bell = () => $<HTMLButtonElement>('button.ui-bell');
  const badge = () => $('[data-testid="bell-badge"]');
  it('names itself with the count and caps the badge at 9+', () => {
    render(<NotificationBell items={[]} unreadCount={3} />);
    expect(bell().getAttribute('aria-label')).toBe('Notifications, 3 unread');
    expect(badge().textContent).toBe('3');
    expect(badge().getAttribute('aria-hidden')).toBe('true');
    render(<NotificationBell items={[]} unreadCount={12} />);
    expect(badge().textContent).toBe('9+');
    render(<NotificationBell items={[]} unreadCount={0} />);
    expect(badge()).toBeNull();
    expect(bell().getAttribute('aria-label')).toBe('Notifications');
  });
  it('opens a panel with the header, the list and View all; Escape closes and returns focus', async () => {
    const onOpenChange = vi.fn<(...args: unknown[]) => void>();
    const onMarkAllRead = vi.fn<(...args: unknown[]) => void>();
    render(
      <NotificationBell
        items={ITEMS}
        unreadCount={2}
        now={NOW}
        viewAllHref="/notifications"
        onOpenChange={onOpenChange}
        onMarkAllRead={onMarkAllRead}
      />,
    );
    act(() => bell().focus());
    click(bell());
    await flush();
    expect(onOpenChange).toHaveBeenCalledWith(true);
    const panel = $('[role="dialog"]');
    expect(panel.getAttribute('aria-label')).toBe('Notifications');
    expect(panel.textContent).toContain('Invoice paid');
    expect(panel.querySelector('a')?.getAttribute('href')).toBe('/notifications');
    click(byText('Mark all as read'));
    expect(onMarkAllRead).toHaveBeenCalledTimes(1);
    key(active(), 'Escape');
    await flush();
    expect($('[role="dialog"]')).toBeNull();
    expect(active()).toBe(bell());
  });
  it('lets the page draw View all with its router link', async () => {
    render(
      <NotificationBell
        items={ITEMS}
        unreadCount={1}
        defaultOpen
        viewAllHref="/n"
        renderLink={({ href, className, children }) => (
          <a data-router href={href} className={className}>
            {children}
          </a>
        )}
      />,
    );
    await flush();
    expect($('a[data-router]').textContent).toBe('View all');
  });
  it('does nothing for Mark all as read at zero (aria-disabled), and shows loading and error', async () => {
    const onMarkAllRead = vi.fn<(...args: unknown[]) => void>();
    render(
      <NotificationBell
        items={[]}
        unreadCount={0}
        defaultOpen
        onMarkAllRead={onMarkAllRead}
        loading
      />,
    );
    await flush();
    const mark = byText('Mark all as read');
    expect(mark.getAttribute('aria-disabled')).toBe('true');
    click(mark);
    expect(onMarkAllRead).not.toHaveBeenCalled();
    expect($('[role="dialog"]').textContent).toContain('Loading notifications');
    render(
      <NotificationBell items={[]} unreadCount={0} defaultOpen error="Boom" onRetry={() => {}} />,
    );
    await flush();
    expect($('[role="dialog"] [role="alert"]').textContent).toContain('Boom');
  });
  it('announces a rise in the count and rings the badge, unless pulse is off', () => {
    vi.useFakeTimers();
    render(<NotificationBell items={[]} unreadCount={1} />);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('');
    render(<NotificationBell items={[]} unreadCount={2} />);
    expect(host.querySelector('[role="status"]')?.textContent).toBe('2 unread notifications');
    expect(badge().querySelectorAll('span').length).toBe(2);
    act(() => {
      vi.advanceTimersByTime(2500);
    });
    expect(badge().querySelectorAll('span').length).toBe(1);
    render(<NotificationBell items={[]} unreadCount={3} pulse={false} />);
    expect(badge().querySelectorAll('span').length).toBe(1);
  });
});

describe('SessionList', () => {
  const SESSIONS: SessionEntry[] = [
    {
      id: 's1',
      current: true,
      ip: '203.0.113.7',
      lastSeenAt: '2026-10-12T11:59:00Z',
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/130.0.0.0 Safari/537.36',
    },
    {
      id: 's2',
      ip: '198.51.100.23',
      lastSeenAt: '2026-10-12T09:00:00Z',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0',
    },
    { id: 's3', lastSeenAt: '2026-10-01T09:00:00Z', userAgent: null },
  ];
  it('lists each device, marks this one and gives it no Sign out', () => {
    render(
      <SessionList sessions={SESSIONS} now={NOW} onRevoke={() => {}} onRevokeOthers={() => {}} />,
    );
    const rows = $$('li.ui-session');
    expect(rows[0]?.textContent).toContain('Chrome on macOS');
    expect(rows[0]?.textContent).toContain('This device');
    expect(rows[0]?.textContent).toContain('203.0.113.7');
    expect(rows[0]?.querySelector('button')).toBeNull();
    expect(rows[1]?.textContent).toContain('Firefox on Linux');
    expect(rows[1]?.textContent).toContain('Last active 3 hours ago');
    expect(rows[2]?.textContent).toContain('Unknown device');
    expect(rows[1]?.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Sign out Firefox on Linux, 198.51.100.23',
    );
  });
  it('asks before signing one session out, and Cancel does nothing', async () => {
    const onRevoke = vi.fn<(...args: unknown[]) => void>();
    render(<SessionList sessions={SESSIONS} now={NOW} onRevoke={onRevoke} />);
    click($('[aria-label="Sign out Firefox on Linux, 198.51.100.23"]'));
    await flush();
    const dialog = $<HTMLDialogElement>('dialog');
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Sign out this session?');
    click(byText('Cancel', 'dialog button'));
    await flush();
    expect(onRevoke).not.toHaveBeenCalled();
    click($('[aria-label="Sign out Firefox on Linux, 198.51.100.23"]'));
    await flush();
    click(byText('Sign out', 'dialog button'));
    await flush();
    expect(onRevoke).toHaveBeenCalledWith('s2');
  });
  it('signs out all others after a confirm, and hides the button with no others', async () => {
    const onRevokeOthers = vi.fn<(...args: unknown[]) => void>();
    render(
      <SessionList
        sessions={SESSIONS}
        now={NOW}
        onRevoke={() => {}}
        onRevokeOthers={onRevokeOthers}
      />,
    );
    click(byText('Sign out all other sessions'));
    await flush();
    expect($('dialog').textContent).toContain('2 other sessions will be signed out');
    click(byText('Sign out', 'dialog button'));
    await flush();
    expect(onRevokeOthers).toHaveBeenCalledTimes(1);
    render(
      <SessionList
        sessions={[SESSIONS[0] as SessionEntry]}
        now={NOW}
        onRevokeOthers={onRevokeOthers}
      />,
    );
    expect(byText('Sign out all other sessions')).toBeUndefined();
  });
  it('shows a rejection in the dialog, and loading and error states', async () => {
    render(
      <SessionList
        sessions={SESSIONS}
        now={NOW}
        onRevoke={() => Promise.reject(new Error('Server said no'))}
      />,
    );
    click($('[aria-label="Sign out Firefox on Linux, 198.51.100.23"]'));
    await flush();
    click(byText('Sign out', 'dialog button'));
    await flush();
    expect($('dialog [role="alert"]').textContent).toBe('Server said no');
    render(<SessionList sessions={[]} loading />);
    expect(host.textContent).toContain('Loading sessions');
    render(<SessionList sessions={[]} error="Down" />);
    expect($('[role="alert"]').textContent).toContain('Down');
  });
});

describe('AvatarPicker', () => {
  const file = (name: string, type: string, size = 1000) => {
    const f = new File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };
  const choose = (f: File) => {
    const input = $<HTMLInputElement>('input[type=file]');
    act(() => {
      Object.defineProperty(input, 'files', { value: [f], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };
  beforeEach(() => {
    URL.createObjectURL = vi.fn<(f: Blob) => string>(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn<(u: string) => void>();
  });

  it('shows initials without a photo, accepts only images, and opens the picker from the button', () => {
    render(<AvatarPicker name="Ada Lovelace" />);
    expect($('[aria-label="Ada Lovelace"]').textContent).toBe('AL');
    expect($<HTMLInputElement>('input[type=file]').accept).toBe('image/png,image/jpeg,image/webp');
    expect(byText('Remove')).toBeUndefined();
    const open = vi.spyOn($<HTMLInputElement>('input[type=file]'), 'click');
    click(byText('Change photo'));
    expect(open).toHaveBeenCalled();
  });
  it('refuses a wrong type or a big file in words and sends nothing', () => {
    const onSave = vi.fn<(...args: unknown[]) => void>();
    render(<AvatarPicker name="Ada" onSave={onSave} />);
    choose(file('cat.gif', 'image/gif'));
    expect($('[role="alert"]').textContent).toBe('cat.gif is not a PNG, JPEG or WebP image.');
    choose(file('big.png', 'image/png', 5 * 1024 * 1024));
    expect($('[role="alert"]').textContent).toContain('too large');
    expect(byText('Save photo')).toBeUndefined();
    expect(onSave).not.toHaveBeenCalled();
  });
  it('previews a good file, saves it on confirm, and Cancel puts focus back', async () => {
    const onSave = vi.fn<(...args: unknown[]) => void>();
    render(<AvatarPicker name="Ada" onSave={onSave} />);
    const picked = file('me.png', 'image/png');
    choose(picked);
    expect($('.ui-avatar img').getAttribute('src')).toBe('blob:preview');
    expect($('[role="status"]').textContent).toContain('Photo chosen: me.png');
    click(byText('Save photo'));
    expect(onSave).toHaveBeenCalledWith(picked);
    click(byText('Cancel'));
    await flush();
    expect($('.ui-avatar img')).toBeNull();
    expect(active()).toBe(byText('Change photo'));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview');
  });
  it('shows progress while uploading with the controls inert, and the server error', () => {
    render(
      <AvatarPicker
        name="Ada"
        src="/a.png"
        onRemove={() => {}}
        uploading
        progress={40}
        error="Nope"
      />,
    );
    const bar = $('[role="progressbar"]');
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(bar.getAttribute('aria-label')).toBe('Uploading photo');
    expect(byText('Change photo').hasAttribute('disabled')).toBe(true);
    expect(byText('Remove').hasAttribute('disabled')).toBe(true);
    expect($('[role="alert"]').textContent).toContain('Nope');
  });
  it('removes a saved photo', () => {
    const onRemove = vi.fn<(...args: unknown[]) => void>();
    render(<AvatarPicker name="Ada" src="/a.png" onRemove={onRemove} />);
    click(byText('Remove'));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });
  it('drops the preview when an upload ends without an error', async () => {
    const onSave = vi.fn<(...args: unknown[]) => void>();
    render(<AvatarPicker name="Ada" onSave={onSave} />);
    choose(file('me.png', 'image/png'));
    render(<AvatarPicker name="Ada" onSave={onSave} uploading progress={90} />);
    render(<AvatarPicker name="Ada" src="/new.png" onSave={onSave} />);
    await flush();
    expect($('.ui-avatar img').getAttribute('src')).toBe('/new.png');
    expect($('[role="status"]').textContent).toBe('Photo saved.');
  });
});

describe('PasswordStrength', () => {
  it('draws the meter, the word and a hint; says nothing for an empty field', () => {
    render(<PasswordStrength value="" />);
    expect($('[role="meter"]').getAttribute('aria-valuenow')).toBe('0');
    expect($('[role="meter"]').getAttribute('aria-valuetext')).toBe('Nothing entered');
    expect($('[data-testid="strength-label"]').textContent).toBe('');
    render(<PasswordStrength value="abc" />);
    expect($('[role="meter"]').getAttribute('aria-valuenow')).toBe('1');
    expect($('[data-testid="strength-label"]').textContent).toBe('Weak');
    expect(host.textContent).toContain('Use at least 10 characters.');
    render(<PasswordStrength value="Abcdefghij1!xyz" />);
    expect($('[role="meter"]').getAttribute('aria-valuetext')).toBe('Strong');
    expect($$('[data-filled]').length).toBe(4);
  });
  it('lists the requirements with Met / Not met in words', () => {
    render(<PasswordStrength value="Abcdefghij1" requirements minLength={12} />);
    const items = $$('ul[aria-label="Password requirements"] li');
    expect(items.length).toBe(5);
    expect(items[0]?.textContent).toBe('At least 12 characters: not met');
    expect(items[1]?.textContent).toBe('A lower-case letter: met');
    expect(items[4]?.textContent).toBe('A symbol: not met');
  });
  it('announces politely, once, after typing pauses', () => {
    vi.useFakeTimers();
    const status = () => host.querySelector('[role="status"]')?.textContent;
    render(<PasswordStrength value="" debounceMs={500} />);
    render(<PasswordStrength value="a" debounceMs={500} />);
    render(<PasswordStrength value="ab" debounceMs={500} />);
    render(<PasswordStrength value="Abcdefghij1!xyz" debounceMs={500} />);
    expect(status()).toBe('');
    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(status()).toBe('');
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(status()).toBe('Password strength: Strong.');
    expect($('[role="status"]').getAttribute('aria-live')).toBeNull();
  });
});

describe('Banner', () => {
  it('announces danger at once and the rest politely, with an icon and the words', () => {
    render(<Banner tone="danger">You are offline.</Banner>);
    expect($('.ui-banner').getAttribute('role')).toBe('alert');
    render(
      <Banner tone="warning" title="Heads up.">
        Maintenance tonight.
      </Banner>,
    );
    expect($('.ui-banner').getAttribute('role')).toBe('status');
    expect($('.ui-banner').textContent).toBe('Heads up. Maintenance tonight.');
    expect($('.ui-banner svg')).not.toBeNull();
  });
  it('dismisses and carries an action', () => {
    const onDismiss = vi.fn<(...args: unknown[]) => void>();
    render(
      <Banner action={<button type="button">Details</button>} onDismiss={onDismiss}>
        New version.
      </Banner>,
    );
    expect(byText('Details')).toBeDefined();
    click($('[aria-label="Dismiss announcement"]'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

const AXE = {
  runOnly: {
    type: 'tag' as const,
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
  },
  rules: { 'color-contrast': { enabled: false } },
  resultTypes: ['violations' as const],
};
const describeViolations = (r: axe.AxeResults) =>
  r.violations
    .map((x) => `${x.id}: ${x.help}\n${x.nodes.map((nd) => `  ${nd.target.join(' ')}`).join('\n')}`)
    .join('\n');

describe('axe: every account part, every skin x mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(
          <main>
            <h1>Account</h1>
            <AccountShowcase />
          </main>,
        );
        await flush();
        expect(describeViolations(await axe.run(document.body, AXE))).toBe('');
      });
    }
  }
  it('the bell opened by a click, and a session dialog', async () => {
    render(
      <main>
        <h1>Account</h1>
        <NotificationBell items={ITEMS} unreadCount={2} now={NOW} viewAllHref="/n" group />
        <SessionList sessions={[{ id: 'x', lastSeenAt: NOW }]} now={NOW} onRevoke={() => {}} />
      </main>,
    );
    click($('button.ui-bell'));
    await flush();
    expect(describeViolations(await axe.run(document.body, AXE))).toBe('');
    key(active(), 'Escape');
    await flush();
    click($('[aria-label^="Sign out"]'));
    await flush();
    expect(describeViolations(await axe.run(document.body, AXE))).toBe('');
  });
});
