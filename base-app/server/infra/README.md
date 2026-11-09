# server/infra

Leaf adapters the server uses: `db/` (database drivers), `llm/` (LLM HTTP clients) and `http/` (the API routes).

- **Direction:** `main → infra/http → infra/{db,llm}`. Nothing in `infra/` reads `process.env` or imports `config/`; values are passed in from `main.ts`.
- **`db/`:** one `DbClient` interface with SQLite (built-in `node:sqlite`), Postgres (`pg`) and MySQL (`mysql2`). The last two load lazily. See `db/README.md`.
- **`llm/`:** raw-`fetch` clients for Anthropic and Gemini.
- **`mail/`:** the `log` (development) and `resend` mail transports. See `mail/README.md`.
- **`storage/`:** `FileStorage` (put/get/delete) with a local-disk implementation under `UPLOADS_DIR`; keys are random, so no path can be built from input. See `storage/README.md`.
- **`http/`:** the `/api/*` router, JSON helpers and route handlers.
- **Imports:** only Node built-ins, the lazily loaded driver packages, `shared/` types and the pure `lib/` (the SSE parser).
- **Imported by:** `server/main.ts` only.
