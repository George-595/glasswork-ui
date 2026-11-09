import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { shouldDrain } from '../api/index.ts';
import { createDbClient } from './infra/db/index.ts';
import { migrate } from './infra/db/migrate.ts';
import { MIGRATIONS } from './infra/db/migrations/index.ts';
import { seedIfEmpty } from './services/index.ts';

/* api/index.ts, the Vercel function, driven over real HTTP with the platform's environment.
   The function never migrates or seeds (the deploy did, server/cli/migrate.ts), so each test
   database is prepared the way the deploy leaves it. */

const ADMIN = {
  adminEmail: 'admin@example.test',
  adminPassword: 'adminpassword',
};
const dirs: string[] = [];
function tempDb(): { url: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), 'app-vercel-'));
  dirs.push(dir);
  const file = join(dir, 'app.sqlite');
  return { url: `sqlite:${file}`, file };
}
async function prepared(url: string, upTo = MIGRATIONS.length): Promise<void> {
  const db = await createDbClient(url);
  await migrate(db, MIGRATIONS.slice(0, upTo));
  await seedIfEmpty(db, { ...ADMIN, seedDemoData: false });
  await db.close();
}
async function schemaOf(url: string): Promise<{ master: unknown[]; users: number }> {
  const db = await createDbClient(url);
  try {
    const master = await db.query('SELECT type, name FROM sqlite_master ORDER BY name');
    const users = await db
      .query<{ n: number }>('SELECT COUNT(*) AS n FROM users')
      .then((r) => Number(r[0]?.n))
      .catch(() => -1);
    return { master, users };
  } finally {
    await db.close();
  }
}

const HOST = 'app-test.vercel.app';
let server: Server;
let base: string;
let mainUrl: string;

/* node:http, not fetch: fetch forbids setting the Host header. */
function call(
  path: string,
  init: { method?: string; host?: string; headers?: Record<string, string>; body?: string } = {},
): Promise<{ status: number; json: () => unknown }> {
  const { host = HOST, headers = {}, method = 'GET', body } = init;
  return new Promise((resolve, reject) => {
    const req = request(base + path, { method, headers: { ...headers, host } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode ?? 0, json: () => JSON.parse(text) });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

beforeAll(async () => {
  vi.stubEnv('VERCEL', '1');
  vi.stubEnv('VERCEL_URL', HOST);
  /* VERCEL=1 is production (config/env.ts fails closed), so the environment must be a complete
     one; and the entry is driven on a temporary SQLite file, which the config refuses on Vercel
     unless a test says so. */
  vi.stubEnv('ADMIN_EMAIL', 'admin@example.test');
  vi.stubEnv('ADMIN_PASSWORD', 'a-real-test-password');
  vi.stubEnv('MAIL_TRANSPORT', 'log');
  vi.stubEnv('APP_BASE_URL', `https://${HOST}`);
  vi.stubEnv('ALLOW_SQLITE_ON_VERCEL', 'true');
  const db = tempDb();
  await prepared(db.url);
  mainUrl = db.url;
  vi.stubEnv('DATABASE_URL', db.url);
  vi.stubEnv('CRON_SECRET', 'cron-secret-for-tests');
  vi.stubEnv('LOG_LEVEL', 'error');
  const { default: handler } = await import('../api/index.ts');
  server = createServer((req, res) => {
    void handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  vi.unstubAllEnvs();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

describe('api/index.ts', () => {
  it('answers the API through the node:http router', async () => {
    const res = await call('/api/health');
    expect(res.status).toBe(200);
  });

  it('refuses a host Vercel did not name', async () => {
    const res = await call('/api/health', { host: 'evil.example.com' });
    expect(res.status).toBe(403);
  });

  it('takes the client address from X-Forwarded-For (TRUST_PROXY is on)', async () => {
    const res = await call('/api/health', { headers: { 'x-forwarded-for': '203.0.113.9' } });
    expect(res.status).toBe(200);
  });

  it('routes a POST from the deployment own origin', async () => {
    const res = await call('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: `https://${HOST}` },
      body: JSON.stringify({ email: 'nobody@example.test', password: 'wrong-password-123' }),
    });
    expect(res.status).toBe(401);
  });

  it('runs the cron route only for the secret', async () => {
    expect((await call('/api/cron/jobs')).status).toBe(401);
    expect(
      (await call('/api/cron/jobs', { headers: { authorization: 'Bearer nope' } })).status,
    ).toBe(401);
    const ok = await call('/api/cron/jobs', {
      headers: { authorization: 'Bearer cron-secret-for-tests' },
    });
    expect(ok.status).toBe(200);
    expect(ok.json()).toMatchObject({ ok: true });
  });

  it('answers the event stream with 503 instead of holding a connection', async () => {
    const res = await call('/api/events');
    expect(res.status).toBe(503);
  });
});

describe('api/index.ts boot: verify only, never migrate', () => {
  /* A fresh module (and so a fresh boot) per database, started the way a cold start is. */
  async function coldStart(url: string): Promise<{
    call: typeof call;
    close: () => Promise<void>;
  }> {
    vi.resetModules();
    vi.stubEnv('DATABASE_URL', url);
    const { default: handler } = await import('../api/index.ts');
    const srv = createServer((req, res) => {
      void handler(req, res);
    });
    await new Promise<void>((resolve) => srv.listen(0, '127.0.0.1', resolve));
    const prior = base;
    base = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
    return {
      call,
      close: async () => {
        base = prior;
        await new Promise((resolve) => srv.close(resolve));
      },
    };
  }

  it('answers 503 "updating" with Retry-After while a migration is pending, and issues no DDL', async () => {
    const db = tempDb();
    await prepared(db.url, MIGRATIONS.length - 1);
    const before = await schemaOf(db.url);
    const cold = await coldStart(db.url);
    try {
      const raw = await new Promise<{ status: number; retryAfter?: string; body: string }>(
        (resolve, reject) => {
          const req = request(`${base}/api/health`, { headers: { host: HOST } }, (res) => {
            let body = '';
            res.on('data', (c: Buffer) => {
              body += c.toString();
            });
            res.on('end', () =>
              resolve({
                status: res.statusCode ?? 0,
                retryAfter: String(res.headers['retry-after'] ?? ''),
                body,
              }),
            );
          });
          req.on('error', reject);
          req.end();
        },
      );
      expect(raw.status).toBe(503);
      expect(raw.retryAfter).toBe('30');
      expect(JSON.parse(raw.body)).toMatchObject({
        ok: false,
        error: {
          code: 'updating',
          message: 'The app is being updated. Try again in a minute.',
        },
      });
      // read-only boot: not a table, index or row more than the deploy left
      expect(await schemaOf(db.url)).toEqual(before);

      // the failure is not cached: once the deploy has migrated, the next request just works
      await prepared(db.url);
      expect((await call('/api/health')).status).toBe(200);
    } finally {
      await cold.close();
    }
  });

  it('boots against a migrated database without writing a thing (no CREATE, ALTER or seed)', async () => {
    const db = tempDb();
    // migrated but never seeded: a boot that seeded would create the admin
    const raw = await createDbClient(db.url);
    await migrate(raw);
    await raw.close();
    const before = await schemaOf(db.url);
    expect(before.users).toBe(0);
    const cold = await coldStart(db.url);
    try {
      expect((await call('/api/health')).status).toBe(200);
      expect(await schemaOf(db.url)).toEqual(before);
    } finally {
      await cold.close();
    }
  });

  it('keeps serving a database a newer deployment migrated (rollback and the deploy window)', async () => {
    const db = tempDb();
    await prepared(db.url);
    const raw = await createDbClient(db.url);
    await raw.execute(
      "INSERT INTO schema_migrations (id, checksum, applied_at) VALUES ('999_from_the_future', ?, '2030-01-01T00:00:00.000Z')",
      ['0'.repeat(64)],
    );
    await raw.close();
    const cold = await coldStart(db.url);
    try {
      expect((await call('/api/health')).status).toBe(200);
    } finally {
      await cold.close();
    }
  });
});

describe('api/index.ts jobs after the response', () => {
  const KEY = Symbol.for('@vercel/request-context');
  type Holder = Record<symbol, unknown>;

  async function withContext<T>(waitUntil: (p: Promise<unknown>) => void, fn: () => Promise<T>) {
    (globalThis as Holder)[KEY] = { get: () => ({ waitUntil }) };
    try {
      return await fn();
    } finally {
      delete (globalThis as Holder)[KEY];
    }
  }

  it('hands the drain to waitUntil, and the queued email is sent when it settles', async () => {
    const registered: Promise<unknown>[] = [];
    const res = await withContext(
      (p) => registered.push(p),
      () =>
        call('/api/auth/forgot-password', {
          method: 'POST',
          headers: { 'content-type': 'application/json', origin: `https://${HOST}` },
          body: JSON.stringify({ email: ADMIN.adminEmail }),
        }),
    );
    expect(res.status).toBe(202);
    expect(registered).toHaveLength(1);
    expect(registered[0]).toBeInstanceOf(Promise);
    await registered[0];
    const db = await createDbClient(mainUrl);
    const mail = await db.query<{ status: string; template: string }>(
      'SELECT status, template FROM outbound_emails',
    );
    await db.close();
    expect(mail).toEqual([{ status: 'sent', template: 'password_reset' }]);
  });

  it('does not drain after a read, a refused request or anonymous noise', async () => {
    const registered: Promise<unknown>[] = [];
    await withContext(
      (p) => registered.push(p),
      async () => {
        await call('/api/health'); // a read
        await call('/api/nope', { method: 'POST', headers: { origin: `https://${HOST}` } }); // 404
        await call('/api/transactions', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            origin: `https://${HOST}`,
            cookie: 'sid=bogus',
          },
          body: '{}',
        }); // a stale session: 401
      },
    );
    expect(registered).toEqual([]);
  });

  it('awaits the drain itself when the platform gives no request context', async () => {
    // (the test host: no waitUntil) the handler returns only once the drain is done
    const res = await call('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: `https://${HOST}` },
      body: JSON.stringify({ email: ADMIN.adminEmail }),
    });
    expect(res.status).toBe(202);
    const db = await createDbClient(mainUrl);
    const queued = await db.query('SELECT id FROM outbound_emails WHERE status = ?', ['queued']);
    await db.close();
    expect(queued).toEqual([]);
  });
});

describe('shouldDrain', () => {
  const post = (cookie?: string) => ({
    method: 'POST',
    headers: cookie ? { cookie } : {},
  });

  it('drains a successful write from a signed-in browser, and the public mail-sending calls', () => {
    expect(shouldDrain(post('sid=abc'), '/api/transactions', 201)).toBe(true);
    expect(shouldDrain(post('theme=dark; sid=abc'), '/api/users', 200)).toBe(true);
    expect(shouldDrain(post(), '/api/auth/forgot-password', 202)).toBe(true);
    expect(shouldDrain(post(), '/api/auth/accept-invite', 200)).toBe(true);
  });

  it('does not drain reads, refusals or anonymous requests', () => {
    expect(
      shouldDrain({ method: 'GET', headers: { cookie: 'sid=abc' } }, '/api/transactions', 200),
    ).toBe(false);
    expect(shouldDrain(post('sid=abc'), '/api/transactions', 401)).toBe(false);
    expect(shouldDrain(post('sid=abc'), '/api/transactions', 403)).toBe(false);
    expect(shouldDrain(post('sid=abc'), '/api/transactions', 429)).toBe(false);
    expect(shouldDrain(post(), '/api/anything', 404)).toBe(false);
    expect(shouldDrain(post(), '/api/anything', 200)).toBe(false);
    expect(shouldDrain(post('xsid=abc'), '/api/transactions', 200)).toBe(false);
    expect(shouldDrain(post(), '/api/auth/forgot-password', 429)).toBe(false);
  });
});
