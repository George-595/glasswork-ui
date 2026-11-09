/* "View as", over HTTP.

   An admin may view the app as an editor or a viewer, an editor as a viewer. It is a real,
   server-enforced downgrade, not a client costume: the session stores `acting_role` and EVERY role
   check uses the effective role (`acting ?? real`, never higher). This file pins:
   - the endpoint's validation, per real role;
   - every auth level: an admin viewing as an editor or a viewer is refused the admin routes (403)
     and gets them back on switching back. The sweep runs over the real route table, so a route
     added later is covered;
   - the audit trail (real id, acting role), sign-out, a second session and a changed real role. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRoutes } from './routes/index.ts';
import { hashPassword } from './services/index.ts';
import { ORIGIN, startTestApp, type TestApp, VIEWER_EMAIL, VIEWER_PASSWORD } from './testing.ts';

const EDITOR_EMAIL = 'editor@example.com';
const EDITOR_PASSWORD = 'editor password 123';

let app: TestApp;
beforeAll(async () => {
  app = await startTestApp();
  const at = new Date().toISOString();
  await app.db.execute(
    `INSERT INTO users (id, name, email, role, status, team, password_hash, created_at, updated_at, last_active_at)
     VALUES (?, ?, ?, 'editor', 'active', 'Ops', ?, ?, ?, ?)`,
    ['usr_editor', 'Ed Editor', EDITOR_EMAIL, await hashPassword(EDITOR_PASSWORD), at, at, at],
  );
});
afterAll(() => app.close());

const call = (method: string, path: string, cookie: string, body?: unknown) =>
  fetch(`${app.base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      cookie,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
// oxlint-disable-next-line typescript/no-explicit-any -- response JSON is inspected loosely in tests
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const viewAs = (cookie: string, role: unknown) =>
  call('POST', '/api/auth/view-as', cookie, { role });
const me = async (cookie: string) => (await json(await call('GET', '/api/auth/me', cookie))).user;

type Role = 'admin' | 'editor' | 'viewer';
const signIn = (role: Role) =>
  role === 'admin'
    ? app.signIn()
    : role === 'editor'
      ? app.signIn(EDITOR_EMAIL, EDITOR_PASSWORD)
      : app.signIn(VIEWER_EMAIL, VIEWER_PASSWORD);

describe('POST /api/auth/view-as', () => {
  it('needs a session, and a body with a role key', async () => {
    const anon = await fetch(`${app.base}/api/auth/view-as`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: JSON.stringify({ role: null }),
    });
    expect(anon.status).toBe(401);
    const cookie = await signIn('admin');
    expect((await viewAs(cookie, undefined)).status).toBe(400);
    expect((await call('POST', '/api/auth/view-as', cookie, {})).status).toBe(400);
    expect((await viewAs(cookie, 7)).status).toBe(400);
  });

  it('lets an admin view as an editor or a viewer, and an editor as a viewer', async () => {
    const admin = await signIn('admin');
    const asEditor = await json(await viewAs(admin, 'editor'));
    expect(asEditor.user).toMatchObject({
      role: 'editor',
      realRole: 'admin',
      actingRole: 'editor',
    });
    expect(await me(admin)).toMatchObject({ role: 'editor', realRole: 'admin' });
    expect((await json(await viewAs(admin, 'viewer'))).user).toMatchObject({ role: 'viewer' });
    expect((await json(await viewAs(admin, null))).user).toMatchObject({
      role: 'admin',
      actingRole: null,
    });

    const editor = await signIn('editor');
    expect((await json(await viewAs(editor, 'viewer'))).user).toMatchObject({
      role: 'viewer',
      realRole: 'editor',
    });
  });

  it('refuses your own role, a higher one and an unknown one with 403 forbidden_role', async () => {
    const attempts: [Role, string][] = [
      ['admin', 'admin'],
      ['admin', 'root'],
      ['editor', 'editor'],
      ['editor', 'admin'],
      ['viewer', 'viewer'],
      ['viewer', 'editor'],
      ['viewer', 'admin'],
    ];
    for (const [real, target] of attempts) {
      const cookie = await signIn(real);
      const res = await viewAs(cookie, target);
      expect([real, target, res.status]).toEqual([real, target, 403]);
      expect((await json(res)).error.code).toBe('forbidden_role');
      expect((await me(cookie)).role).toBe(real);
    }
    // anyone may go back; for a viewer that is a no-op
    const viewer = await signIn('viewer');
    expect((await viewAs(viewer, null)).status).toBe(200);
  });
});

describe('every auth level asks the effective role', () => {
  const routes = () =>
    createRoutes(app.services, { cookieSecure: false }).map((r) => ({
      method: r.method as string,
      path: r.path,
      auth: r.auth as string,
    }));
  const concrete = (path: string): string => path.replace(/:\w+/g, 'does-not-exist');
  // the event stream never ends, and view-as is the thing under test
  const SKIP = new Set(['GET /api/events', 'POST /api/auth/view-as']);

  it('an admin viewing as an editor or a viewer is refused every admin route, and gets them back', async () => {
    const cookie = await signIn('admin');
    const admin = routes().filter((r) => r.auth === 'admin' && !SKIP.has(`${r.method} ${r.path}`));
    expect(admin.length).toBeGreaterThan(5);
    for (const acting of ['editor', 'viewer'] as const) {
      await viewAs(cookie, acting);
      for (const r of admin) {
        const res = await call(
          r.method,
          concrete(r.path),
          cookie,
          r.method === 'GET' ? undefined : {},
        );
        expect([acting, r.method, r.path, res.status]).toEqual([acting, r.method, r.path, 403]);
      }
    }
    await viewAs(cookie, null);
    const users = await call('GET', '/api/users', cookie);
    expect(users.status).toBe(200);
  });

  it('an editor viewing as a viewer is the viewer for the rules a service holds', async () => {
    const cookie = await signIn('editor');
    expect((await me(cookie)).role).toBe('editor');
    await viewAs(cookie, 'viewer');
    expect((await me(cookie)).role).toBe('viewer');
    expect((await call('GET', '/api/users', cookie)).status).toBe(403);
  });
});

describe('the audit trail, sign-out and other sessions', () => {
  const audit = async () =>
    app.db.query<{ action: string; actor_user_id: string; target: string; detail: string }>(
      "SELECT action, actor_user_id, target, detail FROM audit_events WHERE action LIKE 'view_as.%' ORDER BY occurred_at, id",
    );

  it('writes view_as.start and view_as.end under the real id, and a change writes both', async () => {
    const before = (await audit()).length;
    const cookie = await signIn('editor');
    await viewAs(cookie, 'viewer');
    await viewAs(cookie, null);
    const rows = (await audit()).slice(before);
    expect(rows.map((r) => r.action)).toEqual(['view_as.start', 'view_as.end']);
    expect(rows.every((r) => r.actor_user_id === 'usr_editor')).toBe(true);
    expect(JSON.parse(rows[0]?.detail ?? '{}')).toEqual({
      realRole: 'editor',
      actingRole: 'viewer',
    });
    // the same role again changes nothing and writes nothing
    await viewAs(cookie, 'viewer');
    await viewAs(cookie, 'viewer');
    expect((await audit()).slice(before)).toHaveLength(3);
  });

  it('signing out ends it, says so in the audit log, and a new sign-in is the real role', async () => {
    const before = (await audit()).length;
    const cookie = await signIn('admin');
    await viewAs(cookie, 'viewer');
    await call('POST', '/api/auth/logout', cookie, {});
    const rows = (await audit()).slice(before);
    expect(rows.map((r) => r.action)).toEqual(['view_as.start', 'view_as.end']);
    expect(rows[1]?.target).toContain('signed out while viewing as Viewer');
    expect((await me(await signIn('admin'))).role).toBe('admin');
  });

  it('another session of the same person is not affected', async () => {
    const one = await signIn('admin');
    const two = await signIn('admin');
    await viewAs(one, 'viewer');
    expect((await me(one)).role).toBe('viewer');
    expect((await me(two)).role).toBe('admin');
  });

  it('a stored role that is no longer below the real one is nothing (a demoted editor)', async () => {
    const cookie = await signIn('editor');
    await viewAs(cookie, 'viewer');
    // demoted to viewer while viewing as viewer: still a viewer, never more
    await app.db.execute("UPDATE users SET role = 'viewer' WHERE id = 'usr_editor'");
    const user = await me(cookie);
    expect(user).toMatchObject({ role: 'viewer', realRole: 'viewer', actingRole: null });
    await app.db.execute("UPDATE users SET role = 'editor' WHERE id = 'usr_editor'");
  });
});
