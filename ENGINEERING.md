# Engineering standards for `apps/`

These apply to every file in the workspace. (This repo is the `apps/` workspace of the author's
own monorepo, published as it is: wherever these documents say `apps/`, read the repo root.) **Read the nearest `README.md` before
you edit a folder:** every area has one, saying what lives there, what it may import and what
imports it.

## 1. Map

| Path | What |
|---|---|
| `packages/colors/` | `@apps/colors`: every colour in apps/ — the palette, the semantic roles per skin × mode, the generated CSS + Tailwind theme, and the contrast gate. |
| `packages/ui/` | `@apps/ui`: the shared UI package. Components, non-colour tokens, skins' materials. Every app imports it. |
| `base-app/` | The template app. A new app starts as a copy of this folder plus one line in `workspaces`. It is self-contained (own deps, `.npmrc`, tsconfig, oxlint and biome config), so `npm run export` can take it to another repo; see its `README.md`. |
| `base-app/src/` | Client (React, Vite): `app/`, `pages/`, `core/{ui,api,auth,router,config,utils}`. |
| `base-app/server/` | Node API: `routes/ → services/ → repositories/ → infra/db`, plus `infra/{http,llm,log}`, `config/`, `main.ts`. |
| `base-app/shared/` | The wire contract (routes, auth levels, record types). Type-only. |
| `base-app/lib/` | Pure, environment-free helpers shared by client, server and fixtures. |
| `base-app/fixtures/` | Seeded demo data: the server seeds it (development); tests stub the API with it. |

## 2. Dependency direction

Imports point one way. Never in reverse.

- **Client:** `app → pages → core/* → @apps/ui`.
  - Pages get data from the API through `core/api` (`useApiQuery`, `useApiAction`), never from
    `fixtures/`: every page shows the real client → API → database path a new app copies.
  - Only `src/core/ui` imports `@apps/ui`; everything else imports UI from `~/core/ui`.
  - Pages never import other pages or `app/`.
  - `core/utils` (a re-export of `lib/`), `core/config` and `core/router` import nothing app-level.
  - `src/entry-server.tsx` is the server's one door into `src/` (§15), loaded by path, never imported.
- **Server:** `routes → services → repositories → DbClient` (`infra/db`), one way only.
  - Routes parse the request and write the response; no SQL, no business rules.
  - Services hold the business rules; they know nothing about HTTP.
  - Repositories hold the SQL; they call nothing above them.
  - `infra/*` (db, http, llm, log) is the bottom layer and never imports the app.
  - `config/` is read once, in `main.ts`, which wires everything.
- **Across the line:** `shared/` imports nothing and exports only types. `lib/` imports nothing
  outside `lib/`. `fixtures/` imports only `lib/` and `shared/`. The client never imports
  `server/`; the server never imports `src/`, React or `@apps/ui`. Tests may use `fixtures/`.
- `@apps/ui` imports nothing from any app.

oxlint enforces the parts it can (`no-restricted-imports` overrides in `base-app/.oxlintrc.json`
for the app and `apps/.oxlintrc.json` for `@apps/ui`). The general rules (plugins, categories,
`rules`, the `scripts/` override) are a block marked MIRRORED in both files: edit both, and
`npm run check` fails (`scripts/check-oxlint-mirror.mjs`) when they differ.
Never disable a rule to get past it: change the design, or ask.

## 3. Supply chain

- **7-day quarantine, exact pins (George's rule for every dependency).** Every version in every
  `package.json` is exact (no `^`, `~`, `*` or `latest`), and nothing published less than 7 days
  ago is ever installed, direct or transitive. `apps/.npmrc` (and `base-app/.npmrc`, which goes
  with the app when it is exported) enforces it at install time
  (`save-exact=true`, `min-release-age=7`), and `npm run check:deps` proves the committed
  `apps/package-lock.json` agrees by asking the registry for each locked version's publish date.
  It is part of `npm run verify`. To take a newer release, wait until it is 7 days old.
- Runtime dependencies allowed today:
  - `react` and `react-dom`;
  - in `@apps/ui`, shadcn/ui's stack (Radix primitives, pinned or vendored, and its small
    helpers), Tailwind v4 themed from our tokens, and `@tanstack/charts` with its React adapter —
    George's choice ("use shadcn as much as I can in core ui");
  - on the server only `pg` and `mysql2`, loaded lazily. SQLite is Node's built-in `node:sqlite`.
- Any other new dependency, runtime or dev, needs a written case in the commit body: why ~100
  lines of our own code can't do it, its licence, maintainers and transitive count.
- Prefer cloning a small component into our own code (with its licence notice in
  `THIRD_PARTY_NOTICES.md`) over adding a package.
- The LLM clients call the Anthropic and Gemini HTTP APIs with raw `fetch`, no SDKs: a
  deliberate exception to "use the vendor SDK", for the same reason.

## 4. Accessibility: WCAG 2.2 AA is the gate

- Everything works by keyboard, with a visible focus ring (`--ring`). Targets are at least 24×24px.
- Text contrast 4.5:1, UI parts and graphics 3:1, in every skin and both modes. Nothing is
  conveyed by colour alone (StatTile and Delta carry an arrow and words, not just green/red).
- One `<h1>` per page (through `Page`), real landmarks, a label on every control.
- Native elements first (`button`, `select`, `dialog`, `input type=checkbox`); WAI-ARIA APG
  patterns for anything custom (menu, tabs, switch).
- Respect `prefers-reduced-motion` and `prefers-reduced-transparency`.
- Every component and page has an axe test (tags wcag2a, wcag2aa, wcag21a, wcag21aa, wcag22aa).
  jsdom cannot compute contrast, so contrast is covered by `@apps/ui`'s token gate and a
  real-browser axe pass through Stagehand.

## 5. Theming and colour

- Two attributes on `<html>`: `data-theme` = `light` | `dark` (the mode) and `data-skin` =
  `enterprise` | `glass`. `useTheme()` from `@apps/ui` owns both.
- **Every colour is a role from `@apps/colors` (`packages/colors`). No exceptions** (George,
  Oct 2026: "NO hand rolled colours at all"). The palette (`src/palette.ts`) is the only place
  a colour value exists; the roles (`src/roles.ts`) give each one a job in each skin × mode.
  Nowhere else in `apps/` (CSS, TS, TSX, SVG, inline `style`) may write a hex, `rgb()`,
  `hsl()`, `oklch()`, `oklab()`, `color-mix()` or a named colour. `transparent` and
  `currentColor` are keywords, not colours, and are allowed. `npm run check` fails otherwise.
- Use roles through their Tailwind utilities (`bg-surface`, `text-fg-muted`, `border-border`,
  `bg-primary hover:bg-primary-hover`…) or, where a value must be handed to code (a canvas,
  an SVG fill), as `cssVar('chart-1')` → `var(--chart-1)`. Never read a role's value to
  compute another colour: if a colour is missing, add a role.
- **Button levels** (`Button`'s `variant`), each with rest / hover / pressed / selected /
  disabled / focus states built in, the same in both skins:

  | Level | Use it for |
  |---|---|
  | `primary` | the one main action of a page or dialog (Save, Sign in) |
  | `secondary` | an important action that is not the main one (Export, Invite) |
  | `neutral` | the default, everyday button (Cancel, Filters, Columns) |
  | `outline` | low emphasis in a dense row, next to a neutral |
  | `ghost` | toolbars, icon buttons, menu triggers |
  | `link` | an action that reads as inline text |
  | `danger` | destroys or removes something (always confirmed) |
  | `success` | confirms a positive, final step (Approve, Publish) |

  One `primary` per view. A button never borrows another level's colours to look different;
  add a level to `@apps/colors` and `Button` if one is truly missing.
- Add or change a colour: edit `packages/colors/src/roles.ts` (and `palette.ts` for a new
  swatch), run `npm run build --workspace @apps/colors`. Its contrast gate measures every
  text, button-state, status, boundary, focus and chart pair in all four themes, against
  glass's worst backdrop point, and refuses to write the CSS if one fails.
- To add a skin: one more theme in `roles.ts` keyed `<skin>-light` / `<skin>-dark`, one entry
  in `SKINS`, its material (filters) in `packages/ui/src/styles/`, one pass in the a11y gate.
- **Palette: graphite + azure** (George, Oct 2026: "indigo screams vibe coded … professional
  and ultra modern"). Graphite neutrals carry the interface; the main action is ink (near-black
  in light, near-white in dark), not a hue; one azure accent marks links, focus, selection and
  the secondary level only.
- **Look: expressive, not calm, in `apps/`.** By George's word, the glass skin uses the real liquid-glass material over an animated
  backdrop (the kit's own `tide` and `hive` shaders), and pages use the kit's own effects
  (`PointerLight`, the `RollingNumber` odometer, the generation reveal). The enterprise skin stays
  calm.
- **Performance rules for the glass skin** (George, Oct 2026: "glass mode is super laggy"; the glass
  skin is used mostly on phones). A backdrop filter is re-run by the GPU whenever what is behind it
  changes, so:
  1. **No `backdrop-filter` on content that scrolls.** Cards, tiles, buttons, inputs, badges,
     checkboxes, tables and tabs keep the translucent role fill, the rim and the elevation shadow;
     `--surface-filter` is `none` in every skin. Blur (`glass-chrome`, `--chrome-filter`) is for
     fixed chrome only: the top bar, the sidebar or drawer, a bottom tab bar, the sheet and dialog
     panels, menus, popovers, tooltips and toasts. The scrim dims, it does not blur
     (`--scrim-filter` is `none`).
  2. **SVG refraction (`LiquidGlass`) only where it does not scroll, and never on a phone.** It needs
     a fine pointer, a screen of at most 2x and a device that is not low power. `Card` has
     `lens` (default false); the data-table scroller and long lists never refract.
  3. **Render on demand, never a continuous loop.** A canvas or WebGL scene draws a frame when
     something changes (a resize, a theme, a prop) and stops asking for animation frames when
     nothing moves. An animated one is capped at 30 fps, holds while the page scrolls and while the
     tab is hidden, and stops offscreen. Idle page `requestAnimationFrame` callbacks per second:
     zero on a phone.
  4. **Canvases are capped at a device-pixel ratio of 1.5** (1.25 on touch), with a pixel budget, and
     **the page holds one GPU context** (the guard in `effects/webglGuard.ts`).
  5. **Every costly effect has a low-power path and reads the one signal**, `useLowPower()` /
     `isLowPower()` (`effects/lowPower.ts`), never its own guess: a coarse pointer, little memory or
     few cores, Save-Data, reduced motion or transparency, or a remembered lag. It sets
     `<html data-power="low">` (`AppRoot` does) so CSS can follow; an app can force it
     (`<AppRoot power="low">`). Low power draws the backdrop once, fades instead of revealing,
     starts sea glass still and paints sheet and dialog panels solid.
  6. **Heavy work leaves the main thread.** The Liquid Glass maps are made in a Web Worker and shared
     across sizes (8px buckets) and themes (the field does not depend on the appearance).
  7. **Check it on a phone profile.** `npm run check:perf:glass -w @apps/base-app` (local, with
     `npm run dev` running; Stagehand at 390x844, DPR 3, CPU x4) asserts zero idle frames, at most
     three backdrop-filter elements, no SVG filter on touch, a short theme toggle and a smooth first
     scroll. A new effect that fails it does not ship.
- Motion never costs access: every animation stops under `prefers-reduced-motion`, text keeps
  4.5:1 over the busiest frame of any background (glass falls back to solid surfaces under
  `prefers-reduced-transparency`), animated counters announce their final value only, and an
  animated background is decorative (`aria-hidden`) and never mounts more than one WebGL
  context per page.

## 6. Components

- Shared, reusable UI goes in `@apps/ui`, one component per file, exported from
  `src/index.ts`. Props extend the native element's props and pass `className` through.
- App-specific composition (Page, Money, ApiStatusBadge) lives in `base-app/src/core/ui`, not
  in the package.
- **Interface sounds come from the kit's `playSound` only** (`@apps/ui`, `src/sound/`): never an
  `Audio` element or a second AudioContext in an app. A sound answers a person's action (a
  press, a change, a reply that finished), never hover, focus or page load, and `playSound`
  already respects the Sounds setting (`useSoundEnabled`), a hidden tab and the server.

## 7. Auth, data and logging

- Auth is a server session: an httpOnly, SameSite=Strict cookie (Secure in production) holding
  a random token whose SHA-256 is stored; passwords are scrypt hashes. Every route declares
  `public`, `user` or `admin`, and the router enforces it. The client hides what a role cannot
  use, but the server is the guard.
- Development seeds a fixed, public login (`admin@example.test` / `adminpassword`) and demo
  data. Production refuses to start without its own `ADMIN_PASSWORD` and seeds no demo data.
- Schema changes are new files in `server/infra/db/migrations/`, applied in order on boot
  and recorded, with a checksum, in `schema_migrations` (rules: "Database design" below).
  SQL must run on SQLite, Postgres and MySQL: `?` placeholders, no bound `LIMIT`.
- **Background work and mail.** Work that need not finish inside the request, and everything that leaves
  the building (email), goes through the job queue (`server/services/jobs.ts`): `enqueue(tx, …)` inside the
  transaction that made it necessary, never a bare `fetch` or `setInterval` in a request or in `main.ts`.
  Mail is `Outbox.sendEmail(tx, …)` (`services/outbox.ts`): the row and the job commit with your change.
  Recurring work is a scheduled job (`services/housekeeping.ts`). Handlers run at least once, so they
  must be repeatable. Settings an admin changes at run time are `services/settings.ts`, not `localStorage`
  and not env (env is for deployment, settings are for the people running the app).
- Logs are one JSON object per line with a request ID; a 500 returns an `errorId` that matches
  its log line and never the error's text.

### Tokens, passwords, sessions and uploads

The emailed-link flows, the account routes and file uploads follow OWASP ASVS (V2 authentication, V3
sessions, V12 files). The code is `server/services/{tokens,password-policy,credentials,account,files}.ts`.

- **Tokens** (invitations, password resets). 32 random bytes, base64url; only the SHA-256 is stored.
  Invite 7 days, reset 1 hour. Issuing a token voids the user's older unused ones of that purpose. A token
  is spent by one conditional `UPDATE ... WHERE used_at IS NULL` in the same transaction as the action it
  unlocks (the first thing the transaction does), so two concurrent requests cannot both win and a failed
  action leaves the link usable. An unknown, used, expired, revoked or wrong-purpose token all answer
  `invalid_token` / "This link is invalid or has expired." The link is `APP_BASE_URL/accept-invite#token=…` (the token is in the fragment, which no server or Referer sees):
  in the fragment, which is never sent to a server or in a `Referer`; the page removes it from the address
  and history after reading it; the request log redacts `/api/auth/invite/<token>`.
- **Password policy.** One function, `assertPasswordPolicy`, used wherever a password is set (accept, reset,
  change): 10 to 256 characters (code points), not in `common-passwords.txt` (also with a tail of digits or
  symbols), not one repeated character, not containing the email or its local part (3+ characters). No
  composition rules. The strength meter in the page informs; the server decides. Sign-in is exempt, so an
  older password still works.
- **Enumeration.** `forgot-password` answers 202 and the same body for any address, takes at least
  `forgotMinMs` (300 ms), is rate limited per email and per address (the 429 does not depend on the account),
  and only an *active* account is sent a link. An invited or suspended account who asks gets nothing (an admin
  re-sends the invitation).
- **Sessions.** Changing or resetting a password ends the other sessions (a reset ends all, then signs this
  browser in fresh) and closes their event streams; revoking a session is matched on `(id, user_id)` in the
  same statement, so a stranger's id is a 404. A sign-in from a browser and system not seen in the last 10
  sessions raises a `security` notification.
- **Uploads.** `FileStorage` (`server/infra/storage`) takes a stream and returns a random key; the local-disk
  implementation (`UPLOADS_DIR`) rejects any key that is not 32 hex characters before it becomes a path, and
  writes a temp file then renames. An avatar: the declared type must be png, jpeg or webp, a declared length
  over 2 MB is refused before reading, the stream is cut at 2 MB, SHA-256 is computed on the way, and the first
  bytes must match the declared type. The filename is never used. Files are served with the stored type,
  `nosniff`, a `default-src 'none'; sandbox` CSP, `inline` only for those images (else `attachment`),
  `private` cache and an ETag. An avatar is readable by any signed-in user, an attachment only by its owner,
  and a file you may not read is the same 404 as one that does not exist.

### Database design

The schema is `server/infra/db/migrations/001_baseline.ts`, drawn and explained in
`server/infra/db/SCHEMA.md`. `npm run test:db` (Docker, `base-app/compose.yaml`) runs the
repository contract suite and the schema-conventions test on SQLite, Postgres 17 and MySQL 8.4.
A change that touches SQL is not done until that passes.

- **Migrations are append-only.** Never edit or delete an applied one; add `NNN_name.ts`. The
  migrator stores a sha256 of each migration's statements and refuses to boot on a changed or
  unknown applied id (dev fix: `npm run db:reset`). A new migration id must sort after the
  last applied one. MySQL commits DDL implicitly: keep a migration small, and fix forward.
- **Names.** snake_case, plural tables, `id` primary key, `<table_singular>_id` foreign key,
  `_at` for instants. No `is_`/`has_` booleans: a nullable `_at` (`read_at`, `used_at`,
  `revoked_at`). Avoid MySQL reserved words as column names (`key`, `order`, `group`).
- **Every constraint and index is named:** `pk_<table>`, `fk_<table>_<column>`,
  `uq_<table>_<columns>`, `ix_<table>_<columns>`, `ck_<table>_<rule>`. At most 63 characters.
  Uniqueness is a named `UNIQUE INDEX`, not an inline `UNIQUE`.
- **Keys.** `id` is a UUIDv7 string from `newId()` (`server/lib/ids.ts`), `VARCHAR(36)`
  (not `CHAR`: Postgres pads it). Never `AUTO_INCREMENT`/`SERIAL`: `lastInsertId` is not portable.
- **Types, through `migrations/dialect.ts`.** Timestamps are native (`TIMESTAMPTZ(3)`,
  `DATETIME(3)` as UTC, SQLite `TEXT`). Money is `BIGINT` minor units. JSON is `TEXT`.
  Booleans: avoid; a flag is `SMALLINT` with `CHECK (x IN (0, 1))`. Never `FLOAT` for money.
- **Timestamp contract.** Repositories bind `Date`, never a string, and the driver returns every
  timestamp as an ISO-8601 UTC string with milliseconds. Compare instants with a bound `Date`
  in SQL, not text. No `DEFAULT now()`: the application supplies the time from its clock.
- **Integrity lives in the database.** `NOT NULL` unless null means something (a new nullable
  column must be added, with its reason, to the allowlist in `schema-conventions.test.ts`).
  A `CHECK` on every enum-like column. A foreign key wherever a row refers to another, with an
  explicit `ON DELETE`: CASCADE for rows a user owns, SET NULL for history that must survive,
  RESTRICT otherwise. Emails are stored lower-case with `CHECK (email = LOWER(email))`.
- **Indexes.** Every foreign key column leads an index (MySQL makes one; Postgres and SQLite do
  not). Every query a repository runs has a supporting index; a list that sorts by time is a
  composite ending in the time column. No index nothing uses.
- **Every table** has `created_at`, and `updated_at` if rows change. Append-only event and series
  tables carry `occurred_at` (or `day`) instead; key-value tables carry only `updated_at`.
- **Portable SQL only:** `?` placeholders; `LIMIT`/`OFFSET` inlined as a clamped integer
  (MySQL rejects them bound); `Number()` on every count, sum and `BIGINT` (drivers may return
  strings); no `RETURNING` (Postgres only); no `ON CONFLICT`/`ON DUPLICATE KEY` except behind
  the `db.driver` switch in a repository, as `jobs.enqueue` does; upsert as UPDATE then INSERT.
  Check `rowsAffected` for "did I win": `UPDATE ... WHERE id = ? AND status = 'queued'`.
- **A lifecycle is an explicit state machine, and every transition is a guarded write.** A row
  with a status (a job, an email, a user, a waiting approval) changes it only with
  `UPDATE ... WHERE id = ? AND <the from-state>`, and the caller acts on `rowsAffected`: a
  late, repeated or racing write then changes nothing instead of overwriting a newer state.
  Write the diagram in the repository's comment (`repositories/jobs.ts`, `users.moveStatus`,
  `outbound-emails`, `agent.claimPending`). Running work is guarded by its lease (worker and
  attempt), and the work's own record reaches its final state through one place
  (`JobDefinition.onGiveUp`), not wherever it might fail. On the client, a process with several
  phases (a connection, a run) is one `phase` value changed through one function that releases
  what the old phase held, never a handful of booleans (`RealtimeProvider`).
- **Repositories** map rows to records and hold no rules; each has a case in
  `server/repositories.contract.test.ts`, which runs on all three databases.

### Realtime, notifications and after-commit

The notification network is: a row in `notifications` (the fact), a push over `GET /api/events` (a hint
that the fact changed), and an email job (the other channel). Code map: `services/notifications.ts`
(the `Notifier`, the inbox, the preferences), `services/events.ts` (the hub), `infra/db/after-commit.ts`,
`routes/{events,notifications}.ts`, client `src/core/{realtime,notifications}`, the bell in `src/app`.

- **Tell someone through `Notifier.notify(tx, input)`, inside the transaction of the thing that happened.**
  It reads the user's preference for the kind (code defaults in `NOTIFICATION_KINDS`; `security` in-app is
  locked on), inserts the row, enqueues the email through the Outbox, and queues the push. A rolled-back
  action leaves no row, no email job and no event.
- **Publishing to browsers happens after the commit: `afterCommit(tx, hook)`.** `createServices` wraps the
  database once (`withAfterCommit`), so every service's `db.transaction(async (tx) => …)` gives its `tx` a
  queue; hooks run in order after the commit, are dropped on rollback, and a hook that throws is reported
  (`onError`) and never fails the request. Outside a transaction a hook runs at once. Use it for cheap in-process
  side effects (publish, close a stream); anything that must not be lost is a job enqueued inside the
  transaction. Never call `realtime.publish` from inside a transaction.
- **The hub (`RealtimeHub`) is one object, `services.realtime`:** `publish(userId, event, data)`,
  `publishToAdmins`, `broadcast`, `disconnectSession(sessionId)`, `disconnectUser(userId)`, `setRole`,
  `count`. A service that ends a session (sign-out elsewhere, "sign out that device", a password change,
  a suspension) calls `disconnectSession` / `disconnectUser` after the commit. Streams also re-check their
  session every minute (`stillValid`), so a missed call costs at most a minute.
- **No replay.** Event ids count up inside a process but a reconnecting client is not sent what it missed:
  it refetches (the client fires a synthetic `resync`; `useEventStream('resync', reload)`). Every event is
  a hint ("a notification arrived, you now have 4 unread"), never the only copy of the data. This is also what
  makes more than one server process safe to add: the `EventBus` interface in `services/events.ts` is the seam
  (publish an envelope; every process delivers what it hears to its own clients). The in-memory bus is today's
  implementation; Postgres `LISTEN/NOTIFY` (payloads are capped at 8000 bytes: send ids) or Redis pub/sub goes
  behind the same two methods, in one file.
- **Limits.** At most 5 open streams per user (the oldest is closed); a stream that is not draining (256
  unsettled sends) is cut and resyncs; the heartbeat is `openSse`'s. Browsers allow six connections per origin
  over HTTP/1.1, so the client closes a tab's stream after 5 minutes hidden and reopens it (with a resync) on return.
- **Everything is the caller's own.** The notification routes take no user id; another user's notification id is
  a 404, not a 403, so ids cannot be probed. `link` is an in-app path only (checked on write and again before the
  client navigates).
- **Lists are keyset-paged** on `(created_at, id)` with an opaque cursor (`ix_notifications_user_id_created_at`):
  no gaps or repeats when rows arrive between pages, unlike `OFFSET`.
- **Client:** `RealtimeProvider` + `useEventStream(event, handler)` (core/realtime) own the one `EventSource`,
  reconnect with jittered exponential backoff themselves (the built-in retry gives up after an HTTP error, such as
  a 401), and report `status`. `NotificationsProvider` keeps the unread count (`unread-store.ts`, also read by
  `Page` for the tab title) and shows the polite toast. Pages and tests without the provider see a closed,
  silent stream.

## 8. Secrets and config

- Secrets come from the environment only: `base-app/.env` (gitignored) or the shell. A key
  written to any tracked file is published the moment it is pushed.
- Never log, return or echo a key. Error messages name the variable, never its value. Database
  URLs are redacted (`redactUrl`) in every log and error.
- `RESEND_API_KEY` is read once in `config/env.ts`, goes into the `Authorization` header and nowhere else:
  never logged, never in `outbound_emails.error`, never in a job's `last_error`.
- The client sees `VITE_*` only, through `src/core/config`. The server reads env once, in
  `server/config/env.ts`.

## 9. Tests

- Tests sit next to the code: `x.ts` → `x.test.ts`.
- Pure logic gets unit tests; components and pages get behaviour tests and an axe test.
- Fake data is seeded and anchored to `FAKE_NOW`: no `Date.now()`, no unseeded randomness.
- No network in tests: `fetch` is stubbed by `src/test/setup.ts`; LLM clients take `fetchImpl`.

## 10. Naming and layout

- Folders kebab-case. Component files PascalCase (`HomePage.tsx`). Hooks `useX.ts`. Pure
  modules lower-case (`format.ts`).
- Page folders match route ids; a page's `index.ts` is `export { default } from './XPage';`.
  Adding a page = one folder + one line in `src/app/routes.ts`.
- Server relative imports carry `.ts` (Node runs the TS directly by type stripping). Client
  imports are extensionless and cross areas with the `~/` alias.

## 11. TypeScript

Strict, `noUncheckedIndexedAccess`, `erasableSyntaxOnly` (no enums, namespaces or parameter
properties), `verbatimModuleSyntax` (type-only imports use `import type`). No `any`.

## 12. Commands (run from `apps/`)

| Command | Does |
|---|---|
| `npm install` | Install every workspace. |
| `npm run dev` | base-app: one Node server on :5173 with Vite inside it: server-rendered pages, hot reload, `/api` on the same origin. |
| `npm run check` | biome + oxlint + the oxlint/script mirrors + `check:colours` + `check:pages` + `check:colors` (generated CSS current, contrast gate) + the app's own check. |
| `npm run check:colours` | `scripts/check-colours.mjs`: no hex / `rgb()` / `hsl()` / `oklch()` / `color-mix()` / named colour / stock Tailwind palette outside `packages/colors`. `npm run check` runs it with `--no-legacy`, so the old colour names fail too (§14 rule 15). |
| `npm run check:pages` | `scripts/check-pages.mjs`: pages are made of kit components (§13). Report mode prints counts; `--strict` fails. |
| `npm run check:craft` | `scripts/check-craft.mjs`: motion and wording habits (§14 rule 137). `--strict` fails; `craft-ok: <reason>` in a comment marks a deliberate exception. |
| `npm run build --workspace @apps/colors` | regenerate `packages/colors/css/` after editing `roles.ts` / `palette.ts` (the contrast gate must pass). |
| `npm run check:deps` | the 7-day quarantine and exact-pin check (needs the network). |
| `npm run format` | biome format --write. |
| `npm run typecheck` | tsc for every workspace. |
| `npm test` | `node --test scripts/` (the checkers' own tests) + vitest in every workspace. |
| `npm run a11y` | the axe gates. |
| `npm run check:budget -w @apps/base-app` | builds the client and fails when first-load JavaScript (sign-in, Home; gzip bytes of the static import graph) is over `BUDGETS` in `scripts/check-budget.ts`; part of `verify`. |
| `npm run check:perf:glass -w @apps/base-app` | the glass performance guard rail on a phone profile (§5), local, needs `npm run dev`; not part of `verify`. |
| `npm run verify` | all of the above. Run it before you call work done. |

Checks are local only: there is no CI for `apps/`.

## 13. Pages are made of core components; no custom CSS

- **A page composes kit components and nothing else.** Layout (`Stack`, `Cluster`, `Grid`,
  `Section`, `PageGrid`), type (`Heading`, `Text`), surfaces (`Card`, `Panel`) and every
  control come from `@apps/ui` through `~/core/ui`. If a page needs a look the kit cannot
  give, the kit is missing a component or a prop: add it there (with its test and axe pass),
  never style around it in the page.
- No `.css` files under `base-app/src`. No colour, spacing or font values in a page's
  `className` beyond the kit's documented layout props; no arbitrary Tailwind values
  (`bg-[…]`, `w-[…]`, `[--x:…]`) and no inline `style` in pages. `npm run check` fails otherwise.
- The kit keeps CSS only for what Tailwind cannot say: the generated colour CSS, the reset,
  keyframes, the liquid-glass SVG filter layers, and the forced-colours / reduced-motion /
  reduced-transparency rules. Everything else is a component's Tailwind recipe.

## 14. Rules learned (the gap log)

Every hole or bug an audit finds becomes a rule here, with the check that now enforces it
where one can. Add to the end; never delete a rule without George's say-so.

1. **Colour values live only in `packages/colors`.** Check: the no-colour scan in `npm run check`.
2. **Status text on its own soft wash must pass 4.5:1.** The old palette failed 13 such pairs
   because badges were only ever outlined. Check: the `@apps/colors` contrast gate.
3. **Glass solid fallbacks must out-rank glass light.** `:root[data-skin="glass"]` (0,2,0) lost
   to the glass-light block (0,3,0), so reduced transparency kept translucent surfaces in light
   mode. Fallbacks use `:is([data-theme], :not([data-theme]))`. Check: `@apps/colors` tests.
4. **Type tokens are `font` shorthands.** `font-size: var(--t-…)` is invalid and silently fell
   back to 16px on 11 rules. Type comes from `Heading` / `Text`, never a raw token.
5. **A selected table row gets a `brand` bar, never a wash** (a wash pulled Badge text under
   4.5:1). `selected` is for controls only. Check: the browser a11y gate.
6. **A scroll box is the containing block of what scrolls in it** (`position: relative`), or
   an absolutely positioned descendant (screen-reader text) escapes and widens the page.
7. **A table cannot be shrunk by `.ui-sr-only`** (it sizes to its content): wrap it in a
   clipped block. Hidden chart tables widened every page on a phone.
8. **Grid and flex children that hold wide content need a shrinkable track** (`minmax(0, 1fr)`
   / `min-width: 0`); the kit's layout components do this so pages never have to.
9. **Dense menus are icon-only** (`Menu iconOnly`): a row-action trigger's accessible name
   must not render as visible text. Check: kit tests.
10. **One `Toaster`, at the app root.** Pages and tests that render a page alone mount their own.
11. **The shared API mock must speak every server mode** a page uses (the table's query mode),
    so production code never grows "tolerant readers" for tests.
12. **The browser a11y gate measures the settled page:** transitions and entrance animations are
    off while it scans, or a theme flip caught mid-way reads as a contrast failure.
13. **Generated files are not formatted or hand-edited** (`packages/colors/css`); the build's
    `--check` fails when they drift from the source.
14. **Stock Tailwind palette utilities and role brackets are colour leaks.** `bg-red-500`,
    `text-white`, `border-black/10` and `[--x:var(--role)]` / `bg-[var(--surface)]` all route
    around the role utilities. Roles have utilities (`bg-surface`); use those. Check:
    `check:colours` (`tw-palette`, `arbitrary`).
15. **Old colour names are gone.** `--ink`, `--accent`, `--line`, `text-ink`, `border-edge`,
    `bg-elevated`, `text-muted-foreground`, `--glass-tint-*`, `--glass-chip`, `--btn-fill` and the
    rest of the old names were deleted with the migration; the checker keeps the list so they
    cannot come back. Check: `check:colours` (runs `--no-legacy`).
16. **A page's `className` carries only `sr-only` and `col-span-*` / `row-span-*`** (with a
    responsive prefix). Any other class, a styled raw `<div>`/`<span>`, an arbitrary value or an
    inline `style` in `src/pages/**` or `src/app/**` means a kit component or prop is missing
    (§13): add it to the kit. Check: `check:pages --strict`.
17. **No `.css` under `base-app/src`, and no `import './x.css'`.** App CSS is how hand-rolled
    colours and one-off layouts crept back in. Check: `check:pages`.
18. **Exports carry every package the kit imports.** `@apps/ui` depends on `@apps/colors`, so
    `npm run export` vendors both (`vendor/ui`, `vendor/colors`) and the `Dockerfile` copies both
    manifests; the colour and page checkers are copied into `base-app/scripts/` and
    `check-oxlint-mirror.mjs` fails when the copies differ.
19. **A selected table row's bar is a border on its first cell, not a shadow carrying a colour.**
    `shadow-[inset_3px_0_0_var(--accent)]` was an arbitrary value holding a colour; the bar is now
    `border-s-3` with `border-s-brand` / `border-s-transparent` chosen in code (never both, since
    the same-property utilities would tie on order). Check: the no-colour scan and kit tests.
20. **A gradient needs a colour utility, not `color-mix`.** The skeleton shimmer is
    `bg-linear-90 from-transparent via-(--shine) to-transparent`; effect roles (`shine`, `glare`,
    `spotlight`) are not Tailwind colours, so they go in through the variable shorthand or a prop.
21. **Tailwind only emits classes it can read whole.** Layout props map to literal class tables
    (`layout/classes.ts`), never to a template string such as `` `gap-${n}` ``, or the class is
    silently missing. Check: `core-components.test.tsx` plus a CSS build grep.
22. **Grid and flex items default to `min-width: auto`, so a minmax(0, 1fr) track alone is not
    enough:** the layout components also put `min-w-0` on every child (`*:min-w-0`).
23. **Avatar hues are roles (`avatar-N` + `avatar-N-edge`), six of them;** a name hashes into six
    buckets, not five chart colours.

24. **A control state is a role pair, never opacity or a filter.** Disabled is `bg-disabled text-disabled-fg border-disabled-border`; pressed is the `-active` role plus `--elev-inset`; a button never uses `opacity-50`, `brightness` or a mixed colour for a state. Check: `packages/ui/tests/controls-v3.test.tsx`.
25. **One selected look for every control**: `bg-selected text-fg border-brand` (Toggle, SegmentedControl, Tabs, checkable menu items, CommandPalette option). A component never picks its own hue for "on".
26. **Liquid Glass refraction cannot read a role.** It paints `--lg-fill` in its own layer, so a button whose fill changes per state (hover, pressed) would need that fill duplicated into a custom property. Button therefore does not refract; it uses its translucent role fill plus `glass-blur`. If refraction on buttons is wanted, `LiquidGlass` must take a role name and follow state through `cssVar`.
27. **Pressed/hover utilities must not out-rank disabled.** `aria-pressed:` sorts after `disabled:`, so pressed fills are written `not-disabled:not-aria-disabled:aria-pressed:…`.
28. **Alias names are for safety only.** Button `destructive`/`accent-outline` and Badge `default/accent/warn/solid` still resolve, but every call site uses the new names (`danger`, `secondary`, `neutral`, `brand`, `warning`).
29. **Invalid is not colour alone**: `aria-invalid` adds a 1px inner outline in `outline-danger` on top of `border-danger`, replacing a CSS rule that held a colour.
30. **A shader or canvas never mixes colours; it is handed roles.** `palette.ts` mixed chart tints
    toward the page in JS, a colour the role table could not see or gate. The shader palette is now
    `shader-bg` / `shader-a..c` (precomputed per theme, `MAX_TINT` documented in `roles.ts`), the
    static backdrop washes are `backdrop-1..3`, the contrast scrim `shader-scrim`; the gate measures
    text over all of them. `intensity` is canvas opacity, not a tint. Check: `visuals-v3.test.tsx`.
31. **Colour that cannot be resolved is absent, never invented.** A numeric "fallback" colour in a
    scene (`[0.49, 0.57, 0.9]`) is a hand-rolled colour. When a role cannot be read the scene does
    not mount and the static role gradient stays.
32. **A rim, highlight or glow image carries no colour.** Liquid Glass's generated rim was a grey
    PNG; it is now two alpha masks painted by the `lens-light` and `lens-shade` effects, so the
    image is shape only and the colour is a role. Same for any generated bitmap.
33. **A utility layer outranks nothing unlayered.** `liquid-glass.css`'s `position: relative`
    default overrode a surface's own `sticky` / `fixed` utility because unlayered CSS beats
    `@layer utilities`; kit defaults that a utility may override live in `@layer base`.
34. **Series are told apart by more than colour for every series colour**: the palette grew to
    eight, so dashes, markers and bar patterns grew to eight too (a ninth series reuses the first).
    Check: `visuals-v3.test.tsx`.
35. **Screen shapes are patterns, not page code.** Every page re-built the same list screen
    (toolbar card, chips, bulk bar, table, pagination, error and empty states), detail drawer, KPI
    row, feed, quick-action list, settings nav + save bar, sign-in shell and status page by hand,
    each with its own `.css`. They are `ListPage`, `DetailSheet`, `KpiRow`, `ChartGrid`, `FeedList`,
    `ActionList`, `SettingsLayout` + `SaveBar`, `AuthLayout`, `StatusPage`, `ToolLayout`,
    `PageHeader` in `packages/ui/src/patterns`. A page that needs a new shape adds a pattern.
36. **A field's label, help and error must be wired by one component.** Pages wired `htmlFor`,
    `aria-describedby` and `aria-invalid` by hand with `useId` chains (the sign-in page used four
    ids) and drifted. `FormField` does it for any single control; a form never builds the ids itself.
37. **A save bar needs a live region that exists before the change.** A `role="status"` inserted
    together with its text is often not announced, so `SaveBar` keeps a polite line mounted and
    the visible text is not a second live region. When the bar unmounts it drops focus: the page
    moves focus to its heading.
38. **Skin differences in a pattern are CSS variants, not a `useDocumentSkin()` branch,** so the
    static showcase and the browser a11y gate see both skins from one markup. Two utilities of the
    same property (`lg:flex` and `glass:lg:hidden`) tie on order, so the skin one is written
    important (`glass:hidden!`).
39. **A mobile nav that is a second control is still one control to assistive tech.**
    `SettingsLayout` renders the section `<nav>` and a native `<select>` that drive the same value;
    CSS shows one at a time (`hidden lg:block` / `lg:hidden`), so a screen reader never meets both.
40. **A full-page shell owns `<main id="main">`.** `AuthLayout` has no `AppShell` around it, so it
    is the `main` landmark itself and `ErrorState`'s focus-restore finds `#main`; it must not be
    nested inside the shell's `main` (axe: landmark-main-is-top-level).
41. **Gaps the patterns had to work around, now to fix in the kit:** `DataTableView` has no
    `error` or `busy` state (ListPage wraps it); `EmptyState`'s title cannot be an `h1`
    (StatusPage sits under the page's own `h1`); `Label` requires an `htmlFor` string, so a control
    inside a custom component cannot be labelled by wrapping; `Sheet` takes a string-like `title`
    and a required `description` (DetailSheet falls back to a screen-reader-only "Details").
42. **A role named like a stock palette colour tripped the palette check.** `neutral` is a button
    level (`bg-neutral`) and also a Tailwind stock palette name, so `check-colours` flagged the
    role itself; the palette pattern now matches `neutral` only with a shade (`bg-neutral-500`).
    Check: `check-colours.mjs`.
43. **A worst-case measurement page is part of the kit and follows the colour rule.** `a11y-check.mjs`
    hand-rolled a `color-mix` of a hex over `--bg` for the worst glass backdrop; it now lays the
    `selected` role over `canvas`. Test fixtures and scripts are not exempt from the no-colour check.
44. **Deprecated aliases die with their last caller.** The `fill="elevated"` / `"bar-surface"`
    aliases of LiquidGlass outlived every caller and kept an old name alive; callers were migrated
    (`raised`, `bar`) and the alias deleted. A test asserting a colour output computes it from
    channels instead of writing the literal.
45. **A greeting strip with a glass-only shader is a kit piece (`PageHero`), not page markup.** The
    page had a `.ui-shader-host` div plus a CSS override to move the accent; a shader canvas must
    mount only in the glass skin, so `PageHero` branches on `useDocumentSkin()` (the one allowed
    exception to rule 38: a CSS-hidden canvas would still mount).
46. **A chart card's failure is one component (`ChartFailure`).** Home and Graphs each hand-built
    the same "Couldn’t load X" + Retry block with page CSS; `ErrorState` is its own alert and would
    nest a second one inside the card's. Check: `check:pages` (no styled raw elements).
47. **A visually hidden label is a prop, not a page CSS rule.** The calculator hid each Slider's
    own label with a descendant selector; `Slider hideLabel` does it with `sr-only`, and the thumb
    stays named. Likewise `Card fullHeight` (a card filling its grid cell) and `Text size="title"`
    (the h2 type token for a figure that is not a heading) replace page CSS (`height: 100%`, `font:`).
48. **A query that depends on an optional id is still called every render.** The detail sheet keeps
    one `useApiQuery` and gives it a never-settling promise while no id is open, instead of
    mounting a child to hold the hook, so `DetailSheet` stays mounted and Radix returns focus to the
    opener on close.
49. **The app root, the entrance animation and the room-saving hides are kit components.** The shell wrote
    `<div className="ui-app">`, `.app-route` keyframes and `display: none` media queries in `app.css`. They
    are `AppRoot`, `PageEnter` and `Show from/below`; a page or the shell never writes the class or the
    query. Check: `check:pages` (`raw-element`, `css-file`).
50. **A card of radio choices, an inline notice and a password field are kit components.** The settings page
    drew picture cards (`PickCard`, mock-up skins, backdrop swatches with `color-mix`), the sign-in page an
    error summary and a Show/Hide row, each in its own CSS. They are `ChoiceCard` (+ `SkinPreview`,
    `BackdropSwatch`, on `backdrop-*` roles), `Notice` and `PasswordInput`. Check: `check:colours`, `check:pages`.
51. **A sign-in "loading" gate and a crash fallback use the same patterns as the pages they stand in for.**
    The gate is `AuthLayout` with a skeleton (so the layout does not jump when the form arrives), the error
    boundary's fallback a `Notice` with a retry: neither is a bespoke `app-*` block.
52. **`Text` must be able to be heavier and bigger without a class.** Brand names and big counts were
    `font-weight`/`font` rules in CSS; `Text` takes `weight`, `size="display"` and `preserveLines`.
53. **An effect card that needs a surface says so with a prop.** The pointer-light cards once documented
    "pair it with `ui-card`", which pushed pages to write the class; `PointerLight` takes `surface`. `ShaderHero` is the
    host the `ShaderAccent` needs (`.ui-shader-host`), so a page never writes that class either.
54. **A list screen that groups by day is one table with a date column, not a table per day.** The audit log's
    per-day tables needed `table-layout` CSS to line up and could not use `ListPage`; one sorted table with a
    date-range control (rows narrowed before the table sees them) keeps the facet counts, chips, paging and CSV
    in one place. The cost: a facet value that the date range filters out disappears from its list.
55. **`getByRole` in the app's own `~/test/dom.ts` knows only explicit `region`/`group` roles.** A page that
    moves from hand-written `role` attributes to kit patterns (a `Section`'s implicit region) is tested by its
    `aria-busy` / heading text, not by `getByRole('region', …)`. Tests assert behaviour, not the removed
    `app-*` class names.
56. **A loading `Button` is `aria-busy`, so a reference page must not show one by default.** The kit page's
    matrix adds the loading state only while its "Preview loading states" switch is on, or the shell's a11y gate
    reads the whole page as still loading.
57. **A masked layer paints its colour as an image, not a `background-color`.** Contrast checkers ignore
    `mask-image`, so a rim layer painted with `background: var(--lens-light)` reads to axe as an opaque wall
    behind the text; `background-image: linear-gradient(var(--x), var(--x))` paints the same and is left for
    review. (liquid-glass.css; the browser gate is `check:a11y:browser`.)
58. **The browser a11y gates run against a fresh dev server.** A long-running Vite can keep serving a
    stylesheet from before a merge, so a gate run against it measures CSS that is no longer in the tree.
    Restart `npm run dev` before `check:a11y:browser` after pulling or merging.
59. **A live region has to exist before its first message.** A `role="log"` inserted together with its
    first text is often not announced, so `AssistantLayout` mounts the `ChatThread` in the empty state too
    (the empty state is its content) and the first reply is an addition to a log that was already there.
    The same reason `SaveBar` keeps its status line mounted (rule 37).
60. **A streaming reply is `aria-busy`, so a reference page must not show one by default** (rule 56). A
    `ChatMessage streaming` and a `ChatThread busy` set `aria-busy`; the kit page renders them only while its
    "Preview loading states" switch is on. `TextShimmer` and `Thinking active` do not set it: a shimmering
    label is not a loading page.
61. **An agent's approval is decided by a button, never by Esc, and the decision moves focus.** The source
    `approval-card` denied on Escape; a stray key must not decide for the person. After Approve or Deny the
    buttons unmount, so focus moves to the `role="status"` receipt instead of falling to `<body>`.
62. **A prop named `role` on a component is read as an ARIA role.** biome's `useValidAriaRole` flags
    `<ChatMessage role="assistant">`; the prop is `from`. Choose a prop name that is not an HTML attribute.
63. **A CSS-only shimmer needs a reduced-motion form that still reads.** Text painted with `background-clip: text`
    and `text-transparent` is invisible if the gradient is removed, so `motion-reduce:` and `forced-colors:`
    drop the gradient and restore the text colour together (`motion-reduce:bg-none motion-reduce:text-fg-muted`).
64. **A scrollable log is focusable, and the lint rule is silenced with a reason, once.** axe's
    `scrollable-region-focusable` wants `tabIndex={0}` on the scroll box; oxlint's `no-noninteractive-tabindex`
    objects, so `ChatThread` wraps its return in an `oxlint-disable ... -- reason` / `enable` pair, the pattern
    `Code block` already uses.
65. **A page that wants the assistant layout's height cannot set one.** Pages may not carry height classes
    (rule 16), so `AssistantLayout` sizes itself to the viewport minus the page header
    (`h-[clamp(24rem,calc(100dvh-15rem),52rem)]`) and takes `className` for a box-fitted override in the kit.

66. **A sequential ramp is a set of roles, gated.** The calendar heatmap needed five steps of one hue, which
    the categorical `chart-N` roles cannot give. `heat-0` (an empty, outlined cell) and `heat-1..4` are
    roles; the four filled steps are each held to 3:1 on the page and the surface in all four themes
    (dark climbs deep to pale, light mid to deep, so "more" is always further from the background). A
    pale-to-dark tint ramp cannot pass 3:1 at its lightest step, so the ramp starts at a mid tone. Check: the `@apps/colors` gate.
67. **A hand-drawn SVG chart measures its own width.** Fill patterns (hatch, dots) stretch if the SVG is
    scaled with `preserveAspectRatio="none"`, so `useMeasuredWidth` gives the exact px width and the
    shapes are laid out in pixels. Do not use it where TanStack draws (`useChartWidth` rounds to 16px for that).
68. **A chart whose parts are focusable is a list or a grid, never `role="img"`.** `role="img"` with
    focusable children is axe `nested-interactive`. The heatmap is an ARIA grid (one tab stop, arrows,
    cells named by their date and count) and the treemap a list of tiles (one tab stop, arrows); both
    keep their data table as the text alternative. Biome's `useSemanticElements` and
    `noInteractiveElementToNoninteractiveRole` do not know SVG, so the few places are suppressed with a reason.
69. **Text over a patterned or coloured fill sits on a solid chip.** Treemap labels were unreadable over the
    hatch patterns; a `surface-solid` chip behind the text keeps 4.5:1 whatever the fill, and a label that
    does not fit its tile is hidden, named by the readout line and the table instead.
70. **A count-up is already in `KpiTile`.** Arc's `animated-counter` duplicated the kit's own counter
    (now `RollingNumber`: final value only for a screen reader, instant under reduced motion); it is a
    `countUp` prop on `KpiTile` (default on), not a second component.
71. **Dashboards reduce data the API already serves before asking for a new endpoint.** The heatmap bins
    `GET /api/transactions` per UTC day and the gauges take a share of the same rows
    (`lib/insights.ts`, pure, tested); a route is for data the client cannot derive.
72. **A date is a `YYYY-MM-DD` string, an instant is an ISO timestamp, and the page converts.** The kit's pickers
    speak calendar days (`IsoDate`); a server filters by instants. The table sends `from` / `before` (the start of
    the first UK day, the start of the day after the last) so the server stays zone-free and the Date column and the
    filter agree across a clock change (`pages/table/range.ts`, tested at both changes). Never send a picker's day to
    a time column as it is.
73. **A popup that opens inside a native `<dialog>` cannot be portalled.** `showModal()` puts the dialog in the top
    layer, so a Radix portal to `<body>` renders behind it. `Combobox` / `MultiSelect` draw their list in place;
    `DatePicker` / `DateRangePicker` take `portal={false}` for use in a dialog.
74. **A custom widget that keeps focus elsewhere uses `aria-activedescendant` and `tabIndex={-1}` options.** The
    combobox keeps focus on its input and the options are `div role="option" tabIndex={-1}` with their own keys
    (the command palette's pattern), because oxlint's `jsx-a11y` rules reject `li role="option"` and biome's
    `useSemanticElements` rejects `role="grid"` on a table. Where the two linters disagree, the APG role wins and the
    file carries a `biome-ignore-all` with the reason.
75. **An `aria-disabled` stepper is not a `disabled` one.** A `NumberField` at its limit greys its − or + button with
    `aria-disabled`; a `disabled` button inside the field would trip the field's `has-[input:disabled]` look and drop
    out of the tab order mid-press.
76. **Hold-to-confirm needs a way in that is not holding.** A press-and-hold is a gesture some people cannot make, so
    `HoldToConfirm` also arms on one keyboard press (or a screen-reader click) and confirms on the second, and the
    held state is a label ("Keep holding…") before it is an animation. A destructive action that needs reading first
    (Suspend a user) stays a `ConfirmDialog`.
77. **A page test that clicks a date picker pins only `Date`.** `vi.useFakeTimers({ toFake: ['Date'] })` fixes "today"
    for the picker's presets and leaves `setTimeout` real, so the page's debounces and `flush()` keep working.
78. **The app shell clips its own overflow.** Glass rims paint 2px outside each surface, so a
    full-bleed top bar or sidebar widened the page by 2px and gave a short page (the assistant) both
    scrollbars. `.ui-shell` is `overflow-clip` (clip, not hidden: sticky still works and fixed
    descendants still escape).
79. **A refracting surface that turns into an overlay needs an opaque fill.** LiquidGlass writes an
    inline transparent background, so the phone drawer (the sidebar, fixed over the page) showed the page
    straight through it. Overlay states force `bg-surface-solid!`; refraction is for surfaces that sit
    on the backdrop, not over content.
80. **A relative time takes `now` as a parameter.** `formatRelativeTime(value, now)` and the account parts' `now`
    prop keep tests and server renders off the clock; with no `now`, `useNow` reads it once and then once a minute.
    Calling `Date.now()` in a component body fails oxlint's `react/purity`; the lazy `useState(() => Date.now())`
    inside the hook does not.
81. **State that follows a prop is adjusted while rendering, not in an effect.** oxlint's `react/set-state-in-effect`
    rejects `useEffect(() => setX(…))`. `NotificationBell` (a rise in `unreadCount` rings and announces) and
    `AvatarPicker` (an upload that ended clears the preview) compare the prop with a remembered copy during render and
    set state there; a timer that clears the state later is still an effect, because the `setState` is in its callback.
82. **A button that unmounts takes focus with it.** After "Cancel" or a finished upload the Save / Cancel pair is gone,
    so `AvatarPicker` keeps a `refocus` flag and an effect that focuses "Change photo"; its `onFocus` clears the flag.
83. **A count in a name beats a badge in a picture.** `NotificationBell` is named "Notifications, 3 unread" and the
    badge is `aria-hidden`; the "9+" cap is only for the picture. A rise in the count is announced through a status
    line, never by moving focus.
84. **An unread row is a bar, not a wash.** A `bg-selected` wash pulls muted text under 4.5:1 (see the table row
    rule), so an unread notification takes a 3px brand edge, a dot, a bolder title and the sr-only word "Unread".
85. **`Popover` can take your own trigger.** `customTrigger` replaces the default outline button for a bespoke
    control (the bell); it must be one focusable element that forwards its ref and props, because Radix's
    `asChild` merges the trigger props into it.
86. **User-agent parsing tests tokens in order.** Edge and Opera also say "Chrome", Chrome also says "Safari", so
    `describeUserAgent` lists the browsers from most to least specific; unknown strings say "Unknown device", never
    throw. Put the device name in the Sign out button's accessible name too: three rows of "Sign out" are not
    distinguishable.
87. **A streamed response is opened late and written only through the writer.** `openSse(req, res)` (server/infra/http/sse.ts)
    runs after the body is parsed and the quota admitted, so every refusable thing is still a JSON envelope with its real
    status; afterwards the status is 200 and a failure is an `error` event (safe message, `errorId`, never provider text).
    Never `sendJson` or set `content-length` after it, and never put compression on `/api`: `no-cache, no-transform` and
    `X-Accel-Buffering: no` only help if nothing in front rewrites the stream. Await `send()` so a slow client is
    back-pressured, and hold the quota slot until the stream ends, not until the headers are out.
88. **Streams are aborted by the client leaving, not by us noticing.** `writer.signal` fires on the response's `close`;
    pass it to whatever the stream is paying for (the LLM `stream(req, {signal})` closes the upstream connection). A
    heartbeat timer is `unref`'d and cleared on close, or it holds the process and leaks a socket per dropped client.
89. **The Vite dev proxy must not time out a stream.** `vite.config.ts` sets `timeout: 0, proxyTimeout: 0` on `/api`; the
    default http-proxy passes bytes through as they arrive, so no compression or buffering plugin may ever sit on
    `/api` in dev (it would hold a reply back until it ends and "streaming" would look like one block).
90. **One SSE parser, in `lib/sse.ts`, for browser and server.** Chunks arrive cut anywhere (mid-line, between `\r` and
    `\n`, inside a multi-byte character): decode with `TextDecoder({stream: true})`, hold a trailing `\r`, drop an
    unfinished last event. Test any reader against every chunk size (`for cut in 1..n`), not one hand-picked split.
91. **A stream timeout is an idle timeout.** `AbortSignal.timeout(120s)` would cut a long, healthy reply; `postStream`
    restarts its timer on every event and stops it while the consumer is busy (a slow client is not a stalled provider).
92. **A streaming UI announces the end, not the tokens.** The chat thread is a polite `log` held `aria-busy` while a reply
    streams, plus one `role="status"` line that is empty until it says "Reply complete." or "Reply stopped.". Stop keeps
    the partial text (marked "Stopped") and it is part of the next request; an error removes the whole exchange and
    returns the text to the composer. A stream that ends without its `done` event is an error, never a finished reply.
93. **Ids are `VARCHAR(36)`, not `CHAR(36)`.** Postgres pads `CHAR` with spaces on read, so a short readable
    seed id (`usr_admin`) came back as `usr_admin` plus 27 spaces. MySQL and SQLite do not pad; only the
    fixed-length hashes (`CHAR(64)`) use `CHAR`.
94. **MySQL's default collation is case-insensitive, so `CHECK (email = LOWER(email))` is always true there.**
    `dialect.isLowerCase` compares `CAST(... AS BINARY)` on MySQL. MySQL also ignores a primary key's
    constraint name (it is always `PRIMARY`), which the conventions test allows for.
95. **SQLite needs three workarounds for the same schema.** Foreign keys are off until `PRAGMA foreign_keys = ON`,
    per connection (set when the client opens). Inline `UNIQUE` constraints lose their name, so uniqueness is a
    named `UNIQUE INDEX` on every driver. It cannot `ALTER TABLE ADD CONSTRAINT`, so the `users`/`files` cycle is
    declared inline on SQLite and added by `ALTER` on Postgres and MySQL.
96. **`key` is reserved in MySQL**, and there is no quote character all three accept (backticks vs double
    quotes), so `app_settings` is keyed by `setting_key`. Check a new column name against MySQL's reserved words.
97. **A failed statement aborts a Postgres transaction**, so "insert, catch the duplicate" is wrong inside
    `db.transaction`. `jobs.enqueue` uses `ON CONFLICT (dedupe_key) DO NOTHING` (`ON DUPLICATE KEY UPDATE` on
    MySQL) behind `db.driver`, then asks which id owns the key, because MySQL's affected-row count cannot tell
    an insert from a duplicate. Never `INSERT OR IGNORE`/`INSERT IGNORE`: they also swallow CHECK and NOT NULL errors.
98. **`rowsAffected` on an UPDATE means "rows matched" on all three** (mysql2 sets `CLIENT_FOUND_ROWS`), which is
    what makes `UPDATE jobs SET status = 'running' ... WHERE id = ? AND status = 'queued'` a portable claim.
99. **Timestamps need driver set-up, not just column types.** `pg` formats a bound `Date` in local time and
    parses `timestamptz` into a `Date`; `mysql2` reads `DATETIME` in the process time zone unless `timezone: 'Z'`.
    The clients bind ISO text (pg), set `timezone: 'Z'` (mysql) and return every timestamp as an ISO-8601 UTC
    string, proved under `TZ=Pacific/Auckland` in `repositories.contract.test.ts`.
100. **Database tests make their own database.** `openTestDb` runs `CREATE DATABASE t_<random>` next to
    `TEST_*_URL`'s database and drops it on close, so test files run in parallel without sharing tables. It
    needs a user that may create databases: the dev containers grant it, a shared server should not.

101. **Inside `db.transaction`, never read through the client.** SQLite has one connection and a transaction
    holds it, so `db.query` from inside the callback waits for itself and the request hangs. Everything a
    service reads while it was handed a `tx` takes the `tx` too (`settings.workspaceName(tx)`). Check: the
    outbox tests send mail from inside a transaction.
102. **A job exists if and only if its transaction committed.** `jobs.enqueue(tx, …)` and `Outbox.sendEmail(tx, …)`
    write in the caller's transaction; the in-process wake-up waits a beat so it runs after the commit. Never
    enqueue from outside the transaction that made the work necessary, and never send mail from a request.
    Check: `outbox.test.ts` (rollback leaves no row and no job).
103. **Job handlers are at-least-once: make them repeatable.** A lease that expires, a crash after sending, or an
    admin's Retry all run a handler twice. The mail job skips a row that is no longer `queued`. A
    `dedupeKey` blocks a repeat only until `prune_jobs` deletes the finished job (14 days); scheduler keys carry
    their time bucket, so they never collide with an old one.
104. **`PermanentJobError` for what retrying cannot fix** (a 4xx from the mail provider, a missing row), anything
    else for what it can. A permanent failure ends as `failed`, an exhausted one as `dead`; only those two
    can be retried by hand.
105. **Email HTML needs literal colours, and they still come from the roles.** Mail clients ignore stylesheets and
    CSS variables, so `mail-templates.ts` writes inline styles, but it reads the values from the
    `enterprise-light` roles of `@apps/colors` when a message is rendered (and throws if a role is not a plain
    hex). No hex in the source, so `check:colours` needs no exclusion. The server therefore imports
    `@apps/colors`, and the Dockerfile copies `packages/colors/src` into the runtime image.
106. **Every interpolated value in an email is escaped; a link is only used if it is http(s).** An email
    renders on the recipient's machine, so a name like `<script>` or a `javascript:` link must be inert.
    Check: `mail-templates.test.ts` renders hostile values in every template.
107. **Maintenance mode exempts exactly `/api/auth/*`, `/api/settings` and `/api/health`.** A route a signed-out
    visitor needs (accept an invite, reset a password) belongs under `/api/auth/` or maintenance mode locks
    people out of it. Check: `platform.test.ts`.
108. **A test that drives the job queue awaits `idle()`, not `tick()`.** `tick()` resolves when the due jobs are
    *started*; their handlers may still be running. The housekeeping jobs are scheduled on the first tick, so
    a test about one other job deletes them first or counts only its own kind.
109. **Production must choose a mail transport.** A silent default of `log` would record every invitation and
    password reset and deliver none. `MAIL_TRANSPORT` is required in production (`resend`, or `log` as a
    deliberate acknowledgement), and `APP_BASE_URL` (https) too. Check: `env-hardening.test.ts`.
110. **A page that shows a server's refusal needs the server to name the setting in its message.** The wire
    envelope carries a code and a message, not a field, so the settings page maps `invalid_setting` to a field
    by the setting's name in the message. Keep the names in `services/settings.ts` messages.
111. **Publish to browsers after the commit, never inside the transaction.** A notification pushed from inside a
    transaction announces a row a later failure rolls back. `afterCommit(tx, hook)` (`infra/db/after-commit.ts`)
    queues the hook on the `tx` and runs it once the commit succeeded; `createServices` wraps the client so every
    service gets it without changing how it calls `db.transaction`. Check: `notifications.test.ts` ("tells the
    browser only AFTER the commit") and `after-commit.test.ts`.
112. **A server-sent event is a hint, not the data, and nothing is replayed.** After any gap the client refetches
    (`resync`). A feature that needs events delivered exactly once needs a table and a cursor, not the stream.
113. **An open stream outlives the login that opened it unless something closes it.** A revoked, expired or
    suspended session must end its streams: callers use `disconnectSession` / `disconnectUser`, and the hub
    re-asks `authenticate` every minute as a backstop. An `EventSource` cannot see a 401 (it reports only
    "error"), so the client reconnects with backoff and its next ordinary API call finds out.
114. **`EventSource` does not retry after an HTTP error, and a browser allows six connections per origin on
    HTTP/1.1.** The provider reconnects itself and closes a long-hidden tab's stream. Not solved: a user with more
    than five tabs open on HTTP/1.1 can starve ordinary requests; serve HTTP/2 in production, or elect one tab to hold
    the stream (BroadcastChannel) if that matters.
115. **A sink that counts "pending sends" must let a healthy one settle.** The hub cuts a stream with 256
    unsettled sends; a synchronous burst of events to one user counts as unsettled until the next microtask. Publish
    in a loop with an `await` between, or raise `maxPending`.
116. **Fan-out inside a request is one transaction and one loop.** `broadcast` writes a row per recipient (4
    queries each). Fine for a team; at thousands of recipients make it a job that fans out in batches.
117. **Keyset pagination needs a total order.** `(created_at DESC, id DESC)` with `id` a time-ordered UUIDv7; the
    cursor carries both values and the query is `created_at < ? OR (created_at = ? AND id < ?)`. Proved on all
    three databases in `repositories.contract.test.ts`.
118. **jsdom has no `EventSource`.** `src/test/setup.ts` installs a stub that never connects, so the app mounts in
    page tests; tests that need events pass `FakeEventSource` (`src/test/fakeEventSource.ts`) to `RealtimeProvider`.
119. **`Route.method` and `apiPut` gained `PUT`** (preferences are a replace of named kinds). `PUT` was already in the
    router's state-changing set, so the Origin check covers it.
120. **The document title's unread prefix reads a store with no UI imports.** `Page` (core/ui) shows "(3) Title";
    the provider that fills the count imports `core/ui` for its toast, so a shared file would be an import cycle.
    The store is `core/notifications/unread-store.ts`; `Page` imports that file, not the folder's index.
121. **The `notification` email template gets `{ name, title, body, link }`** (all strings; `link` is absolute, built
    from `APP_BASE_URL` as `<base>/#<path>`, or empty). PLATFORM owns the template; keep the keys in step.
122. **A raw upload must not use `for await (const c of req)` and then answer.** Leaving that loop early destroys
    the request, and with it the socket, so the 413 never arrives. `routes/body.ts rawBody()` iterates by hand,
    so leaving it early keeps the socket; the handler then calls `drainBody(req, cap)` to read what is left (up to
    a byte cap and a time cap) before answering, and the error carries `closeConnection`. Answering while the
    client is still sending lets the close reset the connection and lose the 413. This rule used to say rawBody
    calls `req.resume()` when it stops: that was a no-op, because the abandoned iterator leaves a `'readable'`
    listener and `resume()` does nothing while one is attached (measured 2026-10-19: 0 bytes in 3 s), so the
    413 was lost intermittently. Test it with `node:http` and a chunked body, not `fetch`.
123. **A secret in a URL path is a log line.** `GET /api/auth/invite/:token` puts the invitation token in the path,
    and the request log prints the path. Every logged path goes through `loggablePath`. Prefer the request body
    for a secret; a path secret needs this redaction and its test.
124. **A token is spent first, in the transaction, with a conditional UPDATE.** "Check it, do the work, mark it used"
    lets two requests both pass the check. `tokens.consume` is the first statement of the transaction of the
    action it unlocks; if the action throws, the spend rolls back with it.
125. **The password hash is made outside the transaction.** scrypt takes ~50 ms; holding a SQLite lock or a
    Postgres connection for it serialises every sign-in behind it. The service peeks at the token (read only),
    validates and hashes, and only then opens the transaction that spends the token.
126. **Enumeration needs a time floor, not just the same body.** The known-address path does a few writes the
    unknown path does not; `forgotMinMs` pads both to the same minimum. The mail itself is queued in the outbox,
    so the provider's latency is never in the request.
127. **`CHECK` constraints on the enum are the audit log's whitelist.** `audit_events.action` rejects an action
    that is not in `AUDIT_ACTIONS` (`migrations/001_baseline.ts`), so a new audited action is added there and in
    `AuditAction` (`shared/api.ts`) in the same change.
128. **The sidebar is not the list of routes.** The `account` group is a real signed-in route that is not in the
    sidebar; the shell's a11y gate expects `aria-current` only on sidebar links. Public pages
    (`PUBLIC_ROUTES`) sit outside `ROUTES`, so the gate, the palette and the sidebar never list them.

129. **An app-wide notice goes in the shell's `banner` slot, not inside `<main>`.** Rendered as the first child of the page, the maintenance banner sat flush against the page's eyebrow and heading. `AppShell banner={…}` puts it full width under the top bar, outside the page's padding.
130. **Headless Chrome says `HeadlessChrome/`, and `\bChrome\/` does not match it.** There is no word boundary inside "HeadlessChrome", so the parser fell through to the trailing `Safari/` token and the sessions list read "Safari on Linux". Both copies of `describeUserAgent` list `HeadlessChrome` with Chrome.
131. **An upload refused mid-stream reaches the browser as a 502 through the Vite proxy.** The API answers 413 at once when `Content-Length` is too big, but a chunked body over the limit is cut off while streaming, and the dev proxy reports the dropped socket as 502. The client checks the size before uploading (`AvatarPicker maxBytes`), so only a hand-made request sees it; production (no proxy) gets the 413.
132. **Glass dark needs its own rim strengths, not the light skin's.** The lens highlight at 82% white, the inner diffuse haze, the side shading and a rim that thins the fill to 20% all read as a neon glow around every panel on a dark page. Dark mode paints `lens-light` at 30%, keeps the diffuse haze and shade low (`optics.ts`) and leaves the fill at 90% across the rim, so edges stay crisp.
133. **Glass light glows too at upstream strength.** Full-white `lens-light`, the full diffuse haze, a 48% side shade and a fill thinned to 20% at the rim make a white halo and a grey bevel round every light panel. Light mode paints `lens-light` at 70%, keeps the haze at 35% and the shade at 32% (`optics.ts`), and `LiquidGlass` defaults `rimFill` to 0.65, so the edge is a crisp line, not a glow.
134. **App chrome is frosted, not lensed.** A lens rim (highlight, side shade, thinned fill) round the full-height sidebar and full-width top bar reads as a grey bevel and a halo along the screen edges, in both modes. `AppShell` draws them as plain `glass-blur` surfaces (translucent fill + backdrop blur + a hairline border); floating components (cards, tiles, menus, dialogs) keep `LiquidGlass`.
135. **The generation reveal plays when data arrives, not on every render, and the axe scans skip it.** `useGenerate` plays only when `ready` turns true after being false during the mount, so cached data and re-renders never replay it; React's dev double mount re-arms it. It hides the element for about 2.6s, which an axe pass would measure mid-fade, so both browser scans dispatch `ui:generate-skip` before measuring. A large SVG is drawn as one box; charts pass `traceSvg` so their marks are drawn, not just the card's outline. The `ascii` render draws on a canvas with role colours read from `--gen-ascii-*` when it starts. It never computes a colour of its own (the frost's prism is a canvas gradient between two roles). Without a 2D canvas it shows the element at once.
136. **Sea glass shares the page's one WebGL context, falls back on lag, and is measured where it is drawn.** A `SeaGlassStage` claims the same guard as `AnimatedBackground` (`effects/webglGuard.ts`) and goes ahead of it while on screen, so the glass skin's backdrop waits on its static gradient; a second stage waits on flat fills. The lag fallback George asked for (Oct 2026) is `seaglass/perf.ts`: five seconds of frame timings after a 1.5 s warm-up decide live, still (stop the loop, keep one frame) or flat (release the GPU), a rolling window keeps watching, and a fallback is remembered for a day. Each start makes a fresh canvas, because a released context cannot be reused. The shader's colours are the `seaglass-*` roles read at runtime (rule 31: a role that cannot be read means flat, not a guessed colour). The gate measures `fg` and `fg-muted` on each tint over the paper, but the rendered pixels are lighter or darker than the role where frost and caustics fall, so contrast was also sampled round every text box in Chromium screenshots: dark clear glass and dark frost were lowered until "Forgot password?" on the dark sign-in card measured 4.64. Dark mode has its own lighting (`uNight`): deep tints on dark paper read as dull clay, so at night the body stays deep and the colour lives in the light (a rim in the glass's hue, light pooling on the paper, a moonlight sheen), all kept to the steep outer slope so it never sits behind text.
137. **Motion names its properties and eases out, layouts use dvh, and copy says the specific thing.** Taken from Leonxlnx/taste-skill's lint (Oct 2026), keeping only what agrees with the kit: no `transition: all`, no `ease-in` on UI motion, nothing enters from `scale(0)` (0.95–0.98 with opacity 0 instead), no `100vh`/`h-screen` (they jump when a phone's toolbar moves: `dvh`/`svh`), no stock marketing phrases and no "Learn more"/"Get started"/"Submit" labels. The audit found the shell, its sidebar, the dialog and the app root on `100vh`; all are `dvh` now. A check mark or radio dot growing from its centre is fine and says so with `craft-ok:`. `scripts/check-craft.mjs` (mirrored in base-app) enforces it. taste-skill's other bans (indigo, monospace, glass, shadows, gradients) contradict this design system and are not adopted; its art direction lives in the `taste-landing` skill, for public landing pages only.
138. **The assistant acts through the same actions as the pages, and a visual's numbers come from the database.** One `defineAction` per thing the app can do (`server/services/actions/`): pages call it over `POST /api/actions/:name`, the assistant calls it as a tool, and both pass the same role and input checks, so the assistant can never do more than its user. An action the caller may not run is a 404 like an unknown one, and is never offered as a tool. A chart, KPI tile or table the assistant draws takes a `DataQuery`, not numbers: the server reads them, the model is told what was shown, and a pinned view redraws from the data each time. A write the assistant must ask about has `confirm`; the run stops, the waiting call is stored on the conversation, and only the person's decision runs it (a page calling the action directly needs no approval: the person clicked). No agent framework: Builder.io's agent-native, which this follows, is a Nitro/Postgres stack whose install takes `@latest`, against rule 1's pins.
139. **Glass is fast because blur is rationed, not because the look was cut.** The glass skin was laggy on phones for six measured reasons (Oct 2026, Chromium on a 390x844 DPR-3 profile, 4x CPU): the aurora background redrew a full-screen canvas 60 times a second under every translucent surface, so every backdrop filter re-ran every frame while nothing moved (glass idle GPU was 46x enterprise); SVG refraction sat on every card and on the table scroller; the maps for it were made pixel by pixel on the main thread (3.5 s of blocking at load, a 1.9 s INP on a theme switch); dozens of badges, checkboxes and buttons each had their own blur; a sheet stacked two full-screen blurs; and the generate reveal built a canvas per card. The fix is the rules in §5, behind one signal (`effects/lowPower.ts`): the fills are 0.65 to 0.72 opaque over a smooth wash, so removing the blur from content looks the same at phone size, and the top bar, tab bar, sheet and menus keep the real frost, which is where text actually passes underneath. Do not add a `backdrop-filter` to a card to make it "more glass"; add it to chrome, or turn `lens` on for the one hero card.
140. **First-load JavaScript has a budget, and what only some visitors or pages need is its own file.** `npm run check:budget` (part of `verify`) builds the client and adds up the gzip size of every script on `index.html`'s static import graph (the sign-in page: all a signed-out visitor fetches) and, for Home, of that plus the signed-in app (`src/app/SignedIn.tsx`) and the Home route's chunks (`scripts/check-budget.ts`, `BUDGETS`). Measured Oct 2026: sign-in 284.8 kB at first, 184.8 kB after the Ask panel went lazy, **132.3 kB** now (react 67 kB, the app 44, class-name helpers 9, a little glass); Home 289 kB at first, **202.9 kB** now (that plus the signed-in app 55 and Home's own 4). What holds it down: (a) the signed-in app (the Shell, its menus, the radix and floating-ui libraries behind them, the realtime and notification providers) is `src/app/SignedIn.tsx`, loaded by `SignedInGate.tsx`; a signed-out visitor never fetches it, and for someone signed in `loadInitialRoute` (server and browser) loads it before React renders, so the first render draws the shell in place and hydration matches (when it is not loaded yet, a person has just signed in and sees the loading screen while it arrives); (b) Home's figures (KPI tiles, charts, activity feed) are `pages/home/HomeSections.tsx` behind `React.lazy` and one Suspense boundary per panel: the page's `ready` export has the server and the browser wait for that file before the first render (see §15, `lazyResolved`), so the panels are in the server's HTML and in the first client render, and the chart library is out of Home's static graph (it is still fetched, in parallel with the shell, before hydration; the budget counts only the static graph); (c) the Ask panel is `React.lazy` in the Shell, fetched on hover or focus of the Ask button and mounted once opened; (d) the Shell imports `~/core/agent/ask`, not the `~/core/agent` barrel, whose thread pulls every chart in; (e) `vite.config.ts` gives `react`, `cn` and `charts` their own chunks with `includeDependenciesRecursively: false`, and gives radix no group of its own, so it rides with the file that imports it instead of being downloaded by the sign-in page as one 50 kB lump; (f) modules under `packages/ui/src` and `src/core/ui` are marked side-effect-free for tree-shaking, so a barrel re-export nobody uses does not keep its module (and the chart library behind it) in the entry. A new page-only heavy dependency goes behind a lazy route or `React.lazy`; a new static import in `app/App.tsx`, `core/` or the sign-in page of something only the signed-in app or a page uses fails the budget. Raise a budget only with the reason in the commit. Static files are served pre-compressed (`.br`/`.gz`, written by `vite build`), JSON over 1 kB and the server-rendered page are compressed per response; the event stream never is (`server/infra/http/README.md`).
141. **The kit's effects are its own, so the kit can be published.** The React Bits ports (the Aurora and Iridescence backdrops, CountUp, SpotlightCard, GlareHover, and five unused text and micro-interaction pieces) were MIT plus the Commons Clause, which forbids redistributing the components "as a ported version": the kit could never leave this repo while they were in it. Nov 2026: the five unused ones were deleted and the four in use were replaced by originals written from a description of the behaviour, not from the ports: `RollingNumber` (an odometer: a reel per digit, settling left to right), `PointerLight` (glow, rim and one sheen, a fine pointer only) and the `tide` and `hive` shaders on bare WebGL (`backgrounds/gl.ts`; `ogl` is no longer a dependency). Saved choices of `'aurora'` / `'iridescence'` read as `'tide'` / `'hive'` (`upgradeBackdrop`), so no reader loses their cookie. A port with a licence that limits redistribution does not go into `@apps/ui` again; one that must is kept out of the published kit.
142. **The generation reveal is the kit's own too.** The reveal engine (`effects/generate/reveal.ts` and the Generate block of `effects.css`) was a port of transitions.dev's UI generation, whose licence allows it inside a product but not in a published kit or template without a paid plan. Nov 2026: it was rewritten from the kit's own contract (its tests, `useGenerate`, `ascii.ts`) and from watching it run, not from upstream's code. The `ascii` looks (`plot`, `frost`) were always the kit's and are unchanged; the dotted `dots` look became `draft`, a drafting table (construction lines, a pen walking every box, dimension lines, text bars, a chart's marks, then a soft develop from the centre), and `skeleton-texts` shows a spec sheet of what was measured and a step line. The contract held: one rAF loop and at most one overlay built a frame, the element hidden and inert until shown with every inline style it touches put back, a plain fade under reduced motion or `power="low"`, `ui:generate-skip`.

## 15. Server rendering

Pages are rendered on the server and streamed; the browser hydrates them. The pieces:

| Piece | Where |
|---|---|
| The request: session, settings, the route's data, status, theme, headers | `server/infra/http/ssr.ts` |
| Asking the API in process (the same router, no HTTP) | `server/infra/http/internal.ts` |
| Where the render code comes from: `dist/server` or Vite inside the process | `server/infra/http/ssr-source.ts` |
| The app's side: route table, providers, `renderToPipeableStream` | `src/entry-server.tsx`, `src/app/Providers.tsx` |
| The browser's side: `hydrateRoot` after the first screen's file has loaded | `src/main.tsx` |

**The flow of a page request.** The server reads the session cookie once. Through the API's own router (`dispatch`, as that
person, so every role check and the maintenance gate apply) it asks `/auth/me`, then for a signed-in person `/settings` and
the GET calls the route's `prefetch` names. It picks the status (404 unknown, 403 admin page for a non-admin, 503 maintenance
for a non-admin, a 302 for a short address like `/admin`; a signed-out visitor always gets the sign-in page, 200), writes the
built `index.html` with `<html>` carrying the theme, an embedded `<script type="application/json" id="__INITIAL_DATA__">`, and
the app's markup streamed after the shell is ready. The HTML is per person: `Cache-Control: private, no-store`, `Vary: Cookie, Accept-Encoding`. It is compressed on the way out (Brotli, else gzip, as the request's `Accept-Encoding` allows) through a stream that flushes after every chunk, so a streamed section still reaches the browser as React writes it.
The browser embeds nothing it could not have asked the API for itself: the answers are the API's own, for the same cookie.

**Rules for a component that renders on a server (and so hydrates).**

1. **Render is pure and the same in both places.** The first client render must produce the server's markup. No `window`,
   `document`, `localStorage`, `sessionStorage`, `matchMedia`, `navigator`, `Date.now()`/`new Date()` or `Math.random()` while rendering.
   Read them in an effect, an event handler, or `useSyncExternalStore` with a server snapshot.
2. **Something only the browser knows** (stored preference, time zone, a media query, the fragment) is drawn in two steps: the
   server's value first, the browser's after mount. `useHydrated()` (`core/hooks`) is false until hydration is done;
   `useMediaQuery`, `useLocalStorage` and the kit's hooks already do this. Prefer a value the server also knows: the theme comes
   from the `ui-theme` cookie, the address from the request (`<LocationProvider>`), the time from the instant embedded in the page.
3. **Time and time zones.** Format a date the server draws in a fixed zone, or with the instant the server embedded; switch to the
   reader's own zone after `useHydrated()`.
4. **The fragment never reaches a server.** One-time tokens live there (`/reset-password#token=…`); a page that needs one renders a
   loading state and reads it in `useHashSecret()`, which also removes it from the address.
5. **The theme is a cookie.** `ui-theme=<mode>.<skin>.<backdrop>.<resolved>` (kit `theme/themeCookie.ts`), written by `useTheme` and
   `setBackdrop`, mirrored in localStorage for older clients. Every field is checked against a closed list on the server.
   `index.html`'s inline script settles `system` mode from the device before first paint.
6. **Never embed what the API would not say.** Initial data is only ever an API answer to this request's own cookie, escaped by
   `embedJson` (`<`, `>`, `&`, U+2028, U+2029 as `\u` escapes). CSP needs no change: a JSON block is not executed. The page is
   never cacheable.
7. **Browser-only code stays out of `src/app/Providers.tsx`'s tree at import time too**: a module that touches `window` when it is
   imported breaks the server bundle. Put it behind a function called from an effect.
8. **A lazy part of the first screen is drawn in place, not behind a fallback.** `React.lazy` suspends on its first render even
   when its file is cached, so the server would send a skeleton and swap the real markup in behind it, and a hydrating browser
   would have a boundary to wait on. Use `lazyResolved` (`core/lazy`) for a page or a section of one: `load()` fetches the file,
   and a component that mounts after that draws it synchronously. The server (`entry-server.tsx`) and the browser (`main.tsx`,
   before `hydrateRoot`) both call `loadInitialRoute`, which loads the page (`screens.tsx`), the signed-in app and the page's
   `ready` export (a page with lazy parts of its own exports `ready = () => Promise.all(parts.map((p) => p.load()))`). Later
   client navigations still take the lazy path behind their Suspense skeleton. `entry-server.tsx` also sets
   `progressiveChunkSize` high: otherwise React moves any finished boundary over 12.8 kB out of line (a hidden `<div id="S:n">`
   and a `$RC` swap script) even though it was complete, and a whole page is that big. `server/ssr.test.ts` fails if a signed-in
   `/`, `/table` or `/assistant` comes with a pending boundary, a hidden section or a swap script.

**Giving a page its first data (`prefetch`).** In the page's folder, build the API path in a function with no components in it
(see `pages/table/query.ts`), take the paths from `apiPaths` (`core/api/endpoints.ts`) so the page and the server cannot disagree,
and name them on the route:

```ts
// src/app/routes.ts
{ id: 'table', path: '/table', …, prefetch: (url) => tablePrefetch(url) }   // url: the request's URL

// the page
const q = useApiQuery(
  () => api.transactionsPage(params),
  JSON.stringify(params),
  fromServer(apiPaths.transactionsPage(params), (page) => page),   // first render = the server's copy
);
```

The first render is `success` from the embedded copy and no request is made for it; `reload()`, another key, or a later visit
fetches as usual (the copy is dropped at the first navigation). A page that declares no `prefetch` renders its loading state on the
server and fetches in the browser; that is correct, just slower to first data. `prefetch` must be cheap and must not import the page.

**Tests.** `server/ssr.test.ts` renders every route as a signed-out visitor, a viewer and an admin (status, one `<h1>`, theme,
embedded data, escaping, headers). `src/app/hydration.test.tsx` takes the server's real HTML (made without a `window` by
`scripts/ssr-pages.mjs`), hydrates it in jsdom and fails on any mismatch React reports. A new page needs no new test unless it is
a new kind of thing, but a new route appears in both through the route table.
