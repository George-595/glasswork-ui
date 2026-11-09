import type { IncomingMessage } from 'node:http';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/* Content-Encoding for responses: which encoding a client asked for, and the compression of a
   JSON body. Static files are compressed at build time (scripts/precompress.mjs) and served by
   static.ts with the same negotiation; JSON is compressed per response (json.ts). The event
   stream (sse.ts) never goes through here: a compressor buffers, and a heartbeat must reach the
   client the moment it is written. */

export type Encoding = 'br' | 'gzip';

/* Preference order when the client accepts both: Brotli compresses smaller, gzip is the fallback. */
const PREFERENCE: readonly Encoding[] = ['br', 'gzip'];

/* Below this a body is sent as it is: the headers and the compressor's framing would eat the gain. */
export const MIN_COMPRESS_BYTES = 1024;

/* The best encoding both sides support, or undefined for none (send the bytes as they are).
   `Accept-Encoding: br;q=0, gzip` forbids Brotli; `*` stands for any encoding not named; a
   missing header means identity only (RFC 9110 §12.5.3). */
export function negotiateEncoding(
  header: string | string[] | undefined,
  offered: readonly Encoding[] = PREFERENCE,
): Encoding | undefined {
  const value = Array.isArray(header) ? header.join(',') : header;
  if (!value) return undefined;

  const weights = new Map<string, number>();
  for (const part of value.split(',')) {
    const [rawName, ...params] = part.trim().split(';');
    const name = rawName?.trim().toLowerCase();
    if (!name) continue;
    let q = 1;
    for (const param of params) {
      const [key, raw] = param.split('=');
      if (key?.trim().toLowerCase() === 'q') {
        const parsed = Number(raw?.trim());
        q = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 0), 1) : 0;
      }
    }
    weights.set(name, q);
  }

  let best: Encoding | undefined;
  let bestWeight = 0;
  for (const encoding of PREFERENCE) {
    if (!offered.includes(encoding)) continue;
    // `x-gzip` is an old alias of gzip
    const named =
      weights.get(encoding) ?? (encoding === 'gzip' ? weights.get('x-gzip') : undefined);
    const weight = named ?? weights.get('*') ?? 0;
    // strictly greater: on a tie the earlier (preferred) encoding keeps the place
    if (weight > bestWeight) {
      best = encoding;
      bestWeight = weight;
    }
  }
  return best;
}

export function compressBody(body: Buffer, encoding: Encoding): Buffer {
  if (encoding === 'br') {
    // quality 4 is gzip-speed with a better ratio; the build's own .br files use 11
    return brotliCompressSync(body, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 4,
        [constants.BROTLI_PARAM_SIZE_HINT]: body.length,
      },
    });
  }
  return gzipSync(body, { level: 6 });
}

/* Adds a token to a Vary header value without repeating it (`*` stays `*`). */
export function addVary(existing: string | undefined, token: string): string {
  if (!existing) return token;
  const tokens = existing.split(',').map((t) => t.trim());
  if (tokens.includes('*')) return existing;
  return tokens.some((t) => t.toLowerCase() === token.toLowerCase())
    ? existing
    : `${existing}, ${token}`;
}

/* Does an If-None-Match header match this entity tag? Weak comparison, as for a conditional GET. */
export function etagMatches(header: string | string[] | undefined, etag: string): boolean {
  const value = Array.isArray(header) ? header.join(',') : header;
  if (!value) return false;
  const bare = (tag: string) => tag.trim().replace(/^W\//, '');
  const want = bare(etag);
  return value.split(',').some((tag) => tag.trim() === '*' || bare(tag) === want);
}

export function acceptedEncoding(req: IncomingMessage | undefined): Encoding | undefined {
  return negotiateEncoding(req?.headers['accept-encoding']);
}
