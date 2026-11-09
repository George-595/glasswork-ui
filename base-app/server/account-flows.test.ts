/* Invitations, forgotten passwords, resets and the account routes, end to end over HTTP:
   tokens (single use, expiry, replacement, the race), the password policy where it applies,
   enumeration resistance, session revocation, the new-device notice and the audit trail. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createRepositories } from './repositories/index.ts';
import { hashPassword } from './services/index.ts';
import { ORIGIN, startTestApp, type TestApp } from './testing.ts';

let app: TestApp;
let admin = '';

beforeAll(async () => {
  app = await startTestApp({ limits: { forgotPerIp: 1000, tokenPerIp: 1000 } });
  admin = await app.signIn();
});
afterAll(() => app.close());

const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const FIREFOX_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0';

const send = (method: string, path: string, body?: unknown, cookie?: string, ua?: string) =>
  fetch(`${app.base}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
      ...(ua ? { 'user-agent': ua } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
// oxlint-disable-next-line typescript/no-explicit-any -- response JSON is inspected loosely in tests
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const cookieOf = (res: Response) => (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';

let counter = 0;
const nextEmail = (label: string) => `${label}${++counter}@example.com`;

/** An active user with a password, straight into the database. */
async function makeUser(
  email: string,
  password: string,
  over: { status?: 'active' | 'invited' | 'suspended'; name?: string } = {},
): Promise<string> {
  const id = `usr_t${++counter}`;
  const at = new Date().toISOString();
  await createRepositories(app.db).users.insert(
    {
      id,
      name: over.name ?? 'Test Person',
      email,
      role: 'editor',
      status: over.status ?? 'active',
      team: 'Ops',
      createdAt: at,
      lastActiveAt: at,
    },
    over.status === 'invited' ? null : await hashPassword(password),
  );
  return id;
}

async function login(email: string, password: string, ua?: string): Promise<string> {
  const res = await send('POST', '/api/auth/login', { email, password }, undefined, ua);
  if (res.status !== 200) throw new Error(`login failed: ${res.status}`);
  return cookieOf(res);
}

const tokenIn = (link: string): string =>
  new URLSearchParams(new URL(link).hash.slice(1)).get('token') ?? '';
const mailsTo = (to: string) => app.mail.filter((m) => m.to === to);

async function inviteByAdmin(email: string, sendWelcome = true): Promise<string> {
  const res = await send(
    'POST',
    '/api/users',
    { name: 'Sam Newcomer', email, role: 'viewer', sendWelcome },
    admin,
  );
  expect(res.status).toBe(201);
  return (await json(res)).user.id as string;
}

async function inviteToken(email: string): Promise<string> {
  const mail = mailsTo(email)
    .filter((m) => m.template === 'invite')
    .at(-1);
  expect(mail).toBeDefined();
  return tokenIn(mail?.data.link ?? '');
}

const STRONG = 'quiet-harbour-lamp-4721';

describe('invitations', () => {
  it('inviting queues the invite email with the right data and a 7-day link', async () => {
    const email = nextEmail('invitee');
    await inviteByAdmin(email);
    const mail = mailsTo(email)[0];
    expect(mail?.template).toBe('invite');
    expect(Object.keys(mail?.data ?? {}).toSorted()).toEqual([
      'expiresIn',
      'inviterName',
      'link',
      'name',
    ]);
    expect(mail?.data).toMatchObject({
      name: 'Sam Newcomer',
      inviterName: 'Admin',
      expiresIn: '7 days',
    });
    expect(mail?.data.link).toMatch(/^http:\/\/localhost:5173\/accept-invite#token=[\w-]{43}$/);
  });

  it('with "send welcome email" off it records the person and sends nothing', async () => {
    const email = nextEmail('quiet');
    await inviteByAdmin(email, false);
    expect(mailsTo(email)).toHaveLength(0);
    const rows = await app.db.query(
      'SELECT 1 FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE u.email = ?',
      [email],
    );
    expect(rows).toHaveLength(0);
  });

  it('stores only the hash of the token', async () => {
    const email = nextEmail('hashed');
    await inviteByAdmin(email);
    const token = await inviteToken(email);
    const rows = await app.db.query<{ token_hash: string }>(
      'SELECT t.token_hash FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE u.email = ?',
      [email],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0]?.token_hash).not.toContain(token);
  });

  it('GET /api/auth/invite/:token names the invitee; anything else is the one generic error', async () => {
    const email = nextEmail('peek');
    await inviteByAdmin(email);
    const token = await inviteToken(email);
    const ok = await send('GET', `/api/auth/invite/${token}`);
    expect(ok.status).toBe(200);
    expect((await json(ok)).invite).toEqual({ name: 'Sam Newcomer', email });
    // looking does not spend it
    expect((await send('GET', `/api/auth/invite/${token}`)).status).toBe(200);

    const unknown = await send('GET', '/api/auth/invite/not-a-real-token');
    expect(unknown.status).toBe(400);
    expect((await json(unknown)).error).toEqual({
      code: 'invalid_token',
      message: 'This link is invalid or has expired.',
    });
  });

  it('resend-invite issues a fresh token and the old link stops working', async () => {
    const email = nextEmail('resend');
    const id = await inviteByAdmin(email);
    const first = await inviteToken(email);
    const res = await send('POST', `/api/users/${id}/resend-invite`, {}, admin);
    expect(res.status).toBe(200);
    expect(mailsTo(email).filter((m) => m.template === 'invite')).toHaveLength(2);
    const second = await inviteToken(email);
    expect(second).not.toBe(first);
    expect((await send('GET', `/api/auth/invite/${first}`)).status).toBe(400);
    expect((await send('GET', `/api/auth/invite/${second}`)).status).toBe(200);
  });

  it('accepting sets the name and password, activates, signs in, audits and tells the admins', async () => {
    const email = nextEmail('accept');
    const id = await inviteByAdmin(email);
    const token = await inviteToken(email);
    const res = await send(
      'POST',
      '/api/auth/accept-invite',
      { token, name: '  Sam Jones  ', password: STRONG },
      undefined,
      CHROME_MAC,
    );
    expect(res.status).toBe(200);
    const cookie = cookieOf(res);
    expect(cookie).toMatch(/^sid=/);
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect((await json(res)).user).toMatchObject({ id, name: 'Sam Jones', email, role: 'viewer' });

    const me = await json(await send('GET', '/api/auth/me', undefined, cookie));
    expect(me.user?.email).toBe(email);
    const rows = await app.db.query<{ status: string; name: string }>(
      'SELECT status, name FROM users WHERE id = ?',
      [id],
    );
    expect(rows[0]).toEqual({ status: 'active', name: 'Sam Jones' });
    expect(app.notified).toContainEqual(
      expect.objectContaining({
        admins: true,
        kind: 'team',
        title: 'Sam Jones accepted their invite',
      }),
    );
    const audit = await app.db.query<{ actor_label: string }>(
      "SELECT actor_label FROM audit_events WHERE action = 'user.accept_invite' AND target = ?",
      [email],
    );
    expect(audit).toEqual([{ actor_label: 'Sam Jones' }]);
    // and the password works from now on
    expect(await login(email, STRONG)).toMatch(/^sid=/);
  });

  it('refuses a password the policy refuses, and the token stays usable', async () => {
    const email = nextEmail('policy.sam');
    await inviteByAdmin(email);
    const token = await inviteToken(email);
    const accept = (password: string) =>
      send('POST', '/api/auth/accept-invite', { token, name: 'Sam', password });
    for (const [password, code] of [
      ['short', 'password_too_short'],
      ['password123', 'password_common'],
      ['x'.repeat(257), 'password_too_long'],
      [`POLICY.SAM${counter}-is-here`, 'password_contains_email'],
    ] as const) {
      const res = await accept(password);
      expect([password.slice(0, 12), res.status]).toEqual([password.slice(0, 12), 400]);
      expect((await json(res)).error.code).toBe(code);
    }
    expect((await accept('')).status).toBe(400);
    expect((await accept(STRONG)).status).toBe(200);
  });

  it('a blank name is refused', async () => {
    const email = nextEmail('noname');
    await inviteByAdmin(email);
    const token = await inviteToken(email);
    const res = await send('POST', '/api/auth/accept-invite', {
      token,
      name: '   ',
      password: STRONG,
    });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('invalid_name');
  });

  it('a token is single use: the second accept fails like an unknown token', async () => {
    const email = nextEmail('once');
    await inviteByAdmin(email);
    const token = await inviteToken(email);
    expect(
      (await send('POST', '/api/auth/accept-invite', { token, name: 'A', password: STRONG }))
        .status,
    ).toBe(200);
    const again = await send('POST', '/api/auth/accept-invite', {
      token,
      name: 'A',
      password: STRONG,
    });
    expect(again.status).toBe(400);
    expect((await json(again)).error.message).toBe('This link is invalid or has expired.');
  });

  it('two concurrent accepts of one token: exactly one wins', async () => {
    const email = nextEmail('race');
    await inviteByAdmin(email);
    const token = await inviteToken(email);
    const results = await Promise.all(
      [STRONG, `${STRONG}-second`, `${STRONG}-third`, `${STRONG}-fourth`].map((password) =>
        send('POST', '/api/auth/accept-invite', { token, name: 'Racer', password }),
      ),
    );
    const statuses = results.map((r) => r.status).toSorted();
    expect(statuses).toEqual([200, 400, 400, 400]);
    const winner = results.find((r) => r.status === 200);
    expect(winner).toBeDefined();
    const sessions = await app.db.query(
      'SELECT 1 FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = ?',
      [email],
    );
    expect(sessions).toHaveLength(1);
    const used = await app.db.query(
      'SELECT 1 FROM auth_tokens t JOIN users u ON u.id = t.user_id WHERE u.email = ? AND t.used_at IS NOT NULL',
      [email],
    );
    expect(used).toHaveLength(1);
  });

  it('an expired token, a used one and an unknown one answer identically', async () => {
    const email = nextEmail('expired');
    await inviteByAdmin(email);
    const token = await inviteToken(email);
    await app.db.execute(
      'UPDATE auth_tokens SET expires_at = ? WHERE user_id = (SELECT id FROM users WHERE email = ?)',
      [new Date(Date.now() - 1000), email],
    );
    const expired = await send('POST', '/api/auth/accept-invite', {
      token,
      name: 'A',
      password: STRONG,
    });
    const unknown = await send('POST', '/api/auth/accept-invite', {
      token: 'nope',
      name: 'A',
      password: STRONG,
    });
    expect(expired.status).toBe(400);
    expect(await json(expired)).toEqual(await json(unknown));
    expect((await send('GET', `/api/auth/invite/${token}`)).status).toBe(400);
  });

  it('a suspended invitee cannot accept an old link', async () => {
    const email = nextEmail('suspended');
    const id = await inviteByAdmin(email);
    const token = await inviteToken(email);
    await send('PATCH', `/api/users/${id}`, { status: 'suspended' }, admin);
    const res = await send('POST', '/api/auth/accept-invite', {
      token,
      name: 'A',
      password: STRONG,
    });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('invalid_token');
  });

  it('the invite token never appears in the request log path', async () => {
    const email = nextEmail('logged');
    await inviteByAdmin(email);
    const token = await inviteToken(email);
    await send('GET', `/api/auth/invite/${token}`);
    expect(JSON.stringify(app.logs)).not.toContain(token);
  });
});

describe('forgot password', () => {
  it('answers 202 with the same body for a known and an unknown address', async () => {
    const email = nextEmail('known');
    await makeUser(email, STRONG);
    const known = await send('POST', '/api/auth/forgot-password', { email });
    const unknown = await send('POST', '/api/auth/forgot-password', { email: nextEmail('ghost') });
    const garbage = await send('POST', '/api/auth/forgot-password', { email: 'not an email' });
    for (const res of [known, unknown, garbage]) expect(res.status).toBe(202);
    expect(await json(known)).toEqual({ ok: true });
    expect(await json(unknown)).toEqual({ ok: true });
    expect(await json(garbage)).toEqual({ ok: true });
    expect(known.headers.get('content-length')).toBe(unknown.headers.get('content-length'));
  });

  it('emails only an active account, with the reset data keys', async () => {
    const active = nextEmail('active');
    const invited = nextEmail('invitedperson');
    const suspended = nextEmail('suspendedperson');
    await makeUser(active, STRONG, { name: 'Active Person' });
    await makeUser(invited, STRONG, { status: 'invited' });
    await makeUser(suspended, STRONG, { status: 'suspended' });
    const ghost = nextEmail('nobody');
    for (const email of [active, invited, suspended, ghost]) {
      await send('POST', '/api/auth/forgot-password', { email: email.toUpperCase() });
    }
    expect(mailsTo(active)).toHaveLength(1);
    expect(mailsTo(invited)).toHaveLength(0);
    expect(mailsTo(suspended)).toHaveLength(0);
    expect(mailsTo(ghost)).toHaveLength(0);
    const mail = mailsTo(active)[0];
    expect(mail?.template).toBe('password_reset');
    expect(Object.keys(mail?.data ?? {}).toSorted()).toEqual(['expiresIn', 'link', 'name']);
    expect(mail?.data).toMatchObject({ name: 'Active Person', expiresIn: '1 hour' });
    expect(mail?.data.link).toMatch(/\/reset-password#token=[\w-]{43}$/);
  });

  it('is rate limited per email and per address, the same for any email', async () => {
    const small = await startTestApp({ limits: { forgotPerEmail: 2, forgotPerIp: 5 } });
    try {
      const ask = (email: string) =>
        fetch(`${small.base}/api/auth/forgot-password`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: ORIGIN },
          body: JSON.stringify({ email }),
        });
      expect((await ask('a@example.com')).status).toBe(202);
      expect((await ask('a@example.com')).status).toBe(202);
      expect((await ask('a@example.com')).status).toBe(429);
      expect((await ask('b@example.com')).status).toBe(202);
      expect((await ask('c@example.com')).status).toBe(202);
      expect((await ask('d@example.com')).status).toBe(202);
      // the address is now at 5, whatever the email
      expect((await ask('e@example.com')).status).toBe(429);
    } finally {
      await small.close();
    }
  });

  it('writes password.forgot to the audit log for an account that exists, and only then', async () => {
    const email = nextEmail('audited');
    await makeUser(email, STRONG);
    const ghost = nextEmail('ghosted');
    await send('POST', '/api/auth/forgot-password', { email });
    await send('POST', '/api/auth/forgot-password', { email: ghost });
    const rows = await app.db.query<{ target: string }>(
      "SELECT target FROM audit_events WHERE action = 'password.forgot'",
    );
    expect(rows.map((r) => r.target)).toContain(email);
    expect(rows.map((r) => r.target)).not.toContain(ghost);
  });
});

async function requestReset(email: string): Promise<string> {
  const before = mailsTo(email).filter((m) => m.template === 'password_reset').length;
  await send('POST', '/api/auth/forgot-password', { email });
  const mails = mailsTo(email).filter((m) => m.template === 'password_reset');
  expect(mails).toHaveLength(before + 1);
  return tokenIn(mails.at(-1)?.data.link ?? '');
}

describe('reset password', () => {
  it('sets the password, ends EVERY session, signs in fresh, and says so by email and notification', async () => {
    const email = nextEmail('reset');
    const id = await makeUser(email, 'old password here 91');
    const older = await login(email, 'old password here 91');
    const other = await login(email, 'old password here 91', CHROME_MAC);
    const token = await requestReset(email);

    const res = await send('POST', '/api/auth/reset-password', { token, password: STRONG });
    expect(res.status).toBe(200);
    const fresh = cookieOf(res);
    expect((await json(res)).user.email).toBe(email);

    // every earlier session is dead, the fresh one works
    for (const old of [older, other]) {
      expect((await json(await send('GET', '/api/auth/me', undefined, old))).user).toBeNull();
    }
    expect((await json(await send('GET', '/api/auth/me', undefined, fresh))).user?.email).toBe(
      email,
    );
    const live = await app.db.query(
      'SELECT 1 FROM sessions WHERE user_id = ? AND revoked_at IS NULL',
      [id],
    );
    expect(live).toHaveLength(1);
    // the old password is gone, the new one signs in
    expect(
      (await send('POST', '/api/auth/login', { email, password: 'old password here 91' })).status,
    ).toBe(401);
    expect(await login(email, STRONG)).toMatch(/^sid=/);

    expect(app.disconnected.users).toContain(id);
    const changed = mailsTo(email).filter((m) => m.template === 'password_changed');
    expect(changed).toHaveLength(1);
    expect(Object.keys(changed[0]?.data ?? {}).toSorted()).toEqual(['name', 'when']);
    expect(changed[0]?.data.when).toMatch(/UTC$/);
    expect(app.notified).toContainEqual(
      expect.objectContaining({ userId: id, kind: 'security', admins: false }),
    );
    const audit = await app.db.query(
      "SELECT 1 FROM audit_events WHERE action = 'password.reset' AND target = ?",
      [email],
    );
    expect(audit).toHaveLength(1);
  });

  it('a reset token works once', async () => {
    const email = nextEmail('resetonce');
    await makeUser(email, 'old password here 91');
    const token = await requestReset(email);
    expect(
      (await send('POST', '/api/auth/reset-password', { token, password: STRONG })).status,
    ).toBe(200);
    const again = await send('POST', '/api/auth/reset-password', {
      token,
      password: `${STRONG}-2`,
    });
    expect(again.status).toBe(400);
    expect((await json(again)).error.message).toBe('This link is invalid or has expired.');
  });

  it('asking again voids the older link', async () => {
    const email = nextEmail('resetagain');
    await makeUser(email, 'old password here 91');
    const first = await requestReset(email);
    const second = await requestReset(email);
    expect(
      (await send('POST', '/api/auth/reset-password', { token: first, password: STRONG })).status,
    ).toBe(400);
    expect(
      (await send('POST', '/api/auth/reset-password', { token: second, password: STRONG })).status,
    ).toBe(200);
  });

  it('expires after an hour', async () => {
    const email = nextEmail('resetexpiry');
    const id = await makeUser(email, 'old password here 91');
    const token = await requestReset(email);
    const rows = await app.db.query<{ created_at: string; expires_at: string }>(
      'SELECT created_at, expires_at FROM auth_tokens WHERE user_id = ?',
      [id],
    );
    expect(Date.parse(rows[0]?.expires_at ?? '') - Date.parse(rows[0]?.created_at ?? '')).toBe(
      3_600_000,
    );
    await app.db.execute('UPDATE auth_tokens SET expires_at = ? WHERE user_id = ?', [
      new Date(Date.now() - 1),
      id,
    ]);
    const res = await send('POST', '/api/auth/reset-password', { token, password: STRONG });
    expect(res.status).toBe(400);
    expect((await json(res)).error.code).toBe('invalid_token');
  });

  it('applies the password policy and keeps the link usable after a refusal', async () => {
    const email = nextEmail('resetpolicy.tom');
    await makeUser(email, 'old password here 91');
    const token = await requestReset(email);
    const weak = await send('POST', '/api/auth/reset-password', { token, password: 'password123' });
    expect(weak.status).toBe(400);
    expect((await json(weak)).error.code).toBe('password_common');
    expect(
      (await send('POST', '/api/auth/reset-password', { token, password: STRONG })).status,
    ).toBe(200);
  });

  it('an invitation token does not work as a reset token, nor the other way round', async () => {
    const email = nextEmail('purpose');
    await inviteByAdmin(email);
    const invite = await inviteToken(email);
    const res = await send('POST', '/api/auth/reset-password', { token: invite, password: STRONG });
    expect(res.status).toBe(400);
    const other = nextEmail('purposeactive');
    await makeUser(other, 'old password here 91');
    const reset = await requestReset(other);
    expect(
      (await send('POST', '/api/auth/accept-invite', { token: reset, name: 'A', password: STRONG }))
        .status,
    ).toBe(400);
  });
});

describe('account', () => {
  it('needs a session', async () => {
    for (const [method, path] of [
      ['GET', '/api/account'],
      ['PATCH', '/api/account'],
      ['POST', '/api/account/password'],
      ['GET', '/api/account/sessions'],
      ['DELETE', '/api/account/sessions/abc'],
      ['POST', '/api/account/sessions/revoke-others'],
      ['PUT', '/api/account/avatar'],
      ['DELETE', '/api/account/avatar'],
      ['GET', '/api/files/abc'],
    ] as const) {
      expect(
        (await send(method, path, method === 'GET' ? undefined : {})).status,
        `${method} ${path}`,
      ).toBe(401);
    }
  });

  it('GET and PATCH are about the caller; a name change is audited', async () => {
    const email = nextEmail('profile');
    const id = await makeUser(email, STRONG, { name: 'Before Name' });
    const cookie = await login(email, STRONG);
    const got = await json(await send('GET', '/api/account', undefined, cookie));
    expect(got.account).toEqual({
      id,
      name: 'Before Name',
      email,
      role: 'editor',
      avatarUrl: null,
    });
    const patched = await send('PATCH', '/api/account', { name: '  After Name ' }, cookie);
    expect(patched.status).toBe(200);
    expect((await json(patched)).account.name).toBe('After Name');
    const audit = await app.db.query(
      "SELECT actor_label FROM audit_events WHERE action = 'profile.update' AND target = ?",
      [email],
    );
    expect(audit).toEqual([{ actor_label: 'After Name' }]);
    for (const bad of ['', '   ', 'x'.repeat(201)]) {
      expect((await send('PATCH', '/api/account', { name: bad }, cookie)).status).toBe(400);
    }
    expect((await send('PATCH', '/api/account', { nope: 1 }, cookie)).status).toBe(400);
  });

  it('changing the password needs the current one, signs out the OTHER sessions and keeps this one', async () => {
    const email = nextEmail('change');
    const id = await makeUser(email, 'old password here 91');
    const here = await login(email, 'old password here 91', CHROME_MAC);
    const there = await login(email, 'old password here 91', FIREFOX_WIN);
    const listed = await json(await send('GET', '/api/account/sessions', undefined, here));
    const thereId = (listed.sessions as { id: string; current: boolean }[]).find(
      (s) => !s.current,
    )?.id;

    const wrong = await send(
      'POST',
      '/api/account/password',
      { currentPassword: 'not it at all', newPassword: STRONG },
      here,
    );
    expect(wrong.status).toBe(400);
    expect((await json(wrong)).error).toMatchObject({ code: 'incorrect_password' });

    const weak = await send(
      'POST',
      '/api/account/password',
      { currentPassword: 'old password here 91', newPassword: 'password123' },
      here,
    );
    expect((await json(weak)).error.code).toBe('password_common');
    const same = await send(
      'POST',
      '/api/account/password',
      { currentPassword: 'old password here 91', newPassword: 'old password here 91' },
      here,
    );
    expect((await json(same)).error.code).toBe('password_unchanged');

    const ok = await send(
      'POST',
      '/api/account/password',
      { currentPassword: 'old password here 91', newPassword: STRONG },
      here,
    );
    expect(ok.status).toBe(200);
    expect((await json(await send('GET', '/api/auth/me', undefined, here))).user?.email).toBe(
      email,
    );
    expect((await json(await send('GET', '/api/auth/me', undefined, there))).user).toBeNull();
    expect(app.disconnected.sessions).toContain(thereId);
    expect(mailsTo(email).filter((m) => m.template === 'password_changed')).toHaveLength(1);
    expect(app.notified).toContainEqual(
      expect.objectContaining({ userId: id, kind: 'security', title: 'Your password was changed' }),
    );
    const audit = await app.db.query<{ outcome: string }>(
      "SELECT outcome FROM audit_events WHERE action = 'password.change' AND target = ? ORDER BY outcome",
      [email],
    );
    expect(audit.map((a) => a.outcome)).toEqual(['failure', 'success']);
    expect(await login(email, STRONG)).toMatch(/^sid=/);
  });

  it('wrong current passwords are rate limited', async () => {
    const email = nextEmail('guessing');
    await makeUser(email, STRONG);
    const cookie = await login(email, STRONG);
    const attempt = () =>
      send(
        'POST',
        '/api/account/password',
        { currentPassword: 'wrong guess here', newPassword: `${STRONG}-new` },
        cookie,
      );
    for (let i = 0; i < 5; i++) expect((await attempt()).status).toBe(400);
    expect((await attempt()).status).toBe(429);
    // even the right password waits out the window
    const right = await send(
      'POST',
      '/api/account/password',
      { currentPassword: STRONG, newPassword: `${STRONG}-new` },
      cookie,
    );
    expect(right.status).toBe(429);
  });

  it('lists live sessions with a current flag and never the token hash', async () => {
    const email = nextEmail('sessions');
    await makeUser(email, STRONG);
    const a = await login(email, STRONG, CHROME_MAC);
    await login(email, STRONG, FIREFOX_WIN);
    const res = await send('GET', '/api/account/sessions', undefined, a);
    const body = await json(res);
    expect(body.sessions).toHaveLength(2);
    expect((body.sessions as { current: boolean }[]).filter((s) => s.current)).toHaveLength(1);
    const first = (body.sessions as Record<string, unknown>[]).find((s) => s.current);
    expect(Object.keys(first ?? {}).toSorted()).toEqual([
      'createdAt',
      'current',
      'id',
      'ip',
      'lastSeenAt',
      'userAgent',
    ]);
    expect(first?.userAgent).toBe(CHROME_MAC);
    expect(JSON.stringify(body)).not.toMatch(/[0-9a-f]{64}/);
  });

  it("revokes one of your own sessions (404 for anyone else's) and closes its stream", async () => {
    const mine = nextEmail('revoke');
    const theirs = nextEmail('bystander');
    await makeUser(mine, STRONG);
    await makeUser(theirs, STRONG);
    const here = await login(mine, STRONG, CHROME_MAC);
    const there = await login(mine, STRONG, FIREFOX_WIN);
    const stranger = await login(theirs, STRONG);
    const sessions = (await json(await send('GET', '/api/account/sessions', undefined, here)))
      .sessions as { id: string; current: boolean }[];
    const other = sessions.find((s) => !s.current)?.id ?? '';
    const strangerSession =
      (
        (await json(await send('GET', '/api/account/sessions', undefined, stranger))).sessions as {
          id: string;
        }[]
      )[0]?.id ?? '';

    const cross = await send('DELETE', `/api/account/sessions/${strangerSession}`, undefined, here);
    expect(cross.status).toBe(404);
    expect((await json(cross)).error.code).toBe('session_not_found');
    expect((await json(await send('GET', '/api/auth/me', undefined, stranger))).user?.email).toBe(
      theirs,
    );
    expect(
      (await send('DELETE', '/api/account/sessions/not-a-session', undefined, here)).status,
    ).toBe(404);

    expect((await send('DELETE', `/api/account/sessions/${other}`, undefined, here)).status).toBe(
      200,
    );
    expect((await json(await send('GET', '/api/auth/me', undefined, there))).user).toBeNull();
    expect(app.disconnected.sessions).toContain(other);
    // already ended: a second revoke is a 404
    expect((await send('DELETE', `/api/account/sessions/${other}`, undefined, here)).status).toBe(
      404,
    );
    expect((await send('GET', '/api/account/sessions', undefined, here)).status).toBe(200);
    const audit = await app.db.query(
      "SELECT 1 FROM audit_events WHERE action = 'session.revoke' AND actor_label = 'Test Person'",
    );
    expect(audit.length).toBeGreaterThan(0);
  });

  it('revoke-others ends every session but this one', async () => {
    const email = nextEmail('others');
    await makeUser(email, STRONG);
    const here = await login(email, STRONG, CHROME_MAC);
    const b = await login(email, STRONG, FIREFOX_WIN);
    const c = await login(email, STRONG, 'curl/8.0');
    const res = await send('POST', '/api/account/sessions/revoke-others', {}, here);
    expect(res.status).toBe(200);
    expect((await json(res)).revoked).toBe(2);
    expect((await json(await send('GET', '/api/auth/me', undefined, here))).user?.email).toBe(
      email,
    );
    for (const gone of [b, c]) {
      expect((await json(await send('GET', '/api/auth/me', undefined, gone))).user).toBeNull();
    }
    expect(
      (await json(await send('POST', '/api/account/sessions/revoke-others', {}, here))).revoked,
    ).toBe(0);
  });
});

describe('new sign-in notice', () => {
  it('raises a security notification for a browser not seen in recent sessions, once', async () => {
    const email = nextEmail('newdevice');
    const id = await makeUser(email, STRONG);
    const notices = () => app.notified.filter((n) => n.userId === id && n.kind === 'security');
    await login(email, STRONG, CHROME_MAC);
    expect(notices()).toHaveLength(0); // the first ever session has nothing to compare with
    await login(email, STRONG, CHROME_MAC.replace('126', '127'));
    expect(notices()).toHaveLength(0); // the same browser and system, a newer version
    await login(email, STRONG, FIREFOX_WIN);
    expect(notices()).toHaveLength(1);
    expect(notices()[0]).toMatchObject({
      title: 'New sign-in on Firefox on Windows',
      link: '/account',
    });
    await login(email, STRONG, FIREFOX_WIN);
    expect(notices()).toHaveLength(1);
  });
});
