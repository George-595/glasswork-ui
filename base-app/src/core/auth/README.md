# src/core/auth

Who is signed in. `AuthProvider` asks `GET /api/auth/me` once on mount and again on every window
focus, and holds the answer. `useAuth()` gives `status` (`loading`, `signed-out`, `signed-in`), the
`user`, `isAdmin`, and the `login`, `logout` and `refresh` actions.

- Mounted once in `src/main.tsx`, above `<App/>`. Nothing else mounts it.
- **May import:** `~/core/api` (the `api` object and wire types) and `react`.
- **Imported by:** `src/app/` (the gate and the user menu) and `src/pages/login/`.
- Never imports pages, `app/` or fixtures. Tests stub `fetch` through `~/test/mockApi`.
- `adopt(user)` records a user the server has just signed in (accepting an invitation, resetting a password):
  the cookie is already set. The user carries `avatarUrl`.
- Sign-out never throws; sign-in throws `ApiError` so the form can show the reason.
