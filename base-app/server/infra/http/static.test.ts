import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { contentSecurityPolicy, inlineScriptHashes } from './security-headers.ts';
import { createStaticHandler } from './static.ts';

/* Requests go over a real socket with the raw request-target, so no URL
   normalisation runs before the handler: '/../x' and '%2e%2e' reach it intact.
   A request the handler declines (returns false) gets a 599 marker. */

interface Reply {
  status: number;
  headers: IncomingMessage['headers'];
  body: string;
}

const INDEX_HTML = '<!doctype html><title>app</title><div id="root"></div>';
const JS = 'console.log("app");';
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"></svg>';
const SECRET = 'TOP-SECRET-OUTSIDE-ROOT';

let base: string;
let root: string;
let emptyRoot: string;
let server: Server;
let port: number;

async function send(
  method: string,
  path: string,
  headers: Record<string, string> = {},
): Promise<Reply> {
  return new Promise((resolveReply, rejectReply) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () =>
        resolveReply({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }),
      );
    });
    req.on('error', rejectReply);
    req.end();
  });
}

function startServer(serveRoot: string): Promise<Server> {
  const handler = createStaticHandler({ root: serveRoot });
  const srv = createServer(async (req, res) => {
    const handled = await handler(req, res);
    if (!handled) {
      res.statusCode = 599;
      res.end('declined');
    }
  });
  return new Promise((resolveServer) => {
    srv.listen(0, '127.0.0.1', () => resolveServer(srv));
  });
}

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'static-test-'));
  root = join(base, 'dist');
  emptyRoot = join(base, 'empty');
  await mkdir(join(root, 'assets'), { recursive: true });
  await mkdir(emptyRoot, { recursive: true });
  await writeFile(join(root, 'index.html'), INDEX_HTML);
  await writeFile(join(root, 'assets', 'app-abc123.js'), JS);
  await writeFile(join(root, 'favicon.svg'), SVG);
  // A file just outside the served root, to prove traversal never reaches it.
  await writeFile(join(base, 'secret.txt'), SECRET);
  server = await startServer(root);
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  await rm(base, { recursive: true, force: true });
});

describe('createStaticHandler: serving files', () => {
  it('serves index.html at / with html type, no-cache and the security headers', async () => {
    const res = await send('GET', '/');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['content-security-policy']).toBe(
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
    );
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['permissions-policy']).toBe(
      'camera=(self), geolocation=(self), microphone=()',
    );
    // plain http (development, tests): no HSTS
    expect(res.headers['strict-transport-security']).toBeUndefined();
    expect(res.body).toBe(INDEX_HTML);
  });

  it('lets blob: images through the policy: the preview of the photo just taken', async () => {
    const res = await send('GET', '/');
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain('manifest-src');
  });

  it('serves hashed /assets/ files as immutable JavaScript', async () => {
    const res = await send('GET', '/assets/app-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['content-length']).toBe(String(Buffer.byteLength(JS)));
    expect(res.headers['content-security-policy']).toBeUndefined();
    expect(res.body).toBe(JS);
  });

  it('serves a root-level svg with no-cache and the svg type', async () => {
    const res = await send('GET', '/favicon.svg');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/svg+xml');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body).toBe(SVG);
  });

  it('ignores the query string when resolving the file', async () => {
    const res = await send('GET', '/assets/app-abc123.js?v=2');
    expect(res.status).toBe(200);
    expect(res.body).toBe(JS);
  });

  it('maps the other extensions to their types', async () => {
    const types: Record<string, string> = {
      css: 'text/css; charset=utf-8',
      mjs: 'text/javascript; charset=utf-8',
      png: 'image/png',
      jpg: 'image/jpeg',
      webp: 'image/webp',
      ico: 'image/x-icon',
      json: 'application/json; charset=utf-8',
      woff2: 'font/woff2',
      txt: 'text/plain; charset=utf-8',
      map: 'application/json; charset=utf-8',
    };
    for (const ext of Object.keys(types)) {
      await writeFile(join(root, `probe.${ext}`), 'x');
    }
    for (const [ext, type] of Object.entries(types)) {
      const res = await send('GET', `/probe.${ext}`);
      expect(res.headers['content-type']).toBe(type);
    }
  });
});

describe('createStaticHandler: the inline script and HSTS', () => {
  const SCRIPT = "(() => { document.documentElement.dataset.theme = 'dark'; })();";
  const PAGE = `<!doctype html><html><head><script>${SCRIPT}</script></head><body><script type="module" src="/assets/app.js"></script></body></html>`;

  async function serveOnce(html: string, hsts: boolean): Promise<Reply> {
    const dir = await mkdtemp(join(tmpdir(), 'static-csp-'));
    await writeFile(join(dir, 'index.html'), html);
    const handler = createStaticHandler({ root: dir, hsts });
    const srv = createServer(async (req, res) => {
      if (!(await handler(req, res))) res.end('declined');
    });
    await new Promise<void>((done) => srv.listen(0, '127.0.0.1', () => done()));
    const { port: p } = srv.address() as AddressInfo;
    const reply = await new Promise<Reply>((resolveReply, rejectReply) => {
      const req = request({ host: '127.0.0.1', port: p, path: '/' }, (r) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () =>
          resolveReply({
            status: r.statusCode ?? 0,
            headers: r.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      });
      req.on('error', rejectReply);
      req.end();
    });
    await new Promise<void>((done) => srv.close(() => done()));
    await rm(dir, { recursive: true, force: true });
    return reply;
  }

  it('puts the sha256 of the inline script (and only that) in script-src', async () => {
    const res = await serveOnce(PAGE, false);
    const hashes = inlineScriptHashes(PAGE);
    expect(hashes).toHaveLength(1); // the module script has a src: it is not inline
    expect(res.headers['content-security-policy']).toBe(contentSecurityPolicy(hashes));
    expect(String(res.headers['content-security-policy'])).toContain(
      `script-src 'self' ${hashes[0]};`,
    );
    expect(res.body).toBe(PAGE);
    expect(res.headers['content-length']).toBe(String(Buffer.byteLength(PAGE)));
  });

  it('hashes the exact bytes between the tags (a changed script changes the policy)', () => {
    const a = inlineScriptHashes('<script>a()</script>');
    const b = inlineScriptHashes('<script>a() </script>');
    expect(a).not.toEqual(b);
    expect(inlineScriptHashes('<script src="/x.js"></script>')).toEqual([]);
  });

  it('sends Strict-Transport-Security only when asked (the host is behind TLS)', async () => {
    expect((await serveOnce(PAGE, true)).headers['strict-transport-security']).toBe(
      'max-age=31536000',
    );
    expect((await serveOnce(PAGE, false)).headers['strict-transport-security']).toBeUndefined();
  });
});

describe('createStaticHandler: SPA fallback', () => {
  it('serves index.html for client routes that accept html', async () => {
    for (const path of ['/table', '/admin/users']) {
      const res = await send('GET', path, { accept: 'text/html,application/xhtml+xml' });
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.body).toBe(INDEX_HTML);
    }
  });

  it('serves index.html for an extensionless path even without an accept header', async () => {
    const res = await send('GET', '/admin/users');
    expect(res.status).toBe(200);
    expect(res.body).toBe(INDEX_HTML);
  });

  it('404s a missing file that has an extension', async () => {
    const res = await send('GET', '/missing.js');
    expect(res.status).toBe(404);
    expect(res.body).not.toContain('<title>app</title>');
  });

  it('404s a missing hashed asset rather than returning index.html', async () => {
    const res = await send('GET', '/assets/gone-zzz999.js', { accept: 'text/html' });
    expect(res.status).toBe(404);
  });

  it('declines (returns false) when there is no index.html to fall back to', async () => {
    const handler = createStaticHandler({ root: emptyRoot });
    const declining = createServer(async (req, res) => {
      const handled = await handler(req, res);
      if (!handled) {
        res.statusCode = 599;
        res.end('declined');
      }
    });
    await new Promise<void>((done) => declining.listen(0, '127.0.0.1', () => done()));
    const declinePort = (declining.address() as AddressInfo).port;
    const res = await new Promise<Reply>((resolveReply, rejectReply) => {
      const req = request({ host: '127.0.0.1', port: declinePort, path: '/table' }, (r) => {
        const chunks: Buffer[] = [];
        r.on('data', (chunk: Buffer) => chunks.push(chunk));
        r.on('end', () =>
          resolveReply({
            status: r.statusCode ?? 0,
            headers: r.headers,
            body: Buffer.concat(chunks).toString(),
          }),
        );
      });
      req.on('error', rejectReply);
      req.end();
    });
    await new Promise<void>((done) => declining.close(() => done()));
    expect(res.status).toBe(599);
  });
});

describe('createStaticHandler: path safety', () => {
  it('rejects a raw ../ traversal with 400 and never returns the outside file', async () => {
    const res = await send('GET', '/../secret.txt');
    expect(res.status).toBe(400);
    expect(res.body).not.toContain(SECRET);
  });

  it('rejects an encoded %2e%2e traversal with 400', async () => {
    const res = await send('GET', '/%2e%2e/secret.txt');
    expect(res.status).toBe(400);
    expect(res.body).not.toContain(SECRET);
  });

  it('rejects an encoded slash traversal with 400', async () => {
    for (const path of [
      '/..%2fsecret.txt',
      '/%2e%2e%2fsecret.txt',
      '/assets/..%2F..%2Fsecret.txt',
    ]) {
      const res = await send('GET', path);
      expect(res.status).toBe(400);
      expect(res.body).not.toContain(SECRET);
    }
  });

  it('rejects a NUL byte with 400', async () => {
    const res = await send('GET', '/assets/app%00.js');
    expect(res.status).toBe(400);
  });

  it('rejects a malformed percent-encoding with 400', async () => {
    const res = await send('GET', '/%E0%A4%A');
    expect(res.status).toBe(400);
  });
});

describe('createStaticHandler: API and methods', () => {
  it('declines /api and /api/* so the API router answers', async () => {
    for (const path of ['/api', '/api/health', '/api/db/ping']) {
      const res = await send('GET', path);
      expect(res.status).toBe(599);
    }
  });

  it('declines methods other than GET and HEAD', async () => {
    const res = await send('POST', '/');
    expect(res.status).toBe(599);
  });

  it('answers HEAD with headers and no body', async () => {
    const res = await send('HEAD', '/assets/app-abc123.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['content-length']).toBe(String(Buffer.byteLength(JS)));
    expect(res.body).toBe('');
  });

  it('answers HEAD for the index with the html headers and no body', async () => {
    const res = await send('HEAD', '/table', { accept: 'text/html' });
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.body).toBe('');
  });
});
