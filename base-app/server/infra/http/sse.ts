import type { IncomingMessage, ServerResponse } from 'node:http';

/* Server-sent events, the writing side. openSse() turns a response into an event stream and
   hands back a small writer; the framework knows nothing about what is sent. Wave 2's
   realtime hub and the LLM stream route both build on it.

   What it does for the caller:
   - the headers a stream needs: text/event-stream, `no-cache, no-transform` (no proxy or
     middleware may rewrite or compress it), `X-Accel-Buffering: no` (nginx would otherwise
     hold the bytes back), and the usual nosniff;
   - turns off the socket's idle timeout and Nagle's delay, so a quiet stream is not cut and
     a small event leaves at once;
   - `send()` frames one event (a multi-line data string becomes several `data:` lines; a
     newline in `event` or `id` cannot start a new field) and waits for the socket to drain
     when the client reads slower than we write;
   - a comment heartbeat on an interval keeps proxies from closing an idle stream (the timer
     is unref'd, so it never holds the process open, and is skipped while the socket is
     backed up);
   - `signal` aborts when the client goes away, so work done for it (a paid upstream call)
     can stop; everything is cleaned up on `close`. There is no JSON, no content-length and no
     compression on this response: the router must not touch it after openSse(). */

export interface SseMessage {
  /** The event name; omitted = the browser's default `message`. */
  event?: string;
  id?: string;
  /** A string is sent as is; anything else is JSON. */
  data: unknown;
}

export interface SseWriter {
  /** Frames and writes one event. Resolves when the socket accepted it (or the client left). */
  send(message: SseMessage): Promise<void>;
  /** A comment line (`: text`). Clients ignore it; it keeps the connection warm. */
  comment(text?: string): Promise<void>;
  /** Fires when the client disconnects (or `close()` is called). */
  readonly signal: AbortSignal;
  /** True once the client left or `close()` ran; later sends do nothing. */
  readonly closed: boolean;
  /** Ends the stream from our side. Idempotent. */
  close(): void;
}

export interface SseOptions {
  /** Milliseconds between heartbeat comments. Default 15 s; 0 turns them off. */
  heartbeatMs?: number;
  /** Tells the browser's EventSource how long to wait before reconnecting. */
  retryMs?: number;
  /** Extra response headers (the request id, say). */
  headers?: Record<string, string>;
}

export const DEFAULT_HEARTBEAT_MS = 15_000;

/** The frame for one event, ending in the blank line. Exported for tests and for hubs that fan one frame out to many clients. */
export function frameSse(message: SseMessage): string {
  let out = '';
  if (message.id !== undefined) out += `id: ${singleLine(message.id)}\n`;
  if (message.event !== undefined) out += `event: ${singleLine(message.event)}\n`;
  const text = typeof message.data === 'string' ? message.data : JSON.stringify(message.data);
  for (const line of text.split(/\r\n|\r|\n/)) out += `data: ${line}\n`;
  return `${out}\n`;
}

function singleLine(value: string): string {
  return value.replace(/[\r\n]+/g, ' ');
}

export function openSse(
  req: IncomingMessage,
  res: ServerResponse,
  opts: SseOptions = {},
): SseWriter {
  const heartbeatMs = opts.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const abort = new AbortController();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  // Everything waiting on a drain, released together when the socket drains or closes.
  let waiters: (() => void)[] = [];

  req.socket.setTimeout(0);
  req.socket.setNoDelay(true);
  req.socket.setKeepAlive(true);

  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    'x-accel-buffering': 'no',
    'x-content-type-options': 'nosniff',
    connection: 'keep-alive',
    ...opts.headers,
  });
  if (opts.retryMs !== undefined) res.write(`retry: ${Math.round(opts.retryMs)}\n\n`);
  // Send the headers now: the client's fetch() resolves and EventSource opens before the first event.
  res.flushHeaders();

  function release(): void {
    const pending = waiters;
    waiters = [];
    for (const resolve of pending) resolve();
  }

  function finish(): void {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    release();
    abort.abort();
  }

  res.on('close', finish);
  res.on('drain', release);
  res.on('error', finish);

  function write(frame: string): Promise<void> {
    if (closed || res.writableEnded || res.destroyed) return Promise.resolve();
    const flushed = res.write(frame);
    if (flushed) return Promise.resolve();
    return new Promise<void>((resolve) => waiters.push(resolve));
  }

  if (heartbeatMs > 0) {
    heartbeat = setInterval(() => {
      // A backed-up socket does not need more bytes to stay alive.
      if (!res.writableNeedDrain) void write(': keep-alive\n\n');
    }, heartbeatMs);
    heartbeat.unref();
  }

  return {
    send: (message) => write(frameSse(message)),
    comment: (text = '') => write(`: ${singleLine(text)}\n\n`),
    signal: abort.signal,
    get closed() {
      return closed;
    },
    close() {
      if (closed) return;
      // End first (it flushes what is queued), then mark closed; 'close' follows on the response.
      if (!res.writableEnded) res.end();
      finish();
    },
  };
}
