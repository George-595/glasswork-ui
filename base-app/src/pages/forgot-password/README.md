# src/pages/forgot-password

`#/forgot-password`: ask for a reset link by email. A public page (no shell).

- The server answers 202 the same way for any address; this page then says, every time, "If an account exists
  for <email>, we've emailed a link to reset the password." Nothing on screen tells a registered address from
  an unregistered one. Only asking too often (429, the same for every address) and a network failure differ,
  and they show as errors.
- The address is checked for shape in the browser first (no request for "not an email").
- **May import:** `~/core/*`. **Imported by:** `src/app/routes.ts` only, lazily; linked from the sign-in page.
