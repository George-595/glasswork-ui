# server/infra/db/migrations

Versioned schema changes, applied in order by `../migrate.ts`: once during a deploy (`server/cli/migrate.ts --deploy`, the Vercel build), or at boot of the long-lived Docker/dev process, under a lock.
A Vercel function never applies them: it only checks (`verifySchema`). The schema they build is drawn
and explained in [`../SCHEMA.md`](../SCHEMA.md).

- `001_baseline.ts` is the whole starting schema (16 tables). The template had never shipped, so the earlier
  `001_core`/`002_auth` were replaced by it in one go. It is one file because it is one decision; a later
  feature adds its own file.
- One file per migration, `NNN_name.ts`, exporting `{ id, up(driver) => statements[] }`, plus one line in
  `index.ts`. `up` returns the statements for one driver; the file is the single source for all three.
- **Append-only, enforced.** `schema_migrations` holds `(id, checksum, applied_at)`; the checksum is the sha256
  of the driver's statements. On boot the migrator throws `MigrationError` (and the app does not start) if an
  applied migration's statements changed, an applied id is no longer in the code, or a new migration sorts
  before an applied one. In development the fix is `npm run db:reset`; in production, never edit: add a file.
- **Write the schema once, with `dialect.ts`.** `const d = dialectFor(driver)` gives `d.id`, `d.timestamp`
  (`TIMESTAMPTZ(3)` / `DATETIME(3)` / `TEXT`), `d.bigint`, `d.text`, `d.flag` and `d.isLowerCase(col)`.
  Branch on `driver` only where the dialects truly differ (the one place today is the users/files foreign key
  cycle, see the baseline's header).
- **Name everything** (`pk_`, `fk_`, `uq_`, `ix_`, `ck_`), give every foreign key an `ON DELETE` and an index,
  CHECK every enum-like column, NOT NULL unless null means something. `../schema-conventions.test.ts` fails
  the build if you forget; the rules are in ENGINEERING §7 "Database design".
- The whole run is one transaction under a lock, so two runners at once are safe. On Postgres a
  `pg_advisory_xact_lock` serialises them (it works through PgBouncer's transaction pooling) and every pending
  migration commits together or not at all; `lock_timeout` and `statement_timeout` are set locally, so a
  migration that would queue behind live queries gives up (the deploy fails; retry) instead of stalling the app.
  SQLite is one process. MySQL commits DDL implicitly, so a failure part-way leaves it half applied (dev:
  `npm run db:reset`; production: fix forward) and a named `GET_LOCK` serialises runners. Keep each migration small.
- **Backward-compatible by default.** The previous deployment keeps serving after the database was migrated (until
  the new one is promoted, and again after an Instant Rollback), so a migration must work with the previous
  release's code: add a nullable column, a table, an index, or a column with a default; do a rename, a drop or a
  NOT NULL without a default in two deploys. `verifySchema` tolerates applied ids newer than the code for this reason.
- A column that must change type or lose a CHECK needs a table rebuild on SQLite (no `ALTER ... DROP CONSTRAINT`):
  write it as create-new, copy, drop, rename, for that driver.
