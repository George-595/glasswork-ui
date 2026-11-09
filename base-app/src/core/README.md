# core

The app's own layer, below the pages. `utils/` (pure helpers), `config/` (client settings),
`router/` (path routing and `Link`) and `api/` (the typed HTTP client) are plain code with no
app knowledge. `realtime/` is the server-sent event stream and `notifications/` the unread count and
notification actions built on it (their READMEs say what each may import). `ui/` is the app's composition over `@apps/ui` (`Page`, `Money`, the theme
hook re-export), and it is the only place that imports `@apps/ui`.

`agent/` is the assistant on the client: `useAgentChat` (one chat with POST /api/agent/stream: saved
chats, the streaming reply, approvals, Stop, pinning to Views), `AgentThread` / `AgentNotice` (the
messages and the failure line, from kit parts) and the Ask panel's store (`askAbout`, `useAsk`), so the
Assistant page and the shell's Ask panel share one implementation.

`settings/` holds the server-side settings (workspace name, maintenance mode) for the whole app.

Everything here renders on a server too (ENGINEERING §15): no `window`, `document` or storage while rendering. `api/initial.tsx` is the
request-scoped cache a server render fills (`useApiQuery`'s optional `fromServer(path)`; `AuthProvider` and `SettingsProvider` start from
it), `router/location.tsx` carries the request's address, and `hooks/useHydrated` marks what only the browser can know.

Dependency direction, one way only:
- `utils`, `config`, `router`, `hooks` import nothing app-level.
- `api` imports `config` and `shared/api` (types only).
- `ui` imports `@apps/ui`, `utils` and `router`.
- `agent` imports `api` and `ui`.
- Pages import from `core/*` and `data/fake`; `app/` wires them together.

`src/data/fake` sits beside `core` and imports `core/utils` only.

Add a helper here only if two pages need it. Anything page-specific stays in the page.
