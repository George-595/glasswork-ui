# src/pages/not-authorised

The page a signed-in user sees on an admin route when their role is not admin. `App.tsx` renders it
inside the shell in place of the route's page, so the sidebar and topbar stay.

- `NotAuthorisedPage.tsx`: a kit `StatusPage` (code 403, shield icon), "Go home" (primary) and "Sign in as someone else"
  (signs out, which lands on the sign-in page), and a `ShaderAccent` in glass only.
- Route-independent: it has no entry in the route table and no `load` of its own.
- **May import:** `~/core/*` (UI from `~/core/ui`; `Link` from `~/core/router`; `useAuth` from `~/core/auth`).
- **Imported by:** `src/app/App.tsx` only, directly (not lazily), so the gate needs no extra fetch.
- Not a sign-in prompt: a signed-out user never reaches it (they get the login page).
