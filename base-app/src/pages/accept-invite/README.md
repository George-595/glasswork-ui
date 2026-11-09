# src/pages/accept-invite

`#/accept-invite?token=…`, the link in an invitation email. A public page (no shell), shown by the gate
(`PUBLIC_ROUTES`) whether or not anyone is signed in.

- The token is read once (`readHashParam`) and removed from the address bar and history (`removeHashParam`).
  It travels in the `#fragment`, which a browser never sends to a server or in a `Referer`.
- `GET /api/auth/invite/:token` greets the person ("Join <app> as <email>", name prefilled, email read-only so
  a password manager files the login under it). Unknown, used, expired and revoked links are one answer, the
  "This link is invalid or has expired" screen with a link to sign in.
- The password is a `NewPasswordField` (Show/Hide, `new-password`, the strength meter). The server applies
  the real policy and its refusal lands under the field. Success: the server sets the session cookie, the page
  `adopt`s the user and goes to `#/`.
- **May import:** `~/core/*`. **Imported by:** `src/app/routes.ts` only, lazily.
