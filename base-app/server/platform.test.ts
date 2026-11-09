/* The platform over HTTP: server-side settings, maintenance mode, the admin Mail page and the
   admin Jobs page. Who may call what, what each writes to the audit log, and that maintenance
   mode shuts non-admins out of everything except the way in. */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ORIGIN, startTestApp, type TestApp, VIEWER_EMAIL, VIEWER_PASSWORD } from './testing.ts';

let app: TestApp;
let admin = '';
let viewer = '';

beforeAll(async () => {
  app = await startTestApp();
  admin = await app.signIn();
  viewer = await app.signIn(VIEWER_EMAIL, VIEWER_PASSWORD);
});
afterAll(() => app.close());
beforeEach(async () => {
  await app.db.execute('DELETE FROM jobs');
  await app.db.execute('DELETE FROM outbound_emails');
  await setSettings({ 'maintenance.enabled': false });
});

const call = (method: string, path: string, cookie?: string, body?: unknown) =>
  fetch(`${app.base}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
// oxlint-disable-next-line typescript/no-explicit-any -- response JSON is inspected loosely in tests
const json = async (res: Response) => (await res.json()) as Record<string, any>;
const setSettings = (body: Record<string, unknown>) => call('PUT', '/api/settings', admin, body);

describe('GET /api/settings', () => {
  it('needs a session and gives every signed-in user the public settings', async () => {
    expect((await call('GET', '/api/settings')).status).toBe(401);
    const res = await call('GET', '/api/settings', viewer);
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      settings: {
        'workspace.name': 'Base app',
        'maintenance.enabled': false,
        'maintenance.message': expect.any(String),
      },
    });
  });
});

describe('PUT /api/settings', () => {
  it('is admin only', async () => {
    expect((await call('PUT', '/api/settings', undefined, { 'workspace.name': 'X' })).status).toBe(
      401,
    );
    expect((await call('PUT', '/api/settings', viewer, { 'workspace.name': 'X' })).status).toBe(
      403,
    );
  });

  it('stores, returns, shows to everyone, and writes a settings.update audit event', async () => {
    const res = await setSettings({ 'workspace.name': 'Acme HQ' });
    expect(res.status).toBe(200);
    expect((await json(res)).settings['workspace.name']).toBe('Acme HQ');
    expect(
      (await json(await call('GET', '/api/settings', viewer))).settings['workspace.name'],
    ).toBe('Acme HQ');
    const audit = await json(await call('GET', '/api/audit-log', admin));
    expect(audit.events[0]).toMatchObject({ action: 'settings.update', target: 'workspace.name' });
    await setSettings({ 'workspace.name': 'Base app' });
  });

  it('answers 400 invalid_setting naming the key, and 400 for a body that is not an object', async () => {
    for (const body of [{ 'workspace.name': '' }, { 'maintenance.enabled': 'yes' }, { nope: 1 }]) {
      const res = await setSettings(body);
      expect(res.status).toBe(400);
      expect((await json(res)).error.code).toBe('invalid_setting');
    }
    expect((await setSettings({})).status).toBe(400);
    expect((await call('PUT', '/api/settings', admin, [1, 2])).status).toBe(400);
    expect((await call('PUT', '/api/settings', admin, 'x')).status).toBe(400);
  });

  it('refuses a foreign Origin like every state-changing request', async () => {
    const res = await fetch(`${app.base}/api/settings`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example.com',
        cookie: admin,
      },
      body: JSON.stringify({ 'workspace.name': 'Hacked' }),
    });
    expect(res.status).toBe(403);
  });
});

describe('maintenance mode', () => {
  it('turns every API call from a non-admin into a 503 maintenance, except the way in', async () => {
    await setSettings({ 'maintenance.enabled': true, 'maintenance.message': 'Back at 3pm' });

    const blocked = await call('GET', '/api/transactions', viewer);
    expect(blocked.status).toBe(503);
    expect(await json(blocked)).toEqual({
      ok: false,
      error: { code: 'maintenance', message: 'Back at 3pm' },
    });
    for (const [method, path] of [
      ['GET', '/api/activity'],
      ['GET', '/api/metrics/kpis'],
      ['POST', '/api/llm/complete'],
    ] as const) {
      const res = await call(method, path, viewer, method === 'POST' ? {} : undefined);
      expect(`${path} ${res.status}`).toBe(`${path} 503`);
    }

    // still reachable: health, who am I, the settings (that is how the client learns), sign-in/out
    expect((await call('GET', '/api/health')).status).toBe(200);
    expect((await call('GET', '/api/auth/me', viewer)).status).toBe(200);
    const settings = await json(await call('GET', '/api/settings', viewer));
    expect(settings.settings).toMatchObject({
      'maintenance.enabled': true,
      'maintenance.message': 'Back at 3pm',
    });
    const login = await call('POST', '/api/auth/login', undefined, {
      email: VIEWER_EMAIL,
      password: VIEWER_PASSWORD,
    });
    const own = (login.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    expect((await call('POST', '/api/auth/logout', own, {})).status).toBe(200);
  });

  it('does not turn a signed-out 401 into a 503, and does not hide an admin route as 503 from a viewer', async () => {
    await setSettings({ 'maintenance.enabled': true });
    expect((await call('GET', '/api/transactions')).status).toBe(401);
    expect((await call('GET', '/api/users', viewer)).status).toBe(403);
  });

  it('lets an admin use everything, and a change in the setting takes effect at once', async () => {
    await setSettings({ 'maintenance.enabled': true });
    expect((await call('GET', '/api/transactions', admin)).status).toBe(200);
    expect((await call('GET', '/api/admin/jobs', admin)).status).toBe(200);
    expect((await call('GET', '/api/transactions', viewer)).status).toBe(503);
    await setSettings({ 'maintenance.enabled': false });
    expect((await call('GET', '/api/transactions', viewer)).status).toBe(200);
  });

  it('is off by default', async () => {
    expect((await call('GET', '/api/transactions', viewer)).status).toBe(200);
  });
});

async function queueEmail(
  to: string,
  link = 'https://app.example.com/#/reset?token=t',
): Promise<void> {
  await app.db.transaction((tx) =>
    app.services.outbox.sendEmail(tx, {
      to,
      template: 'password_reset',
      data: { name: 'Pat', link, expiresIn: '1 hour' },
    }),
  );
}

describe('GET /api/admin/emails', () => {
  it('is admin only', async () => {
    expect((await call('GET', '/api/admin/emails')).status).toBe(401);
    expect((await call('GET', '/api/admin/emails', viewer)).status).toBe(403);
    expect((await call('GET', '/api/admin/emails/x', viewer)).status).toBe(403);
  });

  it('lists newest first with paging, metadata only', async () => {
    await queueEmail('a@example.com');
    await new Promise((r) => setTimeout(r, 3));
    await queueEmail('b@example.com');
    await new Promise((r) => setTimeout(r, 3));
    await queueEmail('c@example.com');
    const res = await call('GET', '/api/admin/emails?page=1&pageSize=2', admin);
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toMatchObject({ ok: true, total: 3, page: 1, pageSize: 2 });
    expect(body.emails.map((e: { to: string }) => e.to)).toEqual([
      'c@example.com',
      'b@example.com',
    ]);
    expect(body.emails[0]).toMatchObject({
      template: 'password_reset',
      status: 'queued',
      provider: 'log',
      sentAt: null,
      subject: expect.stringContaining('Reset your'),
    });
    expect(JSON.stringify(body)).not.toContain('bodyText');
    expect(
      (await json(await call('GET', '/api/admin/emails?page=2&pageSize=2', admin))).emails,
    ).toHaveLength(1);
  });

  it('shows one email with the text body and its links, never the HTML', async () => {
    await queueEmail('a@example.com', 'https://app.example.com/#/reset?token=SECRETLINK');
    const list = await json(await call('GET', '/api/admin/emails', admin));
    const res = await call('GET', `/api/admin/emails/${list.emails[0].id}`, admin);
    expect(res.status).toBe(200);
    const { email } = await json(res);
    expect(email.bodyText).toContain('https://app.example.com/#/reset?token=SECRETLINK');
    expect(email).not.toHaveProperty('bodyHtml');
    expect(JSON.stringify(email)).not.toContain('<html');
    const missing = await call('GET', '/api/admin/emails/nope', admin);
    expect(missing.status).toBe(404);
    expect((await json(missing)).error.code).toBe('email_not_found');
  });

  it('rejects a bad page', async () => {
    expect((await call('GET', '/api/admin/emails?page=abc', admin)).status).toBe(400);
    expect((await call('GET', '/api/admin/emails?page=0', admin)).status).toBe(400);
    expect((await call('GET', '/api/admin/emails?pageSize=1000', admin)).status).toBe(400);
  });
});

describe('admin jobs', () => {
  it('is admin only', async () => {
    expect((await call('GET', '/api/admin/jobs')).status).toBe(401);
    expect((await call('GET', '/api/admin/jobs', viewer)).status).toBe(403);
    expect((await call('POST', '/api/admin/jobs/x/retry', viewer, {})).status).toBe(403);
  });

  it('lists with counts and a status filter, without payloads', async () => {
    await queueEmail('a@example.com');
    await app.services.jobs.tick();
    await app.services.jobs.idle(); // the log transport "sends" it
    // the first tick also scheduled the housekeeping jobs; this test is about the email job
    await app.db.execute("DELETE FROM jobs WHERE kind <> 'send_email'");
    await queueEmail('b@example.com');
    const all = await json(await call('GET', '/api/admin/jobs', admin));
    expect(all.total).toBe(2);
    expect(all.counts).toEqual({ queued: 1, running: 0, succeeded: 1, failed: 0, dead: 0 });
    expect(JSON.stringify(all)).not.toContain('payload');
    const queued = await json(await call('GET', '/api/admin/jobs?status=queued', admin));
    expect(queued.jobs).toHaveLength(1);
    expect(queued.jobs[0]).toMatchObject({ kind: 'send_email', status: 'queued', attempts: 0 });
    expect((await call('GET', '/api/admin/jobs?status=bogus', admin)).status).toBe(400);
  });

  it('retries a failed job (audited), and refuses one that is not failed or dead', async () => {
    await app.db.transaction((tx) => app.services.jobs.enqueue(tx, 'no-such-kind', {}));
    await app.services.jobs.tick();
    await app.services.jobs.idle();
    const failed = (await json(await call('GET', '/api/admin/jobs?status=failed', admin))).jobs[0];
    expect(failed).toMatchObject({ kind: 'no-such-kind', status: 'failed' });
    expect(failed.lastError).toMatch(/No handler/);

    const res = await call('POST', `/api/admin/jobs/${failed.id}/retry`, admin, {});
    expect(res.status).toBe(200);
    expect((await json(res)).job).toMatchObject({ id: failed.id, status: 'queued', attempts: 0 });
    const audit = await json(await call('GET', '/api/audit-log', admin));
    expect(audit.events[0]).toMatchObject({
      action: 'job.retry',
      target: `no-such-kind ${failed.id}`,
    });

    const again = await call('POST', `/api/admin/jobs/${failed.id}/retry`, admin, {});
    expect(again.status).toBe(409);
    expect((await json(again)).error.code).toBe('job_not_retryable');
    expect((await call('POST', '/api/admin/jobs/nope/retry', admin, {})).status).toBe(404);
  });
});
