# src/pages/account

`#/account`: the signed-in person's own account, reached from the user menu ("Account") and the command
palette ("Go to Account"). Four panels, each a kit `Section`:

- **Profile:** the photo (`AvatarPicker`, wired to `PUT /api/account/avatar` as a raw body and `DELETE`; the
  bar is indeterminate, because `fetch` cannot report upload progress), the name (`PATCH /api/account`) and the
  email, read-only. After a change the shell's own copy of the user is refreshed, so the topbar avatar follows.
- **Password:** the current password, then a new one with the strength meter (`NewPasswordField`). A wrong
  current password lands under that field, a policy refusal under the new one. The server ends every other
  session, so the sessions list reloads.
- **Sessions:** `SessionList` over `GET /api/account/sessions`: "Chrome on macOS", the IP, last active, a "This
  device" badge, Sign out for one (a session id that is not yours is a 404) and for all others.
- **Notifications:** a link to the preferences on `#/notifications`.
- Every call is about the caller: no user id appears on this page.
- **May import:** `~/core/*`. **Imported by:** `src/app/routes.ts` only, lazily.
