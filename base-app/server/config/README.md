# server/config

Reads the server's environment once, in `main.ts`, and hands the result down.

- **`env.ts`:** `readServerEnv(source = process.env)` returns a `ServerEnv`. `describeEnv(env)` returns a log-safe map: keys show `set` or `missing`, and `DATABASE_URL` shows the URL with its password replaced by `***`.
- **Mail and links:** `MAIL_TRANSPORT` (`log` | `resend`; production must set it), `RESEND_API_KEY`, `MAIL_FROM`,
  `APP_BASE_URL` (required in production, https). **Jobs:** `JOBS_POLL_MS`, `JOBS_CONCURRENCY`,
  `JOBS_SHUTDOWN_GRACE_MS`. The Resend key is described as `set`/`missing` and never printed.
- **Account flows:** `APP_BASE_URL` (the origin of emailed links; a dev default, required in production, an http(s) origin with no path) and `UPLOADS_DIR` (the local-disk file store, default `./data/uploads`).
- **Errors:** `EnvError` names the variable, never its value.
- **Defaults:** the values in `apps/base-app/.env.example`. Empty strings count as unset.
- **Imports:** only the `LlmProvider` type from `infra/llm/types.ts`.
- **Imported by:** `server/main.ts` and its test (`env.test.ts`). Nothing in `infra/` may import this folder; the HTTP and LLM layers take plain structural types instead.
