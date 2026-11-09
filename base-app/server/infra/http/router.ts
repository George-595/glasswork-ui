import type { ServerResponse } from 'node:http';
import { errorFields } from '../log/logger.ts';
import { HttpError } from './errors.ts';
import { sendError } from './json.ts';
import { loggablePath } from './log-path.ts';
import type { ApiDeps, RequestContext, Route } from './types.ts';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/* Who made a request while "viewing as" a lower role the REAL person's id and
   the acting role, set by `dispatch` once the session is known, read by the request log line so
   what a viewing-as admin does is logged under their own id. Absent for everyone else. */
export const actingAs = new WeakMap<ServerResponse, { userId: string; actingRole: string }>();

/* A route path is literal segments, or `:name` segments that capture one
   non-empty segment each ('/api/transactions/:id'). Returns the captures, or
   null when the request path does not fit. A literal path never captures. */
function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  if (!pattern.includes(':')) return pattern === pathname ? {} : null;
  const want = pattern.split('/');
  const got = pathname.split('/');
  if (want.length !== got.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < want.length; i++) {
    const w = want[i] ?? '';
    const g = got[i] ?? '';
    if (w.startsWith(':')) {
      if (g === '') return null;
      try {
        params[w.slice(1)] = decodeURIComponent(g);
      } catch {
        return null;
      }
    } else if (w !== g) {
      return null;
    }
  }
  return params;
}

/* Never throws: every outcome is written to the response. In order:
   match → 404/405; state-changing request from a foreign Origin → 403;
   auth level → 401/403; the optional gate (maintenance mode → 503); handler; an HttpError → its envelope; anything
   else → 500 with an errorId that matches the logged line, and no details. */
export async function dispatch(
  ctx: Omit<RequestContext, 'principal' | 'params'>,
  deps: Pick<ApiDeps, 'routes' | 'settings' | 'authenticate' | 'gate'>,
): Promise<void> {
  const { req, res, url, log } = ctx;
  const method = req.method ?? '';
  const matched = deps.routes.flatMap((route) => {
    const params = matchPath(route.path, url.pathname);
    return params ? [{ route, params }] : [];
  });
  const matches = matched.map((m) => m.route);
  if (matches.length === 0) {
    sendError(res, 404, 'not_found', 'No such route');
    return;
  }
  const hit = matched.find((m) => m.route.method === method);
  const route: Route | undefined = hit?.route;
  if (!hit || !route) {
    const allow = [...new Set(matches.map((candidate) => candidate.method))].join(', ');
    sendError(res, 405, 'method_not_allowed', `Use ${allow} for this route`, { allow });
    return;
  }

  try {
    // Cross-site request forgery: a browser always sends Origin on these.
    const origin = req.headers.origin;
    if (
      MUTATING.has(method) &&
      origin !== undefined &&
      !deps.settings.allowedOrigins.includes(origin)
    ) {
      throw new HttpError(403, 'forbidden_origin', 'Origin is not allowed');
    }

    const principal = await deps.authenticate(req.headers.cookie);
    if (principal?.actingRole) {
      actingAs.set(res, { userId: principal.id, actingRole: principal.actingRole });
    }
    if (route.auth !== 'public' && !principal) {
      throw new HttpError(401, 'unauthenticated', 'Sign in to use this.');
    }
    if (route.auth === 'admin' && principal?.role !== 'admin') {
      throw new HttpError(403, 'forbidden', 'This needs an admin account.');
    }

    await deps.gate?.({ principal, method, path: url.pathname });

    await route.handler({ ...ctx, params: hit.params, principal });
  } catch (err) {
    if (err instanceof HttpError) {
      if (!res.headersSent) {
        const headers: Record<string, string> = err.closeConnection ? { connection: 'close' } : {};
        sendError(res, err.status, err.code, err.message, headers, undefined, err.details);
      } else {
        endStarted(res);
      }
      return;
    }
    const errorId = ctx.requestId;
    log.error('unhandled error', {
      errorId,
      method,
      path: loggablePath(url.pathname),
      ...errorFields(err),
    });
    if (!res.headersSent) {
      sendError(res, 500, 'internal_error', 'Something went wrong on the server.', {}, errorId);
    } else {
      endStarted(res);
    }
  }
}

/* A handler failed after it began a streamed response (SSE): the status is gone, so the best
   that can be done is to end the stream rather than leave the client waiting on it. */
function endStarted(res: ServerResponse): void {
  if (!res.writableEnded) res.end();
}
