/* openSse on a real node:http server and socket: what the fakes in sse.test.ts cannot show. */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { parseSse } from '../../../lib/sse.ts';
import { silentLogger } from '../log/logger.ts';
import { createApiServer } from './server.ts';
import { openSse } from './sse.ts';
import type { Route } from './types.ts';

let server: Server | undefined;
afterEach(async () => {
  server?.closeAllConnections();
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = undefined;
});

async function start(routes: Route[]): Promise<string> {
  const made = createApiServer({
    settings: { allowedOrigins: [], publicHosts: [] },
    routes,
    authenticate: async () => null,
    log: silentLogger,
  });
  server = made;
  await new Promise<void>((r) => made.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(made.address() as AddressInfo).port}`;
}

describe('openSse over a real socket', () => {
  it('delivers events as they are sent, with a heartbeat between them', async () => {
    const base = await start([
      {
        method: 'GET',
        path: '/api/s',
        auth: 'public',
        handler: async ({ req, res }) => {
          const sse = openSse(req, res, { heartbeatMs: 20 });
          await sse.send({ event: 'a', data: 'one\ntwo' });
          await new Promise((r) => setTimeout(r, 70));
          await sse.send({ event: 'b', data: { n: 1 } });
          sse.close();
        },
      },
    ]);
    const res = await fetch(`${base}/api/s`);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('content-length')).toBeNull();
    const seen: string[] = [];
    if (res.body) for await (const e of parseSse(res.body)) seen.push(`${e.event}:${e.data}`);
    expect(seen).toEqual(['a:one\ntwo', 'b:{"n":1}']);
  });

  it('is never compressed, whatever the client accepts', async () => {
    const big = 'x'.repeat(4000);
    const base = await start([
      {
        method: 'GET',
        path: '/api/s',
        auth: 'public',
        handler: async ({ req, res }) => {
          const sse = openSse(req, res, { heartbeatMs: 0 });
          await sse.send({ event: 'big', data: big });
          sse.close();
        },
      },
    ]);
    const res = await fetch(`${base}/api/s`, { headers: { 'accept-encoding': 'br, gzip' } });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('content-encoding')).toBeNull();
    expect(res.headers.get('vary')).toBeNull();
    const seen: string[] = [];
    if (res.body)
      for await (const e of parseSse(res.body)) seen.push(`${e.event}:${e.data.length}`);
    expect(seen).toEqual(['big:4000']);
  });

  it('the signal fires when the client goes away', async () => {
    let aborted: () => void = () => {};
    const gone = new Promise<void>((r) => {
      aborted = r;
    });
    const base = await start([
      {
        method: 'GET',
        path: '/api/s',
        auth: 'public',
        handler: async ({ req, res }) => {
          const sse = openSse(req, res, { heartbeatMs: 0 });
          sse.signal.addEventListener('abort', () => aborted());
          await sse.send({ data: 'hello' });
          await gone;
        },
      },
    ]);
    const controller = new AbortController();
    const res = await fetch(`${base}/api/s`, { signal: controller.signal });
    await res.body?.getReader().read();
    controller.abort();
    await expect(gone).resolves.toBeUndefined();
  });

  it('a handler that throws after the stream began ends it rather than hanging', async () => {
    const base = await start([
      {
        method: 'GET',
        path: '/api/s',
        auth: 'public',
        handler: async ({ req, res }) => {
          const sse = openSse(req, res, { heartbeatMs: 0 });
          await sse.send({ data: 'before' });
          throw new Error('boom');
        },
      },
    ]);
    const res = await fetch(`${base}/api/s`, { signal: AbortSignal.timeout(3000) });
    const seen: string[] = [];
    if (res.body) for await (const e of parseSse(res.body)) seen.push(e.data);
    expect(seen).toEqual(['before']);
  });
});
