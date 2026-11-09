import { randomBytes, randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname } from 'node:path';
import { type Transform, Writable } from 'node:stream';
import { constants, createBrotliCompress, createGzip } from 'node:zlib';
import { errorFields, type Logger } from '../log/logger.ts';
import { acceptedEncoding, addVary, type Encoding } from './encoding.ts';
import { createInternalGet, type InternalGet } from './internal.ts';
import { inlineScriptHashes, securityHeaders } from './security-headers.ts';
import type { ApiDeps, Principal } from './types.ts';

/* Server rendering: answers a page request with the app already drawn, streamed.

   The app's own code (src/: the route table, React) is NOT imported here (ENGINEERING §2: the
   server never imports client code). It is loaded through a `SsrSource` - the built
   dist/server/entry-server.js in production, Vite's ssrLoadModule in development - and spoken to
   through the small `SsrModule` interface below, which entry-server.tsx implements.

   One page request:
     1. who is signed in: the session cookie, once;
     2. in process, through the API's own router (internal.ts): /auth/me, then, for a signed-in
        person, /settings and the GET calls the page makes on its first render (`prefetchPaths`);
     3. the HTTP status and a redirect, from the same route table;
     4. the HTML shell (the built index.html) with <html> carrying the reader's theme from the
        `ui-theme` cookie, the answers embedded as JSON, and the app's markup streamed in between.
   The page is per person, so it is `Cache-Control: private, no-store`. It is compressed on the way
   out (Brotli, else gzip, as the client's Accept-Encoding allows) through a stream that flushes
   after every chunk, so each part still reaches the browser as soon as React has written it. */

/** What src/entry-server.tsx exports (the part the server uses). */
export interface SsrModule {
  prefetchPaths(url: string, viewer: { role: string } | null): string[];
  statusFor(
    url: string,
    viewer: { role: string } | null,
    settings: { maintenance: boolean },
  ): number;
  redirectFor(url: string): string | null;
  titleFor(url: string, viewer: { role: string } | null): string;
  htmlAttributes(cookie: string | undefined): Record<string, string>;
  /** The state the page starts from, and is sent in the page (src/initial-state.ts). Opaque here. */
  initialState(cookie: string | undefined, queries: Record<string, unknown>, now: string): unknown;
  render(input: {
    url: string;
    state: unknown;
    /** CSP nonce for the inline scripts React streams in with each finished section. */
    nonce?: string;
  }): Promise<{ pipe(out: Writable): void; abort(): void }>;
}

export interface SsrLoaded {
  module: SsrModule;
  /** index.html: the built one, or Vite's transform of the source one in development. */
  template: string;
}

export interface SsrSource {
  /** Loads (or re-loads, in development) the module and the page template. */
  load(url: string): Promise<SsrLoaded>;
  /** Development only: maps a stack trace back to source. */
  fixStacktrace?(error: Error): void;
}

export interface SsrOptions {
  source: SsrSource;
  /** The API's routes, for the in-process calls. */
  api: Pick<ApiDeps, 'routes' | 'settings' | 'gate' | 'authenticate'>;
  log: Logger;
  /** Development: Vite's own inline scripts are in the page, so no script policy is sent. */
  dev?: boolean;
  /** Send Strict-Transport-Security (the host is behind TLS). */
  hsts?: boolean;
}

/** The most API calls one page may ask for ahead of the browser. */
const MAX_PREFETCH = 8;
/** A section of the page that has not arrived by now is left to the browser. */
const RENDER_TIMEOUT_MS = 10_000;

/* JSON for a <script type="application/json"> block. `<` (so `</script>` and `<!--` cannot end or
   open anything), `>` and `&`, and the two line separators JavaScript source forbids, are written
   as \u escapes: the text is still valid JSON and means the same, and no value can break out. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll('<', '\\u003c')
    .replaceAll('>', '\\u003e')
    .replaceAll('&', '\\u0026')
    .replaceAll(' ', '\\u2028')
    .replaceAll(' ', '\\u2029');
}

/* A compressor that passes every chunk on the moment it is written: a plain one holds output back
   until it has a block's worth, which would put the whole streamed page behind the slowest section.
   Quality 4 for Brotli is gzip's speed with a better ratio (the same as encoding.ts's JSON). */
function flushingCompressor(encoding: Encoding): Transform {
  return encoding === 'br'
    ? createBrotliCompress({
        flush: constants.BROTLI_OPERATION_FLUSH,
        params: { [constants.BROTLI_PARAM_QUALITY]: 4 },
      })
    : createGzip({ level: 6, flush: constants.Z_SYNC_FLUSH });
}

const escapeHtml = (text: string) =>
  text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

/** The id src/initial-state.ts reads the embedded state by. */
const STATE_ID = '__INITIAL_DATA__';
const STATE_MARK = '<!--app-state-->';
const HTML_MARK = '<!--app-html-->';

interface Shell {
  before: string;
  middle: string;
  after: string;
}

/* index.html cut at its two markers. A template without them cannot be server-rendered. */
function cut(template: string): Shell | null {
  const s = template.indexOf(STATE_MARK);
  const h = template.indexOf(HTML_MARK);
  if (s === -1 || h === -1 || h < s) return null;
  return {
    before: template.slice(0, s),
    middle: template.slice(s + STATE_MARK.length, h),
    after: template.slice(h + HTML_MARK.length),
  };
}

function withAttributes(before: string, attrs: Record<string, string>, title: string): string {
  const html = Object.entries(attrs)
    .map(([name, value]) => ` ${name}="${escapeHtml(value)}"`)
    .join('');
  return before
    .replace(/<html\b/i, `<html${html}`)
    .replace(/<title>[\s\S]*?<\/title>/i, () => `<title>${escapeHtml(title)}</title>`);
}

function plain(res: ServerResponse, status: number, text: string): void {
  if (res.headersSent) {
    if (!res.writableEnded) res.end();
    return;
  }
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

/* Returns a handler like the static one: true when it wrote a response, false when the request is
   not a page (the caller goes on). */
export function createSsrHandler(
  opts: SsrOptions,
): (req: IncomingMessage, res: ServerResponse) => Promise<boolean> {
  const hashes = new Map<string, readonly string[]>();
  const hashesOf = (template: string) => {
    let known = hashes.get(template);
    if (!known) {
      known = inlineScriptHashes(template);
      hashes.clear();
      hashes.set(template, known);
    }
    return known;
  };

  return async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    const target = req.url ?? '/';
    if (!target.startsWith('/') || target.startsWith('//')) return false;
    let url: URL;
    try {
      url = new URL(target, 'http://localhost');
      decodeURIComponent(url.pathname);
    } catch {
      plain(res, 400, 'Bad request');
      return true;
    }
    if (url.pathname.includes('\0') || url.pathname.includes('\\')) {
      plain(res, 400, 'Bad request');
      return true;
    }
    // A file (a missing asset, robots.txt) is not a page: the static handler's 404 stands.
    if (url.pathname.startsWith('/assets/') || extname(url.pathname) !== '') return false;
    const address = `${url.pathname}${url.search}`;
    const requestId = String(res.getHeader('x-request-id') ?? randomUUID());
    const log = opts.log.child({ requestId });

    try {
      const { module, template } = await opts.source.load(address);
      const shell = cut(template);
      if (!shell) throw new Error('index.html has no <!--app-state--> / <!--app-html--> markers.');

      // 1. who is signed in (once), and the API as that person
      const cookie = req.headers.cookie;
      const principal: Principal | null = await opts.api.authenticate(cookie);
      const get: InternalGet = createInternalGet(opts.api, req, principal, {
        requestId,
        log,
        startedAt: Date.now(),
      });
      const queries: Record<string, unknown> = {};
      const answer = async (path: string): Promise<unknown> => {
        const { status, body } = await get(`/api${path}`);
        // an error answer is the browser's to meet (and retry) for itself, with its own state
        if (status === 200 && body !== undefined) queries[path] = body;
        return body;
      };
      await answer('/auth/me');
      const viewer = principal ? { role: principal.role } : null;

      // 2. the settings and the first screen's data, answered together
      let maintenance = false;
      if (viewer) {
        const paths = module
          .prefetchPaths(address, viewer)
          .filter((p) => p.startsWith('/') && !p.includes('..') && !p.startsWith('/events'))
          .slice(0, MAX_PREFETCH);
        const [settings] = await Promise.all([answer('/settings'), ...paths.map(answer)]);
        const values = (settings as { settings?: Record<string, unknown> } | undefined)?.settings;
        maintenance = values?.['maintenance.enabled'] === true;
      }

      // 3. the status, or a redirect
      const redirect = viewer ? module.redirectFor(address) : null;
      if (redirect) {
        res.writeHead(302, { location: redirect, 'cache-control': 'private, no-store' });
        res.end();
        return true;
      }
      const status = module.statusFor(address, viewer, { maintenance });

      // React streams each finished section in with a small inline script: a fresh nonce lets
      // exactly those run (the policy's hash covers index.html's own inline script).
      const nonce = opts.dev ? undefined : randomBytes(16).toString('base64');
      const encoding = acceptedEncoding(req);
      const headers: Record<string, string | number> = {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'private, no-store',
        vary: addVary('Cookie', 'Accept-Encoding'),
        ...(opts.dev
          ? { 'x-content-type-options': 'nosniff' }
          : securityHeaders({
              scriptHashes: [...hashesOf(template), ...(nonce ? [`'nonce-${nonce}'`] : [])],
              ...(opts.hsts ? { hsts: true } : {}),
            })),
        ...(status === 503 ? { 'retry-after': '60' } : {}),
        ...(encoding ? { 'content-encoding': encoding } : {}),
      };

      if (req.method === 'HEAD') {
        res.writeHead(status, headers);
        res.end();
        return true;
      }

      // 4. the page: the shell, the data it was drawn from, then the app's markup as it streams
      const state = module.initialState(cookie, queries, new Date().toISOString());
      const rendered = await module.render({ url: address, state, ...(nonce ? { nonce } : {}) });
      res.writeHead(status, headers);
      // everything below is written to `out`: the response itself, or the compressor in front of it
      let out: Writable = res;
      if (encoding) {
        const compressor = flushingCompressor(encoding);
        compressor.on('error', () => res.destroy());
        res.once('close', () => compressor.destroy());
        compressor.pipe(res);
        out = compressor;
      }
      out.write(
        withAttributes(
          shell.before,
          module.htmlAttributes(cookie),
          module.titleFor(address, viewer),
        ) +
          `<script type="application/json" id="${STATE_ID}">${embedJson(state)}</script>` +
          shell.middle,
      );

      let finished = false;
      const timer = setTimeout(() => rendered.abort(), RENDER_TIMEOUT_MS);
      timer.unref();
      res.once('close', () => {
        clearTimeout(timer);
        if (!finished) rendered.abort(); // the reader left: stop rendering for nobody
      });
      const sink = new Writable({
        write(chunk: Buffer, _encoding, done) {
          if (out.write(chunk)) done();
          else out.once('drain', () => done());
        },
        final(done) {
          finished = true;
          clearTimeout(timer);
          out.end(shell.after, () => done());
        },
      });
      rendered.pipe(sink);
      return true;
    } catch (err) {
      if (err instanceof Error) opts.source.fixStacktrace?.(err);
      log.error('page render failed', errorFields(err));
      plain(res, 500, 'Something went wrong on the server.');
      return true;
    }
  };
}
