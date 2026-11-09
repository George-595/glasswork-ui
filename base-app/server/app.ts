import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEV_ADMIN_PASSWORD, describeEnv, type ServerEnv } from './config/env.ts';
import { createDbClient } from './infra/db/index.ts';
import { migrate, verifySchema } from './infra/db/migrate.ts';
import { createApiServer } from './infra/http/server.ts';
import { createSsrHandler, type SsrSource } from './infra/http/ssr.ts';
import { distSource, startViteDev, type ViteDev } from './infra/http/ssr-source.ts';
import { createStaticHandler } from './infra/http/static.ts';
import { createLlmClient } from './infra/llm/index.ts';
import { createLogger, errorFields, type Logger } from './infra/log/logger.ts';
import { createMailTransport } from './infra/mail/index.ts';
import { createLocalFileStorage } from './infra/storage/index.ts';
import { sessionToken, setTrustProxy } from './routes/auth.ts';
import { createRoutes } from './routes/index.ts';
import { createMaintenanceGate } from './routes/maintenance.ts';
import { createServices, seedIfEmpty } from './services/index.ts';

/* The wiring, shared by the two ways this app runs:
   - server/main.ts: a long-lived Node process that listens on a port and polls the job queue
     (the Docker image, `npm run dev`);
   - api/index.ts: a Vercel function, where the same http.Server is never bound to a port; each
     invocation hands its request to it.
   createApp does env, then the database, then services, routes and the HTTP server. It neither
   listens nor starts the job runner. What it does to the schema depends on who is asking:
   - 'migrate' (server/main.ts: Docker, `npm run dev`): applies pending migrations under a lock
     (safe with several containers) and seeds the admin, and the demo data in development;
   - 'verify' (api/index.ts, a Vercel function): only reads schema_migrations and throws
     SchemaBehindError when a migration is pending. The deploy migrated and seeded already
     (server/cli/migrate.ts), so a cold start never runs DDL or writes. */
export type SchemaMode = 'migrate' | 'verify';

export interface App {
  env: ServerEnv;
  log: Logger;
  db: Awaited<ReturnType<typeof createDbClient>>;
  services: ReturnType<typeof createServices>;
  server: Server;
  /** Development only (`ssr: 'dev'`): Vite running inside this process. Close it at shutdown. */
  dev?: ViteDev | undefined;
}

export async function createApp(
  env: ServerEnv,
  opts: {
    schema?: SchemaMode;
    /** Who answers page requests (config/env.ts `ssr`). Default 'off': the API (and, when
        `env.serveDist`, the built client's files) only - what a test or a function wants. */
    ssr?: ServerEnv['ssr'];
  } = {},
): Promise<App> {
  const schema = opts.schema ?? 'migrate';
  const ssr = opts.ssr ?? 'off';
  const log = createLogger({ level: env.logLevel });
  log.info('config', describeEnv(env));

  const db = await createDbClient(env.databaseUrl, { poolMax: env.dbPoolMax });
  if (schema === 'migrate') {
    const applied = await migrate(db);
    log.info('migrations', { applied, driver: db.driver });

    const seed = await seedIfEmpty(db, {
      adminEmail: env.auth.adminEmail,
      adminPassword: env.auth.adminPassword,
      seedDemoData: !env.production,
    });
    log.info('seed', { tables: seed.seeded, admin: seed.admin });
    if (env.production && env.databaseUrl.includes(':memory:')) {
      log.warn(
        'DATABASE_URL is an in-memory database: every restart loses all users and sessions.',
      );
    }
  } else {
    try {
      await verifySchema(db, undefined, { warn: (msg, fields) => log.warn(msg, fields) });
    } catch (err) {
      await db.close().catch(() => undefined);
      throw err;
    }
  }

  // Development only: the sign-in page's hint and an easy-to-spot terminal box.
  const devDefault = env.auth.adminPassword === DEV_ADMIN_PASSWORD;
  const devSignIn = env.production
    ? undefined
    : { adminEmail: env.auth.adminEmail, password: devDefault ? DEV_ADMIN_PASSWORD : null };
  if (devSignIn) {
    const lines = [
      'DEV ADMIN LOGIN (development only)',
      `email:     ${devSignIn.adminEmail}`,
      `password:  ${devSignIn.password ?? 'ADMIN_PASSWORD from apps/base-app/.env'}`,
    ];
    const width = Math.max(...lines.map((l) => l.length));
    const bar = '═'.repeat(width + 2);
    console.info(
      `\n╔${bar}╗\n${lines.map((l) => `║ ${l.padEnd(width)} ║`).join('\n')}\n╚${bar}╝\n`,
    );
  }

  const services = createServices({
    db,
    sessionTtlHours: env.auth.sessionTtlHours,
    storage: createLocalFileStorage(env.uploadsDir),
    llm: {
      defaultProvider: env.llm.defaultProvider,
      getClient: (provider) => createLlmClient(provider, env.llm),
    },
    mail: {
      transport: createMailTransport(env.mail, { log }),
      from: env.mail.from,
      appBaseUrl: env.appBaseUrl,
    },
    jobs: { pollMs: env.jobs.pollMs, concurrency: env.jobs.concurrency, log },
    log,
    // after-commit hooks and the realtime hub report here; neither ever fails a request
    onError: (err) => log.warn('after-commit or realtime hook failed', errorFields(err)),
  });
  if (env.mail.transport === 'log') {
    log.info(
      'mail: log transport. Emails are recorded, not sent: read them on the admin Mail page.',
    );
  }

  setTrustProxy(env.trustProxy);
  const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dist = { client: join(appRoot, 'dist', 'client'), server: join(appRoot, 'dist', 'server') };
  if (ssr === 'dist' && !existsSync(join(dist.server, 'entry-server.js'))) {
    throw new Error(
      `The server render is not built (${dist.server}/entry-server.js is missing). Run \`npm run build\` first.`,
    );
  }
  const routes = createRoutes(services, {
    cookieSecure: env.auth.cookieSecure,
    ...(devSignIn ? { devSignIn } : {}),
  });
  const gate = createMaintenanceGate(services);
  const authenticate = async (cookie: string | undefined) => {
    try {
      return await services.auth.authenticate(sessionToken(cookie));
    } catch (err) {
      log.error('session lookup failed', errorFields(err));
      return null;
    }
  };

  // Development: Vite needs the HTTP server (its hot-reload socket shares the port), and the HTTP
  // server needs Vite's middleware, so the server is given a getter that is filled in below.
  let dev: ViteDev | undefined;
  const source: SsrSource | undefined =
    ssr === 'dist'
      ? distSource(dist)
      : ssr === 'dev'
        ? {
            load: (url) => {
              if (!dev) throw new Error('The development server is still starting.');
              return dev.source.load(url);
            },
            fixStacktrace: (error) => dev?.source.fixStacktrace?.(error),
          }
        : undefined;

  const server = createApiServer({
    settings: env,
    routes,
    gate,
    authenticate,
    log,
    ...(ssr === 'dev' ? { middleware: () => dev?.middleware } : {}),
    ...(env.serveDist
      ? {
          serveStatic: createStaticHandler({
            root: dist.client,
            hsts: env.auth.cookieSecure,
            // pages are server-rendered: an unknown route is the SSR handler's, not index.html's
            spaFallback: ssr !== 'dist',
          }),
        }
      : {}),
    ...(source
      ? {
          ssr: createSsrHandler({
            source,
            api: { routes, settings: env, gate, authenticate },
            log,
            dev: ssr === 'dev',
            hsts: env.auth.cookieSecure,
          }),
        }
      : {}),
  });
  if (ssr === 'dev') dev = await startViteDev(server, appRoot);

  return { env, log, db, services, server, dev };
}
