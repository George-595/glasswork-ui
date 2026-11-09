# server/infra/db

The database layer: one `DbClient` interface (`types.ts`) with SQLite, Postgres and MySQL drivers behind it,
the migrator, and the schema ([`SCHEMA.md`](SCHEMA.md): ER overview, every table, the conventions).

- **URLs:** `sqlite::memory:`, `sqlite:./rel.db`, `sqlite:///abs.db`, `postgres://`, `postgresql://`, `mysql://`. Anything else throws `DbConfigError` with the URL redacted.
- **Placeholders:** SQL always uses `?`. Postgres rewrites them to `$1..$n` (`toPostgresPlaceholders`). Dollar-quoted strings (`$$...$$`) are not handled, so never put a `?` inside one.
- **Timestamps (the contract):** bind a `Date`; every driver returns a timestamp column as an ISO-8601 UTC string with milliseconds (`2026-10-12T08:30:00.123Z`). SQLite stores that text; Postgres converts `timestamptz` in a per-pool type parser and binds `Date` as ISO text; MySQL reads `DATETIME` as UTC (`timezone: 'Z'`) and converts `Date` to ISO on read. Nothing above this folder knows which database it has.
- **Transactions:** `transaction(fn)` commits if `fn` resolves and rolls back and rethrows if it rejects. Use only the `tx` argument inside `fn`; calling the outer client from inside deadlocks on SQLite and holds a second pool connection on the others. Nested transactions are not supported. A failed statement aborts a Postgres transaction.
- **Writes:** Postgres has no `lastInsertId` and the schema has no auto-increment keys: ids are UUIDv7 strings from `server/lib/ids.ts`. `rowsAffected` on an UPDATE means rows matched, on all three. `executor.driver` is there for the rare statement the dialects spell differently; use it sparingly and say why.
- **After-commit hooks:** `withAfterCommit(db)` (applied once, in `createServices`) lets `afterCommit(tx, hook)` queue work that
  runs only after the transaction committed (dropped on rollback; a throwing hook goes to `onError`, never to the caller).
  Outside a transaction a hook runs at once. See ENGINEERING §7.
- **SQLite** opens with `PRAGMA foreign_keys = ON`.
- **Migrations:** `migrations/` (see its README) and `migrate.ts`, which stores a checksum per applied migration and refuses (`MigrationError`, message points at `npm run db:reset`) when one changed, vanished or was added out of order. `migrate()` runs once per deploy (`server/cli/migrate.ts`) or at Docker/dev boot, under a lock, all pending migrations in one transaction; `verifySchema()` is the read-only check a Vercel function makes (`SchemaBehindError` while a migration is pending, newer ids tolerated). `postgres.ts` sets the pool's connect, idle and query timeouts.
- **Drivers:** `pg` and `mysql2` load lazily, only when their driver is chosen. SQLite uses the built-in `node:sqlite`.
- **Errors:** `DbQueryError` carries the driver and code only. Messages never hold credentials. `isUniqueViolation(err)` recognises a duplicate key on any driver.
- **May import:** `types.ts` and Node built-ins. Nothing in here reads `process.env` except the test helper `test-databases.ts`.
- **Imported by:** `server/app.ts` and `server/cli/migrate.ts` (`createDbClient`, `migrate`, `verifySchema`) and `infra/http`, through `index.ts`.

## Tests

- `*.test.ts` here run on SQLite and pure functions; the migrator and `schema-conventions.test.ts` run on all three.
- `test-databases.ts` + `introspect.ts` are test helpers: `openTestDb(target)` gives a fresh migrated database (SQLite `:memory:`, or a throwaway `CREATE DATABASE t_…` on Postgres/MySQL), `introspect(db)` reads the live schema back.
- Postgres and MySQL suites are skipped unless `TEST_POSTGRES_URL` / `TEST_MYSQL_URL` are set. `npm run test:db` starts the containers (`../../../compose.yaml`) and sets them. The cross-database repository suite is `server/repositories.contract.test.ts`.
