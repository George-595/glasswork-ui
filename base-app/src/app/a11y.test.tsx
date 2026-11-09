/* The shell's accessibility gate: every route, the sign-in page and the not-authorised page, in both
   skins and both modes, through the real App. Every test name starts with "a11y", so `npm run
   check:a11y` runs this file. */
import { act } from 'react';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { hrefFor } from '~/core/router';
import { ThemeProvider } from '~/core/ui';
import { formatViolations, runAxe } from '~/test/axe';
import { getByRole, press } from '~/test/dom';
import { setLocation } from '~/test/location';
import { mockApi, VIEWER } from '~/test/mockApi';
import { flush, render } from '~/test/render';
import { App } from './App';
import { NOT_FOUND_ROUTE, ROUTES, type RouteDef } from './routes';
import { loadSignedIn } from './SignedInGate';

const SKINS = ['enterprise', 'glass'] as const;
const MODES = ['light', 'dark'] as const;
const PAGES: readonly RouteDef[] = [...ROUTES, NOT_FOUND_ROUTE];

/* The app as main.tsx mounts it: the theme provider is what the shell's controls read, and the
   auth provider is what the gate reads. */
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

function isLoading(): boolean {
  return Array.from(document.querySelectorAll('[role="status"]')).some(
    (el) => el.textContent === 'Loading…',
  );
}

function isBusy(): boolean {
  return isLoading() || document.querySelector('[aria-busy="true"]') !== null;
}

/* The session and lazy pages resolve after a fetch or an import, so wait in short steps until
   nothing is loading. */
async function settle(): Promise<void> {
  for (let i = 0; i < 50 && isBusy(); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await flush(1);
  }
}

describe('a11y pages', () => {
  for (const route of PAGES) {
    for (const skin of SKINS) {
      for (const mode of MODES) {
        it(`${route.id} · ${skin} · ${mode}`, async () => {
          mockApi();
          setLocation(hrefFor(route.path));
          const view = await render(app(), { skin, mode });
          await settle();

          expect(isBusy()).toBe(false);
          expect(formatViolations(await runAxe(document.body))).toBe('');

          expect(document.querySelectorAll('h1')).toHaveLength(1);
          expect(document.querySelector('main#main')).not.toBeNull();

          const firstFocusable = document.querySelector<HTMLElement>(
            'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
          expect(firstFocusable?.classList.contains('ui-skip-link')).toBe(true);

          // The sidebar marks the current page; not-found and the account page (reached from the user
          // menu) are not in the sidebar, so nothing is marked.
          // Only links count: a page may show a breadcrumb trail (the kit page does), whose last
          // item is aria-current="page" too but is not a link.
          const inSidebar = ROUTES.includes(route) && route.group !== 'account';
          const expectedHref = inSidebar ? [hrefFor(route.path)] : [];
          const currentHrefs = Array.from(
            document.querySelectorAll('a[aria-current="page"]'),
            (el) => el.getAttribute('href'),
          );
          expect(currentHrefs).toEqual(expectedHref);

          await view.unmount();
        });
      }
    }
  }
});

describe('a11y sign-in and not-authorised', () => {
  for (const skin of SKINS) {
    for (const mode of MODES) {
      it(`login page · ${skin} · ${mode}`, async () => {
        mockApi({ user: null });
        setLocation(hrefFor('/'));
        const view = await render(app(), { skin, mode });
        await settle();

        expect(formatViolations(await runAxe(document.body))).toBe('');
        expect(document.querySelectorAll('h1')).toHaveLength(1);
        expect(document.querySelector('main#main')).not.toBeNull();

        await view.unmount();
      });

      it(`not-authorised page · ${skin} · ${mode}`, async () => {
        mockApi({ user: VIEWER });
        setLocation(hrefFor('/admin/users'));
        const view = await render(app(), { skin, mode });
        await settle();

        expect(formatViolations(await runAxe(document.body))).toBe('');
        expect(document.querySelectorAll('h1')).toHaveLength(1);

        await view.unmount();
      });
    }
  }
});

describe('a11y public pages', () => {
  const PUBLIC: readonly [string, string][] = [
    ['accept-invite', '/accept-invite?token=tok123'],
    ['accept-invite (bad link)', '/accept-invite'],
    ['forgot-password', '/forgot-password'],
    ['reset-password', '/reset-password?token=tok123'],
    ['reset-password (bad link)', '/reset-password'],
  ];
  for (const [name, path] of PUBLIC) {
    for (const skin of SKINS) {
      for (const mode of MODES) {
        it(`${name} · ${skin} · ${mode}`, async () => {
          mockApi({
            user: null,
            routes: {
              'GET /api/auth/invite/tok123': {
                body: { ok: true, invite: { name: 'Sam', email: 'sam@example.com' } },
              },
            },
          });
          window.history.replaceState(null, '', `/#${path}`);
          const view = await render(app(), { skin, mode });
          await settle();

          expect(isBusy()).toBe(false);
          expect(formatViolations(await runAxe(document.body))).toBe('');
          expect(document.querySelectorAll('h1')).toHaveLength(1);
          expect(document.querySelector('main#main')).not.toBeNull();

          await view.unmount();
          window.history.replaceState(null, '', '/');
        });
      }
    }
  }
});

describe('a11y keyboard', () => {
  it('opens the admin menu with ArrowDown, and Escape returns focus to its trigger', async () => {
    mockApi();
    setLocation(hrefFor('/'));
    const view = await render(app());
    await settle();

    const trigger = getByRole(document.body, 'button', 'Admin');
    trigger.focus();
    await press(trigger, 'ArrowDown');

    const first = document.activeElement as HTMLElement;
    expect(first.getAttribute('role')).toBe('menuitem');
    expect(first.textContent).toBe('Users');

    await press(first, 'Escape');
    await flush(); // Radix hands focus back after the menu has unmounted
    expect(document.activeElement).toBe(getByRole(document.body, 'button', 'Admin'));

    await view.unmount();
  });
});
