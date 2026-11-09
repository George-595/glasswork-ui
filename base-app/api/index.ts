import type { IncomingMessage, ServerResponse } from 'node:http';
import { type App, createApp } from '../server/app.ts';
import { EnvError, readServerEnv } from '../server/config/env.ts';
import { SchemaBehindError } from '../server/infra/db/migrate.ts';
import { sendError, sendJson } from '../server/infra/http/json.ts';
import { errorFields } from '../server/infra/log/logger.ts';

/* The Vercel entry. One function answers every /api/* request (vercel.json rewrites them here);
   Vercel serves the built client from dist/ itself. It adapts the base app's node:http server
   rather than rewriting the router: the http.Server is built but never listens, and each
   invocation hands its (req, res) to it, so the routes, cookies, auth, gates and logging are the
   code the Docker image runs. docs/DEPLOY.md.

   Differences from server/main.ts, all because a function is not a long-lived process:
   - the app (database pool, services) is built once per warm instance and reused; a failed
     start is not cached, so the next request tries again;
   - the function NEVER migrates or seeds. The deploy did that once, under a lock, in the build
     (server/cli/migrate.ts --deploy). Boot only reads schema_migrations: a database behind this
     build answers 503 "updating" (the deploy is not finished), a database ahead of it (a newer
     deployment migrated; this one is still serving, or was rolled back to) is fine;
   - no job poller. After a response is sent, this invocation drains the queue (emails and
     other work enqueued by the request go out now) under `waitUntil`, so Vercel keeps the
     instance alive for it, and a daily Vercel Cron call to /api/cron/jobs picks up retries and
     the scheduled housekeeping;
   - /api/events (the server-sent stream) answers 503: a function cannot hold a connection open
     for free. Screens refresh on navigation and when the tab regains focus instead. */

let booted: Promise<App> | undefined;

function boot(): Promise<App> {
  booted ??= createApp(readServerEnv(), { schema: 'verify' }).catch((err: unknown) => {
    booted = undefined;
    throw err;
  });
  return booted;
}

const DRAIN_TICKS = 3;

/** Runs due jobs, a few passes at most so a request's follow-up work is also picked up. */
async function drainJobs(app: App): Promise<number> {
  let started = 0;
  for (let i = 0; i < DRAIN_TICKS; i++) {
    const n = await app.services.jobs.tick();
    await app.services.jobs.idle();
    started += n;
    if (n === 0) break;
  }
  return started;
}

/* Vercel's request context (what `@vercel/functions` reads): `waitUntil` registers work that may
   outlive the response. Without it an instance can be frozen the moment the response ends, with
   an invitation or reset email still `queued`. Read through the well-known symbol so the app
   needs no dependency; outside Vercel (tests, a local run) there is no context and the caller
   awaits instead. */
interface RequestContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}
function requestContext(): RequestContext | undefined {
  const holder = (globalThis as Record<symbol, unknown>)[Symbol.for('@vercel/request-context')] as
    | { get?: () => RequestContext | undefined }
    | undefined;
  return holder?.get?.();
}

/** Runs `work` so the platform waits for it: under waitUntil when there is one, else awaited. */
async function afterResponse(work: Promise<unknown>): Promise<void> {
  const ctx = requestContext();
  if (ctx?.waitUntil) ctx.waitUntil(work);
  else await work;
}

/** The longest a pooled connection idles (infra/db/postgres.ts). The instance is kept alive this
    long after a request, so pg closes its idle clients before Vercel freezes the function (a
    frozen process holds server connections open and Neon counts them). */
const POOL_IDLE_GRACE_MS = 10_000 + 100;

let idleHold: Promise<void> | undefined;
/** One pending hold at a time, however many requests the instance serves. */
function holdForIdleConnections(app: App): void {
  const ctx = requestContext();
  if (app.db.driver !== 'postgres' || !ctx?.waitUntil || idleHold) return;
  idleHold = new Promise<void>((resolve) => {
    setTimeout(() => {
      idleHold = undefined;
      resolve();
    }, POOL_IDLE_GRACE_MS);
  });
  ctx.waitUntil(idleHold);
}

/** Only a request that can have enqueued work pays for the drain: a successful (below 400) call
    from a signed-in browser (it carries the `sid` cookie), or one of the public auth calls that
    send mail. A read, a refused call (401, 403, 404, 429) and anonymous noise cost nothing. */
const SESSION_COOKIE = /(?:^|;\s*)sid=/;
const MAIL_SENDING_PUBLIC = new Set([
  '/api/auth/login',
  '/api/auth/forgot-password',
  '/api/auth/accept-invite',
  '/api/auth/reset-password',
]);
export function shouldDrain(
  req: Pick<IncomingMessage, 'method' | 'headers'>,
  path: string,
  status: number,
): boolean {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return false;
  if (status >= 400) return false;
  return SESSION_COOKIE.test(req.headers.cookie ?? '') || MAIL_SENDING_PUBLIC.has(path);
}

/** The Vercel Cron call: `Authorization: Bearer $CRON_SECRET`, compared in constant time. */
async function cron(app: App, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const secret = app.env.cronSecret;
  const sent = req.headers.authorization ?? '';
  const { timingSafeEqual } = await import('node:crypto');
  const want = Buffer.from(`Bearer ${secret ?? ''}`);
  const got = Buffer.from(sent);
  if (!secret || got.length !== want.length || !timingSafeEqual(got, want)) {
    sendError(res, 401, 'unauthenticated', 'Not allowed.');
    return;
  }
  const started = await drainJobs(app);
  sendJson(res, 200, { ok: true, started });
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let app: App;
  try {
    app = await boot();
  } catch (err) {
    if (err instanceof SchemaBehindError) {
      // The deploy has not migrated this database yet (or its migration failed and this build
      // should not have been promoted). Not cached: the next request checks again.
      console.warn(JSON.stringify({ level: 'warn', msg: 'schema behind', pending: err.pending }));
      res.setHeader('retry-after', '30');
      sendError(res, 503, 'updating', 'The app is being updated. Try again in a minute.');
      return;
    }
    console.error(JSON.stringify({ level: 'error', msg: 'start-up failed', ...errorFields(err) }));
    const detail = err instanceof EnvError ? err.message : undefined;
    if (detail) console.error(JSON.stringify({ level: 'error', msg: 'config error', detail }));
    sendError(
      res,
      503,
      'unavailable',
      'The service is starting up or misconfigured. Try again soon.',
    );
    return;
  }

  const path = (req.url ?? '').split('?')[0] ?? '';
  if (path === '/api/cron/jobs') {
    await cron(app, req, res);
    return;
  }
  if (path === '/api/events') {
    res.setHeader('retry-after', '3600');
    sendError(res, 503, 'realtime_unavailable', 'Live updates are not available on this host.');
    return;
  }

  const finished = new Promise<void>((resolve) => {
    res.once('close', resolve);
  });
  app.server.emit('request', req, res);
  await finished;
  // The response is out. Registered with waitUntil, so the platform keeps this instance alive
  // until the work settles; the idle grace lets the pool close its idle connections first.
  if (shouldDrain(req, path, res.statusCode)) {
    await afterResponse(
      drainJobs(app).catch((err: unknown) => {
        app.log.warn('job drain failed', errorFields(err));
      }),
    );
  }
  holdForIdleConnections(app);
}
