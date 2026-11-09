import type { LlmProvider } from '../infra/llm/types.ts';

/* Reads the server environment once, at start-up (main.ts). Defaults follow
   .env.example. An empty value counts as unset. Errors name the variable,
   never its value. */

export interface ServerEnv {
  production: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
  apiHost: string;
  apiPort: number;
  databaseUrl: string;
  allowedOrigins: readonly string[];
  /** Behind one reverse proxy: take the client address from its X-Forwarded-For. */
  trustProxy: boolean;
  /** Extra Host header names answered (only with ALLOW_NON_LOOPBACK=true). */
  publicHosts: readonly string[];
  auth: {
    adminEmail: string;
    adminPassword: string;
    sessionTtlHours: number;
    cookieSecure: boolean;
  };
  mail: {
    /** 'log' records emails (the admin Mail page) and sends none; 'resend' sends them. */
    transport: 'log' | 'resend';
    /** The From header. */
    from: string;
    resendApiKey?: string | undefined;
  };
  jobs: {
    /** How often the runner looks for due jobs (ms). */
    pollMs: number;
    /** Jobs running at once in this process. */
    concurrency: number;
    /** On SIGTERM, how long running jobs get to finish before the process exits (ms). */
    shutdownGraceMs: number;
  };
  /** The address the app is reached at, no trailing slash; links in emails are built on it. */
  appBaseUrl: string;
  /** Where uploaded files are stored (local disk). Relative paths are from the working directory. */
  uploadsDir: string;
  /** The built client to serve (production), or undefined to serve the API only. */
  serveDist: boolean;
  /** How pages are answered (SSR): 'dist' = server-render with the built dist/server (production),
      'dev' = Vite inside this process, hot reload, on `webPort` (development), 'off' = this process
      serves the API only (a static host or a separate Vite serves the client). */
  ssr: 'off' | 'dev' | 'dist';
  /** The port the app is opened on in development (WEB_PORT, 5173): where `ssr: 'dev'` listens. */
  webPort: number;
  /** Running as a Vercel function (VERCEL=1): no listener, no poller. */
  vercel: boolean;
  /** Bearer secret Vercel Cron sends to /api/cron/jobs (CRON_SECRET). */
  cronSecret?: string | undefined;
  /** Largest database pool per process (DB_POOL_MAX); 3 on Vercel, 10 elsewhere. */
  dbPoolMax: number;
  llm: {
    defaultProvider: LlmProvider;
    timeoutMs: number;
    anthropic: { apiKey?: string; model: string; fallbacks: 'default' | 'off' };
    gemini: { apiKey?: string; model: string };
  };
}

export class EnvError extends Error {}

/* The fixed development sign-in (George's choice). Public by design, so it must never
   work in production: readServerEnv refuses to start production with it, or without
   any ADMIN_PASSWORD. */
export const DEV_ADMIN_EMAIL = 'admin@example.test';
export const DEV_ADMIN_PASSWORD = 'adminpassword';

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 8787;
const DEFAULT_DATABASE_URL = 'sqlite::memory:';
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const DEFAULT_PROVIDER: LlmProvider = 'anthropic';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5';
const DEFAULT_GEMINI_MODEL = 'gemini-flash-latest';

export function readServerEnv(source: Record<string, string | undefined> = process.env): ServerEnv {
  const read = (key: string): string | undefined => {
    const raw = source[key];
    if (raw === undefined) return undefined;
    const trimmed = raw.trim();
    return trimmed === '' ? undefined : trimmed;
  };

  const provider = read('LLM_PROVIDER') ?? DEFAULT_PROVIDER;
  if (provider !== 'anthropic' && provider !== 'gemini') {
    throw new EnvError('LLM_PROVIDER must be "anthropic" or "gemini"');
  }

  const fallbacks = read('ANTHROPIC_FALLBACKS') ?? 'default';
  if (fallbacks !== 'default' && fallbacks !== 'off') {
    throw new EnvError('ANTHROPIC_FALLBACKS must be "default" or "off"');
  }

  /* Production fails closed. A Vercel function is production by definition, whether or not the
     platform sets NODE_ENV: with NODE_ENV missing (a project override, a runtime change) the Secure
     cookie, the refusal of the public development admin password, the absence of demo data and
     the hidden dev sign-in hint would all have gone off together. `VERCEL=1` alone is enough. */
  const vercel = read('VERCEL') === '1';
  const production = read('NODE_ENV') === 'production' || vercel;
  const logLevel = read('LOG_LEVEL') ?? 'info';
  if (!['debug', 'info', 'warn', 'error'].includes(logLevel)) {
    throw new EnvError('LOG_LEVEL must be debug, info, warn or error');
  }

  // Loopback only, unless explicitly opened (a container's published port).
  const allowNonLoopback = flag('ALLOW_NON_LOOPBACK', read('ALLOW_NON_LOOPBACK'), false);
  const apiHost = read('API_HOST') ?? DEFAULT_HOST;
  if (!allowNonLoopback && !LOOPBACK_HOSTS.has(apiHost)) {
    throw new EnvError(
      'API_HOST must be a loopback address (127.0.0.1, localhost or ::1) unless ALLOW_NON_LOOPBACK=true',
    );
  }
  // Vercel: the platform terminates TLS, sets X-Forwarded-For itself and names this
  // deployment's hosts in system variables. They are the only hosts it routes here.
  const vercelHosts = vercel
    ? [
        read('VERCEL_URL'),
        read('VERCEL_BRANCH_URL'),
        read('VERCEL_PROJECT_PRODUCTION_URL'),
        hostOf(read('APP_BASE_URL')),
      ].flatMap((h) => (h ? [h.toLowerCase()] : []))
    : [];
  const publicHosts = [
    ...new Set([
      ...(allowNonLoopback
        ? (read('PUBLIC_HOSTS') ?? '')
            .split(',')
            .map((h) => h.trim().toLowerCase())
            .filter((h) => h !== '')
        : []),
      ...vercelHosts,
    ]),
  ];
  const apiPort = wholeNumber('API_PORT', read('API_PORT'), DEFAULT_PORT, 1, 65_535);

  const webPort = wholeNumber('WEB_PORT', read('WEB_PORT'), 5173, 1, 65_535);
  const origins = read('ALLOWED_ORIGINS');
  const serveDist = flag('SERVE_DIST', read('SERVE_DIST'), production && !vercel);
  const ssr = ssrMode(production, vercel, serveDist, read('SSR_MODE'));

  return {
    production,
    logLevel: logLevel as ServerEnv['logLevel'],
    apiHost,
    apiPort,
    databaseUrl: databaseUrl(
      production,
      vercel,
      read('DATABASE_URL'),
      read('ALLOW_SQLITE_ON_VERCEL'),
    ),
    publicHosts,
    trustProxy: flag('TRUST_PROXY', read('TRUST_PROXY'), vercel),
    auth: {
      adminEmail: adminEmail(production, read('ADMIN_EMAIL')),
      adminPassword: adminPassword(production, read('ADMIN_PASSWORD')),
      sessionTtlHours: wholeNumber('SESSION_TTL_HOURS', read('SESSION_TTL_HOURS'), 168, 1, 24 * 90),
      // Secure needs https; development runs on plain http (Safari also refuses Secure on http://localhost)
      cookieSecure: flag('COOKIE_SECURE', read('COOKIE_SECURE'), production),
    },
    mail: mailConfig(production, read),
    jobs: {
      pollMs: wholeNumber('JOBS_POLL_MS', read('JOBS_POLL_MS'), 1_000, 50, 3_600_000),
      concurrency: wholeNumber('JOBS_CONCURRENCY', read('JOBS_CONCURRENCY'), 4, 1, 64),
      shutdownGraceMs: wholeNumber(
        'JOBS_SHUTDOWN_GRACE_MS',
        read('JOBS_SHUTDOWN_GRACE_MS'),
        10_000,
        0,
        600_000,
      ),
    },
    appBaseUrl: baseUrl(
      production,
      read('APP_BASE_URL') ??
        (vercel && read('VERCEL_PROJECT_PRODUCTION_URL')
          ? `https://${read('VERCEL_PROJECT_PRODUCTION_URL')}`
          : undefined),
      webPort,
    ),
    uploadsDir: read('UPLOADS_DIR') ?? './data/uploads',
    serveDist,
    ssr,
    webPort,
    vercel,
    cronSecret: read('CRON_SECRET'),
    dbPoolMax: wholeNumber('DB_POOL_MAX', read('DB_POOL_MAX'), vercel ? 3 : 10, 1, 100),
    // The app's own origins are always allowed; ALLOWED_ORIGINS adds more (it never removes them).
    allowedOrigins: [
      ...new Set([
        `http://127.0.0.1:${webPort}`,
        `http://localhost:${webPort}`,
        // npm start / the container serve the client from the API's own port
        `http://127.0.0.1:${apiPort}`,
        `http://localhost:${apiPort}`,
        ...publicHosts.flatMap((h) => [`http://${h}:${apiPort}`, `https://${h}`]),
        ...(origins ?? '')
          .split(',')
          .map((o) => o.trim().replace(/\/+$/, ''))
          .filter((o) => o !== ''),
      ]),
    ],
    llm: {
      defaultProvider: provider,
      timeoutMs: wholeNumber(
        'LLM_TIMEOUT_MS',
        read('LLM_TIMEOUT_MS'),
        DEFAULT_TIMEOUT_MS,
        1,
        3_600_000,
      ),
      anthropic: {
        apiKey: read('ANTHROPIC_API_KEY'),
        model: read('ANTHROPIC_MODEL') ?? DEFAULT_ANTHROPIC_MODEL,
        fallbacks,
      },
      gemini: {
        apiKey: read('GEMINI_API_KEY'),
        model: read('GEMINI_MODEL') ?? DEFAULT_GEMINI_MODEL,
      },
    },
  };
}

/* SSR: who answers page requests. Production serves the built client and server-renders it
   ('dist'); development runs Vite inside this process ('dev'); on Vercel the client is static
   files and this process only answers /api ('off'). SSR_MODE=off gives the old API-only development
   server (then `npm run dev:web` is the app). */
function ssrMode(
  production: boolean,
  vercel: boolean,
  serveDist: boolean,
  raw: string | undefined,
): ServerEnv['ssr'] {
  if (raw === undefined) return serveDist ? 'dist' : production || vercel ? 'off' : 'dev';
  if (raw !== 'off' && raw !== 'dev' && raw !== 'dist') {
    throw new EnvError('SSR_MODE must be "off", "dev" or "dist"');
  }
  if (raw === 'dev' && production) throw new EnvError('SSR_MODE=dev is for development only');
  if (raw === 'dist' && !serveDist) throw new EnvError('SSR_MODE=dist needs SERVE_DIST=true');
  return raw;
}

/* Safe to log: keys map to 'set' or 'missing' (never a value); DATABASE_URL
   shows only its scheme, host, port and database, never credentials or query. */
export function describeEnv(env: ServerEnv): Record<string, string> {
  return {
    NODE_ENV: env.production ? 'production' : 'development',
    API_HOST: setOrMissing(env.apiHost !== ''),
    ADMIN_EMAIL: setOrMissing(true),
    ADMIN_PASSWORD: env.production
      ? 'set'
      : env.auth.adminPassword === DEV_ADMIN_PASSWORD
        ? 'dev default'
        : 'set',
    API_PORT: setOrMissing(true),
    DATABASE_URL: redactDatabaseUrl(env.databaseUrl),
    ALLOWED_ORIGINS: setOrMissing(env.allowedOrigins.length > 0),
    APP_BASE_URL: env.appBaseUrl,
    ...(env.vercel
      ? { VERCEL: 'yes', CRON_SECRET: setOrMissing(env.cronSecret !== undefined) }
      : {}),
    UPLOADS_DIR: env.uploadsDir,
    LLM_PROVIDER: setOrMissing(true),
    LLM_TIMEOUT_MS: setOrMissing(true),
    ANTHROPIC_API_KEY: setOrMissing(env.llm.anthropic.apiKey !== undefined),
    ANTHROPIC_MODEL: setOrMissing(true),
    ANTHROPIC_FALLBACKS: setOrMissing(true),
    GEMINI_API_KEY: setOrMissing(env.llm.gemini.apiKey !== undefined),
    GEMINI_MODEL: setOrMissing(true),
    MAIL_TRANSPORT: env.mail.transport,
    MAIL_FROM: setOrMissing(true),
    RESEND_API_KEY: setOrMissing(env.mail.resendApiKey !== undefined),
  };
}

const DEV_MAIL_FROM = 'Base app <no-reply@localhost>';

/* MAIL_TRANSPORT: 'log' (the development default) or 'resend'. Production must choose: a
   silent 'log' would record every invite and password reset and send none of them, so
   production needs MAIL_TRANSPORT set (resend, or log as a deliberate acknowledgement). Resend
   needs its key and, in production, a MAIL_FROM on a domain verified with Resend. */
function mailConfig(
  production: boolean,
  read: (key: string) => string | undefined,
): ServerEnv['mail'] {
  const raw = read('MAIL_TRANSPORT');
  if (production && raw === undefined) {
    throw new EnvError(
      'MAIL_TRANSPORT must be set in production: "resend", or "log" to acknowledge that emails are only recorded, never sent',
    );
  }
  const transport = raw ?? 'log';
  if (transport !== 'log' && transport !== 'resend') {
    throw new EnvError('MAIL_TRANSPORT must be "log" or "resend"');
  }
  const resendApiKey = read('RESEND_API_KEY');
  if (transport === 'resend' && !resendApiKey) {
    throw new EnvError('RESEND_API_KEY must be set when MAIL_TRANSPORT is "resend"');
  }
  const from = read('MAIL_FROM');
  if (transport === 'resend' && production && !from) {
    throw new EnvError('MAIL_FROM must be set in production when MAIL_TRANSPORT is "resend"');
  }
  if (from !== undefined && /[\r\n]/.test(from)) throw new EnvError('MAIL_FROM must be one line');
  return { transport, from: from ?? DEV_MAIL_FROM, resendApiKey };
}

/* APP_BASE_URL: where people reach the app, for the links in emails. Development defaults to
   the Vite server; production must say. */
function baseUrl(production: boolean, raw: string | undefined, webPort: number): string {
  if (raw === undefined) {
    if (production) throw new EnvError('APP_BASE_URL must be set in production');
    return `http://localhost:${webPort}`;
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EnvError('APP_BASE_URL must be a full http(s) URL');
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new EnvError('APP_BASE_URL must be a full http(s) URL');
  }
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new EnvError('APP_BASE_URL must not carry credentials, a query or a fragment');
  }
  if (production && url.protocol !== 'https:' && !LOOPBACK_HOSTS.has(url.hostname)) {
    throw new EnvError('APP_BASE_URL must be https in production');
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/* The host of a URL string, or undefined when it is absent or not a URL (baseUrl reports that). */
function hostOf(raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  try {
    return new URL(raw).hostname;
  } catch {
    return undefined;
  }
}

/* DATABASE_URL. Development falls back to a throwaway in-memory SQLite. Production must name a
   database: without one the app used to start on `sqlite::memory:`, seed an admin, and let people
   save work into a per-instance database that vanishes when the instance is recycled (each warm
   instance showing different data). That is silent data loss, so it is a refusal to start. On
   Vercel a SQLite URL is refused too: the function's filesystem is read-only and per-instance, so
   any SQLite there is as lost as the in-memory one. The one exception is a test that drives the
   Vercel entry on a temporary SQLite file: it says so with ALLOW_SQLITE_ON_VERCEL=true. */
function databaseUrl(
  production: boolean,
  vercel: boolean,
  raw: string | undefined,
  allowSqliteOnVercel: string | undefined,
): string {
  if (raw === undefined) {
    if (production) throw new EnvError('DATABASE_URL must be set in production');
    return DEFAULT_DATABASE_URL;
  }
  if (vercel && /^sqlite:/i.test(raw) && allowSqliteOnVercel !== 'true') {
    throw new EnvError(
      'DATABASE_URL must be a Postgres or MySQL database on Vercel (a SQLite file is lost with the instance)',
    );
  }
  return raw;
}

/* ADMIN_EMAIL: who the first admin is. Production must say. A silent `admin@example.com` made a
   standing admin account that can never receive a reset email. */
function adminEmail(production: boolean, raw: string | undefined): string {
  if (raw === undefined) {
    if (production) throw new EnvError('ADMIN_EMAIL must be set in production');
    return DEV_ADMIN_EMAIL;
  }
  if (raw.length > 254 || !/^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/.test(raw)) {
    throw new EnvError('ADMIN_EMAIL must be an email address');
  }
  return raw;
}

function setOrMissing(present: boolean): string {
  return present ? 'set' : 'missing';
}

function adminPassword(production: boolean, raw: string | undefined): string {
  if (!production) return raw ?? DEV_ADMIN_PASSWORD;
  if (!raw) throw new EnvError('ADMIN_PASSWORD must be set in production');
  if (raw === DEV_ADMIN_PASSWORD) {
    throw new EnvError('ADMIN_PASSWORD must not be the public development password in production');
  }
  if (raw.length < 12)
    throw new EnvError('ADMIN_PASSWORD must be at least 12 characters in production');
  return raw;
}

/* The origin emailed links point at. Development defaults to the Vite dev server; production
   must say (a link to localhost in a real email is a bug). Must be an http(s) origin: a path,
   query or credentials would end up inside every link. */

function flag(name: string, raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined) return fallback;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw new EnvError(`${name} must be true or false`);
}

function wholeNumber(
  name: string,
  raw: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (raw === undefined) return fallback;
  if (!/^\d+$/.test(raw)) throw new EnvError(`${name} must be a whole number`);
  const value = Number(raw);
  if (value < min || value > max) throw new EnvError(`${name} must be between ${min} and ${max}`);
  return value;
}

/* config/ must not depend on infra/db, so this is its own, stricter version:
   it keeps only what is never secret instead of masking what might be. */
function redactDatabaseUrl(url: string): string {
  if (url.startsWith('sqlite:')) return url;
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname}`;
  } catch {
    return 'set (unparseable)';
  }
}
