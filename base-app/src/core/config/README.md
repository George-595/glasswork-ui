# core/config

Client configuration: `readClientConfig()` (pure, testable) and the `config` singleton read
from `import.meta.env` once at load. It defines the app name and the API base path
(`VITE_APP_NAME`, `VITE_API_BASE`, defaults `Base app` and `/api`).

`features.ts` holds `appFeatures`, the app-wide switches set in code (today `notifications`: the bell, the
Notifications route and their menu entries). `VITE_REALTIME=off` turns the live-update stream off (set by
the Vercel build, where a function cannot hold a connection open).

**May import:** nothing app-level. The Vite `import.meta.env` typing is the only dependency.

**May be imported by:** `core/api`, `core/ui`, `app/`, pages.

Rules:
- Only `VITE_*` keys are readable here. Server secrets never reach this file.
- Nothing else reads `import.meta.env` directly; go through `config`.
- Trailing slashes are stripped from the API base so callers can join paths with a leading `/`.
