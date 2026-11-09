import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { errorFields } from '../log/logger.ts';
import { sendError } from './json.ts';
import { loggablePath } from './log-path.ts';
import { actingAs, dispatch } from './router.ts';
import type { ApiDeps } from './types.ts';

export type {
  ApiDeps,
  AuthLevel,
  HttpSettings,
  Principal,
  RequestContext,
  RequestGate,
  Route,
} from './types.ts';

/* By default the API answers only requests addressed to a loopback name. That
   also defeats DNS rebinding, where a web page re-points its own hostname at
   127.0.0.1 and then reads the API as same-origin. settings.publicHosts adds
   names (a container's published host) only when the server is opened up. */
const LOOPBACK_HOST = /^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/i;
const REQUEST_ID = /^[A-Za-z0-9._-]{8,64}$/;

function hostAllowed(host: string, publicHosts: readonly string[]): boolean {
  if (LOOPBACK_HOST.test(host)) return true;
  const name = host.replace(/:\d+$/, '').toLowerCase();
  return publicHosts.includes(name);
}

/* Builds the API server. It is not listening: the caller calls listen().
   Every request gets a request ID (a valid incoming x-request-id is kept), is
   echoed in the x-request-id header, and is logged as one JSON line. */
export function createApiServer(deps: ApiDeps): Server {
  const startedAt = deps.startedAt ?? Date.now();

  return createServer((req, res) => {
    const began = performance.now();
    const incoming = req.headers['x-request-id'];
    const requestId =
      typeof incoming === 'string' && REQUEST_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', requestId);
    const log = deps.log.child({ requestId });

    let url: URL;
    try {
      // Some request-targets ('//', 'http://') make the URL parser throw.
      url = new URL(req.url ?? '/', 'http://localhost');
    } catch {
      sendError(res, 400, 'bad_request', 'Malformed request target');
      return;
    }
    res.on('finish', () => {
      log.info('request', {
        method: req.method ?? '-',
        path: loggablePath(url.pathname),
        status: res.statusCode,
        ms: Math.round(performance.now() - began),
        // viewing as a lower role: the real person's id with the role they acted as
        ...actingAs.get(res),
      });
    });

    if (!hostAllowed(req.headers.host ?? '', deps.settings.publicHosts)) {
      sendError(res, 403, 'forbidden_host', 'This server does not answer for that host name');
      return;
    }

    const isApi = url.pathname === '/api' || url.pathname.startsWith('/api/');
    const handle = async (): Promise<void> => {
      if (!isApi && (await deps.middleware?.()?.(req, res))) return;
      if (!isApi && deps.serveStatic && (await deps.serveStatic(req, res))) return;
      if (!isApi && deps.ssr && (await deps.ssr(req, res))) return;
      await dispatch({ req, res, url, requestId, log, startedAt }, deps);
    };
    handle().catch((err: unknown) => {
      log.error('request failed outside a route', { errorId: requestId, ...errorFields(err) });
      if (!res.headersSent) {
        sendError(res, 500, 'internal_error', 'Something went wrong on the server.', {}, requestId);
      }
    });
  });
}
