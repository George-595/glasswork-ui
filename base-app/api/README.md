# api/

The **Vercel function**: one file, `index.ts`, answers every `/api/*` request (`vercel.json` rewrites
`/api/(.*)` to it). It is the Vercel counterpart of `server/main.ts`: the same `node:http` server built
by `server/app.ts`, never bound to a port, with each invocation's `(req, res)` handed to it.

- **What lives here:** `index.ts` and nothing else. No route logic: routes, auth, cookies and logging are
  `server/`. This file only adapts a function to that server.
- **May import:** `server/` (`app.ts`, `config/env.ts`, `infra/db/migrate.ts` for `SchemaBehindError`,
  `infra/http/json.ts`, `infra/log/logger.ts`). Nothing from `src/` or `vendor/`.
- **Imported by:** nothing; Vercel loads it. `server/vercel-entry.test.ts` drives it over real HTTP, and
  imports its `shouldDrain` helper.
- **Never migrates or seeds.** The build did that once (`server/cli/migrate.ts --deploy`); boot only reads
  `schema_migrations`. A database behind this build answers 503 `updating` (`Retry-After: 30`).
- **After the response**, a successful write from a signed-in browser (or a public mail-sending auth call)
  drains the job queue under Vercel's `waitUntil`, so the platform keeps the instance alive for the email.
- **Also:** `/api/cron/jobs` (the daily cron, `Bearer $CRON_SECRET`) and a 503 for `/api/events` (no
  long-lived connections on a function).

Everything about running it is in [`../docs/DEPLOY.md`](../docs/DEPLOY.md).
