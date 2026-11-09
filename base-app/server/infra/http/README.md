# server/infra/http

The HTTP framework, with no app knowledge: `server.ts` (request IDs, JSON request logs, the
loopback/`PUBLIC_HOSTS` Host guard, static files first in production), `router.ts` (match,
`:name` path segments (`ctx.params`), 405 with Allow, the Origin check on state-changing requests, auth levels → 401/403, error
envelopes, 500s with an `errorId`), `json.ts` (body reading with a size cap, `sendJson`, which compresses bodies of 1 kB or more), `encoding.ts` (`Accept-Encoding` negotiation, Brotli/gzip, `Vary` and `If-None-Match` helpers),
`sse.ts` (the server-sent events writer: `openSse(req, res)` gives `send`, `comment`, `signal`, `close`; see below), `cookies.ts`, `static.ts` (the built client: traversal-safe, hashed assets immutable, SPA
fallback for extensionless paths unless pages are server-rendered, precompressed `.br` / `.gz` files negotiated, ETags), `ssr.ts` / `ssr-source.ts` / `internal.ts` (server rendering: the page request, where the
render code comes from, the in-process API call; ENGINEERING §15), `types.ts`.

- The app's routes live in `server/routes/`; `main.ts` passes them in.
- **May import:** `infra/log`, `shared/`. **Never:** routes, services, repositories, config.

**Streaming (`sse.ts`).** A handler that wants an event stream calls `openSse(req, res, opts)` after it has
validated and authorised the request, and then writes only through the returned writer. It sets
`text/event-stream`, `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no`, turns off the
socket's idle timeout, comments a heartbeat every 15 s (unref'd; skipped while the socket is backed up),
frames multi-line data as several `data:` lines, awaits `drain` when the client reads slowly, and fires
`signal` when the client disconnects. Nothing here compresses or buffers a response and `server.ts` sets no
request timeout shorter than a stream (Node's `requestTimeout` covers reading the request only). Keep it so:
no compression middleware on `/api`, and never `sendJson` after `openSse`. If a handler throws after the
stream began the router ends the response, since the status can no longer change. The reading side is
`lib/sse.ts`, shared with the client.

**Compression (`encoding.ts`, `json.ts`, `static.ts`).** `negotiateEncoding(header)` reads `Accept-Encoding`
(q-values, `q=0`, `*`, `x-gzip`) and answers `br`, `gzip` or nothing, Brotli first on a tie.
- *Static files.* `vite build` writes `file.br` and `file.gz` beside each text file of 1 kB or more
  (`scripts/precompress.ts`). `static.ts` stats the best accepted variant, falls back to the next and then to the
  file itself when one is missing or older than its source, and sets `Content-Encoding`, the compressed
  `Content-Length`, `Vary: Accept-Encoding` (on every response for such a file, plain ones too) and a
  strong ETag per encoding, so `If-None-Match` gets a 304. HEAD sends the same headers and no body. The
  page keeps its per-file CSP hash; its compressed bytes are read once and cached.
- *JSON.* `sendJson` compresses a body of 1 kB or more at Brotli quality 4 or gzip level 6 (synchronously: a few
  milliseconds at most for an API answer) and adds `Vary: Accept-Encoding`; it keeps a body as it is when the
  caller set a `Content-Encoding` or `no-transform`, for 1xx/204/304, and when compressing would not shrink it.
- *Never* on `/api/events` (or any `openSse` stream): `sendJson` is not used there and nothing wraps the socket.
- *The server-rendered page* (`ssr.ts`) is streamed, so it cannot go through `compressBody`: it picks the
  encoding with `acceptedEncoding`, sets `Content-Encoding` and `Vary: Cookie, Accept-Encoding`, and writes
  through `createBrotliCompress` (quality 4) or `createGzip` (level 6) made with a flush flag, so every chunk
  React writes (the head, each Suspense section) is flushed to the client at once rather than held back for a
  full block. Back-pressure and a closed connection are honoured through the compressor. HEAD sends the same
  headers.
- A new response type that is neither JSON nor a static file should call `negotiateEncoding` the same way:
  `compressBody` for a whole body, a flushing stream for a streamed one.
