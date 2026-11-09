import { pipeline } from 'node:stream/promises';
import { HttpError } from '../infra/http/errors.ts';
import type { RequestContext, Route } from '../infra/http/types.ts';
import { IMAGE_TYPES, type Services } from '../services/index.ts';
import { call } from './errors.ts';

/* GET /api/files/:id — streams a stored file to a signed-in user who may read it (avatars: any
   signed-in user; attachments: only the owner; anyone else gets the same 404).

   Response headers (OWASP ASVS V12.5, V14.4):
   - Content-Type is the type the service stored (an avatar's was sniffed from its bytes);
   - X-Content-Type-Options: nosniff, so a browser does not second-guess it;
   - Content-Disposition: inline only for the image allowlist, attachment (with a safe,
     percent-encoded name) for anything else, so an uploaded HTML or SVG is downloaded, never run;
   - Content-Security-Policy: default-src 'none'; sandbox, so even a file opened directly can run
     nothing, and Cross-Origin-Resource-Policy: same-origin;
   - Cache-Control: private, max-age=3600 (never a shared cache) and ETag = the SHA-256, with 304
     on a matching If-None-Match. */
const INLINE = new Set<string>(IMAGE_TYPES);

/* A header-safe download name: no path separators, quotes or control characters. `ascii` also
   drops everything outside printable ASCII (the plain `filename=` parameter must be Latin-1 at
   most; the full name travels percent-encoded in `filename*`). */
function downloadName(name: string, ascii = false): string {
  const cleaned = Array.from(name.slice(0, 120), (ch) => {
    const code = ch.charCodeAt(0);
    const bad = code < 0x20 || code === 0x7f || ch === '/' || ch === '\\' || ch === '"';
    return bad || (ascii && code > 0x7e) ? '_' : ch;
  }).join('');
  return cleaned === '' ? 'download' : cleaned;
}

function etagMatches(header: string | string[] | undefined, etag: string): boolean {
  if (typeof header !== 'string') return false;
  return header
    .split(',')
    .map((t) => t.trim().replace(/^W\//, ''))
    .some((t) => t === etag || t === '*');
}

export function createFileRoutes(services: Services): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/files/:id',
      auth: 'user',
      handler: async (ctx: RequestContext) => {
        const viewer = ctx.principal;
        if (!viewer) throw new HttpError(401, 'unauthenticated', 'Sign in to use this.');
        const { file, open } = await call(() => services.files.open(viewer, ctx.params.id ?? ''));
        const etag = `"${file.sha256}"`;
        const headers: Record<string, string> = {
          'x-content-type-options': 'nosniff',
          'cache-control': 'private, max-age=3600',
          etag,
          'content-security-policy': "default-src 'none'; sandbox",
          'cross-origin-resource-policy': 'same-origin',
          vary: 'Cookie',
        };
        if (etagMatches(ctx.req.headers['if-none-match'], etag)) {
          ctx.res.writeHead(304, headers);
          ctx.res.end();
          return;
        }
        const bytes = await call(open);
        const inline = INLINE.has(file.contentType);
        ctx.res.writeHead(200, {
          ...headers,
          'content-type': inline ? file.contentType : 'application/octet-stream',
          'content-length': String(file.sizeBytes),
          'content-disposition': inline
            ? 'inline'
            : `attachment; filename="${downloadName(file.originalName, true)}"; filename*=UTF-8''${encodeURIComponent(downloadName(file.originalName))}`,
        });
        try {
          await pipeline(bytes, ctx.res);
        } catch {
          // the client went away, or the disk failed after the headers: nothing more can be said
          ctx.res.destroy();
        }
      },
    },
  ];
}
