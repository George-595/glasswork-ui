import type { ActionRunResponse, ActionsResponse, ViewsResponse } from '../../shared/api.ts';
import { HttpError } from '../infra/http/errors.ts';
import { readJsonBody, sendJson } from '../infra/http/json.ts';
import type { RequestContext, Route } from '../infra/http/types.ts';
import type { Services } from '../services/index.ts';
import { clientIp } from './auth.ts';
import { call } from './errors.ts';

/* Actions over HTTP: the page half of "define it once" (services/actions/define.ts). A page
   runs an action with POST /api/actions/:name { input }; the assistant runs the same action as
   a tool. The registry checks the role and the input, so this file only reads the body.
   GET /api/actions lists what the caller may run. GET /api/views draws the caller's saved
   views; saving and removing one are the save_view and delete_view actions. */

const MAX_BODY_BYTES = 64 * 1024;

function principalOf(ctx: RequestContext) {
  if (!ctx.principal) throw new HttpError(401, 'unauthenticated', 'Sign in to use this.');
  return ctx.principal;
}

export function actionRoutes(services: Services): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/actions',
      auth: 'user',
      handler: async (ctx) => {
        const user = principalOf(ctx);
        sendJson(ctx.res, 200, {
          ok: true,
          actions: services.actions.list(user).map((a) => ({
            name: a.name,
            title: a.title,
            description: a.description,
            effect: a.effect,
            confirm: a.confirm,
          })),
        } satisfies ActionsResponse);
      },
    },
    {
      method: 'POST',
      path: '/api/actions/:name',
      auth: 'user',
      handler: async (ctx) => {
        const user = principalOf(ctx);
        const raw = await readJsonBody(ctx.req, MAX_BODY_BYTES);
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          throw new HttpError(400, 'invalid_body', 'Send { "input": { … } }.');
        }
        const input = (raw as { input?: unknown }).input ?? {};
        const outcome = await call(() =>
          services.actions.run(
            { user, ip: clientIp(ctx), now: new Date() },
            ctx.params.name ?? '',
            input,
          ),
        );
        sendJson(ctx.res, 200, {
          ok: true,
          result: outcome.result,
          ...(outcome.summary ? { summary: outcome.summary } : {}),
          ...(outcome.visual ? { visual: outcome.visual } : {}),
        } satisfies ActionRunResponse);
      },
    },
    {
      method: 'GET',
      path: '/api/views',
      auth: 'user',
      handler: async (ctx) => {
        const user = principalOf(ctx);
        sendJson(ctx.res, 200, {
          ok: true,
          views: await call(() => services.views.list(user)),
        } satisfies ViewsResponse);
      },
    },
  ];
}
