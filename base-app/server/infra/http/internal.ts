import { EventEmitter } from 'node:events';
import type { IncomingMessage, OutgoingHttpHeaders, ServerResponse } from 'node:http';
import { dispatch } from './router.ts';
import type { ApiDeps, Principal } from './types.ts';

/* Asking the API a question from inside the process.

   A server-rendered page needs the answers to a few GET calls (who is signed in, the settings, the
   data the first screen shows). Making real HTTP requests to ourselves would cost a socket and a
   second round of parsing, and would run every check twice. Instead this runs the SAME router
   (`dispatch`: matching, the role check, the maintenance gate, the handler) against a request
   made in memory, as a given principal, and hands back the status and the parsed JSON. So an
   answer here is exactly what the browser's own call to that path would have been told, for that
   person - the only guarantee that embedding it in the page leaks nothing the API would not.

   GET only, by construction. The principal is resolved once by the caller and passed in, so a
   page costs one session lookup however many calls it asks. */

export interface InternalAnswer {
  status: number;
  /** The parsed JSON body, or undefined when there was none or it was not JSON. */
  body: unknown;
}

export type InternalGet = (path: string) => Promise<InternalAnswer>;

/* The slice of node:http's request and response the router's routes touch for a plain JSON
   answer. A route that streams (server-sent events) is not asked for this way. */
class MemoryResponse extends EventEmitter {
  statusCode = 200;
  headersSent = false;
  writableEnded = false;
  private readonly headers = new Map<string, unknown>();
  private readonly chunks: Buffer[] = [];

  setHeader(name: string, value: unknown): this {
    this.headers.set(name.toLowerCase(), value);
    return this;
  }
  getHeader(name: string): unknown {
    return this.headers.get(name.toLowerCase());
  }
  removeHeader(name: string): void {
    this.headers.delete(name.toLowerCase());
  }
  writeHead(status: number, headers?: OutgoingHttpHeaders): this {
    this.statusCode = status;
    for (const [name, value] of Object.entries(headers ?? {})) this.setHeader(name, value);
    this.headersSent = true;
    return this;
  }
  write(chunk: string | Uint8Array): boolean {
    this.chunks.push(Buffer.from(chunk));
    return true;
  }
  end(chunk?: string | Uint8Array): this {
    if (chunk !== undefined) this.write(chunk);
    this.headersSent = true;
    this.writableEnded = true;
    this.emit('finish');
    this.emit('close');
    return this;
  }
  text(): string {
    return Buffer.concat(this.chunks).toString('utf8');
  }
}

/** Builds the in-process GET for one request. `real` is the browser's own request: its address,
    forwarding header and user agent are carried over, so rate limits and logs see the same caller. */
export function createInternalGet(
  deps: Pick<ApiDeps, 'routes' | 'settings' | 'gate'>,
  real: Pick<IncomingMessage, 'headers' | 'socket'>,
  principal: Principal | null,
  context: Pick<Parameters<typeof dispatch>[0], 'requestId' | 'log' | 'startedAt'>,
): InternalGet {
  return async (path) => {
    const res = new MemoryResponse();
    const headers: IncomingMessage['headers'] = { host: real.headers.host ?? 'localhost' };
    const forwarded = real.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') headers['x-forwarded-for'] = forwarded;
    const agent = real.headers['user-agent'];
    if (typeof agent === 'string') headers['user-agent'] = agent;
    const req = {
      method: 'GET',
      url: path,
      headers,
      socket: { remoteAddress: real.socket.remoteAddress },
    } as unknown as IncomingMessage;
    await dispatch(
      {
        req,
        res: res as unknown as ServerResponse,
        url: new URL(path, 'http://localhost'),
        ...context,
      },
      {
        routes: deps.routes,
        settings: deps.settings,
        authenticate: async () => principal,
        ...(deps.gate ? { gate: deps.gate } : {}),
      },
    );
    const text = res.text();
    let body: unknown;
    try {
      body = text === '' ? undefined : (JSON.parse(text) as unknown);
    } catch {
      body = undefined;
    }
    return { status: res.statusCode, body };
  };
}
