# server/routes

The route table (`index.ts`) and its handlers. Each entry: method, path, auth level
(`public` | `user` | `admin`, enforced by the router), handler.

- A handler parses the request, calls a service, writes the response. No SQL, no business rules.
- `errors.ts` maps a service's `ServiceError` to an HTTP status; anything else becomes a 500
  with an `errorId`.
- `auth.ts`: sign-in, sign-out and `me`, and the session cookie (httpOnly, SameSite=Strict,
  Secure in production). `llm.ts`: the LLM endpoints' body rules and per-user quota (`/api/llm/complete`, and `/api/llm/stream`, the
  same call answered as server-sent events: `delta`, then `done` or `error`; the quota slot is held until the stream ends).
- `actions.ts`: `GET /api/actions` (what the caller may run), `POST /api/actions/:name` `{ input }` (runs it:
  the registry checks role and input) and `GET /api/views` (saved views, drawn live). `agent.ts`: `POST
  /api/agent/stream` (one assistant run as server-sent events: `conversation`, then `delta` / `tool` /
  `approval`, then `done` or `error`; anything refusable is JSON before the first event; it shares the LLM
  quota) and `GET`/`PATCH`/`DELETE /api/agent/conversations[/:id]` (the caller's saved chats).
- `events.ts`: `GET /api/events`, the event stream (holds the handler open until the client leaves). `notifications.ts`:
  the caller's inbox (`GET /api/notifications`, `/unread-count`, `POST /:id/read`, `/read-all`), the preferences
  (`GET`/`PUT /api/notifications/preferences`) and the admin `POST /api/admin/notifications/{test,broadcast}`.
  None takes a user id; another user's notification id is a 404.
- `auth-flows.ts` (public): `GET /api/auth/invite/:token`, `POST /api/auth/accept-invite`, `POST
  /api/auth/forgot-password` (always 202), `POST /api/auth/reset-password`. `account.ts` (signed in, about
  the caller only): `GET`/`PATCH /api/account`, `POST /api/account/password`, `GET`/`DELETE
  /api/account/sessions[/:id]`, `POST /api/account/sessions/revoke-others`, `PUT`/`DELETE
  /api/account/avatar`. `files.ts`: `GET /api/files/:id` (stream, `nosniff`, ETag/304). `body.ts`: JSON
  object fields, `rawBody` for an upload (leaving it early does not destroy the socket), and `drainBody`,
  which reads what is left after a refusal so the 413 reaches the client instead of a reset.
- User management is admin-only: `PATCH /api/users/:id` (role and/or status) and
  `POST /api/users/:id/resend-invite`. The rules (no self-demotion or self-suspension, never
  the last admin) and the audit events live in `services/data.ts`; the handlers only parse.
- `platform.ts`: `GET`/`PUT /api/settings`, the admin Mail page (`GET /api/admin/emails`, `/:id`) and the admin
  Jobs page (`GET /api/admin/jobs`, `POST /api/admin/jobs/:id/retry`). `maintenance.ts`: the maintenance gate
  (503 `maintenance` for non-admins; `/api/auth/*`, `/api/settings` and `/api/health` stay reachable, so a new
  route for a signed-out visitor belongs under `/api/auth/`).
- **May import:** `services/`, `infra/http`, `shared/`. **Never:** repositories, `infra/db`,
  `infra/llm`, fixtures (oxlint enforces it).
- Adding a route: a handler, one line in the table, its types in `shared/api.ts`, a method in
  `src/core/api`.
