# shared/

The wire contract between the client (`src/`) and the API server (`server/`).

- `api.ts`: request and response DTOs for every `/api/*` route.
- Type-only. It imports nothing and emits nothing.
- Imported by `src/core/api` and `server/infra/http`. A change here is a change to both sides.
- Account and sign-in flows (invite info, accept invite, forgot/reset password, `/api/account/*`, avatar upload): their DTOs and error codes are documented on the types in `api.ts`.
