# server/services

The business rules, independent of HTTP: `auth.ts` (sign-in, sessions, rate limits, audit),
`data.ts` (the read models, and the user writes: invite, change role or status, resend an
invite, each audited), `kpi-range.ts` (the KPIs over a 7/30/90-day range, compared with the
range before: revenue from the daily history, the other three from their weekly trend),
`llm.ts` (provider choice, tools passed through), `seed.ts`
(demo data into empty tables, the admin account), `passwords.ts` (scrypt), `notifications.ts` (the `Notifier` every service tells people through: preferences per kind,
the inbox row, the email through the Outbox, and the push queued with `afterCommit`; plus the inbox reads, keyset
paging, the preferences and the admin test and broadcast), `events.ts` (the in-process `RealtimeHub`, the
`EventBus` seam for more than one process, and the service that attaches `GET /api/events` streams).

- **`actions/`:** everything the app can do, defined once with `defineAction` (`define.ts`): a name,
  a JSON-Schema input (`server/lib/schema.ts`, which also types `run`), an `effect` (read, visual,
  write), the least `role`, and `confirm`/`destructive` for writes the assistant must ask about.
  Pages run one with `POST /api/actions/:name`; the assistant gets the same list as tools. The
  registry checks the role (an action the caller may not run is a 404, like an unknown one) and the
  input on every call. `catalog.ts` is the list, `queries.ts` the `DataQuery` a visual reads its
  numbers from (transactions, revenue or signups, aggregated by `lib/aggregate.ts`), `visuals.ts`
  the show_chart / show_kpis / show_table / show_diagram renderers. Adding an action: one
  `defineAction` in `catalog.ts` and a test; it is offered to pages and the assistant at once.
- **`agent.ts`:** the assistant loop (read its header comment). One run saves the message, calls the
  model with the caller's actions as tools, runs each call as the caller, stops at a `confirm`
  action (the waiting call lives in `agent_conversations.pending` until the person decides), and
  goes round again, up to `MAX_STEPS` model calls. Every message is saved; `toDisplay` turns the
  stored blocks into what the page shows. A run that produced nothing takes its message back out.
- **`views.ts`:** saved views (`saved_views`): save checks and draws the spec once, list redraws each
  live, at most 50 per person; a change publishes a `views` event.
- **`jobs.ts`:** the durable job queue and its scheduler (read its header comment). `enqueue(tx, …)` in the
  caller's transaction; `register(defineJob({ kind, parse, run }))`; `tick()` / `idle()` for tests;
  `start()` / `stop(graceMs)` for `main.ts`. Failures: throw to retry with backoff, `PermanentJobError` to stop.
- **`outbox.ts`:** `Outbox.sendEmail(tx, { to, template, data })`, the only way to send mail. Registers the
  `send_email` job. **`mail-templates.ts`:** the four emails (pure; values escaped; colours read from `@apps/colors`).
- **`settings.ts`:** the typed settings registry, `GET`/`PUT /api/settings`, the maintenance flag (cached 2 s).
  `Publish` is the injected `(target | '*', event, data)` for realtime events.
- **`housekeeping.ts`:** the scheduled sweeps and retention (sessions, tokens, read notifications 90 d,
  finished jobs 14 d, emails 30 d). `prune_jobs` is also the retention of job dedupe keys.
- **Inside a transaction, pass the `tx`.** SQLite has one connection and a transaction holds it, so a read
  through the client from inside `db.transaction` waits for itself forever. Anything a service reads while
  it is called with a `tx` (the outbox reads the workspace name) takes the `tx` too.
- A service that must tell someone calls `notifier.notify(tx, …)` inside its own transaction; never `realtime.publish`
  in a transaction (use `afterCommit(tx, hook)` for any in-process side effect that must wait for the commit).
- A service that ends a session calls `realtime.disconnectSession(sessionId)` / `disconnectUser(userId)` after the commit.
The account and sign-in flows (ENGINEERING §7 "Tokens, passwords and uploads"):
- `tokens.ts`: the single-use tokens behind emailed links. 32 random bytes, only the SHA-256 stored,
  invite 7 days / reset 1 hour, a new token voids the older unused ones of its purpose, and `consume`
  is one conditional UPDATE inside the transaction of the action it unlocks (two concurrent uses: one
  wins). A bad token is always `invalid_token`, "This link is invalid or has expired."
- `password-policy.ts` (+ `common-passwords.txt`): the one password policy, applied wherever a password
  is set: 10 to 256 characters, not a common password (also with a tail of digits or symbols), not one
  repeated character, not containing the email or its local part (3+ characters).
- `credentials.ts`: accept an invitation, forgot password, reset password. Forgot-password answers the
  same for any address, after a minimum time, and is rate limited per email and per address. An invited
  or suspended account who asks for a reset is sent nothing (an admin re-sends the invitation).
- `account.ts`: the caller's profile, password change (current password required, other sessions ended),
  sessions list and revocation. Always about the caller; a session id from the URL is matched against
  their own sessions.
- `files.ts`: avatar upload and file access. A hard 2 MB limit enforced while streaming, a SHA-256 on the
  way, and a magic-byte sniff that must agree with the declared type. An avatar is readable by any
  signed-in user, an attachment only by its owner; anyone else gets the same 404 as a missing file.
- `rate-limit.ts`: an in-memory sliding window used by the above.
- `platform-deps.ts`: the `Outbox`, `Notifier` and `StreamDisconnector` shapes these services consume
  (structural copies of the owners' interfaces) and their no-op defaults.

- A failure the caller should see is a `ServiceError` (kind + code + message); routes map it.
- Writes that must happen together use `db.transaction` and the repositories over `tx`.
- **May import:** `repositories/`, `infra/db` types, `infra/llm`, `lib/`, `shared/`, and
  `fixtures/` (seed only). **Never:** `routes/`, `infra/http`.
