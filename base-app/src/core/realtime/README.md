# core/realtime

The one server-sent event stream of the signed-in app (`EventSource` on `GET /api/events`).

- `RealtimeProvider` opens it, reports `status` (`connecting`, `open`, `reconnecting`, `paused`, `closed`) and
  hands events to listeners. Mounted once in `app/App.tsx`, inside the signed-in branch only.
- **Off switch:** `enabled` (default `config.realtime`, false when the build has `VITE_REALTIME=off`) stops it opening at
  all: status stays `closed`, nothing is requested. `vite.config.ts` sets it off on a Vercel build (`VERCEL=1`), where
  `/api/events` answers 503 and a retry loop would hit the function all day for every open tab. An explicit `VITE_REALTIME`
  wins.
- **Stream off, still fresh:** with `enabled` false the provider sends the same synthetic `resync` when the browser
  comes back `online` and when the tab is shown again after `staleAfterMs` (60 s) hidden, so a phone on Vercel
  refetches what it shows instead of keeping this morning's numbers.
- `useEventStream<T>(event, handler)` listens to one event name while the component is mounted; the handler may
  change every render. `useRealtimeStatus()` reads the state. Without a provider both are inert (a page rendered
  alone in a test).
- **`resync`** is a synthetic event: it fires when the stream returns after a gap (an error, or a tab that was
  hidden long enough to be closed). The server does not replay, so a consumer that shows server state refetches it.
- **Reconnecting is ours, not the browser's:** on any `error` the source is closed and a new one opened after
  `backoffDelay(attempt)` (1 s doubling to 30 s, between half and all of it, so a restarted server is not
  stampeded). The first `ready` of a connection resets the attempt count. `online` reconnects at once.
- **A hidden tab** keeps its stream for `hiddenGraceMs` (5 minutes), then closes it (`paused`); becoming visible
  reopens it and resyncs. Browsers allow six connections per origin over HTTP/1.1.
- Props `createEventSource`, `hiddenGraceMs`, `backoff` and `random` exist for tests; pass stable values.
  `src/test/fakeEventSource.ts` is the fake.

**May import:** `core/config`. **Imported by:** `core/notifications`, `app/`, pages (through `~/core/realtime`).
Events and their shapes: `shared/api.ts` (`RealtimeNotification`, …) and `server/services/events.ts`.
