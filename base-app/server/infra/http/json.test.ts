import { createServer, type IncomingMessage, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sendError, sendJson } from './json.ts';

/* sendJson over a real socket: which responses are compressed, and how. */

interface Reply {
  status: number;
  headers: IncomingMessage['headers'];
  body: Buffer;
}

const BIG = { rows: Array.from({ length: 120 }, (_, i) => ({ id: i, name: `Row number ${i}` })) };
const BIG_TEXT = JSON.stringify(BIG);
const SMALL = { ok: true, n: 1 };
let server: Server;
let port: number;

async function call(
  path: string,
  headers: Record<string, string> = {},
  method = 'GET',
): Promise<Reply> {
  return new Promise((resolveReply, rejectReply) => {
    const req = request({ host: '127.0.0.1', port, path, method, headers }, (res) => {
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

beforeAll(async () => {
  server = createServer((req, res) => {
    const path = req.url ?? '/';
    if (path === '/big') sendJson(res, 200, BIG);
    else if (path === '/small') sendJson(res, 200, SMALL);
    else if (path === '/vary') sendJson(res, 200, BIG, { Vary: 'Origin' });
    else if (path === '/notransform') sendJson(res, 200, BIG, { 'Cache-Control': 'no-transform' });
    else if (path === '/encoded') sendJson(res, 200, BIG, { 'Content-Encoding': 'identity' });
    else if (path === '/no-content') sendJson(res, 204, BIG);
    else if (path === '/error') sendError(res, 404, 'not_found', 'x'.repeat(2000));
    else if (path === '/cookie') sendJson(res, 200, BIG, { 'Set-Cookie': 'a=b; Path=/' });
    else res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});

describe('sendJson compression', () => {
  it('compresses a body over 1 kB with Brotli when the client accepts it', async () => {
    const res = await call('/big', { 'accept-encoding': 'gzip, br' });
    expect(res.status).toBe(200);
    expect(res.headers['content-encoding']).toBe('br');
    expect(res.headers.vary).toBe('Accept-Encoding');
    expect(res.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(res.headers['content-length']).toBe(String(res.body.length));
    expect(res.body.length).toBeLessThan(BIG_TEXT.length);
    expect(brotliDecompressSync(res.body).toString()).toBe(BIG_TEXT);
  });

  it('uses gzip for a client that only accepts gzip', async () => {
    const res = await call('/big', { 'accept-encoding': 'gzip, deflate' });
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(res.body).toString()).toBe(BIG_TEXT);
  });

  it('respects q-values', async () => {
    const res = await call('/big', { 'accept-encoding': 'br;q=0.1, gzip' });
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('sends a client with no Accept-Encoding the plain body, still with Vary', async () => {
    const res = await call('/big');
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers.vary).toBe('Accept-Encoding');
    expect(res.headers['content-length']).toBe(String(Buffer.byteLength(BIG_TEXT)));
    expect(res.body.toString()).toBe(BIG_TEXT);
  });

  it('leaves a body under 1 kB alone', async () => {
    const res = await call('/small', { 'accept-encoding': 'br, gzip' });
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers.vary).toBeUndefined();
    expect(JSON.parse(res.body.toString())).toEqual(SMALL);
  });

  it('keeps the other headers and merges Vary with the caller’s', async () => {
    const res = await call('/vary', { 'accept-encoding': 'gzip' });
    expect(res.headers.vary).toBe('Origin, Accept-Encoding');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('keeps a Set-Cookie header on a compressed response', async () => {
    const res = await call('/cookie', { 'accept-encoding': 'gzip' });
    expect(res.headers['set-cookie']).toEqual(['a=b; Path=/']);
    expect(res.headers['content-encoding']).toBe('gzip');
  });

  it('does not compress when the caller said no-transform', async () => {
    const res = await call('/notransform', { 'accept-encoding': 'br' });
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.body.toString()).toBe(BIG_TEXT);
  });

  it('does not compress a body the caller already encoded', async () => {
    const res = await call('/encoded', { 'accept-encoding': 'br' });
    expect(res.headers['content-encoding']).toBe('identity');
    expect(res.body.toString()).toBe(BIG_TEXT);
  });

  it('does not compress a 204', async () => {
    const res = await call('/no-content', { 'accept-encoding': 'br' });
    expect(res.status).toBe(204);
    expect(res.headers['content-encoding']).toBeUndefined();
  });

  it('compresses a long error envelope the same way', async () => {
    const res = await call('/error', { 'accept-encoding': 'gzip' });
    expect(res.status).toBe(404);
    expect(res.headers['content-encoding']).toBe('gzip');
    expect(JSON.parse(gunzipSync(res.body).toString()).error.code).toBe('not_found');
  });

  it('answers HEAD with the headers and no body', async () => {
    const res = await call('/big', { 'accept-encoding': 'br' }, 'HEAD');
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(0);
    expect(res.headers['content-encoding']).toBe('br');
    expect(Number(res.headers['content-length'])).toBeGreaterThan(0);
  });
});
