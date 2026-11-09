# Deploying base-app

Two ways to run the same code: a long-lived Node process (the Docker image, `npm run dev`) and a
Vercel function (`api/index.ts`) with the built client served from Vercel's CDN. Both build the app
with `server/app.ts`.

## Docker or a home server

`npm run build` makes `dist/client` and `dist/server` (the server render); the image copies both. Pages are server-rendered by the same process
(`NODE_ENV=production` means `SSR_MODE=dist`), with `Cache-Control: private, no-store`. `server/main.ts` applies pending migrations at boot, under a lock (safe with several containers),
seeds the admin, listens on a port and polls the job queue. Set `DATABASE_URL`, `ADMIN_EMAIL`,
`ADMIN_PASSWORD`, `APP_BASE_URL` and `MAIL_TRANSPORT` (`.env.example` lists them all). Production
refuses to start without a database, an admin email and a real admin password.

## Vercel (+ Neon)

`vercel.json` rewrites `/api/*` to the one function in `api/index.ts` and runs `npm run vercel-build`:
`vite build` (the client only, into `dist/client`, which is `outputDirectory`), then `node server/cli/migrate.ts --deploy`. Pages are served as static files with
the single-page fallback (`/index.html`) and render in the browser; server rendering needs a Node process.

- **Migrations run once, in the deploy, never on a request.** A failed migration fails the build, so
  the deployment is never promoted. The whole run is one transaction under an advisory lock
  (`server/infra/db/migrate.ts`). `--deploy` decides from `VERCEL_ENV`: `production` applies and seeds
  the admin (never demo data); a preview applies only with `MIGRATE_PREVIEW=apply` (give that Preview
  its own database branch), otherwise it only verifies and fails the build when a migration is pending,
  because previews share the production database.
- **A function never migrates.** At cold start it calls `verifySchema`: one read of
  `schema_migrations`. A database behind the build answers 503 `updating`; a database *ahead* of it (a
  newer deployment migrated it, or this is a rollback) is fine, which is why every migration must be
  backward-compatible with the previous release (`server/infra/db/migrations/README.md`).
- **Which database:** `MIGRATION_DATABASE_URL`, else `DATABASE_URL_UNPOOLED` (Neon's direct endpoint),
  else `DATABASE_URL`. The app itself uses the pooled `DATABASE_URL`. SQLite is refused on Vercel.
- **Jobs:** there is no poller. After a response that can have queued work (a successful write from a
  signed-in browser, or a public call that sends mail) the function drains the queue under `waitUntil`,
  so an invitation email goes out before the instance freezes. A daily Vercel Cron call to
  `/api/cron/jobs` (`Authorization: Bearer $CRON_SECRET`) picks up retries and the scheduled
  housekeeping.
- **No live stream:** `/api/events` answers 503 and the client build sets `VITE_REALTIME=off`
  (`vite.config.ts`), so screens refresh when the tab regains focus or the connection returns.
- **Timeouts:** the Postgres pool has connect, idle (10 s) and query (30 s) limits
  (`server/infra/db/postgres.ts`). Set `idle_in_transaction_session_timeout` on the database role, since
  Neon's pooled endpoint rejects it as a startup option.
- **Headers:** the CDN serves `dist/`, so the security headers live in `vercel.json`, generated from
  `server/infra/http/security-headers.ts` (`npm run check:headers`; `node scripts/vercel-headers.mjs
  --write` after editing the inline theme script in `index.html`, whose hash is in the CSP).
- **Uploads:** `vercel` uploads the folder minus `.vercelignore`, which names secrets and local data
  (`npm run check:ignore` keeps it in step with `.gitignore`).

## A deploy while the app is open

Every deploy renames every page's file. A tab left open then asks for a file that is gone:
`src/app/chunk-errors.ts` reloads the app once (never twice inside a minute, never offline) and
otherwise shows plain words with a Reload button (`RouteError`).
