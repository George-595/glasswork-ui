# src/core/ui

The app's one door to the UI kit.

- `index.ts` re-exports all of `@apps/ui`, plus the app's own composition components:
  `Page` (the single `<h1>` and document title), `Money`, `ApiStatusBadge`, `LinkedText` (text whose http(s) addresses are links).
  `Page` (the single `<h1>` and document title), `AuthScreen` (the kit's `AuthLayout` with the app's
  brand, the glass backdrop and the document title: the shell of every signed-out page), `NewPasswordField` (a password input with the strength meter,
  wherever a password is set), `Money`, `ApiStatusBadge`.
- `Brand` is the app's name with a mark beside it (a kit glyph by default; pass `mark` for a logo), `compact`
  for the sidebar and the phone top bar. The name is real text, the mark decorative.
- `Page` is the kit's `PageLayout` (`eyebrow`, `description`, `actions`, `breadcrumbs`, `toolbar`, the one
  `<h1>`, the spaced body) plus `document.title` = "<title> · <app name>". It owns no CSS. `Money` is the
  kit's `Num` (mono, `up`/`down` tone) around `formatMoney`.
- `Delta`, `ErrorState` and `LoadingRegion` now live in `@apps/ui`; `Delta.tsx` and `Loading.tsx`
  here only re-export them, so the old import paths keep working.
- **Only this folder may import `@apps/ui`.** Pages and `app/` import UI from `~/core/ui`.
- May import: `@apps/ui`, `~/core/utils`, `~/core/config`, `~/core/api`.
- Never imports: `pages/`, `app/`, `data/`, `server/`.
- A component every app would want belongs in `apps/packages/ui`, not here.
