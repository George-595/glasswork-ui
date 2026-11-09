import type { IncomingMessage, ServerResponse } from 'node:http';
import type { ApiErrorBody } from '../../../shared/api.ts';
import { acceptedEncoding, addVary, compressBody, MIN_COMPRESS_BYTES } from './encoding.ts';
import { HttpError } from './errors.ts';

/* Every response goes through these two helpers, so every response carries the
   same security headers and the same error envelope.

   A body of 1 kB or more is compressed when the client's Accept-Encoding allows it (Brotli, else
   gzip; encoding.ts) and says `Vary: Accept-Encoding`. Smaller bodies, and a response that
   already names a Content-Encoding or says `no-transform`, go out as they are. The event stream
   never comes through here (sse.ts writes it directly), so it is never compressed. */

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = Buffer.from(JSON.stringify(body), 'utf8');
  const out: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  };
  for (const [name, value] of Object.entries(headers)) out[name.toLowerCase()] = value;

  let bytes: Uint8Array = payload;
  if (payload.length >= MIN_COMPRESS_BYTES && canCompress(status, out)) {
    out.vary = addVary(out.vary, 'Accept-Encoding');
    const encoding = acceptedEncoding(res.req);
    if (encoding) {
      const packed = compressBody(payload, encoding);
      if (packed.length < payload.length) {
        bytes = packed;
        out['content-encoding'] = encoding;
      }
    }
  }
  out['content-length'] = String(bytes.length);
  res.writeHead(status, out);
  res.end(bytes);
}

function canCompress(status: number, headers: Record<string, string>): boolean {
  if (status < 200 || status === 204 || status === 304) return false;
  if (headers['content-encoding']) return false;
  return !/\bno-transform\b/i.test(headers['cache-control'] ?? '');
}

export function sendError(
  res: ServerResponse,
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
  errorId?: string,
  details?: Record<string, unknown>,
): void {
  const body: ApiErrorBody = {
    ok: false,
    error: {
      code,
      message,
      ...(errorId ? { errorId } : {}),
      ...(details ? { details } : {}),
    },
  };
  sendJson(res, status, body, headers);
}

const MEDIA_TYPE = 'application/json';

/* Reads a JSON request body with a hard size cap. Rejects non-JSON content
   types before reading anything. Over the cap, the rest of the body is drained
   (up to 4x the cap) so the client still receives the 413. */
export async function readJsonBody(req: IncomingMessage, limitBytes: number): Promise<unknown> {
  const contentType = req.headers['content-type'];
  const mediaType = contentType?.split(';')[0]?.trim().toLowerCase();
  if (mediaType !== MEDIA_TYPE) {
    throw new HttpError(
      415,
      'unsupported_media_type',
      'Content-Type must be application/json',
      true,
    );
  }

  const chunks: Buffer[] = [];
  let total = 0;
  let overflow = false;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    total += chunk.length;
    if (total > limitBytes * 4) {
      // Giving up here ends the stream (the client may see a reset instead of
      // the 413). Only a body over 4x the cap, from a client that is not stopping.
      throw new HttpError(413, 'body_too_large', `Request body exceeds ${limitBytes} bytes`, true);
    }
    if (total > limitBytes) {
      overflow = true;
      continue;
    }
    chunks.push(chunk);
  }
  if (overflow) {
    throw new HttpError(413, 'body_too_large', `Request body exceeds ${limitBytes} bytes`, true);
  }

  const text = Buffer.concat(chunks).toString('utf8');
  if (text.trim() === '') throw new HttpError(400, 'invalid_body', 'Request body is empty');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new HttpError(400, 'invalid_body', 'Request body is not valid JSON');
  }
}
