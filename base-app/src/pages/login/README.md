# src/pages/login

The sign-in page. The app shows it with no shell whenever nobody is signed in, at any address; after a
successful sign-in the address the user first asked for shows.

- `LoginPage.tsx`: the kit's `AuthLayout`. Enterprise is a calm two-column panel (brand with three feature
  bullets in a `FeedList`, the form beside it; one column on a phone). Glass is sea glass (the layout's
  `seaGlass`): the form on a frosted glass pebble on sunlit paper, coloured pebbles around it, with the lag
  fallback (Still, then Flat) on a slow device. Fields are `FormField`s, the password is a
  `PasswordInput`, the error summary a `Notice`.
  - The email is focused on mount. The password has a Show/Hide button (`aria-pressed`, the label changes, focus
    and value are kept) and a Caps Lock hint (`getModifierState` on key events: shown as the password's `FormField` description, so it is tied to
    the field with `aria-describedby`, and repeated in an always-mounted polite status line).
  - A failed attempt (empty field, malformed email, or the server refusing) shows one `role="alert"` summary and
    moves focus to it. Field problems are also written under their field, and each summary entry focuses its
    field. A 401 `invalid_credentials` reads "That email or password isn't right." (`messages.ts`; offline, rate-limited and network failures have their own words); other errors show the API message.
  - While sending, the button reads "Signing in…" and is `aria-disabled` (not `disabled`, so it keeps focus); a
    second press is ignored.
  - Development only: the server sends who to sign in as, and a "Fill dev login" button fills it in.
- A "Forgot password?" link in the layout's footer goes to `#/forgot-password`.
- **May import:** `~/core/*` (UI from `~/core/ui`, `ApiError` from `~/core/api`, `useAuth` from `~/core/auth`).
- **Imported by:** `src/app/App.tsx` only, directly (not lazily; it is not a route).
