import { createApp } from './app.ts';
import { EnvError, readServerEnv, type ServerEnv } from './config/env.ts';
import { errorFields } from './infra/log/logger.ts';

/* The long-lived Node process: reads config, builds the app (server/app.ts), listens on a port,
   runs the job poller and shuts down cleanly. On Vercel, api/index.ts takes this place. */

async function main(): Promise<void> {
  let env: ServerEnv;
  try {
    env = readServerEnv();
  } catch (err) {
    if (err instanceof EnvError) {
      console.error(JSON.stringify({ level: 'error', msg: 'config error', detail: err.message }));
      process.exit(1);
    }
    throw err;
  }
  // 'migrate': the long-lived process applies pending migrations at boot, under the migrator's lock
  const { log, db, services, server, dev } = await createApp(env, {
    schema: 'migrate',
    ssr: env.ssr,
  });

  // In development the one server is the app: Vite's modules, the server-rendered pages and /api,
  // on the port the app is opened at. Otherwise it is the API's own port.
  const port = env.ssr === 'dev' ? env.webPort : env.apiPort;
  server.listen(port, env.apiHost, () => {
    log.info('listening', {
      url: `http://${env.apiHost}:${port}`,
      servesClient: env.serveDist,
      ssr: env.ssr,
    });
  });

  // The job runner: background work, and the scheduled housekeeping (expired sessions, spent
  // tokens, retention). Every instance runs it; the queue and the scheduler's dedupe keys keep
  // a job to one run.
  services.jobs.start();

  // Shutdown: stop taking requests, stop claiming jobs and give running ones a few seconds to
  // finish (one still running afterwards stays `running` and the lease returns it to the
  // queue), then close the database. It runs once: running → stopping → exit. A second signal
  // while stopping (Ctrl-C again) exits at once, and so does a shutdown that has not finished
  // well after the grace (a stream or a socket that never closes).
  let phase: 'running' | 'stopping' = 'running';
  const shutdown = (signal: string): void => {
    if (phase === 'stopping') {
      log.warn('second signal while shutting down: exiting now', { signal });
      process.exit(1);
    }
    phase = 'stopping';
    log.info('shutting down', { signal });
    setTimeout(() => {
      log.error('shutdown did not finish in time: exiting');
      process.exit(1);
    }, env.jobs.shutdownGraceMs + 10_000).unref();
    const stopped = services.jobs.stop(env.jobs.shutdownGraceMs).then(({ abandoned }) => {
      if (abandoned > 0) log.warn('jobs still running at shutdown', { abandoned });
    });
    // open event streams would keep server.close() waiting forever
    services.realtime.close();
    // Vite's hot-reload sockets would keep server.close() waiting too
    void dev?.close().catch(() => undefined);
    server.close(() => {
      void stopped
        .catch(() => undefined)
        .then(() => db.close())
        .catch(() => undefined)
        .then(() => process.exit(0));
    });
    server.closeIdleConnections();
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  console.error(JSON.stringify({ level: 'error', msg: 'start-up failed', ...errorFields(err) }));
  process.exit(1);
});
