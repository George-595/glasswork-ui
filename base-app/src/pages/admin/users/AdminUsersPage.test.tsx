import { act, type ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { InviteUserBody, SessionUser, User } from '~/core/api';
import { AuthProvider } from '~/core/auth';
import { Toaster, toast } from '~/core/ui';
import { formatViolations, runAxe } from '~/test/axe';
import { changeValue, click, getAllByRole, getByRole, press } from '~/test/dom';
import { type MockApiOptions, mockApi } from '~/test/mockApi';
import { flush, render } from '~/test/render';
import { getUsers } from '../../../../fixtures/index.ts';
import AdminUsersPage from './AdminUsersPage';

const SERVER_ERROR = {
  status: 500,
  body: { ok: false, error: { code: 'internal_error', message: 'Boom' } },
};

const CREATED: User = {
  id: 'usr_new_ada',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  role: 'viewer',
  status: 'invited',
  team: 'Unassigned',
  createdAt: '2026-10-01T09:00:00Z',
  lastActiveAt: '2026-10-01T09:00:00Z',
};

/* A small, known user list so rows, counts and rules are predictable. */
function user(over: Partial<User> & Pick<User, 'id' | 'name'>): User {
  return {
    email: `${over.id}@example.com`,
    role: 'viewer',
    status: 'active',
    team: 'Ops',
    createdAt: '2026-01-01T09:00:00Z',
    lastActiveAt: '2026-09-30T09:00:00Z',
    ...over,
  };
}
const ME = user({ id: 'usr_me', name: 'Ada Admin', role: 'admin', email: 'admin@example.com' });
const OTHER_ADMIN = user({ id: 'usr_oa', name: 'Olga Admin', role: 'admin' });
const ACTIVE = user({ id: 'usr_bob', name: 'Bob Active', role: 'editor' });
const INVITED = user({ id: 'usr_ivy', name: 'Ivy Invited', status: 'invited' });
const SUSPENDED = user({ id: 'usr_sam', name: 'Sam Suspended', status: 'suspended' });
const SMALL = [ME, OTHER_ADMIN, ACTIVE, INVITED, SUSPENDED];
const ME_SESSION: SessionUser = { id: ME.id, name: ME.name, email: ME.email, role: 'admin' };

afterEach(() => {
  act(() => toast.dismiss());
});

function Wrap({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <main>{children}</main>
      <Toaster />
    </AuthProvider>
  );
}

function bodyRows(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('table tbody tr'));
}

function rowOf(name: string): HTMLElement {
  const row = bodyRows().find((r) => r.textContent?.includes(name));
  if (!row) throw new Error(`no row for ${name}`);
  return row;
}

/* A tiny stateful server: GET returns the current list and PATCH applies the body to it,
   as the real one does, so a refresh after a change agrees with the change. */
function smallApi(extra: MockApiOptions['routes'] = {}) {
  let current: User[] = [...SMALL];
  const patches: { id: string; body: unknown }[] = [];
  const handlers = Object.fromEntries(
    SMALL.map((u) => [
      `PATCH /api/users/${u.id}`,
      ({ body }: { body: unknown }) => {
        patches.push({ id: u.id, body });
        const change = body as Partial<User>;
        current = current.map((c) => (c.id === u.id ? { ...c, ...change } : c));
        return { body: { ok: true, user: current.find((c) => c.id === u.id) } };
      },
    ]),
  );
  const api = mockApi({
    user: ME_SESSION,
    routes: {
      'GET /api/users': () => ({ body: { ok: true, users: current } }),
      ...handlers,
      ...extra,
    },
  });
  return Object.assign(api, { patches });
}

async function renderPage(skin: 'enterprise' | 'glass' = 'enterprise') {
  await render(
    <Wrap>
      <AdminUsersPage />
    </Wrap>,
    { skin },
  );
  await flush();
}

/** Pick a role card: the radios are native inputs named by their card's title. */
async function chooseRole(dialog: HTMLElement, role: string) {
  const radio = dialog.querySelector<HTMLInputElement>(`input[type="radio"][value="${role}"]`);
  if (!radio) throw new Error(`no role card for ${role}`);
  await click(radio);
}

async function openInvite(): Promise<HTMLElement> {
  await click(getByRole(document.body, 'button', 'Invite user'));
  await flush();
  return document.querySelector('dialog') as HTMLElement;
}

async function openRowMenu(name: string): Promise<HTMLElement[]> {
  const trigger = getByRole(rowOf(name), 'button', `Actions for ${name}`);
  await press(trigger, 'Enter');
  await flush();
  return getAllByRole(document.body, 'menuitem');
}

async function choose(name: string, label: string) {
  const items = await openRowMenu(name);
  const item = items.find((i) => i.textContent === label);
  if (!item) throw new Error(`no menu item ${label}`);
  await click(item);
  await flush();
}

function toastText(): string {
  return Array.from(document.querySelectorAll('.ui-toast'))
    .map((t) => t.textContent)
    .join(' | ');
}

describe('AdminUsersPage', () => {
  it('shows a labelled skeleton and busy region while the users load', async () => {
    mockApi({ delay: true });
    await renderPage();
    expect(getByRole(document.body, 'heading', 'Users')).toBeTruthy();
    expect(document.querySelector('section[aria-busy="true"]')).not.toBeNull();
    expect(bodyRows()).toHaveLength(0);
  });

  it('shows the first page of 15 users in a captioned table once loaded', async () => {
    const api = mockApi({ delay: true });
    await renderPage();
    api.release();
    await flush();
    expect(bodyRows()).toHaveLength(15);
    expect(document.querySelector('caption')?.textContent).toBe('Users');
    expect(getByRole(document.body, 'heading', 'Users')).toBeTruthy();
  });

  it('shows an error with Retry, and Retry loads the users again', async () => {
    let calls = 0;
    const users = getUsers();
    const api = mockApi({
      routes: {
        'GET /api/users': () => {
          calls += 1;
          return calls === 1 ? SERVER_ERROR : { body: { ok: true, users } };
        },
      },
    });
    await renderPage();
    const alert = getByRole(document.body, 'alert');
    expect(alert.textContent).toContain('Couldn’t load users.');
    await click(getByRole(alert, 'button', 'Retry'));
    await flush();
    expect(api.calls.filter((c) => c === 'GET /api/users')).toHaveLength(2);
    expect(bodyRows()).toHaveLength(15);
  });

  it('puts an avatar, the name and the email together in the name cell', async () => {
    smallApi();
    await renderPage();
    const cell = rowOf('Bob Active').querySelector('td:nth-child(2)') as HTMLElement;
    expect(cell.querySelector('.ui-avatar')).not.toBeNull();
    expect(cell.textContent).toContain('Bob Active');
    expect(cell.textContent).toContain('usr_bob@example.com');
    expect(rowOf('Ivy Invited').textContent).toContain('Never');
  });

  it('opens a user in a detail sheet, with their fields and the actions that apply', async () => {
    smallApi();
    await renderPage();
    await click(rowOf('Bob Active').querySelector('td:nth-child(2) button') as HTMLElement);
    await flush();
    const sheet = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(sheet.textContent).toContain('Bob Active');
    expect(sheet.textContent).toContain('usr_bob@example.com');
    expect(getByRole(sheet, 'button', 'Change role…')).toBeTruthy();
    expect(getByRole(sheet, 'button', 'Suspend')).toBeTruthy();
    // the sheet's Change role… hands over to the same dialog the row menu opens
    await click(getByRole(sheet, 'button', 'Change role…'));
    await flush();
    expect(document.querySelector('dialog[open]')?.textContent).toContain('Change role');
  });

  it('offers no actions in the sheet for the signed-in admin', async () => {
    smallApi();
    await renderPage();
    await click(rowOf('Ada Admin').querySelector('td:nth-child(2) button') as HTMLElement);
    await flush();
    const sheet = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(sheet.textContent).toContain('Ada Admin');
    expect(getAllByRole(sheet, 'button', 'Suspend')).toHaveLength(0);
  });

  it('searches by name or email', async () => {
    smallApi();
    await renderPage();
    expect(bodyRows()).toHaveLength(5);
    await changeValue(getByRole(document.body, 'textbox', 'Search users'), 'usr_oa@');
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    await flush();
    expect(bodyRows()).toHaveLength(1);
    expect(bodyRows()[0]?.textContent).toContain('Olga Admin');
  });

  it('filters by Role with counts, and shows the filter as a chip', async () => {
    smallApi();
    await renderPage();
    const trigger = getAllByRole(document.body, 'button', /^Role/).find((b) =>
      b.hasAttribute('aria-expanded'),
    );
    await click(trigger as HTMLElement);
    await flush();
    const admin = getAllByRole(document.body, 'checkbox').find((c) =>
      c.closest('label')?.textContent?.startsWith('Admin'),
    ) as HTMLElement;
    expect(admin.closest('label')?.textContent).toContain('2');
    await click(admin);
    await flush();
    expect(bodyRows()).toHaveLength(2);
    const chips = document.querySelector('[aria-label="Active filters"]') as HTMLElement;
    expect(chips.textContent).toContain('Admin');
  });

  it('hides the row actions of the signed-in admin', async () => {
    smallApi();
    await renderPage();
    expect(getAllByRole(rowOf('Ada Admin'), 'button', 'Actions for Ada Admin')).toHaveLength(0);
    expect(getAllByRole(rowOf('Olga Admin'), 'button', 'Actions for Olga Admin')).toHaveLength(1);
  });

  it('offers only the actions that apply to each status', async () => {
    smallApi();
    await renderPage();
    const labels = async (n: string) => (await openRowMenu(n)).map((i) => i.textContent);
    expect(await labels('Bob Active')).toEqual(['Change role…', 'Suspend']);
    await press(document.activeElement ?? document.body, 'Escape');
    await flush();
    expect(await labels('Ivy Invited')).toEqual(['Change role…', 'Resend invite', 'Suspend']);
    await press(document.activeElement ?? document.body, 'Escape');
    await flush();
    expect(await labels('Sam Suspended')).toEqual(['Change role…', 'Reactivate']);
  });

  it('Change role… PATCHes the new role, updates the row and says so', async () => {
    const api = smallApi();
    await renderPage();
    await choose('Bob Active', 'Change role…');
    const dialog = document.querySelector('dialog[open]') as HTMLElement;
    expect(dialog.textContent).toContain('Bob Active');
    await chooseRole(dialog, 'viewer');
    await click(getByRole(dialog, 'button', 'Save role'));
    await flush();
    expect(api.patches).toEqual([{ id: 'usr_bob', body: { role: 'viewer' } }]);
    expect(api.calls.filter((c) => c === 'GET /api/users').length).toBeGreaterThanOrEqual(2);
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(toastText()).toContain('Bob Active is now Viewer.');
    expect(rowOf('Bob Active').textContent).toContain('Viewer');
  });

  it('keeps the dialog open and shows the server’s reason when a role change is refused', async () => {
    smallApi({
      'PATCH /api/users/usr_oa': {
        status: 409,
        body: {
          ok: false,
          error: { code: 'last_admin', message: 'This is the last active admin.' },
        },
      },
    });
    await renderPage();
    await choose('Olga Admin', 'Change role…');
    const dialog = document.querySelector('dialog[open]') as HTMLElement;
    await chooseRole(dialog, 'viewer');
    await click(getByRole(dialog, 'button', 'Save role'));
    await flush();
    expect(getByRole(dialog, 'alert').textContent).toBe('This is the last active admin.');
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('Suspend asks for confirmation, then PATCHes status and toasts', async () => {
    const api = smallApi();
    await renderPage();
    await choose('Bob Active', 'Suspend');
    const dialog = document.querySelector('dialog[open]') as HTMLElement;
    expect(dialog.textContent).toContain('Suspend Bob Active?');
    expect(api.patches).toEqual([]);
    await click(getByRole(dialog, 'button', 'Cancel'));
    await flush();
    expect(api.patches).toEqual([]);

    await choose('Bob Active', 'Suspend');
    const again = document.querySelector('dialog[open]') as HTMLElement;
    await click(getByRole(again, 'button', 'Suspend'));
    await flush();
    expect(api.patches).toEqual([{ id: 'usr_bob', body: { status: 'suspended' } }]);
    expect(toastText()).toContain('Bob Active was suspended.');
    expect(rowOf('Bob Active').textContent).toContain('Suspended');
  });

  it('a refused suspension stays open with the reason', async () => {
    smallApi({
      'PATCH /api/users/usr_oa': {
        status: 409,
        body: { ok: false, error: { code: 'last_admin', message: 'Last admin.' } },
      },
    });
    await renderPage();
    await choose('Olga Admin', 'Suspend');
    const dialog = document.querySelector('dialog[open]') as HTMLElement;
    await click(getByRole(dialog, 'button', 'Suspend'));
    await flush();
    expect(getByRole(dialog, 'alert').textContent).toContain('Last admin.');
    expect(dialog.hasAttribute('open')).toBe(true);
  });

  it('Reactivate PATCHes status active without a confirmation', async () => {
    const api = smallApi();
    await renderPage();
    await choose('Sam Suspended', 'Reactivate');
    expect(api.patches).toEqual([{ id: 'usr_sam', body: { status: 'active' } }]);
    expect(toastText()).toContain('Sam Suspended was reactivated.');
  });

  it('Resend invite POSTs to the user and toasts; a failure toasts an error', async () => {
    const api = smallApi({
      'POST /api/users/usr_ivy/resend-invite': { body: { ok: true, user: INVITED } },
    });
    await renderPage();
    await choose('Ivy Invited', 'Resend invite');
    expect(api.calls).toContain('POST /api/users/usr_ivy/resend-invite');
    expect(toastText()).toContain('Invitation re-sent to usr_ivy@example.com.');

    smallApi({ 'POST /api/users/usr_ivy/resend-invite': SERVER_ERROR });
    await renderPage();
    await choose('Ivy Invited', 'Resend invite');
    expect(toastText()).toContain('Couldn’t re-send the invitation');
  });

  it('bulk "Suspend selected" confirms, skips suspended users and yourself, and suspends the rest', async () => {
    const api = smallApi();
    await renderPage();
    for (const name of ['Ada Admin', 'Bob Active', 'Ivy Invited', 'Sam Suspended']) {
      await click(getByRole(rowOf(name), 'checkbox'));
    }
    const bar = getByRole(document.body, 'region', 'Bulk actions');
    await click(getByRole(bar, 'button', 'Suspend selected'));
    await flush();
    const dialog = document.querySelector('dialog[open]') as HTMLElement;
    expect(dialog.textContent).toContain('Suspend 2 users?');
    expect(dialog.textContent).toContain('2 selected users are left out');
    await click(getByRole(dialog, 'button', 'Suspend'));
    await flush();
    expect(api.patches.map((p) => p.id)).toEqual(['usr_bob', 'usr_ivy']);
    expect(toastText()).toContain('2 users were suspended.');
    expect(document.querySelector('[aria-label="Selected rows"]')).toBeNull();
  });

  it('moves focus into the invite dialog when it opens', async () => {
    mockApi();
    await renderPage();
    const dialog = await openInvite();
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it('shows two errors when the invite is submitted empty', async () => {
    mockApi();
    await renderPage();
    const dialog = await openInvite();
    await click(getByRole(dialog, 'button', 'Send invite'));
    expect(dialog.querySelectorAll('[aria-invalid="true"]')).toHaveLength(2);
    expect(document.activeElement?.getAttribute('name')).toBe('name');
  });

  it('POSTs the invite, puts the user first and toasts', async () => {
    const seen: unknown[] = [];
    const api = mockApi({
      routes: {
        'POST /api/users': ({ body }) => {
          seen.push(body);
          return { body: { ok: true, user: CREATED } };
        },
      },
    });
    await renderPage();
    const dialog = await openInvite();
    await changeValue(getByRole(dialog, 'textbox', 'Name'), 'Ada Lovelace');
    await changeValue(getByRole(dialog, 'textbox', 'Email'), 'ada@example.com');
    await click(getByRole(dialog, 'button', 'Send invite'));
    await flush();

    const expected: InviteUserBody = {
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      role: 'viewer',
      sendWelcome: true,
    };
    expect(seen).toEqual([expected]);
    expect(api.calls).toContain('POST /api/users');
    expect(dialog.hasAttribute('open')).toBe(false);
    expect(toastText()).toContain('Invitation sent to ada@example.com.');
    expect(bodyRows()[0]?.textContent).toContain('Ada Lovelace');
    expect(bodyRows()[0]?.textContent).toContain('Invited');
  });

  it('offers the roles as cards with what each can do, and sends the one chosen', async () => {
    const seen: unknown[] = [];
    mockApi({
      routes: {
        'POST /api/users': ({ body }) => {
          seen.push(body);
          return { body: { ok: true, user: CREATED } };
        },
      },
    });
    await renderPage();
    const dialog = await openInvite();
    const group = dialog.querySelector('[role="radiogroup"]') as HTMLElement;
    expect(group.querySelector('legend')?.textContent).toBe('Role');
    const cards = Array.from(group.querySelectorAll('.ui-radio-card'));
    expect(cards.map((c) => c.querySelector('span > span')?.textContent)).toEqual([
      'Admin',
      'Editor',
      'Viewer',
    ]);
    expect(cards[2]?.textContent).toContain('Read-only access to the data.');
    expect((dialog.querySelector('input[value="viewer"]') as HTMLInputElement).checked).toBe(true);
    await chooseRole(dialog, 'editor');
    await changeValue(getByRole(dialog, 'textbox', 'Name'), 'Ada Lovelace');
    await changeValue(getByRole(dialog, 'textbox', 'Email'), 'ada@example.com');
    await click(getByRole(dialog, 'button', 'Send invite'));
    await flush();
    expect(seen).toEqual([
      { name: 'Ada Lovelace', email: 'ada@example.com', role: 'editor', sendWelcome: true },
    ]);
  });

  it('puts a 409 email_taken on the Email field and keeps the dialog open', async () => {
    mockApi({
      routes: {
        'POST /api/users': {
          status: 409,
          body: { ok: false, error: { code: 'email_taken', message: 'Taken.' } },
        },
      },
    });
    await renderPage();
    const dialog = await openInvite();
    await changeValue(getByRole(dialog, 'textbox', 'Name'), 'Ada Lovelace');
    await changeValue(getByRole(dialog, 'textbox', 'Email'), 'ada@example.com');
    await click(getByRole(dialog, 'button', 'Send invite'));
    await flush();

    const email = getByRole(dialog, 'textbox', 'Email');
    expect(email.getAttribute('aria-invalid')).toBe('true');
    const message = document.getElementById(`${email.id}-err`);
    expect(message?.textContent).toBe('An account with this email already exists.');
    expect(email.getAttribute('aria-describedby')).toBe(message?.id);
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(toastText()).toBe('');
  });

  it('shows any other invite failure as an alert inside the dialog', async () => {
    mockApi({ routes: { 'POST /api/users': SERVER_ERROR } });
    await renderPage();
    const dialog = await openInvite();
    await changeValue(getByRole(dialog, 'textbox', 'Name'), 'Ada Lovelace');
    await changeValue(getByRole(dialog, 'textbox', 'Email'), 'ada@example.com');
    await click(getByRole(dialog, 'button', 'Send invite'));
    await flush();
    expect(getByRole(dialog, 'alert').textContent).toBe('Boom');
    expect(dialog.hasAttribute('open')).toBe(true);
  });
});

describe('a11y users', () => {
  const passes = [
    ['enterprise', 'light'],
    ['enterprise', 'dark'],
    ['glass', 'light'],
    ['glass', 'dark'],
  ] as const;

  async function scan(
    skin: 'enterprise' | 'glass',
    mode: 'light' | 'dark',
    setup: () => Promise<void> = async () => {},
  ) {
    await render(
      <Wrap>
        <AdminUsersPage />
      </Wrap>,
      { skin, mode },
    );
    await flush();
    await setup();
    return formatViolations(await runAxe());
  }

  for (const [skin, mode] of passes) {
    it(`${skin} · ${mode}`, async () => {
      smallApi();
      expect(await scan(skin, mode)).toBe('');
    });

    it(`while loading · ${skin} · ${mode}`, async () => {
      const api = mockApi({ delay: true });
      expect(await scan(skin, mode)).toBe('');
      api.release();
    });

    it(`with the invite dialog open · ${skin} · ${mode}`, async () => {
      smallApi();
      expect(await scan(skin, mode, async () => void (await openInvite()))).toBe('');
    });

    it(`with the change-role dialog open · ${skin} · ${mode}`, async () => {
      smallApi();
      expect(await scan(skin, mode, () => choose('Bob Active', 'Change role…'))).toBe('');
    });

    it(`with the suspend confirmation open · ${skin} · ${mode}`, async () => {
      smallApi();
      expect(await scan(skin, mode, () => choose('Bob Active', 'Suspend'))).toBe('');
    });

    it(`with the detail sheet open · ${skin} · ${mode}`, async () => {
      smallApi();
      const open = async () => {
        await click(rowOf('Bob Active').querySelector('td:nth-child(2) button') as HTMLElement);
        await flush();
      };
      expect(await scan(skin, mode, open)).toBe('');
    });

    it(`with the row menu open · ${skin} · ${mode}`, async () => {
      smallApi();
      expect(await scan(skin, mode, async () => void (await openRowMenu('Bob Active')))).toBe('');
    });
  }
});
