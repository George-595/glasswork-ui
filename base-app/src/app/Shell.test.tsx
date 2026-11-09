/* The shell through the real App: the command palette, the collapsible sidebar and mobile drawer,
   the keyboard shortcuts and their help, the document title, the appearance controls and the one
   Toaster. Tests whose names start with "a11y" are the axe pass over the shell with the palette
   closed and open, in every skin and mode. */
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { config } from '~/core/config';
import { hrefFor, navigate } from '~/core/router';
import { ThemeProvider } from '~/core/ui';
import { formatViolations, runAxe } from '~/test/axe';
import { changeValue, click, press } from '~/test/dom';
import { locationNow, setLocation } from '~/test/location';
import { mockApi, VIEWER } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import { App } from './App';
import { loadSignedIn } from './SignedInGate';

// The signed-in app is its own chunk (SignedInGate.tsx). The browser has it fetched before it hydrates;
// load it once up front so a test's first render finds it, instead of racing its first transform.
beforeAll(loadSignedIn);

function app() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  );
}

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
  vi.restoreAllMocks();
});

async function mount(hash: string, opts: Parameters<typeof render>[1] = {}) {
  setLocation(hrefFor(hash));
  view = await render(app(), opts);
  await flush(8);
  return view;
}

const searchButton = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
    b.textContent?.startsWith('Search…'),
  ) as HTMLButtonElement;
const palette = () => document.querySelector<HTMLElement>('.ui-palette');
const box = () =>
  document.querySelector<HTMLInputElement>('input[role="combobox"]') as HTMLInputElement;
const optionLabels = () =>
  Array.from(document.querySelectorAll('[role="option"]'), (o) => o.textContent ?? '');
const shell = () => document.querySelector('.ui-shell') as HTMLElement;

async function openPalette() {
  await click(searchButton());
  await flush(2);
}

describe('command palette in the shell', () => {
  it('opens from the top-bar button and from Ctrl+K, and Esc closes it and refocuses the button', async () => {
    mockApi();
    await mount('/');
    expect(palette()).toBeNull();

    searchButton().focus();
    await openPalette();
    expect(palette()).not.toBeNull();
    expect(document.activeElement).toBe(box());

    await press(box(), 'Escape');
    await flush(4);
    expect(palette()).toBeNull();
    expect(document.activeElement).toBe(searchButton());

    await press(document.body, 'k', { ctrlKey: true });
    await flush(2);
    expect(palette()).not.toBeNull();
  });

  it('lists every page an admin may open, filters, and Enter navigates', async () => {
    mockApi();
    await mount('/');
    await openPalette();
    const labels = optionLabels().join('|');
    for (const t of ['Home', 'Table', 'Graphs', 'Users', 'Settings', 'Audit log', 'Sign out']) {
      expect(labels).toContain(t);
    }
    await changeValue(box(), 'table');
    await flush(1);
    expect(optionLabels()[0]).toContain('Table');
    await press(box(), 'Enter');
    await flush(6);
    expect(locationNow()).toBe('/table');
    expect(palette()).toBeNull();
  });

  it('hides the admin pages from a viewer', async () => {
    mockApi({ user: VIEWER });
    await mount('/');
    await openPalette();
    const labels = optionLabels().join('|');
    expect(labels).toContain('Graphs');
    expect(labels).not.toContain('Audit log');
    expect(labels).not.toContain('Users');
  });

  it('switches skin and mode, and picks a glass backdrop', async () => {
    mockApi();
    await mount('/');
    const html = document.documentElement;

    await openPalette();
    await changeValue(box(), 'glass theme');
    await press(box(), 'Enter');
    await flush(3);
    expect(html.getAttribute('data-skin')).toBe('glass');

    await openPalette();
    await changeValue(box(), 'dark mode');
    await press(box(), 'Enter');
    await flush(3);
    expect(html.getAttribute('data-theme')).toBe('dark');

    await openPalette();
    await changeValue(box(), 'enterprise');
    await press(box(), 'Enter');
    await flush(3);
    expect(html.getAttribute('data-skin')).toBe('enterprise');

    await openPalette();
    await changeValue(box(), 'backdrop mesh');
    expect(optionLabels().length).toBeGreaterThan(0);
    await press(box(), 'Enter');
    await flush(3);
    expect(localStorage.getItem('ui-backdrop')).not.toBeNull();
    expect(html.getAttribute('data-skin')).toBe('glass');
  });
});

describe('sidebar and drawer', () => {
  it('collapses to the rail, remembers it across a remount, and `[` toggles it', async () => {
    mockApi();
    await mount('/');
    expect(shell().hasAttribute('data-collapsed')).toBe(false);

    await click(document.querySelector('.ui-sidebar-collapse') as HTMLElement);
    expect(shell().hasAttribute('data-collapsed')).toBe(true);
    expect(localStorage.getItem('app-sidebar-collapsed')).toBe('true');

    await view?.unmount();
    view = null;
    await mount('/');
    expect(shell().hasAttribute('data-collapsed')).toBe(true);

    await press(document.body, '[');
    expect(shell().hasAttribute('data-collapsed')).toBe(false);
    expect(localStorage.getItem('app-sidebar-collapsed')).toBe('false');
  });

  it('gives each rail icon a tooltip on the desktop layout only', async () => {
    mockApi();
    const original = window.matchMedia;
    window.matchMedia = ((query: string) =>
      ({
        matches: true,
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList) as typeof window.matchMedia;
    try {
      localStorage.setItem('app-sidebar-collapsed', 'true');
      await mount('/');
      const link = document.querySelector('.ui-sidebar a[href="/table"]') as HTMLElement;
      expect(link.hasAttribute('data-state')).toBe(true); // a Tooltip trigger
      expect(link.textContent).toBe('Table'); // still named, visually hidden by CSS
    } finally {
      window.matchMedia = original;
    }
    await view?.unmount();
    view = null;
    await mount('/');
    const plain = document.querySelector('.ui-sidebar a[href="/table"]') as HTMLElement;
    expect(plain.hasAttribute('data-state')).toBe(false);
  });

  it('the hamburger opens the navigation drawer, which Esc closes', async () => {
    mockApi();
    await mount('/');
    const menu = document.querySelector('.ui-topbar-menu') as HTMLElement;
    expect(menu.getAttribute('aria-label')).toBe('Navigation');
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    await click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect(shell().hasAttribute('data-drawer-open')).toBe(true);
    await press(document.body, 'Escape');
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
  });

  it('has a skip link that focuses main', async () => {
    mockApi();
    await mount('/');
    const skip = document.querySelector('a.ui-skip-link') as HTMLElement;
    await click(skip);
    expect(document.activeElement).toBe(document.getElementById('main'));
  });
});

describe('keyboard shortcuts', () => {
  it('g then h / t / g go to Home, Table and Graphs', async () => {
    mockApi();
    await mount('/admin/users');
    for (const [second, hash] of [
      ['t', '/table'],
      ['g', '/graphs'],
      ['h', '/'],
    ] as const) {
      await press(document.body, 'g');
      await press(document.body, second);
      await flush(4);
      expect(locationNow()).toBe(hash);
    }
  });

  it('a g that is more than a second old does not start a sequence', async () => {
    mockApi();
    await mount('/');
    const now = Date.now();
    const spy = vi.spyOn(Date, 'now');
    spy.mockReturnValue(now);
    await press(document.body, 'g');
    spy.mockReturnValue(now + 1500);
    await press(document.body, 't');
    await flush(2);
    expect(locationNow()).toBe('/');
  });

  it('does not fire while typing in a field, nor with a modifier held', async () => {
    mockApi();
    await mount('/');
    const field = document.createElement('input');
    document.body.append(field);
    field.focus();
    await press(field, 'g');
    await press(field, 't');
    await press(field, '[');
    await press(field, '?');
    await flush(2);
    expect(locationNow()).toBe('/');
    expect(shell().hasAttribute('data-collapsed')).toBe(false);
    expect(document.querySelector('dialog[open]')).toBeNull();
    field.remove();

    await press(document.body, 'g', { metaKey: true });
    await press(document.body, 't');
    await flush(2);
    expect(locationNow()).toBe('/');
  });

  it('does not fire inside contenteditable text', async () => {
    mockApi();
    await mount('/');
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    document.body.append(editor);
    await press(editor, '?');
    expect(document.querySelector('dialog[open]')).toBeNull();
    editor.remove();
  });

  it('? opens the help dialog listing the shortcuts as keys, and Close dismisses it', async () => {
    mockApi();
    await mount('/');
    await press(document.body, '?');
    await flush(2);
    const dialog = document.querySelector('dialog[open]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.querySelector('h2')?.textContent).toBe('Keyboard shortcuts');
    const text = dialog.textContent ?? '';
    for (const t of [
      'Open the command palette',
      'Go to Home',
      'Go to Table',
      'Go to Graphs',
      'Collapse or expand the sidebar',
      'Show this help',
    ]) {
      expect(text).toContain(t);
    }
    expect(dialog.querySelectorAll('kbd').length).toBeGreaterThanOrEqual(10);
    await click(dialog.querySelector('.ui-dialog-close') as HTMLElement);
    await flush(2);
    expect(document.querySelector('dialog[open]')).toBeNull();
  });
});

describe('top bar and page', () => {
  it('sets the document title from the page', async () => {
    mockApi();
    await mount('/table');
    const h1 = document.querySelector('h1')?.textContent;
    expect(h1).toBeTruthy();
    // the mock has two unread notifications, so the tab title carries the count
    expect(document.title).toBe(`(2) ${h1} · ${config.appName}`);
  });

  it('has no unread prefix when nothing is unread', async () => {
    mockApi({
      routes: { 'GET /api/notifications/unread-count': { body: { ok: true, unreadCount: 0 } } },
    });
    await mount('/table');
    const h1 = document.querySelector('h1')?.textContent;
    expect(document.title).toBe(`${h1} · ${config.appName}`);
  });

  it('groups the appearance controls and shows the user with an avatar', async () => {
    mockApi();
    await mount('/');
    const group = document.querySelector('[data-appearance-controls]') as HTMLElement;
    expect(group.querySelector('[role="radiogroup"][aria-label="Theme"]')).not.toBeNull();
    expect(group.querySelector('button[aria-label^="Switch to"]')).not.toBeNull();
    expect(document.querySelector('select')).toBeNull(); // no raw native select in the bar

    const glass = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]')).find(
      (r) => r.textContent === 'Glass',
    ) as HTMLElement;
    await click(glass);
    expect(document.documentElement.getAttribute('data-skin')).toBe('glass');

    expect(document.querySelector('.ui-avatar')).not.toBeNull();
  });

  it('shows the admin trail in the top bar for an admin page', async () => {
    mockApi();
    await mount('/admin/users');
    expect(document.querySelector('.ui-topbar-title')?.textContent).toBe('Admin / Users');
  });

  it('mounts one Toaster', async () => {
    mockApi();
    await mount('/');
    expect(document.querySelectorAll('.ui-toaster').length).toBe(1);
  });

  it('keeps one h1 and moves focus to main when the page changes', async () => {
    mockApi();
    await mount('/');
    await act(async () => navigate('/table'));
    await flush(8);
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(document.activeElement).toBe(document.getElementById('main'));
  });
});

describe('a11y shell with the command palette', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`closed · ${skin} · ${mode}`, async () => {
        mockApi();
        await mount('/', { skin, mode });
        expect(formatViolations(await runAxe(document.body))).toBe('');
      });

      // a whole-page axe pass is slow on a busy machine: allow it
      it(`open · ${skin} · ${mode}`, async () => {
        mockApi();
        await mount('/', { skin, mode });
        await openPalette();
        expect(palette()).not.toBeNull();
        expect(formatViolations(await runAxe(document.body))).toBe('');
      }, 90_000);

      it(`open, no matches · ${skin} · ${mode}`, async () => {
        mockApi();
        await mount('/', { skin, mode });
        await openPalette();
        await changeValue(box(), 'zzzz');
        expect(formatViolations(await runAxe(document.body))).toBe('');
      }, 90_000);

      it(`help dialog · ${skin} · ${mode}`, async () => {
        mockApi();
        await mount('/', { skin, mode });
        await press(document.body, '?');
        await flush(2);
        expect(document.querySelector('dialog[open]')).not.toBeNull();
        expect(formatViolations(await runAxe(document.body))).toBe('');
      });
    }
  }
});
