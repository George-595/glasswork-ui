# core/hooks

Small, UI-free React hooks that more than one page needs. Import them as `~/core/hooks`.

- `useDebouncedValue(value, ms)`: `value`, but only after it has been still for `ms`. Pair it
  with a search box so one request goes out per pause, not per keystroke.
- `useLocalStorage(key, initial)`: `useState` that remembers itself (JSON) in `localStorage`.
  Every access is in try/catch: blocked or full storage just means it is not remembered.
  Per-person conveniences only (a collapsed sidebar), never data that must survive.

- `useOnline()`: whether the browser thinks it has a connection (the `online` / `offline` events). It drives the
  offline banner and "needs a connection" hints; a screen that fails still offers Try again, because
  `navigator.onLine` can say "online" on a dead network.
- `useMediaQuery(query)` and `useWide()` (768px and up): ask once and draw the one version a screen needs,
  rather than two hidden by CSS. A window with no `matchMedia` (jsdom) is a phone.
- `useHydrated()`: false on a server and while the browser hydrates its HTML, true after; for what only the browser knows (the time zone). `useLocalStorage`
  and `useMediaQuery` are hydration-safe the same way (the server's value first).
- `useUnsavedGuard(dirty)`: asks before a tab close, a reload or an in-app link throws edits away.

URL-backed state is `useUrlState` in `core/router`, not here.

**May import:** `react`, and `core/router`'s `isAppHref` and `navigate` (the guard). **May be imported by:** pages, `core/ui` and `app/`.

Rules:
- No `@apps/ui`, no `fetch`, no app knowledge; a hook that needs one belongs in the page.
- Each hook has a `*.test.tsx` beside it (fake timers for anything timed).
