import { HttpError } from '../infra/http/errors.ts';
import { openSse } from '../infra/http/sse.ts';
import type { Route } from '../infra/http/types.ts';
import type { Services } from '../services/index.ts';
import { sessionToken } from './auth.ts';

/* GET /api/events: the server-sent event stream a signed-in browser keeps open (EventSource sends
   the session cookie on a same-origin GET). The handler registers the stream with the realtime hub
   and then waits until the client leaves or the hub closes it; the hub does the fan-out and
   `openSse` the heartbeat. See services/events.ts and shared/api.ts for the events. */
export function eventsRoutes(services: Services): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/events',
      auth: 'user',
      handler: async (ctx) => {
        const user = ctx.principal;
        if (!user) throw new HttpError(401, 'unauthenticated', 'Sign in to use this.');
        const token = sessionToken(ctx.req.headers.cookie);
        // From here the response is a stream: a failure can no longer become a JSON envelope.
        const sse = openSse(ctx.req, ctx.res);
        if (!token) {
          sse.close();
          return;
        }
        await services.events.attach({ token, user, sink: sse });
        // Hold the handler until the client leaves (or the hub closes the stream).
        if (!sse.signal.aborted) {
          await new Promise<void>((resolve) =>
            sse.signal.addEventListener('abort', () => resolve(), { once: true }),
          );
        }
      },
    },
  ];
}
