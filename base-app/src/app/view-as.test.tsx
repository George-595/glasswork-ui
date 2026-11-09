/* View as, through the real App: who is offered it, what it does to the navigation and the gates,
   the warning banner on every screen with its one-tap way back. The server's side (every role
   check, audit, sessions) is server/view-as.test.ts; here the mock server keeps the same rule:
   the `user` it answers with carries the effective role in `role`, the account's own in
   `realRole`. */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { hrefFor } from '~/core/router';
import { SettingsProvider } from '~/core/settings';
import { ThemeProvider } from '~/core/ui';
import { formatViolations, runAxe } from '~/test/axe';
import { click, getAllByRole, getByRole } from '~/test/dom';
import { locationNow, setLocation } from '~/test/location';
import { ADMIN, type MockApiOptions, mockApi, VIEWER } from '~/test/mockApi';
import { flush, type Rendered, render, type TestMode, type TestSkin } from '~/test/render';
import type { Role, SessionUser } from '../../shared/api';
import { App } from './App';
import { loadSignedIn } from './SignedInGate';

const EDITOR: SessionUser = {
  id: 'usr_editor',
  name: 'Ed Editor',
  email: 'editor@example.com',
  role: 'editor',
};

// The signed-in app is its own chunk (SignedInGate.tsx). The browser has it fetched before it hydrates;
// load it once up front so a test's first render finds it, instead of racing its first transform.
beforeAll(loadSignedIn);

function app() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
});

/* The person as the server sends them: `role` is the effective one. */
function asSeen(account: SessionUser, acting: Role | null): SessionUser {
  const effective = acting ?? account.role;
  return {
    ...account,
    role: effective,
    realRole: account.role,
    effectiveRole: effective,
    actingRole: acting,
  };
}

/* A mock server that keeps the session's acting role, answers POST /api/auth/view-as by the real
   rule (a role strictly below the account's own, or null) and records what was asked. */
function viewAsServer(
  account: SessionUser,
  start: Role | null = null,
  options: Omit<MockApiOptions, 'user' | 'routes'> = {},
) {
  const rank: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };
  let acting = start;
  const asked: (Role | null)[] = [];
  const api = mockApi({
    ...options,
    user: asSeen(account, start),
    routes: {
      'GET /api/auth/me': () => ({ body: { ok: true, user: asSeen(account, acting) } }),
      'POST /api/auth/view-as': (req) => {
        const role = (req.body as { role: Role | null }).role;
        if (role !== null && !(role in rank && rank[role] < rank[account.role])) {
          return {
            status: 403,
            body: { ok: false, error: { code: 'forbidden_role', message: 'No.' } },
          };
        }
        asked.push(role);
        acting = role;
        return { body: { ok: true, user: asSeen(account, acting) } };
      },
    },
  });
  return { api, asked };
}

async function mount(hash: string, opts: { skin?: TestSkin; mode?: TestMode } = {}) {
  setLocation(hrefFor(hash));
  view = await render(app(), opts);
  await flush(8);
}

async function untilHeading(text: string): Promise<void> {
  for (let i = 0; i < 150 && document.querySelector('h1')?.textContent !== text; i++) {
    await flush(1);
    await new Promise((r) => setTimeout(r, 20));
  }
}

const banner = () => document.querySelector<HTMLElement>('[data-view-as-banner]');
const sidebarGroups = () =>
  Array.from(document.querySelectorAll('.ui-sidebar-group-label'), (g) => g.textContent);
const openUserMenu = async (name: string) => {
  await click(getByRole(document.body, 'button', name));
  await flush(2);
};
const menuItems = () => getAllByRole(document.body, 'menuitem').map((m) => m.textContent ?? '');

describe('who is offered View as (the user menu)', () => {
  it('an admin: Editor and Viewer', async () => {
    viewAsServer(ADMIN);
    await mount('/');
    await openUserMenu(ADMIN.name);
    expect(menuItems()).toEqual([
      'Account',
      'Notifications',
      'View as Editor',
      'View as Viewer',
      'Sign out',
    ]);
  });

  it('an editor: Viewer only', async () => {
    viewAsServer(EDITOR);
    await mount('/');
    await openUserMenu(EDITOR.name);
    expect(menuItems()).toEqual(['Account', 'Notifications', 'View as Viewer', 'Sign out']);
  });

  it('a viewer: nothing', async () => {
    viewAsServer(VIEWER);
    await mount('/');
    await openUserMenu(VIEWER.name);
    expect(menuItems()).toEqual(['Account', 'Notifications', 'Sign out']);
  });

  it('while viewing as an editor an admin is offered the way back first, then the other role', async () => {
    viewAsServer(ADMIN, 'editor');
    await mount('/');
    await openUserMenu(ADMIN.name);
    expect(menuItems()).toEqual([
      'Account',
      'Notifications',
      'Switch back to Admin',
      'View as Viewer',
      'Sign out',
    ]);
  });
});

describe('viewing as a viewer', () => {
  it('asks the server, shows the warning with its one-tap way back, and rebuilds the app for the role', async () => {
    const server = viewAsServer(ADMIN);
    await mount('/admin/settings');
    expect(banner()).toBeNull();
    expect(sidebarGroups()).toContain('Admin');

    await openUserMenu(ADMIN.name);
    await click(getByRole(document.body, 'menuitem', 'View as Viewer'));
    await flush(8);

    expect(server.asked).toEqual(['viewer']);
    expect(server.api.calls).toContain('POST /api/auth/view-as');
    // the app goes Home, built for a viewer
    expect(locationNow()).toBe('/');
    const warning = banner();
    expect(warning?.textContent).toContain("You're viewing as a Viewer.");
    expect(
      getByRole(warning as HTMLElement, 'button', 'Switch back to Admin').textContent,
    ).toContain('Switch back to Admin');
    expect(sidebarGroups()).not.toContain('Admin');

    // one tap back
    await click(getByRole(banner() as HTMLElement, 'button', 'Switch back to Admin'));
    await flush(8);
    expect(server.asked).toEqual(['viewer', null]);
    expect(banner()).toBeNull();
    expect(sidebarGroups()).toContain('Admin');
  });

  it('the gates follow: an admin page is Not authorised while viewing as an editor', async () => {
    const server = viewAsServer(ADMIN, 'editor');
    await mount('/admin/settings');
    await untilHeading('Not authorised');
    expect(document.querySelector('h1')?.textContent).toBe('Not authorised');
    expect(banner()?.textContent).toContain("You're viewing as an Editor.");
    expect(sidebarGroups()).not.toContain('Admin');
    expect(server.asked).toEqual([]); // and the way back is still there
    expect(getByRole(banner() as HTMLElement, 'button', 'Switch back to Admin')).toBeTruthy();
  });

  it('the warning is on the maintenance page, which an admin viewing as a viewer is shown', async () => {
    const server = viewAsServer(ADMIN, 'viewer', { settings: { 'maintenance.enabled': true } });
    await mount('/');
    expect(document.querySelector('.ui-sidebar')).toBeNull(); // no shell: the "back soon" page
    expect(banner()?.textContent).toContain("You're viewing as a Viewer.");
    await click(getByRole(banner() as HTMLElement, 'button', 'Switch back to Admin'));
    await flush(8);
    expect(server.asked).toEqual([null]);
    expect(banner()).toBeNull();
    expect(document.querySelector('.ui-sidebar')).not.toBeNull(); // the admin is let in again
  });

  it('shows no warning to someone who is not viewing as anyone', async () => {
    viewAsServer(ADMIN);
    await mount('/');
    expect(banner()).toBeNull();
  });

  it('refuses to show more than the real role: an answer that says a higher effective role is clamped', async () => {
    // a hand-made answer: an editor "effectively" an admin must still be treated as an editor
    mockApi({ user: { ...EDITOR, realRole: 'editor', role: 'admin' } });
    await mount('/');
    expect(sidebarGroups()).not.toContain('Admin');
  });
});

describe('when the server will not switch', () => {
  it('the banner stays, with a toast, and the button works again', async () => {
    mockApi({
      user: asSeen(ADMIN, 'viewer'),
      routes: {
        'POST /api/auth/view-as': {
          status: 500,
          body: { ok: false, error: { code: 'internal_error', message: 'x' } },
        },
      },
    });
    await mount('/');
    await click(getByRole(banner() as HTMLElement, 'button', 'Switch back to Admin'));
    await flush(8);
    expect(document.body.textContent).toContain('Could not switch back. Please try again.');
    expect(banner()).not.toBeNull();
    expect(
      getByRole(banner() as HTMLElement, 'button', 'Switch back to Admin').hasAttribute('disabled'),
    ).toBe(false);
  });
});

describe('a11y with the View as warning', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`a page under the warning · ${skin} · ${mode}`, async () => {
        viewAsServer(ADMIN, 'viewer');
        await mount('/', { skin, mode });
        expect(banner()).not.toBeNull();
        expect(formatViolations(await runAxe(document.body))).toBe('');
      });
    }
  }
});
