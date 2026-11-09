import { mkdir, mkdtemp, rm, utimes, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliCompressSync, brotliDecompressSync, gunzipSync, gzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createStaticHandler } from './static.ts';

/* Precompressed files (.br / .gz beside the file, as scripts/precompress.ts writes them), over a
   real socket. */

interface Reply {
  status: number;
  headers: IncomingMessage['headers'];
  body: Buffer;
}

const BIG_JS = `console.log(${JSON.stringify('x'.repeat(4000))});`;
const SMALL_JS = 'console.log(1);';
const BIG_HTML = `<!doctype html><title>app</title><div id="root"></div><!-- ${'p'.repeat(3000)} -->`;
const BIG_CSS = `body{color:red}${'.a{margin:0}'.repeat(300)}`;

let base: string;
let server: Server;
let port: number;

async function get(
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
          body: Buffer.concat(chunks),
        }),
      );
    });
    req.on('error', rejectReply);
    req.end();
  });
}

const br = (text: string) => brotliCompressSync(Buffer.from(text));
const gz = (text: string) => gzipSync(Buffer.from(text));

beforeAll(async () => {
  base = await mkdtemp(join(tmpdir(), 'static-enc-'));
  const assets = join(base, 'assets');
  await mkdir(assets, { recursive: true });
  // both variants
  await writeFile(join(assets, 'both-1.js'), BIG_JS);
  await writeFile(join(assets, 'both-1.js.br'), br(BIG_JS));
  await writeFile(join(assets, 'both-1.js.gz'), gz(BIG_JS));
  // gzip only: the .br is missing
  await writeFile(join(assets, 'gzonly-1.js'), BIG_JS);
  await writeFile(join(assets, 'gzonly-1.js.gz'), gz(BIG_JS));
  // neither
  await writeFile(join(assets, 'plain-1.js'), BIG_JS);
  // under 1 kB: never negotiated, even if a variant exists
  await writeFile(join(assets, 'small-1.js'), SMALL_JS);
  await writeFile(join(assets, 'small-1.js.br'), br(SMALL_JS));
  // a stale .br (older than its source) next to a fresh .gz
  await writeFile(join(assets, 'stale-1.js'), BIG_JS);
  await writeFile(join(assets, 'stale-1.js.br'), br('console.log("OLD BUILD");'));
  await utimes(join(assets, 'stale-1.js.br'), new Date(2020, 0, 1), new Date(2020, 0, 1));
  await writeFile(join(assets, 'stale-1.js.gz'), gz(BIG_JS));
  await writeFile(join(assets, 'style-1.css'), BIG_CSS);
  await writeFile(join(assets, 'style-1.css.br'), br(BIG_CSS));
  // an image with a stray .br: not a compressible type, so never negotiated
  await writeFile(join(assets, 'logo-1.png'), Buffer.alloc(2000, 7));
  await writeFile(join(assets, 'logo-1.png.br'), br('not a png'));
  // the page, with its variants
  await writeFile(join(base, 'index.html'), BIG_HTML);
  await writeFile(join(base, 'index.html.br'), br(BIG_HTML));
  await writeFile(join(base, 'index.html.gz'), gz(BIG_HTML));
  const handler = createStaticHandler({ root: base });
  server = createServer(async (req, res) => {
    if (!(await handler(req, res))) {
      res.statusCode = 599;
      res.end('declined');
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
  await rm(base, { recursive: true, force: true });
});

describe('static compression: negotiation', () => {
  it('serves Brotli to a client that accepts it', async () => {
    const res = await get('GET', '/assets/both-1.js', { 'accept-encoding': 'gzip, deflate, br' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('br');
    expect(res.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(res.headers['content-length']).toBe(String(res.body.length));
    expect(brotliDecompressSync(res.body).toString()).toBe(BIG_JS);
  });

  it('serves gzip to a client that does not accept Brotli', async () => {
    const res = await get('GET', '/assets/both-1.js', { 'accept-encoding': 'gzip, deflate' });
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(res.body).toString()).toBe(BIG_JS);
  });

  it('follows q-values: gzip first when the client weights it higher', async () => {
    const res = await get('GET', '/assets/both-1.js', {
      'accept-encoding': 'br;q=0.2, gzip;q=0.9',
    });
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('never sends an encoding the client turned off with q=0', async () => {
    const res = await get('GET', '/assets/both-1.js', { 'accept-encoding': 'br;q=0, gzip' });
    expect(res.headers['content-encoding']).toBe('gzip');
    const none = await get('GET', '/assets/both-1.js', { 'accept-encoding': 'br;q=0, gzip;q=0' });
    expect(none.headers['content-encoding']).toBeUndefined();
    expect(none.body.toString()).toBe(BIG_JS);
  });

  it('sends the file itself to a client with no Accept-Encoding, and still says Vary', async () => {
    const res = await get('GET', '/assets/both-1.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers.vary).toBe('Accept-Encoding');
    expect(res.headers['content-length']).toBe(String(Buffer.byteLength(BIG_JS)));
    expect(res.body.toString()).toBe(BIG_JS);
  });

  it('sends the file itself for Accept-Encoding: identity', async () => {
    const res = await get('GET', '/assets/both-1.js', { 'accept-encoding': 'identity' });
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body.toString()).toBe(BIG_JS);
  });

  it('falls back to gzip when the file has no .br', async () => {
    const res = await get('GET', '/assets/gzonly-1.js', { 'accept-encoding': 'br, gzip' });
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(res.body).toString()).toBe(BIG_JS);
  });

  it('falls back to the file itself when it has no variants at all', async () => {
    const res = await get('GET', '/assets/plain-1.js', { 'accept-encoding': 'br, gzip' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers.vary).toBe('Accept-Encoding');
    expect(res.body.toString()).toBe(BIG_JS);
  });

  it('does not serve a variant older than its source (a stale build)', async () => {
    const res = await get('GET', '/assets/stale-1.js', { 'accept-encoding': 'br, gzip' });
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(res.body).toString()).toBe(BIG_JS);
    const onlyBr = await get('GET', '/assets/stale-1.js', { 'accept-encoding': 'br' });
    expect(onlyBr.headers['content-encoding']).toBeUndefined();
    expect(onlyBr.body.toString()).toBe(BIG_JS);
  });

  it('leaves a file under 1 kB alone: no Vary, no encoding', async () => {
    const res = await get('GET', '/assets/small-1.js', { 'accept-encoding': 'br' });
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers.vary).toBeUndefined();
    expect(res.body.toString()).toBe(SMALL_JS);
  });

  it('leaves types that are not compressed alone (a png with a stray .br)', async () => {
    const res = await get('GET', '/assets/logo-1.png', { 'accept-encoding': 'br' });
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers.vary).toBeUndefined();
    expect(res.body.equals(Buffer.alloc(2000, 7))).toBe(true);
  });

  it('keeps the type, the immutable cache and nosniff on a compressed asset', async () => {
    const res = await get('GET', '/assets/style-1.css', { 'accept-encoding': 'br' });
    expect(res.headers['content-type']).toBe('text/css; charset=utf-8');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers.vary).toBe('Accept-Encoding');
  });

  it('serves a missing compressed file as the usual 404', async () => {
    const res = await get('GET', '/assets/nope-1.js', { 'accept-encoding': 'br' });
    expect(res.status).toBe(404);
    expect(res.headers['content-encoding']).toBeUndefined();
  });
});

describe('static compression: HEAD and validators', () => {
  it('answers HEAD with the headers of the compressed GET and no body', async () => {
    const getRes = await get('GET', '/assets/both-1.js', { 'accept-encoding': 'br' });
    const head = await get('HEAD', '/assets/both-1.js', { 'accept-encoding': 'br' });
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
    expect(head.headers['content-encoding']).toBe('br');
    expect(head.headers['content-length']).toBe(getRes.headers['content-length']);
    expect(head.headers.etag).toBe(getRes.headers.etag);
    expect(head.headers.vary).toBe('Accept-Encoding');
  });

  it('answers HEAD for the identity file with the file size', async () => {
    const head = await get('HEAD', '/assets/both-1.js');
    expect(head.headers['content-encoding']).toBeUndefined();
    expect(head.headers['content-length']).toBe(String(Buffer.byteLength(BIG_JS)));
    expect(head.body.length).toBe(0);
  });

  it('gives each encoding its own ETag', async () => {
    const tags = new Set<string | undefined>();
    for (const enc of ['br', 'gzip', undefined]) {
      const res = await get('GET', '/assets/both-1.js', enc ? { 'accept-encoding': enc } : {});
      tags.add(res.headers.etag);
    }
    expect(tags.size).toBe(3);
    for (const tag of tags) expect(tag).toMatch(/^"[0-9a-f]+-[0-9a-f]+(-br|-gzip)?"$/);
  });

  it('answers a matching If-None-Match with a 304 and no body, still with Vary', async () => {
    const first = await get('GET', '/assets/both-1.js', { 'accept-encoding': 'br' });
    const etag = String(first.headers.etag);
    const again = await get('GET', '/assets/both-1.js', {
      'accept-encoding': 'br',
      'if-none-match': etag,
    });
    expect(again.status).toBe(304);
    expect(again.body.length).toBe(0);
    expect(again.headers.etag).toBe(etag);
    expect(again.headers.vary).toBe('Accept-Encoding');
    expect(again.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('does not answer 304 with a tag from another encoding', async () => {
    const gzipTag = String(
      (await get('GET', '/assets/both-1.js', { 'accept-encoding': 'gzip' })).headers.etag,
    );
    const res = await get('GET', '/assets/both-1.js', {
      'accept-encoding': 'br',
      'if-none-match': gzipTag,
    });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('br');
  });
});

describe('static compression: the page', () => {
  it('serves index.html compressed, with the security headers of the page', async () => {
    const res = await get('GET', '/', { 'accept-encoding': 'br, gzip' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('br');
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.headers['content-security-policy']).toContain("script-src 'self'");
    expect(res.headers.vary).toBe('Accept-Encoding');
    expect(res.headers['content-length']).toBe(String(res.body.length));
    expect(brotliDecompressSync(res.body).toString()).toBe(BIG_HTML);
  });

  it('serves the same page as gzip, and as itself, to other clients', async () => {
    const zipped = await get('GET', '/', { 'accept-encoding': 'gzip' });
    expect(zipped.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(zipped.body).toString()).toBe(BIG_HTML);
    const plain = await get('GET', '/');
    expect(plain.headers['content-encoding']).toBeUndefined();
    expect(plain.body.toString()).toBe(BIG_HTML);
    expect(plain.headers['content-security-policy']).toBe(
      zipped.headers['content-security-policy'],
    );
  });

  it('gives a client route the compressed shell too', async () => {
    const res = await get('GET', '/table', { 'accept-encoding': 'br' });
    expect(res.headers['content-encoding']).toBe('br');
    expect(brotliDecompressSync(res.body).toString()).toBe(BIG_HTML);
  });

  it('revalidates the page with its ETag', async () => {
    const first = await get('GET', '/', { 'accept-encoding': 'br' });
    const again = await get('GET', '/', {
      'accept-encoding': 'br',
      'if-none-match': String(first.headers.etag),
    });
    expect(again.status).toBe(304);
    expect(again.headers['cache-control']).toBe('no-cache');
  });

  it('answers HEAD for the page without a body', async () => {
    const head = await get('HEAD', '/', { 'accept-encoding': 'br' });
    expect(head.status).toBe(200);
    expect(head.body.length).toBe(0);
    expect(head.headers['content-encoding']).toBe('br');
    expect(Number(head.headers['content-length'])).toBeGreaterThan(0);
  });
});

/* Under server rendering (server/app.ts) the static handler runs with spaFallback:false: an
   address that is not a file is the SSR handler's, so the handler declines it, while every built
   file, compressed, is still served. */
describe('static compression with the page left to the server render', () => {
  let ssrServer: Server;
  let ssrPort: number;

  beforeAll(async () => {
    const handler = createStaticHandler({ root: base, spaFallback: false });
    ssrServer = createServer(async (req, res) => {
      if (!(await handler(req, res))) {
        res.statusCode = 599;
        res.end('declined');
      }
    });
    await new Promise<void>((r) => ssrServer.listen(0, '127.0.0.1', r));
    ssrPort = (ssrServer.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((done) => ssrServer.close(() => done()));
  });

  const ask = (path: string, headers: Record<string, string> = {}) =>
    new Promise<Reply>((resolveReply, rejectReply) => {
      const req = request({ host: '127.0.0.1', port: ssrPort, path, headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () =>
          resolveReply({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks),
          }),
        );
      });
      req.on('error', rejectReply);
      req.end();
    });

  it('still serves the .br and .gz of a built asset', async () => {
    const zipped = await ask('/assets/both-1.js', { 'accept-encoding': 'br, gzip' });
    expect(zipped.status).toBe(200);
    expect(zipped.headers['content-encoding']).toBe('br');
    expect(brotliDecompressSync(zipped.body).toString()).toBe(BIG_JS);
    const gzipped = await ask('/assets/both-1.js', { 'accept-encoding': 'gzip' });
    expect(gzipped.headers['content-encoding']).toBe('gzip');
  });

  it('declines a page address (to the server render) and a directory', async () => {
    expect((await ask('/table', { 'accept-encoding': 'br' })).status).toBe(599);
    expect((await ask('/', { 'accept-encoding': 'br' })).status).toBe(599);
  });

  it('still answers a missing asset with a 404, never a page', async () => {
    expect((await ask('/assets/none-1.js')).status).toBe(404);
  });
});
