import { createServer, type IncomingMessage, request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { drainBody, rawBody } from './body.ts';

/* drainBody against a real socket: what is left of a request after a refusal is read, within a
   byte cap and a time cap, so the answer reaches the client instead of a reset. */

const KB = 1024;

/** Starts a server whose handler runs `onRequest`, sends one PUT whose body `send` writes, and
    resolves with what `onRequest` returned and how long it took. */
function exchange<T>(
  onRequest: (req: IncomingMessage) => Promise<T>,
  send: (req: ReturnType<typeof request>) => void,
): Promise<{ value: T; ms: number }> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const started = Date.now();
      onRequest(req).then((value) => {
        res.writeHead(413, { connection: 'close' }).end();
        server.close();
        resolve({ value, ms: Date.now() - started });
      }, reject);
    });
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo;
      const req = request({ host: '127.0.0.1', port, method: 'PUT', path: '/' }, (res) =>
        res.resume(),
      );
      req.on('error', () => {}); // the server closes on us; only its side is under test
      send(req);
    });
  });
}

/** Reads one chunk through rawBody and abandons it, as a refused upload does. */
async function abandonAfterOneChunk(req: IncomingMessage): Promise<void> {
  for await (const _chunk of rawBody(req)) break;
}

describe('drainBody', () => {
  it('reads the rest of a body whose rawBody iterator was abandoned (resume() would not)', async () => {
    const { value } = await exchange(
      async (req) => {
        await abandonAfterOneChunk(req);
        return drainBody(req, 8 * 1024 * KB, 3000);
      },
      (req) => req.end(Buffer.alloc(3 * 1024 * KB, 7)),
    );
    expect(value).toBe(true);
  });

  it('gives up once more than the byte cap has arrived', async () => {
    const { value } = await exchange(
      async (req) => {
        await abandonAfterOneChunk(req);
        return drainBody(req, 64 * KB, 3000);
      },
      (req) => req.end(Buffer.alloc(2 * 1024 * KB, 7)),
    );
    expect(value).toBe(false);
  });

  it('gives up after the time cap when the client stops sending', async () => {
    const { value, ms } = await exchange(
      async (req) => {
        await abandonAfterOneChunk(req);
        return drainBody(req, 8 * 1024 * KB, 150);
      },
      (req) => {
        req.setHeader('transfer-encoding', 'chunked');
        req.write(Buffer.alloc(16 * KB, 7)); // then nothing: the request never ends
      },
    );
    expect(value).toBe(false);
    expect(ms).toBeGreaterThanOrEqual(140);
    expect(ms).toBeLessThan(2000);
  });

  it('answers true at once for a body that was already read to the end', async () => {
    const { value } = await exchange(
      async (req) => {
        for await (const _chunk of rawBody(req)) {
          // read it all
        }
        return drainBody(req, 64 * KB, 3000);
      },
      (req) => req.end(Buffer.alloc(4 * KB, 7)),
    );
    expect(value).toBe(true);
  });
});
