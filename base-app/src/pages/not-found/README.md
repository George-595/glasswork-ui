# src/pages/not-found

Shown for any address with no page, inside the shell.

- `NotFoundPage.tsx`: a kit `StatusPage` (code 404) with clear copy, "Go home" (primary) and "Go back" (history), and a
  quiet `ShaderAccent` behind it in the glass skin only.
- **May import:** `~/core/*`. **Imported by:** `src/app/routes.ts` (`NOT_FOUND_ROUTE`), lazily.
