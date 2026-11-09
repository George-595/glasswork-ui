# src/core/settings

The server-side settings, for the whole app: the workspace name and maintenance mode
(`GET /api/settings`). Per-viewer look and feel (skin, mode, backdrop) is not here; it stays in the
browser.

- `SettingsProvider` (mounted in `src/main.tsx`, inside `AuthProvider`) reads the settings once the
  user is signed in and again on window focus, after a save, and whenever any call answers
  `503 maintenance` (the server switched it on under us; `onMaintenance` in `core/api`). A failed
  read keeps the last good values. Another tab's change arrives through those; a realtime `settings`
  event (NOTIFY's `useEventStream`) can call `refresh()` for an instant update.
- `useSettings()` gives `workspaceName` (falls back to `VITE_APP_NAME` until the server answers),
  `maintenance: { enabled, message }`, every `values` key, `refresh()` and `save(patch)` (admin only;
  rejects with the `ApiError`, `invalid_setting` names the setting).
- Without a provider (a page rendered alone in a test) it returns the defaults, and `save` goes
  straight to the API.
- **May import:** `~/core/api`, `~/core/auth`, `~/core/config`. **Imported by:** `src/app/` (brand,
  the maintenance gate and banner), `src/pages/admin/settings/`, `src/pages/maintenance/`.
