/* The whole server, end to end: client → HTTP → routes → services →
   repositories → sqlite. Auth levels, sessions, the data routes, invites,
   request IDs, error IDs and the LLM endpoint's defences. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HttpError } from './infra/http/errors.ts';
import { LlmError } from './infra/llm/types.ts';
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

beforeAll(async () => {
  app = await startTestApp({
    extraRoutes: [
      {
        method: 'GET',
        path: '/api/__boom',
        auth: 'public',
        handler: async () => {
          throw new Error('secret internal detail');
        },
      },
      {
        method: 'GET',
        path: '/api/__teapot',
        auth: 'public',
        handler: async () => {
          throw new HttpError(418, 'teapot', 'I am a teapot');
        },
      },
    ],
  });
  admin = await app.signIn();
  viewer = await app.signIn(VIEWER_EMAIL, VIEWER_PASSWORD);
});
afterAll(() => app.close());

const get = (path: string, cookie?: string) =>
  fetch(`${app.base}${path}`, { headers: cookie ? { cookie } : {} });
const post = (path: string, body: unknown, cookie?: string, headers: Record<string, string> = {}) =>
  fetch(`${app.base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      ...(cookie ? { cookie } : {}),
      ...headers,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
const total = (pts: { value: number }[]) => pts.reduce((a, p) => a + p.value, 0);
// oxlint-disable-next-line typescript/no-explicit-any -- response JSON is inspected loosely in tests
const json = async (res: Response) => (await res.json()) as Record<string, any>;

describe('platform', () => {
  it('health is public, with security headers and a request id', async () => {
    const res = await get('/api/health');
    expect(res.status).toBe(200);
    expect((await json(res)).service).toBe('base-app-api');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-request-id')).toMatch(/^[\w.-]{8,64}$/);
  });

  it('keeps a valid incoming request id', async () => {
    const res = await fetch(`${app.base}/api/health`, {
      headers: { 'x-request-id': 'trace-12345678' },
    });
    expect(res.headers.get('x-request-id')).toBe('trace-12345678');
  });

  it('a crash answers 500 with an errorId and no internals, and logs the same id', async () => {
    const res = await get('/api/__boom');
    const body = await json(res);
    expect(res.status).toBe(500);
    expect(body.error.code).toBe('internal_error');
    expect(body.error.errorId).toBe(res.headers.get('x-request-id'));
    expect(JSON.stringify(body)).not.toContain('secret internal detail');
    expect(app.logs.some((l) => l.errorId === body.error.errorId && l.level === 'error')).toBe(
      true,
    );
  });

  it('an HttpError keeps its own envelope', async () => {
    const res = await get('/api/__teapot');
    expect(res.status).toBe(418);
    expect((await json(res)).error.code).toBe('teapot');
  });

  it('404 for an unknown route, 405 with Allow for the wrong method', async () => {
    expect((await get('/api/nope')).status).toBe(404);
    const res = await post('/api/health', {});
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET');
  });
});

describe('auth', () => {
  it('me is null when signed out, the user when signed in', async () => {
    expect((await json(await get('/api/auth/me'))).user).toBeNull();
    const me = await json(await get('/api/auth/me', admin));
    expect(me.user).toMatchObject({ email: ADMIN_EMAIL, role: 'admin' });
    expect(me.user.passwordHash).toBeUndefined();
  });

  it('the session cookie is httpOnly, SameSite=Strict, and carries no user data', async () => {
    const res = await post('/api/auth/login', {
      email: ADMIN_EMAIL,
      password: 'correct horse battery staple',
    });
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^sid=[\w-]{40,};/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).not.toContain('admin');
  });

  it('only a hash of the token is stored', async () => {
    const token = admin.slice('sid='.length);
    const rows = await app.db.query<{ token_hash: string }>('SELECT token_hash FROM sessions');
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.token_hash === token)).toBe(false);
  });

  it('records the browser and address on the session, and signing out revokes it', async () => {
    const res = await fetch(`${app.base}/api/auth/login`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: ORIGIN,
        'user-agent': 'TestBrowser/9.9',
      },
      body: JSON.stringify({ email: ADMIN_EMAIL, password: 'correct horse battery staple' }),
    });
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    const [row] = await app.db.query<{ user_agent: string; ip: string; revoked_at: string | null }>(
      'SELECT user_agent, ip, revoked_at FROM sessions WHERE token_hash <> ? ORDER BY created_at DESC LIMIT 1',
      [''],
    );
    expect(row).toMatchObject({ user_agent: 'TestBrowser/9.9', ip: '127.0.0.1', revoked_at: null });
    const out = await fetch(`${app.base}/api/auth/logout`, {
      method: 'POST',
      headers: { origin: ORIGIN, cookie },
    });
    expect(out.status).toBe(200);
    const [after] = await app.db.query<{ revoked_at: string | null }>(
      'SELECT revoked_at FROM sessions WHERE user_agent = ?',
      ['TestBrowser/9.9'],
    );
    expect(after?.revoked_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);
    const me = await fetch(`${app.base}/api/auth/me`, { headers: { cookie } });
    expect((await json(me)).user).toBeNull();
  });

  it('wrong password and unknown email give the same 401, and are audited', async () => {
    const a = await post('/api/auth/login', { email: ADMIN_EMAIL, password: 'nope' });
    const b = await post('/api/auth/login', { email: 'ghost@example.com', password: 'nope' });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect((await json(a)).error).toEqual((await json(b)).error);
    const failures = await app.db.query(
      "SELECT * FROM audit_events WHERE action = 'login' AND outcome = 'failure'",
    );
    expect(failures.length).toBeGreaterThanOrEqual(2);
  });

  it('rate limits repeated failures for one email', async () => {
    const email = 'brute@example.com';
    let last = 0;
    for (let i = 0; i < 11; i++)
      last = (await post('/api/auth/login', { email, password: `x${i}` })).status;
    expect(last).toBe(429);
  });

  it('a parallel burst cannot slip past the limit', async () => {
    const email = 'burst@example.com';
    const statuses = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        post('/api/auth/login', { email, password: `p${i}` }).then((r) => r.status),
      ),
    );
    expect(statuses.filter((s) => s === 401).length).toBeLessThanOrEqual(10);
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThanOrEqual(20);
  });

  it('rejects a login from a foreign Origin (CSRF)', async () => {
    const res = await post('/api/auth/login', { email: ADMIN_EMAIL, password: 'x' }, undefined, {
      origin: 'http://evil.example',
    });
    expect(res.status).toBe(403);
    expect((await json(res)).error.code).toBe('forbidden_origin');
  });

  it('logout ends the session', async () => {
    const cookie = await app.signIn();
    expect((await post('/api/auth/logout', {}, cookie)).headers.get('set-cookie')).toContain(
      'Max-Age=0',
    );
    expect((await get('/api/transactions', cookie)).status).toBe(401);
  });
});

describe('auth levels', () => {
  const userRoutes = [
    '/api/transactions',
    '/api/activity',
    '/api/metrics/kpis',
    '/api/metrics/revenue',
    '/api/metrics/categories',
    '/api/metrics/signups',
    '/api/metrics/spend-by-status',
  ];
  const adminRoutes = ['/api/users', '/api/audit-log', '/api/db/ping'];

  it('user routes: 401 signed out, 200 for a viewer', async () => {
    for (const path of userRoutes) {
      expect([path, (await get(path)).status]).toEqual([path, 401]);
      expect([path, (await get(path, viewer)).status]).toEqual([path, 200]);
    }
  });

  it('admin routes: 401 signed out, 403 for a viewer, 200 for an admin', async () => {
    for (const path of adminRoutes) {
      expect([path, (await get(path)).status]).toEqual([path, 401]);
      const denied = await get(path, viewer);
      expect(denied.status).toBe(403);
      expect((await json(denied)).error.code).toBe('forbidden');
      expect([path, (await get(path, admin)).status]).toEqual([path, 200]);
    }
  });
});

describe('data through the API', () => {
  it('serves the seeded records', async () => {
    const tx = await json(await get('/api/transactions', viewer));
    expect(tx.transactions).toHaveLength(240);
    expect(tx.transactions[0].date >= tx.transactions[1].date).toBe(true);
    expect((await json(await get('/api/activity', viewer))).activity).toHaveLength(8);
    expect((await json(await get('/api/metrics/kpis', viewer))).kpis).toHaveLength(4);
    expect((await json(await get('/api/metrics/signups', viewer))).signups).toHaveLength(12);
  });

  it('categories are a SQL GROUP BY that matches the transactions', async () => {
    const tx = (await json(await get('/api/transactions', viewer))).transactions as {
      amountMinor: number;
    }[];
    const cats = (await json(await get('/api/metrics/categories', viewer))).categories as {
      value: number;
    }[];
    expect(cats.reduce((s, c) => s + c.value, 0)).toBe(tx.reduce((s, t) => s + t.amountMinor, 0));
  });

  it('revenue honours days and rejects anything else', async () => {
    const r30 = await json(await get('/api/metrics/revenue?days=30', viewer));
    expect(r30.revenue).toHaveLength(30);
    expect(r30.costs).toHaveLength(30);
    expect((await json(await get('/api/metrics/revenue?days=7', viewer))).revenue).toHaveLength(7);
    expect((await get('/api/metrics/revenue?days=14', viewer)).status).toBe(400);
  });

  it('revenue compare=1 adds the days just before, and leaves them out otherwise', async () => {
    const plain = await json(await get('/api/metrics/revenue?days=30', viewer));
    expect(plain.previousRevenue).toBeUndefined();
    const withPrev = await json(await get('/api/metrics/revenue?days=30&compare=1', viewer));
    expect(withPrev.previousRevenue).toHaveLength(30);
    // the previous window ends the day before the current one starts
    const lastPrev = withPrev.previousRevenue.at(-1).date as string;
    const firstNow = withPrev.revenue[0].date as string;
    expect(new Date(firstNow).getTime() - new Date(lastPrev).getTime()).toBe(86_400_000);
    // 90 days still has a full 90 before it (180 are seeded)
    const r90 = await json(await get('/api/metrics/revenue?days=90&compare=1', viewer));
    expect(r90.previousRevenue).toHaveLength(90);
  });

  it('kpis honour days (7, 30, 90), compare revenue with the range before, and reject others', async () => {
    const stored = (await json(await get('/api/metrics/kpis', viewer))).kpis as { id: string }[];
    expect(stored).toHaveLength(4);
    for (const days of [7, 30, 90]) {
      const { kpis } = await json(await get(`/api/metrics/kpis?days=${days}`, viewer));
      expect(kpis.map((k: { id: string }) => k.id)).toEqual(stored.map((k) => k.id));
      const rev = kpis[0];
      const r = await json(await get(`/api/metrics/revenue?days=${days}&compare=1`, viewer));
      expect(rev.value).toBe(total(r.revenue));
      expect(rev.previous).toBe(total(r.previousRevenue));
    }
    expect((await get('/api/metrics/kpis?days=60', viewer)).status).toBe(400);
    expect((await get('/api/metrics/kpis?days=abc', viewer)).status).toBe(400);
  });

  it('spend by status is a SQL GROUP BY that adds back up to the category totals', async () => {
    const { breakdown } = await json(await get('/api/metrics/spend-by-status', viewer));
    expect(breakdown.map((b: { status: string }) => b.status)).toEqual([
      'paid',
      'pending',
      'failed',
      'refunded',
    ]);
    const cats = (await json(await get('/api/metrics/categories', viewer))).categories as {
      label: string;
      value: number;
    }[];
    for (const c of cats) {
      const split = breakdown.reduce(
        (a: number, b: { data: { label: string; value: number }[] }) =>
          a + (b.data.find((d) => d.label === c.label)?.value ?? 0),
        0,
      );
      expect([c.label, split]).toEqual([c.label, c.value]);
    }
  });

  it('invites a user (admin only), and refuses a duplicate email', async () => {
    const body = {
      name: 'New Person',
      email: 'New.Person@example.com',
      role: 'editor',
      sendWelcome: true,
    };
    expect((await post('/api/users', body, viewer)).status).toBe(403);
    const created = await post('/api/users', body, admin);
    expect(created.status).toBe(201);
    expect((await json(created)).user).toMatchObject({
      email: 'new.person@example.com',
      status: 'invited',
      role: 'editor',
    });
    const again = await post('/api/users', body, admin);
    expect(again.status).toBe(409);
    expect((await json(again)).error.code).toBe('email_taken');
    const audit = (await json(await get('/api/audit-log', admin))).events as {
      action: string;
      target: string;
    }[];
    expect(
      audit.some((e) => e.action === 'user.invite' && e.target === 'new.person@example.com'),
    ).toBe(true);
  });

  it('validates an invite', async () => {
    expect((await post('/api/users', { name: 'x' }, admin)).status).toBe(400);
    const bad = await post(
      '/api/users',
      { name: 'x', email: 'not-an-email', role: 'editor', sendWelcome: false },
      admin,
    );
    expect((await json(bad)).error.code).toBe('invalid_email');
  });

  it('db ping names the driver', async () => {
    expect(await json(await get('/api/db/ping', admin))).toMatchObject({
      ok: true,
      driver: 'sqlite',
    });
  });
});

describe('POST /api/llm/complete', () => {
  it('answers a signed-in user and passes the request through', async () => {
    const res = await post('/api/llm/complete', { prompt: 'ping', maxTokens: 10 }, viewer);
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({ ok: true, text: 'pong', provider: 'anthropic' });
    expect(app.llmCalls.at(-1)).toMatchObject({
      messages: [{ role: 'user', content: 'ping' }],
      maxTokens: 10,
    });
  });

  it('is closed to signed-out callers', async () => {
    expect((await post('/api/llm/complete', { prompt: 'x' })).status).toBe(401);
  });

  it('enforces its body rules', async () => {
    const t = (body: unknown, headers?: Record<string, string>) =>
      post('/api/llm/complete', body, viewer, headers).then((r) => r.status);
    expect(await t('hi', { 'content-type': 'text/plain' })).toBe(415);
    expect(await t({ prompt: 'x'.repeat(70 * 1024) })).toBe(413);
    expect(await t('')).toBe(400);
    expect(await t('{nope')).toBe(400);
    expect(await t({ prompt: 'a', messages: [{ role: 'user', content: 'b' }] })).toBe(400);
    expect(await t({})).toBe(400);
    expect(await t({ prompt: 'a', maxTokens: 0 })).toBe(400);
    expect(
      await t({ messages: Array.from({ length: 51 }, () => ({ role: 'user', content: 'x' })) }),
    ).toBe(400);
  });

  it('maps provider failures without leaking their text', async () => {
    const cases: [LlmError, number, string][] = [
      [
        new LlmError('config', 'anthropic', 'ANTHROPIC_API_KEY is not set'),
        503,
        'llm_not_configured',
      ],
      [new LlmError('refusal', 'anthropic', 'no'), 422, 'refusal'],
      [new LlmError('timeout', 'anthropic', 'slow'), 504, 'timeout'],
      [new LlmError('http', 'anthropic', 'upstream secret text', 500), 502, 'upstream_error'],
    ];
    for (const [err, status, code] of cases) {
      app.llm.reply = async () => {
        throw err;
      };
      const res = await post('/api/llm/complete', { prompt: 'x' }, viewer);
      const body = await json(res);
      expect(res.status).toBe(status);
      expect(body.error.code).toBe(code);
      expect(JSON.stringify(body)).not.toContain('upstream secret text');
    }
    app.llm.reply = async () => ({
      text: 'pong',
      provider: 'anthropic',
      model: 'fake-1',
      stopReason: 'end_turn',
    });
  });
});
