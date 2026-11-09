# server/

The Node API (`node:http`, TypeScript run directly by Node's type stripping). `main.ts` is the
only file that reads config and wires the layers:

```
routes/ → services/ → repositories/ → infra/db (DbClient: sqlite | postgres | mysql)
            └→ infra/llm (Anthropic, Gemini)
infra/http (server, router, cookies, static, sse)   infra/log (JSON lines)   config/ (env, once)
                                       └→ infra/mail (log, resend)
```

Each arrow is one-way and linted (`base-app/.oxlintrc.json`). Start-up: env → migrate → seed
(empty tables; development demo data and the dev admin) → services → routes → listen.

- **Background work** runs inside the server process: `main.ts` starts the job runner
  (`services/jobs.ts`) after `listen` and, on SIGTERM, stops it (a grace period for running jobs) before the
  database closes. Scheduled housekeeping, the mail outbox and the maintenance gate
  (`routes/maintenance.ts`, passed to the HTTP server as its `gate`) hang off it. See `services/README.md`.
- **Realtime and notifications:** `GET /api/events` (a server-sent stream) is served by `services/events.ts`'s
  `RealtimeHub` (`createServices(...).realtime`: `publish`, `publishToAdmins`, `broadcast`, `disconnectSession`,
  `disconnectUser`); `services/notifications.ts` is the `Notifier` and the inbox. A notification is published
  only after its transaction commits (`infra/db/after-commit.ts`, ENGINEERING §7 "Realtime, notifications and
  after-commit").
- Sign-in flows and the account (accept an invitation, forgot and reset password, change password,
  sessions, profile, avatar upload) are `services/{tokens,credentials,account,files,password-policy}.ts`
  over `routes/{auth-flows,account,files}.ts` and `infra/storage/`. They use the mail outbox, the
  notifier and the realtime hub only through the structural types in `services/platform-deps.ts`.
- `lib/ids.ts` is `newId()`, the UUIDv7 every server-created row gets as its primary key.
- `testing.ts` boots the whole stack on sqlite `:memory:` for `*.test.ts`; `app.test.ts` is
  the end-to-end suite, `hardening.test.ts` the network defences.
- Relative imports end in `.ts`. No enums, namespaces or parameter properties.
- **Pages** (`infra/http/ssr.ts`): a GET that is neither `/api` nor a file is server-rendered. `ssr.ts` reads the session, asks the API's own router in process
  (`internal.ts`: `/auth/me`, `/settings`, the route's `prefetch` paths), picks the status and sends the built `index.html` with the theme from the `ui-theme`
  cookie, the answers embedded as escaped JSON, and the app's markup streamed. The app's code comes from `ssr-source.ts`: `dist/server/entry-server.js` in
  production (`SSR_MODE=dist`), Vite running inside this process in development (`SSR_MODE=dev`, the default; listens on `WEB_PORT`), nothing with `SSR_MODE=off` (API only;
  Vercel). The server never imports `src/`: it loads `entry-server` by path. ENGINEERING §15.
- **Never imports:** `src/`, React, `@apps/ui`.
