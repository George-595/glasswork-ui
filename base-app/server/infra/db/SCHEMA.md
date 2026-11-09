# The schema

One baseline migration, [`migrations/001_baseline.ts`](migrations/001_baseline.ts), creates every
table below on SQLite, Postgres and MySQL. This file says what each table is for and which
rules the database itself enforces. The design rules are in
[`../../../../ENGINEERING.md`](../../../../ENGINEERING.md) §7 "Database design"; the live schema is
held to them by `schema-conventions.test.ts`.

## How the tables relate

Each arrow points from the table that holds the foreign key to the table it references. The
label is the `ON DELETE` rule: owned rows are deleted with their user (CASCADE); history and
files survive their user, unowned (SET NULL).

```
+----------------------------- [ ER OVERVIEW ] -----------------------------+
|                                                                           |
| REFERENCES (arrow = foreign key, label = ON DELETE)                       |
|                                                                           |
| sessions                    ─ CASCADE ──▶ users                           |
| auth_tokens                 ─ CASCADE ──▶ users                           |
| notifications               ─ CASCADE ──▶ users                           |
| notification_preferences    ─ CASCADE ──▶ users                           |
| audit_events (actor)        ─ SET NULL ─▶ users                           |
| app_settings (updated by)   ─ SET NULL ─▶ users                           |
| files (owner)               ─ SET NULL ─▶ users                           |
| users (avatar)              ─ SET NULL ─▶ files                           |
|                                                                           |
| NO FOREIGN KEYS                                                           |
|                                                                           |
| jobs   outbound_emails   schema_migrations                                |
| transactions   activity   revenue_daily   kpis   signups_monthly          |
|                                                                           |
+---------------------------------------------------------------------------+
```

`users` and `files` point at each other (`users.avatar_file_id`, `files.owner_user_id`), a
cycle. Postgres and MySQL create `users`, then `files`, then add the avatar foreign key with
`ALTER TABLE`. SQLite cannot add a constraint to an existing table, but it resolves a
`REFERENCES` target lazily, so there the same named constraint is declared inline in
`CREATE TABLE users`. Same name, same `ON DELETE SET NULL` on all three.

## Tables

Types are written as the logical type: `id` is a UUIDv7 string (`VARCHAR(36)`), `ts` is the
native timestamp (`TIMESTAMPTZ(3)` / `DATETIME(3)` / `TEXT`), `money` is `BIGINT` minor units
(pence), `json` is `TEXT` holding JSON. "null" lists the nullable columns; every other
column is `NOT NULL`.

### Identity

| Table | Purpose | Key constraints |
|---|---|---|
| `users` | Everyone who can sign in or has been invited. | `pk_users (id)`, `uq_users_email`, `ck_users_role` (admin/editor/viewer), `ck_users_status` (invited/active/suspended), `ck_users_email_lower` (stored lower-case), `fk_users_avatar_file_id` SET NULL. null: `password_hash` (invited, no password yet), `avatar_file_id`, `last_active_at`. |
| `sessions` | One row per signed-in browser. Only the token's SHA-256 is stored. | `uq_sessions_token_hash` (CHAR 64), `fk_sessions_user_id` CASCADE, `ix_sessions_user_id`, `ix_sessions_expires_at`. Ends by `revoked_at` (sign-out, suspension) or `expires_at`. `last_seen_at` is written at most once a minute. null: `user_agent`, `ip`, `revoked_at`. |
| `auth_tokens` | Single-use invitation and password-reset tokens (SHA-256 only). | `uq_auth_tokens_token_hash`, `fk_auth_tokens_user_id` CASCADE, `ck_auth_tokens_purpose` (invite/password_reset), `ix_auth_tokens_user_id_purpose`. null: `used_at`. |
| `audit_events` | Append-only record of who did what. | `fk_audit_events_actor_user_id` SET NULL (history outlives the account; `actor_label` keeps the name), `ck_audit_events_action`, `ck_audit_events_outcome`, `ix_audit_events_occurred_at`. null: `actor_user_id`, `ip`, `detail`. |
| `files` | Metadata of an uploaded file; the bytes live in file storage under `storage_key`. | `uq_files_storage_key`, `fk_files_owner_user_id` SET NULL, `ck_files_purpose` (avatar/attachment), `ck_files_size_bytes` (>= 0), `ix_files_owner_user_id`. null: `owner_user_id`. |

### Platform

| Table | Purpose | Key constraints |
|---|---|---|
| `notifications` | In-app notifications, one row per user per event. | `fk_notifications_user_id` CASCADE, `ix_notifications_user_id_created_at` (the list), `ix_notifications_user_id_read_at` (the unread count). null: `body`, `link`, `read_at` (null = unread). |
| `notification_preferences` | Per user, per notification kind: in-app and/or email. | `pk_notification_preferences (user_id, kind)`, `fk_notification_preferences_user_id` CASCADE, `ck_..._in_app` and `ck_..._email` (0/1). |
| `jobs` | The background job queue. A worker claims a row with one atomic `UPDATE ... WHERE status = 'queued'`. | `ck_jobs_status` (queued/running/succeeded/failed/dead), `ck_jobs_attempts`, `uq_jobs_dedupe_key` (an enqueue with a key that exists is ignored), `ix_jobs_status_run_at` (the "what is due" query). null: `locked_at`, `locked_by`, `last_error`, `dedupe_key`. |
| `outbound_emails` | The mail outbox: written first, sent by a job, result recorded. | `ck_outbound_emails_status` (queued/sent/failed), `ix_outbound_emails_created_at`. null: `body_html`, `provider_message_id`, `error`, `sent_at`. |
| `app_settings` | Server-side settings, one JSON value per key. | `pk_app_settings (setting_key)`, `fk_app_settings_updated_by_user_id` SET NULL. The column is `setting_key`, not `key`: `KEY` is a reserved word in MySQL. |

### The assistant (migration 002)

| Table | Purpose | Key constraints |
|---|---|---|
| `agent_conversations` | A saved chat with the assistant. `pending` holds the tool call waiting for approval (JSON) until the person decides. | `fk_agent_conversations_user_id` CASCADE, `ix_agent_conversations_user_id_updated_at` (the list). null: `pending` (null = nothing waiting). |
| `agent_messages` | One message: the person's, or one model step. `content` is a JSON array of text, tool-call and tool-result blocks. | `fk_agent_messages_conversation_id` CASCADE, `ck_agent_messages_role` (user/assistant), `ix_agent_messages_conversation_id_created_at`. null: `model`, `input_tokens`, `output_tokens` (a person's message has none). |
| `saved_views` | A visual pinned to the Views page, stored as the show_* input that drew it, so it is redrawn from the data. | `fk_saved_views_user_id` CASCADE, `ck_saved_views_tool` (the four show_* tools), `ix_saved_views_user_id_created_at`. |

### Demo data

Append-only tables behind the dashboard, table and chart pages. They carry `occurred_at` (or the
`day`, or an `ord`) instead of `created_at`.

| Table | Purpose | Key constraints |
|---|---|---|
| `transactions` | The sample payments table. | `ck_transactions_category`, `ck_transactions_status`, `ck_transactions_currency` (GBP); `ix_transactions_occurred_at`, `ix_transactions_customer_occurred_at`, `ix_transactions_status_occurred_at`, `ix_transactions_category_occurred_at`. `amount_minor` is `BIGINT`. |
| `activity` | The recent-activity feed. | `ck_activity_kind`, `ix_activity_occurred_at`. |
| `revenue_daily` | Revenue and costs per calendar day (`day` is `CHAR(10)` `YYYY-MM-DD`, a date, not an instant). | `pk_revenue_daily (day)`, `ck_revenue_daily_amounts` (>= 0). |
| `kpis` | The dashboard figures; `trend` is a JSON array. | `ck_kpis_unit` (money/count/percent), `uq_kpis_ord`. |
| `signups_monthly` | Sign-ups per month, in `ord` order. | `pk_signups_monthly (ord)`, `ck_signups_monthly_signups`. |

### Bookkeeping

`schema_migrations (id, checksum, applied_at)`. Written by `migrate.ts`; the checksum is the
sha256 of the statements the migration ran, and a changed or missing applied migration stops
the boot.

## Conventions this schema follows

- **Names.** snake_case; plural table names; `id` primary keys; `<table_singular>_id` foreign
  keys (`user_id`, `owner_user_id` where the role matters); `_at` for every instant; no
  `is_`/`has_` booleans, a nullable `_at` says it and when (`read_at`, `used_at`, `revoked_at`).
- **Constraint names.** `pk_<table>`, `fk_<table>_<column>`, `uq_<table>_<columns>`,
  `ix_<table>_<columns>`, `ck_<table>_<rule>`, all at most 63 characters. MySQL ignores the
  name of a primary key (it is always `PRIMARY`); the conventions test knows.
- **Keys.** `id` is a UUIDv7 from `newId()` (`server/lib/ids.ts`): time-ordered, so inserts
  append to the index. Seed and demo rows keep short readable ids.
- **Timestamps.** Native types, bound as `Date`, read back as ISO-8601 UTC strings with
  milliseconds on every driver (`2026-10-12T08:30:00.123Z`). No default values: the clock is
  injected.
- **Integrity in the database.** `NOT NULL` unless null means something (the allowlist is in
  `schema-conventions.test.ts`); a `CHECK` on every enum-like column; a foreign key with an
  explicit `ON DELETE` wherever a row refers to another; emails stored lower-case with a check.
- **Indexes.** Every foreign key column leads an index; every list query has a supporting
  index (a composite ending in the sort column). Uniqueness is a named `UNIQUE INDEX`.
- **Why `VARCHAR(36)` for ids, not `CHAR(36)`.** Postgres pads `CHAR` with spaces on read, which
  would corrupt the short readable seed ids. A UUID is 36 characters either way.
- **Open vocabularies.** `notifications.kind`, `jobs.kind`, `outbound_emails.template` and
  `provider` are registered in code, not enumerated in the database, so adding one needs no
  migration.
