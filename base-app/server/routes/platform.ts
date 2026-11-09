import type {
  EmailResponse,
  EmailsResponse,
  JobsResponse,
  RetryJobResponse,
  SettingsResponse,
  UpdateSettingsResponse,
} from '../../shared/api.ts';
import { HttpError } from '../infra/http/errors.ts';
import { readJsonBody, sendJson } from '../infra/http/json.ts';
import type { RequestContext, Route } from '../infra/http/types.ts';
import type { Services } from '../services/index.ts';
import { clientIp } from './auth.ts';
import { call } from './errors.ts';

/* The platform routes: server-side settings, the admin Mail page (the outbox) and the admin Jobs
   page (the queue). Handlers parse and answer; the rules are in services/{settings,outbox,jobs}.ts.

     GET  /api/settings                 user    the settings this viewer may see
     PUT  /api/settings                 admin   change settings (audited, published)
     GET  /api/admin/emails             admin   ?page&pageSize
     GET  /api/admin/emails/:id         admin
     GET  /api/admin/jobs               admin   ?status&page&pageSize
     POST /api/admin/jobs/:id/retry     admin   failed or dead only (audited) */

/** A whole number from query text, or a 400 naming the parameter. Its range is the service's rule. */
function intParam(sp: URLSearchParams, name: string): number | undefined {
  const raw = sp.get(name);
  if (raw === null) return undefined;
  if (!/^\d{1,9}$/.test(raw)) {
    throw new HttpError(
      400,
      `invalid_${name === 'page' ? 'page' : 'page_size'}`,
      `"${name}" must be a whole number.`,
    );
  }
  return Number(raw);
}

function principalOf(ctx: RequestContext) {
  if (!ctx.principal) throw new HttpError(401, 'unauthenticated', 'Sign in to use this.');
  return ctx.principal;
}

export function platformRoutes(services: Services): Route[] {
  const { settings, outbox, jobs } = services;
  return [
    {
      method: 'GET',
      path: '/api/settings',
      auth: 'user',
      handler: async (ctx) => {
        const viewer = principalOf(ctx);
        sendJson(ctx.res, 200, {
          ok: true,
          settings: await call(() => settings.forViewer(viewer.role)),
        } satisfies SettingsResponse);
      },
    },
    {
      method: 'PUT',
      path: '/api/settings',
      auth: 'admin',
      handler: async (ctx) => {
        const actor = principalOf(ctx);
        const raw = await readJsonBody(ctx.req, 4 * 1024);
        if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
          throw new HttpError(400, 'invalid_body', 'Send an object of settings to change.');
        }
        sendJson(ctx.res, 200, {
          ok: true,
          settings: await call(() => settings.update(raw, actor, clientIp(ctx))),
        } satisfies UpdateSettingsResponse);
      },
    },

    {
      method: 'GET',
      path: '/api/admin/emails',
      auth: 'admin',
      handler: async (ctx) => {
        const page = intParam(ctx.url.searchParams, 'page');
        const pageSize = intParam(ctx.url.searchParams, 'pageSize');
        const result = await call(() =>
          outbox.list({
            ...(page !== undefined ? { page } : {}),
            ...(pageSize !== undefined ? { pageSize } : {}),
          }),
        );
        sendJson(ctx.res, 200, { ok: true, ...result } satisfies EmailsResponse);
      },
    },
    {
      method: 'GET',
      path: '/api/admin/emails/:id',
      auth: 'admin',
      handler: async (ctx) => {
        const email = await call(() => outbox.get(ctx.params.id ?? ''));
        sendJson(ctx.res, 200, { ok: true, email } satisfies EmailResponse);
      },
    },

    {
      method: 'GET',
      path: '/api/admin/jobs',
      auth: 'admin',
      handler: async (ctx) => {
        const page = intParam(ctx.url.searchParams, 'page');
        const pageSize = intParam(ctx.url.searchParams, 'pageSize');
        const status = ctx.url.searchParams.get('status');
        const result = await call(() =>
          jobs.list({
            ...(status ? { status } : {}),
            ...(page !== undefined ? { page } : {}),
            ...(pageSize !== undefined ? { pageSize } : {}),
          }),
        );
        sendJson(ctx.res, 200, { ok: true, ...result } satisfies JobsResponse);
      },
    },
    {
      method: 'POST',
      path: '/api/admin/jobs/:id/retry',
      auth: 'admin',
      handler: async (ctx) => {
        const actor = principalOf(ctx);
        const job = await call(() => jobs.retry(ctx.params.id ?? '', actor, clientIp(ctx)));
        sendJson(ctx.res, 200, { ok: true, job } satisfies RetryJobResponse);
      },
    },
  ];
}
