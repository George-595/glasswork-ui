/* User management over HTTP: PATCH /api/users/:id and POST /api/users/:id/resend-invite.
   Who may call them (admin only), the safety rules (no self-demotion, no losing the last
   admin), what each change writes to the audit log, and that suspending ends sessions. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDataService } from './services/data.ts';
import {
  ADMIN_EMAIL,
  ORIGIN,
  startTestApp,
  type TestApp,
  VIEWER_EMAIL,
  VIEWER_PASSWORD,
} from './testing.ts';

let app: TestApp;
let admin = '';
let viewer = '';
let adminId = '';

beforeAll(async () => {
  app = await startTestApp();
  admin = await app.signIn();
  viewer = await app.signIn(VIEWER_EMAIL, VIEWER_PASSWORD);
  const rows = await app.db.query<{ id: string }>('SELECT id FROM users WHERE email = ?', [
    ADMIN_EMAIL,
  ]);
  adminId = rows[0]?.id ?? '';
});
afterAll(() => app.close());

const send = (method: string, path: string, body: unknown, cookie?: string) =>
  fetch(`${app.base}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });
// oxlint-disable-next-line typescript/no-explicit-any -- response JSON is inspected loosely in tests
const json = async (res: Response) => (await res.json()) as Record<string, any>;

async function invite(email: string): Promise<string> {
  const res = await send(
    'POST',
    '/api/users',
    { name: 'Test', email, role: 'viewer', sendWelcome: false },
    admin,
  );
  return (await json(res)).user.id as string;
}

async function addUser(
  id: string,
  email: string,
  role: string,
  status: string,
  password: string | null,
): Promise<void> {
  const at = new Date().toISOString();
  await app.db.execute(
    `INSERT INTO users (id, name, email, role, status, team, created_at, last_active_at, password_hash, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, `Name ${id}`, email, role, status, 'Ops', at, at, password, at],
  );
}

async function audit(action: string): Promise<{ actor: string; target: string }[]> {
  return app.db.query('SELECT actor_label AS actor, target FROM audit_events WHERE action = ?', [
    action,
  ]);
}

describe('PATCH /api/users/:id', () => {
  it('is admin only: 401 signed out, 403 for a viewer', async () => {
    const id = await invite('guard@example.com');
    expect((await send('PATCH', `/api/users/${id}`, { role: 'editor' })).status).toBe(401);
    const denied = await send('PATCH', `/api/users/${id}`, { role: 'editor' }, viewer);
    expect(denied.status).toBe(403);
    expect((await json(denied)).error.code).toBe('forbidden');
  });

  it('changes a role and writes an audit event naming both roles', async () => {
    const id = await invite('role@example.com');
    const res = await send('PATCH', `/api/users/${id}`, { role: 'editor' }, admin);
    expect(res.status).toBe(200);
    expect((await json(res)).user).toMatchObject({ id, role: 'editor' });
    const rows = await app.db.query<{ role: string }>('SELECT role FROM users WHERE id = ?', [id]);
    expect(rows[0]?.role).toBe('editor');
    const events = await audit('user.role');
    expect(events.some((e) => e.target === 'role@example.com (viewer → editor)')).toBe(true);
    expect(events.every((e) => e.actor === 'Admin' || e.actor.length > 0)).toBe(true);
  });

  it('refuses an admin changing their own role or suspending themself', async () => {
    const role = await send('PATCH', `/api/users/${adminId}`, { role: 'viewer' }, admin);
    expect(role.status).toBe(409);
    expect((await json(role)).error.code).toBe('cannot_modify_self');
    const suspend = await send('PATCH', `/api/users/${adminId}`, { status: 'suspended' }, admin);
    expect(suspend.status).toBe(409);
    expect((await json(suspend)).error.code).toBe('cannot_modify_self');
    const rows = await app.db.query<{ role: string; status: string }>(
      'SELECT role, status FROM users WHERE id = ?',
      [adminId],
    );
    expect(rows[0]).toEqual({ role: 'admin', status: 'active' });
  });

  it('refuses to demote or suspend the last active admin', async () => {
    // Over HTTP the caller is itself an active admin, so "last" cannot happen. The guard is
    // exercised on the service, with an actor who is not one of the admins being counted.
    const service = createDataService(app.db);
    const ghost = {
      id: 'usr_ghost',
      name: 'Ghost',
      email: 'ghost@example.com',
      role: 'admin',
    } as const;
    // the demo seed holds other admins; for this test only two should count
    await app.db.execute("UPDATE users SET role = 'viewer' WHERE role = 'admin' AND id <> ?", [
      adminId,
    ]);
    await addUser('usr_admin2', 'admin2@example.com', 'admin', 'active', 'x');
    await app.db.execute("UPDATE users SET status = 'suspended' WHERE id = ?", [adminId]);
    await expect(
      service.updateUser('usr_admin2', { role: 'viewer' }, ghost, '127.0.0.1'),
    ).rejects.toMatchObject({ code: 'last_admin' });
    await expect(
      service.updateUser('usr_admin2', { status: 'suspended' }, ghost, '127.0.0.1'),
    ).rejects.toMatchObject({ code: 'last_admin' });
    // with the first admin active again there are two, so the second can be demoted
    await app.db.execute("UPDATE users SET status = 'active' WHERE id = ?", [adminId]);
    const ok = await send('PATCH', '/api/users/usr_admin2', { role: 'editor' }, admin);
    expect(ok.status).toBe(200);
  });

  it('suspends and reactivates, ending sessions and auditing both', async () => {
    const email = 'suspend@example.com';
    await addUser('usr_susp', email, 'viewer', 'active', 'x');
    await app.db.execute(
      `INSERT INTO sessions (id, token_hash, user_id, created_at, last_seen_at, expires_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        'ses_susp',
        'hash-susp',
        'usr_susp',
        '2026-01-01T00:00:00.000Z',
        '2026-01-01T00:00:00.000Z',
        '2999-01-01T00:00:00.000Z',
      ],
    );
    const suspended = await send('PATCH', '/api/users/usr_susp', { status: 'suspended' }, admin);
    expect(suspended.status).toBe(200);
    expect((await json(suspended)).user.status).toBe('suspended');
    const live = await app.db.query(
      'SELECT 1 FROM sessions WHERE user_id = ? AND revoked_at IS NULL',
      ['usr_susp'],
    );
    expect(live).toHaveLength(0);
    const back = await send('PATCH', '/api/users/usr_susp', { status: 'active' }, admin);
    expect((await json(back)).user.status).toBe('active');
    expect((await audit('user.suspend')).some((e) => e.target === email)).toBe(true);
    expect((await audit('user.reactivate')).some((e) => e.target === email)).toBe(true);
  });

  it('reactivating someone who never set a password returns them to invited', async () => {
    const id = await invite('never@example.com');
    await send('PATCH', `/api/users/${id}`, { status: 'suspended' }, admin);
    const back = await send('PATCH', `/api/users/${id}`, { status: 'active' }, admin);
    expect((await json(back)).user.status).toBe('invited');
  });

  it('validates the body and the target', async () => {
    const id = await invite('valid@example.com');
    expect((await send('PATCH', `/api/users/${id}`, {}, admin)).status).toBe(400);
    const badRole = await send('PATCH', `/api/users/${id}`, { role: 'owner' }, admin);
    expect((await json(badRole)).error.code).toBe('invalid_role');
    const badStatus = await send('PATCH', `/api/users/${id}`, { status: 'invited' }, admin);
    expect((await json(badStatus)).error.code).toBe('invalid_status');
    const notSuspended = await send('PATCH', `/api/users/${id}`, { status: 'active' }, admin);
    expect(notSuspended.status).toBe(409);
    expect((await json(notSuspended)).error.code).toBe('not_suspended');
    const missing = await send('PATCH', '/api/users/usr_nobody', { role: 'editor' }, admin);
    expect(missing.status).toBe(404);
    expect((await json(missing)).error.code).toBe('user_not_found');
  });
});

describe('POST /api/users/:id/resend-invite', () => {
  it('is admin only', async () => {
    const id = await invite('resend-guard@example.com');
    expect((await send('POST', `/api/users/${id}/resend-invite`, {})).status).toBe(401);
    expect((await send('POST', `/api/users/${id}/resend-invite`, {}, viewer)).status).toBe(403);
  });

  it('records a re-sent invitation for an invited user', async () => {
    const id = await invite('resend@example.com');
    const res = await send('POST', `/api/users/${id}/resend-invite`, {}, admin);
    expect(res.status).toBe(200);
    expect((await json(res)).user).toMatchObject({ id, status: 'invited' });
    expect((await audit('user.resend_invite')).some((e) => e.target === 'resend@example.com')).toBe(
      true,
    );
  });

  it('refuses a user who already accepted, and an unknown user', async () => {
    const active = await send('POST', `/api/users/${adminId}/resend-invite`, {}, admin);
    expect(active.status).toBe(409);
    expect((await json(active)).error.code).toBe('not_invited');
    expect((await send('POST', '/api/users/usr_nobody/resend-invite', {}, admin)).status).toBe(404);
  });
});
