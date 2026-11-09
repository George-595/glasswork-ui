import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import {
  addVary,
  type Encoding,
  etagMatches,
  MIN_COMPRESS_BYTES,
  negotiateEncoding,
} from './encoding.ts';
import { inlineScriptHashes, securityHeaders } from './security-headers.ts';

/* Serves the built client (Vite's dist/) from the same process as the API.
   It answers GET and HEAD for non-/api paths and returns false for anything
   else, so the API router gets the rest. Unknown client routes fall back to
   index.html (the SPA shell); unknown files with an extension are 404s.

   Compression: `vite build` writes a `.br` and a `.gz` beside each text file of 1 kB or more
   (scripts/precompress.ts). A client that accepts one gets it (Brotli before gzip, q-values
   respected) with `Content-Encoding`; a missing or stale variant falls back to the next one and
   then to the file itself. Every response for such a file says `Vary: Accept-Encoding` and
   carries an ETag per variant, so a conditional request gets a 304. */

export interface StaticOptions {
  /* Absolute path to the built client (dist/). */
  readonly root: string;
  /* Send Strict-Transport-Security with the page (the host is behind TLS: cookieSecure). */
  readonly hsts?: boolean;
  /* Answer an unknown client route with index.html (a single-page app). Default true. Turn it off
     when pages are server-rendered (ssr.ts): the handler then returns false for them. */
  readonly spaFallback?: boolean;
}

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

/* The files `vite build` precompresses (scripts/precompress.ts). */
const COMPRESSIBLE_EXTS = new Set([
  '.js',
  '.mjs',
  '.css',
  '.html',
  '.svg',
  '.json',
  '.txt',
  '.map',
  '.webmanifest',
]);
const VARIANT_SUFFIX: Readonly<Record<Encoding, string>> = { br: '.br', gzip: '.gz' };

const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';
const NO_CACHE = 'no-cache';

/* Returns a handler: true when it wrote a response, false when the request is
   not for the client (the caller then hands it to the API or its own 404). */
export function createStaticHandler(
  opts: StaticOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const root = resolve(opts.root);
  const rootPrefix = root.endsWith(sep) ? root : root + sep;
  // The page and the headers computed from it (the inline script's hash), by file and version,
  // with the bytes of each precompressed variant that has been asked for.
  const pages = new Map<
    string,
    { stamp: string; body: Buffer; headers: Record<string, string>; variants: Map<string, Buffer> }
  >();

  const page: PageLoader = async (filePath, size, mtimeMs, variantPath) => {
    const stamp = `${size}:${mtimeMs}`;
    let entry = pages.get(filePath);
    if (entry?.stamp !== stamp) {
      const body = await readFile(filePath);
      const headers = securityHeaders({
        scriptHashes: inlineScriptHashes(body.toString('utf8')),
        ...(opts.hsts ? { hsts: true } : {}),
      });
      entry = { stamp, body, headers, variants: new Map() };
      pages.set(filePath, entry);
    }
    if (!variantPath) return { body: entry.body, headers: entry.headers };
    let variant = entry.variants.get(variantPath);
    if (!variant) {
      variant = await readFile(variantPath);
      entry.variants.set(variantPath, variant);
    }
    return { body: variant, headers: entry.headers };
  };

  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;

    const rawPath = (req.url ?? '/').split('?')[0] ?? '/';
    if (!rawPath.startsWith('/')) return reject(res, 400);

    let path: string;
    try {
      path = decodeURIComponent(rawPath);
    } catch {
      return reject(res, 400);
    }
    if (path.includes('\0') || path.includes('\\')) return reject(res, 400);
    if (path.split('/').some((segment) => segment === '..')) return reject(res, 400);

    if (path === '/api' || path.startsWith('/api/')) return false;

    const isHead = req.method === 'HEAD';
    const target = resolve(join(root, path));
    if (target !== root && !target.startsWith(rootPrefix)) return reject(res, 400);

    const fileStat = await statFile(target);
    if (fileStat) {
      await serveFile(req, res, target, fileStat, path, isHead, page);
      return true;
    }

    // Not a file: a client route (no extension) gets the SPA shell; a missing file
    // with an extension (or under /assets/) is a real 404, never a 200 HTML page.
    const isAsset = path.startsWith('/assets/');
    const hasExtension = extname(path) !== '';
    if (!isAsset && !hasExtension) {
      if (opts.spaFallback === false) return false;
      const indexPath = join(root, 'index.html');
      const indexStat = await statFile(indexPath);
      if (!indexStat) return false;
      await serveFile(req, res, indexPath, indexStat, '/index.html', isHead, page);
      return true;
    }

    res.statusCode = 404;
    setCommonHeaders(res);
    res.setHeader('content-type', 'text/plain; charset=utf-8');
    res.setHeader('cache-control', NO_CACHE);
    res.end(isHead ? undefined : 'Not found');
    return true;
  };
}

interface FileInfo {
  size: number;
  mtimeMs: number;
}

async function statFile(path: string): Promise<FileInfo | undefined> {
  try {
    const info = await stat(path);
    return info.isFile() ? { size: info.size, mtimeMs: info.mtimeMs } : undefined;
  } catch {
    return undefined;
  }
}

type PageLoader = (
  filePath: string,
  size: number,
  mtimeMs: number,
  /* Read this precompressed file's bytes instead of the page's own (the headers stay the page's). */
  variantPath?: string,
) => Promise<{ body: Buffer; headers: Record<string, string> }>;

interface Variant {
  encoding: Encoding;
  path: string;
  size: number;
}

/* The precompressed file this client should get, or undefined to send the file itself. The best
   accepted encoding is tried first; if its file is missing (or older than the file it was made
   from), the next accepted one is. */
async function pickVariant(
  req: IncomingMessage,
  filePath: string,
  { mtimeMs }: FileInfo,
): Promise<Variant | undefined> {
  const header = req.headers['accept-encoding'];
  const offered: Encoding[] = ['br', 'gzip'];
  while (offered.length > 0) {
    const encoding = negotiateEncoding(header, offered);
    if (!encoding) return undefined;
    const path = filePath + VARIANT_SUFFIX[encoding];
    const info = await statFile(path);
    if (info && info.mtimeMs >= mtimeMs) return { encoding, path, size: info.size };
    offered.splice(offered.indexOf(encoding), 1);
  }
  return undefined;
}

async function serveFile(
  req: IncomingMessage,
  res: ServerResponse,
  filePath: string,
  info: FileInfo,
  urlPath: string,
  isHead: boolean,
  loadPage: PageLoader,
): Promise<void> {
  const { size, mtimeMs } = info;
  const ext = extname(filePath).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
  // a file the build compresses: its answer depends on Accept-Encoding even when sent as it is
  const negotiated = COMPRESSIBLE_EXTS.has(ext) && size >= MIN_COMPRESS_BYTES;
  const variant = negotiated ? await pickVariant(req, filePath, info) : undefined;
  const stamp = `${size.toString(16)}-${Math.floor(mtimeMs).toString(16)}`;
  const etag = `"${stamp}${variant ? `-${variant.encoding}` : ''}"`;

  setCommonHeaders(res);
  res.setHeader('cache-control', urlPath.startsWith('/assets/') ? IMMUTABLE_CACHE : NO_CACHE);
  res.setHeader('etag', etag);
  if (negotiated) res.setHeader('vary', addVary(undefined, 'Accept-Encoding'));

  if (etagMatches(req.headers['if-none-match'], etag)) {
    res.statusCode = 304;
    res.end();
    return;
  }

  res.statusCode = 200;
  res.setHeader('content-type', contentType);
  if (variant) res.setHeader('content-encoding', variant.encoding);
  if (ext === '.html') {
    // The page is read whole (it is a few KB) so its inline script can be hashed into the CSP.
    let loaded: Awaited<ReturnType<PageLoader>>;
    try {
      loaded = await loadPage(filePath, size, mtimeMs, variant?.path);
    } catch {
      res.statusCode = 500;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.setHeader('cache-control', NO_CACHE);
      for (const name of ['content-encoding', 'etag', 'vary']) res.removeHeader(name);
      res.end('Server error');
      return;
    }
    for (const [name, value] of Object.entries(loaded.headers)) res.setHeader(name, value);
    res.setHeader('content-length', String(loaded.body.length));
    res.end(isHead ? undefined : loaded.body);
    return;
  }

  res.setHeader('content-length', String(variant ? variant.size : size));
  if (isHead) {
    res.end();
    return;
  }
  const stream = createReadStream(variant ? variant.path : filePath);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

function setCommonHeaders(res: ServerResponse): void {
  res.setHeader('x-content-type-options', 'nosniff');
}

function reject(res: ServerResponse, status: 400): true {
  res.statusCode = status;
  setCommonHeaders(res);
  res.setHeader('content-type', 'text/plain; charset=utf-8');
  res.setHeader('cache-control', NO_CACHE);
  res.end('Bad request');
  return true;
}
