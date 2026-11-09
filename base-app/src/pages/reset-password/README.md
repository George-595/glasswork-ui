# src/pages/reset-password

`#/reset-password?token=…`, the link in a password-reset email. A public page (no shell).

- The token is read once and removed from the address bar and history (see `accept-invite`).
- A reset token cannot be looked at without being spent, so a bad link shows on submit, as the one generic
  "This link is invalid or has expired" screen with "Request a new link" (`#/forgot-password`).
- Success: the server has set the new password, signed out every other session of the account and signed this
  browser in fresh; the page `adopt`s the user and goes to `#/`.
- **May import:** `~/core/*`. **Imported by:** `src/app/routes.ts` only, lazily.
