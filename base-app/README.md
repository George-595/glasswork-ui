# base-app

The template every new app under `apps/` starts from: a React + Vite client, a small Node API
server, SQL databases (SQLite, MySQL, PostgreSQL) behind one interface, Anthropic and Gemini
clients, and the shared `@apps/ui` kit in two skins (enterprise, glass) × light/dark, whose
colours all come from `@apps/colors` (graphite neutrals, ink main action, one azure accent).

## Run it

```bash
npm install          # from the repo root
npm run dev          # the app, server-rendered, with hot reload: http://127.0.0.1:5173 (API on the same origin, /api)
```

No `.env` is needed to start: the database defaults to in-memory SQLite and the LLM routes
answer "not configured". To use real services, copy `.env.example` to `.env` (gitignored) and
fill it in. **Keys go in `.env` or your shell only, never in a tracked file.**

## Deploying

Docker or a home server runs `server/main.ts`; Vercel runs `api/index.ts` and migrates once in the build.
Both build the app with `server/app.ts`. See [`docs/DEPLOY.md`](docs/DEPLOY.md): the migration lock and
the read-only cold-start schema check, the database timeouts, the security headers (`vercel.json` is
generated from `server/infra/http/security-headers.ts`) and how a deploy while the app is open recovers.

## Server rendering

Every page is rendered on the server and streamed (`renderToPipeableStream`), then the browser hydrates it: the person
sees the signed-in screen, in their theme, with its first data, before any JavaScript has run. `npm run build` makes
`dist/client` (the browser bundle) and `dist/server` (`entry-server.js`); `npm start` builds and serves both from one Node
process. `npm run dev` runs Vite inside that same process, so development renders exactly as production does. Routing is
by path (`/table?page=2`); old `#/table` links are redirected. How it works, and the rules for components that must
render on a server: [`../ENGINEERING.md`](../ENGINEERING.md) section 15.

## What lives where

| Path | What | May import |
|---|---|---|
| `src/app/` | entry composition: shell, routes table, Admin menu, the Ask panel (the assistant over any page) | pages, core |
| `src/pages/<id>/` | one folder per route: home, table, tool-1, graphs, kit, admin/*, login | core |
| `src/core/ui/` | the only door to `@apps/ui`, plus Page, Money, Delta, ThemeProvider, `AgentVisualView` (draws what the assistant shows) | `@apps/ui`, core |
| `src/core/agent/` | the assistant on the client: `useAgentChat`, `AgentThread`, and `askAbout` / `useAsk` for the Ask panel | core/api, core/ui |
| `src/core/utils/` | re-export of `lib/`: format, dates, ids, numbers, rng | lib |
| `src/core/auth/` | `AuthProvider` / `useAuth`: who is signed in | core/api |
| `src/core/settings/` | `SettingsProvider` / `useSettings`: workspace name and maintenance mode, from the server | core/api, core/auth |
| `src/core/config/` | typed client config from `VITE_*` | nothing |
| `src/core/router/` | path router (History API): `usePath`, `useSearch`, `navigate`, `Link`, `useUrlState` | nothing |
| `src/core/api/` | typed fetch client, `useApiQuery`, `useApiAction` | config, `shared/` |
| `src/test/` | test harness: render, DOM helpers, axe, `mockApi` | fixtures |
| `shared/` | the wire contract: routes, auth levels, record types | nothing |
| `lib/` | pure helpers for client, server and fixtures | nothing |
| `fixtures/` | seeded demo data (server seed, test stubs) | lib, shared |
| `server/routes/` | the route table and handlers | services, infra/http |
| `server/services/` | business rules: auth, data, LLM, seed, **jobs, outbox (mail), settings, housekeeping**, and the **actions** (`actions/`, one definition each, run by pages and by the assistant), the **agent** loop and saved **views** | repositories, infra/llm, infra/mail |
| `server/repositories/` | the SQL | infra/db |
| `server/infra/db/` | `DbClient` (sqlite / postgres / mysql), migrations, the schema (`SCHEMA.md`) | nothing app-level |
| `server/lib/` | server-only helpers: `newId()` (UUIDv7), `schema.ts` (the JSON-Schema subset actions are checked with) | Node built-ins |
| `compose.yaml`, `db/` | local Postgres 17 + MySQL 8.4 for development and `npm run test:db` (dev-only) | — |
| `server/infra/http/` | `node:http` server, router, cookies, static files, server rendering (`ssr.ts`) | nothing app-level |
| `server/infra/llm/` | `LlmClient` for Anthropic / Gemini (raw fetch) | nothing app-level |
| `server/infra/mail/` | mail transports: `log` (dev, nothing leaves the machine) and `resend` (HTTP API) | nothing app-level |
| `server/infra/log/` | JSON-lines logger | nothing |
| `server/config/` | reads env once | — |
| `scripts/` | browser a11y gate, `ssr-pages.mjs` (the server's real HTML for the hydration test), backdrop contrast sampler, `check-colours.mjs`, `check-pages.mjs` and `check-craft.mjs` (the colour, core-component and motion/wording checks), `precompress.ts` (the build's `.br` / `.gz` files) and `check-budget.ts` (the first-load size budget) | — |

Every folder has its own `README.md`. The rules behind the table are in
[`../ENGINEERING.md`](../ENGINEERING.md); oxlint enforces the import directions.

## Jobs, mail, settings and maintenance mode

Background work is part of the template, not an afterthought:

- **Job queue** (`server/services/jobs.ts`). Durable jobs in the `jobs` table. `enqueue(tx, kind,
  payload, { runAt?, dedupeKey?, maxAttempts? })` writes the job in *your* transaction, so it exists
  exactly when your change committed. A runner in `main.ts` polls (`JOBS_POLL_MS`, default 1 s; an
  enqueue wakes it), claims with one atomic UPDATE (any number of instances is safe), runs the
  handler with a timeout, retries with exponential backoff and jitter, dead-letters after
  `maxAttempts`, takes back jobs a crashed process left running, and on SIGTERM stops claiming and
  waits `JOBS_SHUTDOWN_GRACE_MS` for running ones. Recurring jobs are declared in code
  (`every: '1h'`) and deduped per time bucket across instances. The shipped ones
  (`services/housekeeping.ts`): expired sessions and spent tokens hourly; read notifications over
  90 days, finished jobs over 14 days and emails over 30 days daily. Delivery is at least once:
  write handlers to be repeatable.
- **Mail** (`server/services/outbox.ts`, `mail-templates.ts`, `server/infra/mail/`). Nothing sends
  email from a request. `outbox.sendEmail(tx, { to, template, data })` renders the template (invite,
  password_reset, password_changed, notification; text and accessible HTML, every value escaped)
  and writes an `outbound_emails` row plus a `send_email` job in your transaction; the job sends it
  and records the result. `MAIL_TRANSPORT=log` (the development default) sends nothing: read the
  email, links clickable, at **Admin → Mail**. `MAIL_TRANSPORT=resend` sends through Resend
  (`RESEND_API_KEY`, `MAIL_FROM`); a 4xx is a permanent failure, anything else is retried.
  `APP_BASE_URL` is what links in emails point at.
- **Settings** (`server/services/settings.ts`, `GET`/`PUT /api/settings`). A typed registry
  (`workspace.name`, `maintenance.enabled`, `maintenance.message`) over the `app_settings` table.
  An update is validated, audited (`settings.update`) and broadcast as a `settings` realtime event.
  Skin, colour mode and backdrop are per viewer and stay in the browser.
- **Maintenance mode.** While `maintenance.enabled` is on, every `/api` request from a non-admin
  answers `503 { code: 'maintenance' }`, except `/api/auth/*`, `/api/settings` and `/api/health`.
  Non-admins see a "We'll be back soon" page with the message; admins keep working and see a
  banner linking to the settings.
- **Admin pages:** **Mail** (the outbox, a drawer with the text body) and **Jobs** (counts by status,
  a status filter, Retry on failed and dead jobs, audited as `job.retry`).

- **Interface sounds.** The kit plays quiet sounds after a person's action (switches, checkboxes, tabs,
  panels, toasts, sending a message); the assistant adds `reply` and `approval` when a run finishes
  (`useAgentChat`). They are on by default and one Sounds switch in Settings > Appearance turns them off
  for the device; the Kit page has a button per sound.

## Pages are made of core components; no CSS

A page composes kit components (`Stack`, `Cluster`, `Grid`, `Section`, `Card`, `Heading`,
`Text`, every control) through `src/core/ui` and nothing else (ENGINEERING §13). There is
**no `.css` file under `src/`**, no inline `style`, no arbitrary Tailwind value and no colour:
a page's `className` may carry only `sr-only` and `col-span-*` / `row-span-*`. If a page needs
a look the kit cannot give, the kit is missing a component or a prop: add it to `@apps/ui`
(with its test and axe pass), never style around it. Colours are roles from `@apps/colors`
only. `scripts/check-pages.mjs` and `scripts/check-colours.mjs` enforce this in
`npm run check`.

## Recipes

- **Add a page:** create `src/pages/<id>/` with `<Name>Page.tsx` (render through `<Page>`) and
  `index.ts` (`export { default } from './<Name>Page';`), then add one line to
  `src/app/routes.ts`.
- **Add an API route:** one handler file in `server/infra/http/routes/`, one line in the route
  table, its DTOs in `shared/api.ts`, a method on `src/core/api`.
- **Let the assistant (and pages) do something new:** one `defineAction({ name, title, description,
  effect, role, input, run })` in `server/services/actions/catalog.ts`, plus a test. Pages run it with
  `api.runAction(name, input)`; the assistant is offered it as a tool. A write it should ask about
  takes `confirm: true` (and `describe` for the approval card's details). To let the Ask panel know
  what the person is looking at, call `askAbout({ kind, id, label })` from `~/core/agent` (as the
  table's transaction drawer does); it travels as the run's `context.selection`.
- **Point at Postgres or MySQL:** `npm run dev:pg` / `npm run dev:mysql` (local containers, below),
  or set `DATABASE_URL=postgres://…` / `mysql://…` in `.env`. SQL uses `?` placeholders on every driver.
- **Add a table or column:** a new `server/infra/db/migrations/NNN_name.ts` (never edit an applied one),
  a repository, a case in `server/repositories.contract.test.ts`; `npm run test:db` must pass.
  Rules: ENGINEERING §7 "Database design".
- **Start a new app:** copy this folder to `apps/<name>`, rename the package, add it to
  `workspaces` in `apps/package.json`.

## Local databases (Postgres and MySQL)

`compose.yaml` runs Postgres 17 and MySQL 8.4 on **127.0.0.1 only** (ports 5432 and 3306, or
`POSTGRES_PORT` / `MYSQL_PORT`), each with a healthcheck, a named volume, and two databases: `app`
(development) and `app_test` (the tests). **Dev only:** the passwords (`app_dev_only`) are fixed and public.
Images are pinned by version and digest (how they were chosen is in the file's header). Needs Docker.

```bash
npm run db:up        # start both and wait until healthy
npm run dev:pg       # npm run dev against Postgres   (dev:mysql for MySQL)
npm run db:psql      # a psql shell      (db:mysql: a mysql shell)
npm run test:db      # the database suites on SQLite, Postgres AND MySQL (starts the containers)
npm run db:down      # stop them; the data stays in the volumes
npm run db:reset     # delete the volumes and any .data/*.sqlite file, then start fresh
```

Migrations are append-only and checksummed. If boot stops with "was applied and then changed" (you edited
a migration, or switched branches), run `npm run db:reset`. `npm test` runs the same database suites on
SQLite only; `npm run test:db` adds Postgres and MySQL. Each test run creates and drops its own database,
so it never touches `app` and does not need `db:reset`. The schema is explained in
[`server/infra/db/SCHEMA.md`](server/infra/db/SCHEMA.md).

## Checks (local only, no CI)

From `apps/`: `npm run verify` (biome + oxlint + colour and page checks + 7-day dep
quarantine + typecheck + tests + jsdom axe) for every workspace, or `npm run verify -w @apps/base-app` for this app alone.
`npm run test:db -w @apps/base-app` is the extra gate for anything that touches SQL (Docker required).
With `npm run dev` running: `npm run check:a11y:browser -w @apps/base-app` for the real-browser
axe pass with colour contrast, every route × skin × mode. `npm run check:perf:glass -w @apps/base-app`
is the glass performance guard rail on a 390x844 touch phone (DPR 3, CPU x4): zero idle frames,
at most three backdrop-filter elements, no SVG filter on touch, a short theme toggle, a smooth
first scroll (ENGINEERING §5). Neither is part of `verify`.

`npm run check:budget -w @apps/base-app` (part of `verify`) builds the client and fails when the
JavaScript a browser fetches before the page runs is over budget: gzip bytes of `index.html`'s
static import graph (the sign-in page) and of that plus the signed-in app and the Home route's.
The budgets are the `BUDGETS` constant in `scripts/check-budget.ts` (sign-in 135 kB, Home 207 kB).
Lazy chunks (the Ask panel, Home's charts, the other pages, the WebGL scene) do not count. See
"Performance" below.

## Self-contained: what this folder carries

This folder builds from its own files, so it can leave `apps/` without breaking:

- `package.json` declares every package the app imports or runs (React, Vite, Tailwind,
  Vitest, jsdom, axe-core, TypeScript, oxlint, biome, the `@types/*`), each an exact pin. It
  does not lean on what `apps/package.json` happens to hoist.
- `.npmrc` (exact pins, 7-day quarantine), `tsconfig.base.json`, `.oxlintrc.json` (the import
  rules of [`ENGINEERING.md`](../ENGINEERING.md) §2, plus a general block MIRRORED from
  `apps/.oxlintrc.json`) and `biome.json` live here, not in `apps/`.
  `scripts/check-release-age.mjs` reads the app's own `package-lock.json`, or the repo root's.
- The two things it needs from outside are `@apps/ui` and `@apps/colors` (the kit's colour
  source). In this repo they are the `packages/ui` and `packages/colors` workspaces. Outside,
  they are copied to `vendor/ui` and `vendor/colors`, which this `package.json`'s
  `"workspaces": ["vendor/*"]` turns into a workspace of the copy. (npm ignores that field while
  the app is a member of the root workspace.) The `"@apps/ui": "0.1.0"` pin (and ui's own
  `@apps/colors` pin) resolves to them either way, and nothing imports it by path. `@apps/ui`
  declares the Tailwind packages its `build:css` script needs, so the copy in `vendor/ui` builds
  its CSS too.
- The browser checks (`scripts/a11y-browser.mjs`, `scripts/backdrop-contrast.mjs`,
  `scripts/perf-glass.mjs`, and `@apps/ui`'s `scripts/a11y-check.mjs`) drive headless Chrome
  through `scripts/browser.mjs` on playwright-core: set `CHROME_PATH`, or install playwright's
  Chromium once with `npx playwright-core install chromium`.

## Start your own app from it

```bash
cd base-app
npm run export -- ~/code/my-new-app    # a new or empty folder outside this repo
cd ~/code/my-new-app
npm install                            # writes package-lock.json; commit it
npm run verify                         # biome + oxlint + quarantine + typecheck + tests + axe
npm run build
```

`scripts/export.mjs` copies this folder (without `node_modules`, `dist`, `.env` or local
databases), `packages/ui` to `vendor/ui`, `packages/colors` to `vendor/colors` and
`ENGINEERING.md`. It also writes a `.dockerignore` and rewrites the `Dockerfile` so its build
context is the new folder. Then rename the package in `package.json`. To take a newer kit later,
replace `vendor/ui` and `vendor/colors` with fresh copies. Read the licence first (`LICENSE.md`
at the repo root): build your own apps on it, but do not publish it, or anything made from it,
as a UI kit, template or starter of your own.

## Performance

- **Chunks.** `vite.config.ts` splits the client: `react`, `cn` (the class-name helpers) and `charts`
  (the chart library and the kit's chart components, the KPI tile and the assistant's visual) are
  chunks of their own, and the rest of what the entry needs is one `index` chunk. The sign-in page
  needs only those first two and `index` (about 132 kB gzip): the signed-in app (the shell, its menus
  and popovers and their radix libraries) is `src/app/SignedIn.tsx`, a file a signed-out visitor never
  fetches, loaded before hydration for someone signed in (`src/app/SignedInGate.tsx`). Home's charts
  are `pages/home/HomeSections.tsx`, behind `React.lazy` and a Suspense boundary per panel, hydrated
  as the file arrives. The Shell mounts the Ask panel lazily (`React.lazy`, fetched when the Ask
  button is hovered or focused, mounted once it has been opened and kept after that so the chat
  survives closing it). Keep it so: a static import of `~/core/agent` (its barrel exports the
  thread, which draws charts), of a chart component or of the shell from the sign-in page or
  `App.tsx` puts them back on every first load, and `check:budget` fails.
- **Compression.** `vite build` writes a `.br` (Brotli, quality 11) and a `.gz` beside every js,
  css, html, svg, json, txt, map and webmanifest file of 1 kB or more (`scripts/precompress.ts`, a
  plugin in `vite.config.ts`; skipped on Vercel, whose CDN compresses). The Node server
  (`server/infra/http/static.ts`) serves the best one the request's `Accept-Encoding` allows (Brotli,
  then gzip, q-values respected), with `Content-Encoding`, `Vary: Accept-Encoding` and an ETag per
  encoding (a conditional request gets a 304). JSON API responses of 1 kB or more and the
  server-rendered page (streamed through a flushing Brotli or gzip stream, `Vary: Cookie,
  Accept-Encoding`) are compressed per response (`server/infra/http/json.ts`, `ssr.ts`). The event
  stream is never compressed.

## Signing in

Development (`npm run dev`) seeds a fixed, public dev login, shown on the sign-in page and in a
"DEV ADMIN LOGIN" box in the terminal: **`admin@example.test` / `adminpassword`**. It exists in
development only. Set `ADMIN_EMAIL` / `ADMIN_PASSWORD` in `.env` to use your own.

## Production

`npm start` (from `apps/`) builds the client and runs one Node process on :8787 that serves it
from `base-app/dist` and the API under `/api` (`npm run serve -w @apps/base-app` skips the build).

It reads these from `base-app/.env` or the shell:

- `ADMIN_EMAIL`, `ADMIN_PASSWORD`: required. The server refuses to start without a password of
  12+ characters, or with the dev one. No demo data is seeded in production.
- `DATABASE_URL`: `sqlite:./.data/app.sqlite` for a file, or `postgres://` / `mysql://`. An
  in-memory database is allowed but warned about: it loses every user on restart.
- `SESSION_TTL_HOURS` (default 168). Cookies are `Secure` in production: serve it over https,
  or set `COOKIE_SECURE=false` for plain http on a private network.
- `TRUST_PROXY=true` behind one reverse proxy, so rate limits and the audit log see the real
  client address (from its `X-Forwarded-For`). Never set it without a proxy in front.
- `ALLOWED_ORIGINS`: extra origins allowed to send POSTs; the app's own are always allowed.
- `APP_BASE_URL`: required, `https://…`. The address people reach the app at; links in emails use it.
- `MAIL_TRANSPORT`: required. `resend` (with `RESEND_API_KEY` and a `MAIL_FROM` on a domain verified
  with Resend) to send email, or `log` to say, on purpose, that emails are only recorded in the
  Admin → Mail page and never delivered. Without it production refuses to start: a silent `log`
  would drop every invitation and password reset.
- `APP_BASE_URL`: required. The public origin (`https://app.example.com`, no path) that the links in
  invitation and password-reset emails point at. Development defaults to `http://localhost:$WEB_PORT`.
- `UPLOADS_DIR` (default `./data/uploads`): where uploaded files (avatars) live on disk. Persist it
  (a volume in Docker) and back it up with the database: the `files` table points into it. S3 slots in
  behind `server/infra/storage` later.

Docker, from `apps/`:

```bash
docker build -f base-app/Dockerfile -t base-app .
docker run -p 8787:8787 --env-file base-app/.env base-app
```

The image runs as the `node` user, serves the client and the API on 8787, and has a health
check on `/api/health`. The base image is pinned by digest; see the comments in `Dockerfile`.

`ALLOW_NON_LOOPBACK` and `PUBLIC_HOSTS` are what open the API beyond loopback. The image sets
them so the container answers its published port; add your public host name to `PUBLIC_HOSTS`.
On a laptop the API stays on 127.0.0.1 and refuses other host names (a DNS-rebinding guard).
`.env.example` leaves the host settings commented out, so `--env-file` keeps the image's own.
