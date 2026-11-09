/* Test-only harness: the whole server (sqlite :memory:, migrations, seed,
   services, routes, HTTP) on a random loopback port, with a fake LLM. Used by
   *.test.ts files only; main.ts never imports it. */
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createDbClient } from './infra/db/index.ts';
import { migrate } from './infra/db/migrate.ts';
import type { DbClient } from './infra/db/types.ts';
import { createApiServer } from './infra/http/server.ts';
import { createSsrHandler, type SsrSource } from './infra/http/ssr.ts';
import type { Route } from './infra/http/types.ts';
import type {
  LlmClient,
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmStreamEvent,
} from './infra/llm/types.ts';
import { silentLogger } from './infra/log/logger.ts';
import { createLocalFileStorage } from './infra/storage/index.ts';
import { createRepositories } from './repositories/index.ts';
import { sessionToken } from './routes/auth.ts';
import { createRoutes } from './routes/index.ts';
import { createMaintenanceGate } from './routes/maintenance.ts';
import { createServices, hashPassword, seedIfEmpty } from './services/index.ts';
import type { EmailMessage, NotifyInput, Outbox } from './services/platform-deps.ts';

export const ADMIN_EMAIL = 'admin@example.com';
export const ADMIN_PASSWORD = 'correct horse battery staple';
export const VIEWER_EMAIL = 'viewer@example.com';
export const VIEWER_PASSWORD = 'viewer password 123';
export const ORIGIN = 'http://127.0.0.1:5173';

export interface TestApp {
  base: string;
  db: DbClient;
  llmCalls: LlmCompleteRequest[];
  /** What the fake LLM does next. */
  llm: {
    reply: (req: LlmCompleteRequest, signal?: AbortSignal) => Promise<LlmCompleteResult>;
    /** What the fake LLM streams next. Default: "pong" in two deltas, then done. */
    stream: (req: LlmCompleteRequest, signal?: AbortSignal) => AsyncIterable<LlmStreamEvent>;
  };
  logs: Record<string, unknown>[];
  /** The services, for tests that call them directly (settings, jobs, outbox). */
  services: ReturnType<typeof createServices>;
  /** Every email the app queued (the fake outbox keeps them; nothing is sent). */
  mail: EmailMessage[];
  /** Every in-app notification raised; `admins` is true for notifyAdmins. */
  notified: (Omit<NotifyInput, 'userId'> & { userId?: string; admins: boolean })[];
  /** What the fake realtime hub was told to disconnect. */
  disconnected: { sessions: string[]; users: string[] };
  /** The directory holding uploaded files (removed on close). */
  uploadsDir: string;
  close(): Promise<void>;
  /** Signs in and returns the Cookie header value for later requests. */
  signIn(email?: string, password?: string): Promise<string>;
}

export async function startTestApp(
  opts: {
    extraRoutes?: Route[];
    /** Server-render pages with this source (see ssr.test.ts); without it the app is API-only. */
    ssr?: SsrSource;
    /** Replaces the real outbox (the app still records every email in `mail`). */
    outbox?: Outbox;
    /** Overrides for the credential flows' rate limits. */
    limits?: NonNullable<
      NonNullable<Parameters<typeof createServices>[0]['credentialTuning']>['limits']
    >;
  } = {},
): Promise<TestApp> {
  const db = await createDbClient('sqlite::memory:');
  await migrate(db);
  await seedIfEmpty(db, {
    adminEmail: ADMIN_EMAIL,
    adminPassword: ADMIN_PASSWORD,
  });
  const at = new Date().toISOString();
  await createRepositories(db).users.insert(
    {
      id: 'usr_viewer',
      name: 'Vic Viewer',
      email: VIEWER_EMAIL,
      role: 'viewer',
      status: 'active',
      team: 'Ops',
      createdAt: at,
      lastActiveAt: at,
    },
    await hashPassword(VIEWER_PASSWORD),
  );

  const llmCalls: LlmCompleteRequest[] = [];
  const llm: TestApp['llm'] = {
    reply: async () => ({
      text: 'pong',
      provider: 'anthropic',
      model: 'fake-1',
      stopReason: 'end_turn',
    }),
    stream: async function* () {
      yield { type: 'text', text: 'po' };
      yield { type: 'text', text: 'ng' };
      yield {
        type: 'done',
        model: 'fake-1',
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 2 },
      };
    },
  };
  const fakeClient: LlmClient = {
    provider: 'anthropic',
    model: 'fake',
    complete: (req, o) => {
      llmCalls.push(req);
      return llm.reply(req, o?.signal);
    },
    stream: (req, o) => {
      llmCalls.push(req);
      return llm.stream(req, o?.signal);
    },
  };

  const mail: EmailMessage[] = [];
  const notified: TestApp['notified'] = [];
  const disconnected: TestApp['disconnected'] = { sessions: [], users: [] };
  const uploadsDir = mkdtempSync(join(tmpdir(), 'base-app-uploads-'));
  const services = createServices({
    db,
    sessionTtlHours: 1,
    storage: createLocalFileStorage(uploadsDir),
    // every email, notification and disconnect is recorded, then handed to the real service
    wrap: {
      outbox: (real) => ({
        sendEmail: async (tx, msg) => {
          mail.push(msg);
          await (opts.outbox ?? real).sendEmail(tx, msg);
        },
      }),
      notifier: (real) => ({
        notify: async (tx, input) => {
          notified.push({ ...input, admins: false });
          await real.notify(tx, input);
        },
        notifyAdmins: async (tx, input, o) => {
          notified.push({ ...input, admins: true });
          await real.notifyAdmins(tx, input, o);
        },
      }),
      streams: (real) => ({
        disconnectSession: (id) => {
          disconnected.sessions.push(id);
          real.disconnectSession(id);
        },
        disconnectUser: (id) => {
          disconnected.users.push(id);
          real.disconnectUser(id);
        },
      }),
    },
    credentialTuning: { forgotMinMs: 0, ...(opts.limits ? { limits: opts.limits } : {}) },
    llm: { defaultProvider: 'anthropic', getClient: () => fakeClient },
  });
  const logs: Record<string, unknown>[] = [];
  const log = {
    ...silentLogger,
    child: () => ({
      ...silentLogger,
      error: (msg: string, f?: Record<string, unknown>) => logs.push({ level: 'error', msg, ...f }),
      warn: (msg: string, f?: Record<string, unknown>) => logs.push({ level: 'warn', msg, ...f }),
      info: (msg: string, f?: Record<string, unknown>) => logs.push({ level: 'info', msg, ...f }),
      child: () => silentLogger,
    }),
  };
  const settings = { allowedOrigins: [ORIGIN], publicHosts: [] };
  const routes = [...createRoutes(services, { cookieSecure: false }), ...(opts.extraRoutes ?? [])];
  const gate = createMaintenanceGate(services);
  const authenticate = (cookie: string | undefined) =>
    services.auth.authenticate(sessionToken(cookie));
  const server = createApiServer({
    settings,
    routes,
    gate,
    authenticate,
    log,
    ...(opts.ssr
      ? {
          ssr: createSsrHandler({
            source: opts.ssr,
            api: { routes, settings, gate, authenticate },
            log,
          }),
        }
      : {}),
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  return {
    base,
    db,
    services,
    llm,
    llmCalls,
    logs,
    mail,
    notified,
    disconnected,
    uploadsDir,
    async close() {
      services.realtime.close();
      server.closeAllConnections();
      await new Promise<void>((r) => server.close(() => r()));
      await db.close();
      rmSync(uploadsDir, { recursive: true, force: true });
    },
    async signIn(email = ADMIN_EMAIL, password = ADMIN_PASSWORD) {
      const res = await fetch(`${base}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: ORIGIN },
        body: JSON.stringify({ email, password }),
      });
      if (res.status !== 200) throw new Error(`sign-in failed: ${res.status}`);
      return (res.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
    },
  };
}
