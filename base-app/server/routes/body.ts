import type { IncomingMessage } from 'node:http';
import { HttpError } from '../infra/http/errors.ts';
import { readJsonBody } from '../infra/http/json.ts';

/* Reading request bodies for the account and sign-in routes. */

/** A JSON object body (anything else is a 400), within `limitBytes`. */
export async function readObjectBody(
  req: IncomingMessage,
  limitBytes: number,
): Promise<Record<string, unknown>> {
  const raw = await readJsonBody(req, limitBytes);
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new HttpError(400, 'invalid_body', 'Send a JSON object.');
  }
  return raw as Record<string, unknown>;
}

/** A string field no longer than `max`; a 400 naming the field otherwise. */
export function stringField(body: Record<string, unknown>, key: string, max: number): string {
  const value = body[key];
  if (typeof value !== 'string') {
    throw new HttpError(400, 'invalid_body', `Send "${key}" as a string.`);
  }
  if (value.length > max) throw new HttpError(400, 'invalid_body', `"${key}" is too long.`);
  return value;
}

/** The request body as chunks, for a raw upload. Unlike `for await (const c of req)`, leaving early
    does NOT destroy the request (and with it the socket): the answer, a 413 say, must still be
    able to reach the client. The caller reads what is left with `drainBody`, and the handler's
    error closes the connection (`closeConnection`). */
export function rawBody(req: IncomingMessage): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      const chunks = req[Symbol.asyncIterator]();
      for (;;) {
        const next = await chunks.next();
        if (next.done) return;
        yield next.value as Uint8Array;
      }
    },
  };
}

/** Reads and discards what is left of the request body, up to `limitBytes` more bytes or
    `timeoutMs`, whichever comes first. Answering while the client is still sending and then
    closing makes the OS reset the connection, and a reset can discard the answer before the
    client reads it (the client sees ECONNRESET, not the 413). Draining first lets the answer
    land; the caps keep a client that never stops from holding the connection. True when the
    body ended within the caps. */
export function drainBody(
  req: IncomingMessage,
  limitBytes: number,
  timeoutMs = 5000,
): Promise<boolean> {
  if (req.complete || req.destroyed) return Promise.resolve(req.complete);
  return new Promise((resolve) => {
    let seen = 0;
    const finish = (ended: boolean) => {
      clearTimeout(timer);
      req.off('readable', onReadable);
      req.off('end', onEnd);
      req.off('error', onError);
      req.off('close', onClose);
      resolve(ended);
    };
    // read() on 'readable', not resume() + 'data': an abandoned async iterator (rawBody) leaves a
    // 'readable' listener on the request, and while one is attached resume() starts nothing
    const onReadable = () => {
      for (let chunk = req.read() as Buffer | null; chunk !== null; chunk = req.read()) {
        seen += chunk.length;
        if (seen > limitBytes) return finish(false);
      }
    };
    const onEnd = () => finish(true);
    const onError = () => finish(false);
    const onClose = () => finish(req.complete);
    const timer = setTimeout(() => finish(false), timeoutMs);
    req.on('readable', onReadable);
    req.once('end', onEnd);
    req.once('error', onError);
    req.once('close', onClose);
    onReadable();
  });
}

/** The declared Content-Length as a number, or undefined (chunked or missing). */
export function declaredLength(req: IncomingMessage): number | undefined {
  const raw = req.headers['content-length'];
  if (typeof raw !== 'string' || !/^\d{1,15}$/.test(raw)) return undefined;
  return Number(raw);
}
