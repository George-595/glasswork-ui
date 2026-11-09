# server/cli/

Command-line entry points that share `server/`'s code but are not the server.

- `migrate.ts`: applies or checks migrations. `--apply` (`npm run db:migrate`), `--verify`
  (`npm run db:verify`), `--deploy` (`npm run vercel-build`, the Vercel build step: `VERCEL_ENV=production`
  applies and seeds the admin, a Preview only verifies unless `MIGRATE_PREVIEW=apply`). Database URL:
  `MIGRATION_DATABASE_URL`, else `DATABASE_URL_UNPOOLED`, else `DATABASE_URL`. Exit 0 ok, 1 failed, 2 bad
  usage. Never prints a password. See `docs/DEPLOY.md`, "Migrations: once, in the deploy".
- **May import:** `config/`, `infra/db`, `services` (the admin seed). **Imported by:** `package.json` scripts,
  `scripts/import-legacy.mjs` (for `describeTarget`) and its own test.
