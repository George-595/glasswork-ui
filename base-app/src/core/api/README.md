# core/api

The browser's side of the HTTP contract in `shared/api.ts`. `client.ts` holds `apiGet`,
`apiPost`, `apiPut`, `apiPatch` and `ApiError` (every failure becomes an `ApiError`, with `status 0` and code
`apiPost`, `apiPatch`, `apiPut`, `apiDelete`, `apiPutFile` (a raw file body with the file's own Content-Type, for an upload) and `ApiError` (every failure becomes an `ApiError`, with `status 0` and code
`network` when no response arrives). `endpoints.ts` is the typed `api` object, one function
per route (`transactionsPage(query)` is table mode: filtered, sorted, paged, with facet counts;
`transaction(id)` is the detail drawer's record). `llmStream(body, {signal, onDelta})` is the one streaming call: a POST read with `fetch` and `lib/sse.ts`'s parser (not EventSource, which cannot POST), resolving with the closing `done` event and rejecting with an `ApiError` for an `error` event (the server's `code`), a dropped connection (`network`) or a stream that ends without `done` (`stream_ended`); aborting `signal` rejects with the abort error. `notifications(query)`, `unreadCount()`, `markNotificationRead(id)`, `markAllNotificationsRead()`, `notificationPreferences()` and `saveNotificationPreferences(body)` are the inbox calls (the live part is `core/realtime`). `useApiAction.ts` runs a call and tracks its loading, success and error state. `apiPaths` (in `endpoints.ts`) holds the path of each GET a server render can
answer ahead of the browser; `initial.tsx` is the request-scoped cache (`InitialData`, `useInitialData`) a server render fills and the page embeds, and
`useApiQuery(load, key, fromServer(apiPaths.x(…), select))` draws its first render from it with no request (ENGINEERING §15).

**May import:** `core/config`, `core/utils` (the SSE parser) and `shared/api` (type-only), plus `react` for the hook.

**May be imported by:** pages, `core/ui` and `app/`.

Rules:
- Use global `fetch` only. No API SDKs in the client.
- Add a route here when `server/` adds one; the types come from `shared/`, never redefined.
- Error messages are safe to show. Never put a secret or a request body in one.
- Tests stub `fetch` with `vi.stubGlobal`; nothing reaches the network.
