import type {
  ActivityResponse,
  AuditLogResponse,
  CategoriesResponse,
  DbPingResponse,
  DevSignInHint,
  HealthResponse,
  InviteUserBody,
  InviteUserResponse,
  KpisResponse,
  ResendInviteResponse,
  RevenueResponse,
  SignupsResponse,
  SpendByStatusResponse,
  TransactionDetailResponse,
  TransactionsPageResponse,
  TransactionsQuery,
  TransactionsResponse,
  UpdateUserBody,
  UpdateUserResponse,
  UsersResponse,
} from '../../shared/api.ts';
import { HttpError } from '../infra/http/errors.ts';
import { readJsonBody, sendError, sendJson } from '../infra/http/json.ts';
import type { RequestContext, Route } from '../infra/http/types.ts';
import type { Services } from '../services/index.ts';
import { isKpiRange, type KpiRange } from '../services/kpi-range.ts';
import { createAccountRoutes } from './account.ts';
import { actionRoutes } from './actions.ts';
import { agentRoutes } from './agent.ts';
import { authRoutes, clientIp } from './auth.ts';
import { createAuthFlowRoutes } from './auth-flows.ts';
import { call } from './errors.ts';
import { eventsRoutes } from './events.ts';
import { createFileRoutes } from './files.ts';
import { llmCompleteHandler, llmStreamHandler } from './llm.ts';
import { notificationRoutes } from './notifications.ts';
import { platformRoutes } from './platform.ts';

/* The route table: method, path, who may call it, handler. Handlers parse the
   request, call a service and write the response; they hold no SQL and no
   business rules. Adding a route: a handler here (or in its own file) and one
   line in the table, its types in shared/api.ts, a method in src/core/api. */
export function createRoutes(
  services: Services,
  opts: { cookieSecure: boolean; devSignIn?: DevSignInHint },
): Route[] {
  const auth = authRoutes(services, opts);
  const get =
    <T>(load: (ctx: RequestContext) => Promise<T>) =>
    async (ctx: RequestContext) => {
      sendJson(ctx.res, 200, await call(() => load(ctx)));
    };

  return [
    { method: 'GET', path: '/api/health', auth: 'public', handler: health },
    { method: 'POST', path: '/api/auth/login', auth: 'public', handler: auth.login },
    { method: 'POST', path: '/api/auth/logout', auth: 'public', handler: auth.logout },
    { method: 'GET', path: '/api/auth/me', auth: 'public', handler: auth.me },
    { method: 'POST', path: '/api/auth/view-as', auth: 'user', handler: auth.viewAs },
    ...createAuthFlowRoutes(services, opts),
    ...createAccountRoutes(services),
    ...createFileRoutes(services),

    {
      method: 'GET',
      path: '/api/transactions',
      auth: 'user',
      handler: get(async (ctx) => {
        // No query at all: everything, as the dashboard's table has always had it.
        const query = parseTransactionsQuery(ctx.url.searchParams);
        if (!query) {
          return {
            ok: true,
            transactions: await services.data.transactions(),
          } satisfies TransactionsResponse;
        }
        return {
          ok: true,
          ...(await services.data.transactionsPage(query)),
        } satisfies TransactionsPageResponse;
      }),
    },
    {
      method: 'GET',
      path: '/api/transactions/:id',
      auth: 'user',
      handler: get(
        async (ctx) =>
          ({
            ok: true,
            ...(await services.data.transaction(ctx.params.id ?? '')),
          }) satisfies TransactionDetailResponse,
      ),
    },
    {
      method: 'GET',
      path: '/api/activity',
      auth: 'user',
      handler: get(
        async () =>
          ({ ok: true, activity: await services.data.activity() }) satisfies ActivityResponse,
      ),
    },
    {
      method: 'GET',
      path: '/api/metrics/kpis',
      auth: 'user',
      handler: get(async (ctx) => {
        const raw = ctx.url.searchParams.get('days');
        if (raw === null) {
          return { ok: true, kpis: await services.data.kpis() } satisfies KpisResponse;
        }
        if (!isKpiRange(Number(raw))) {
          throw new HttpError(400, 'invalid_query', '"days" must be 7, 30 or 90.');
        }
        return {
          ok: true,
          kpis: await services.data.kpis(Number(raw) as KpiRange),
        } satisfies KpisResponse;
      }),
    },
    {
      method: 'GET',
      path: '/api/metrics/revenue',
      auth: 'user',
      handler: get(async (ctx) => {
        const raw = ctx.url.searchParams.get('days') ?? '90';
        if (!['7', '30', '60', '90'].includes(raw)) {
          throw new HttpError(400, 'invalid_query', '"days" must be 7, 30, 60 or 90.');
        }
        return {
          ok: true,
          ...(await services.data.revenue(
            Number(raw),
            ctx.url.searchParams.get('compare') === '1',
          )),
        } satisfies RevenueResponse;
      }),
    },
    {
      method: 'GET',
      path: '/api/metrics/categories',
      auth: 'user',
      handler: get(
        async () =>
          ({ ok: true, categories: await services.data.categories() }) satisfies CategoriesResponse,
      ),
    },
    {
      method: 'GET',
      path: '/api/metrics/signups',
      auth: 'user',
      handler: get(
        async () =>
          ({ ok: true, signups: await services.data.signups() }) satisfies SignupsResponse,
      ),
    },
    {
      method: 'GET',
      path: '/api/metrics/spend-by-status',
      auth: 'user',
      handler: get(
        async () =>
          ({
            ok: true,
            breakdown: await services.data.spendByStatus(),
          }) satisfies SpendByStatusResponse,
      ),
    },
    {
      method: 'POST',
      path: '/api/llm/complete',
      auth: 'user',
      handler: llmCompleteHandler(services),
    },
    { method: 'POST', path: '/api/llm/stream', auth: 'user', handler: llmStreamHandler(services) },
    ...actionRoutes(services),
    ...agentRoutes(services),

    {
      method: 'GET',
      path: '/api/users',
      auth: 'admin',
      handler: get(
        async () => ({ ok: true, users: await services.data.users() }) satisfies UsersResponse,
      ),
    },
    { method: 'POST', path: '/api/users', auth: 'admin', handler: inviteUser(services) },
    { method: 'PATCH', path: '/api/users/:id', auth: 'admin', handler: updateUser(services) },
    {
      method: 'POST',
      path: '/api/users/:id/resend-invite',
      auth: 'admin',
      handler: resendInvite(services),
    },
    {
      method: 'GET',
      path: '/api/audit-log',
      auth: 'admin',
      handler: get(
        async () =>
          ({ ok: true, events: await services.data.auditLog() }) satisfies AuditLogResponse,
      ),
    },
    { method: 'GET', path: '/api/db/ping', auth: 'admin', handler: dbPing(services) },
    ...platformRoutes(services),

    ...eventsRoutes(services),
    ...notificationRoutes(services),
  ];
}

const TABLE_PARAMS = [
  'page',
  'pageSize',
  'sort',
  'q',
  'status',
  'category',
  'from',
  'before',
] as const;

/* A whole number from text, or a 400 naming the parameter. Which numbers are
   allowed (page from 1, pageSize up to 100) is the service's rule. */
function intParam(sp: URLSearchParams, name: 'page' | 'pageSize'): number | undefined {
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

/* A repeatable, comma-separated list: ?status=paid,failed&status=pending. */
function listParam(sp: URLSearchParams, name: string): string[] | undefined {
  const all = sp.getAll(name);
  if (all.length === 0) return undefined;
  return all
    .flatMap((v) => v.split(','))
    .map((v) => v.trim())
    .filter((v) => v !== '');
}

/* Null when the request carries none of the table-mode parameters; the caller
   then answers with the plain full list. Values are checked by the service. */
function parseTransactionsQuery(sp: URLSearchParams): TransactionsQuery | null {
  if (!TABLE_PARAMS.some((p) => sp.has(p))) return null;
  const query: {
    -readonly [K in keyof TransactionsQuery]: TransactionsQuery[K];
  } = {};
  const page = intParam(sp, 'page');
  if (page !== undefined) query.page = page;
  const pageSize = intParam(sp, 'pageSize');
  if (pageSize !== undefined) query.pageSize = pageSize;
  const sort = listParam(sp, 'sort');
  if (sort) query.sort = sort;
  const q = sp.get('q');
  if (q !== null) query.q = q;
  const status = listParam(sp, 'status');
  if (status) query.status = status as TransactionsQuery['status'];
  const category = listParam(sp, 'category');
  if (category) query.category = category as TransactionsQuery['category'];
  const from = sp.get('from');
  if (from !== null) query.from = from;
  const before = sp.get('before');
  if (before !== null) query.before = before;
  return query;
}

async function health(ctx: RequestContext): Promise<void> {
  sendJson(ctx.res, 200, {
    ok: true,
    service: 'base-app-api',
    uptimeSec: Math.floor((Date.now() - ctx.startedAt) / 1000),
    time: new Date().toISOString(),
  } satisfies HealthResponse);
}

function dbPing(services: Services) {
  return async (ctx: RequestContext): Promise<void> => {
    try {
      const { driver, latencyMs } = await services.data.dbPing();
      sendJson(ctx.res, 200, { ok: true, driver, latencyMs } satisfies DbPingResponse);
    } catch (err) {
      // The reason goes to the server log only; the client learns the database is down.
      ctx.log.warn('db ping failed', { errName: err instanceof Error ? err.name : 'unknown' });
      sendError(ctx.res, 503, 'db_unavailable', 'The database is not reachable.');
    }
  };
}

function inviteUser(services: Services) {
  return async (ctx: RequestContext): Promise<void> => {
    const raw = await readJsonBody(ctx.req, 8 * 1024);
    const b = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    if (
      typeof b.name !== 'string' ||
      typeof b.email !== 'string' ||
      typeof b.role !== 'string' ||
      typeof b.sendWelcome !== 'boolean'
    ) {
      throw new HttpError(400, 'invalid_body', 'Send name, email, role and sendWelcome.');
    }
    const body = b as unknown as InviteUserBody;
    const principal = ctx.principal;
    if (!principal) throw new HttpError(401, 'unauthenticated', 'Sign in to use this.');
    const user = await call(() => services.data.inviteUser(body, principal, clientIp(ctx)));
    sendJson(ctx.res, 201, { ok: true, user } satisfies InviteUserResponse);
  };
}

function updateUser(services: Services) {
  return async (ctx: RequestContext): Promise<void> => {
    const raw = await readJsonBody(ctx.req, 2 * 1024);
    const b = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
    if (
      (b.role !== undefined && typeof b.role !== 'string') ||
      (b.status !== undefined && typeof b.status !== 'string')
    ) {
      throw new HttpError(400, 'invalid_body', 'Send "role" and/or "status" as strings.');
    }
    const principal = ctx.principal;
    if (!principal) throw new HttpError(401, 'unauthenticated', 'Sign in to use this.');
    const body = b as UpdateUserBody;
    const user = await call(() =>
      services.data.updateUser(ctx.params.id ?? '', body, principal, clientIp(ctx)),
    );
    sendJson(ctx.res, 200, { ok: true, user } satisfies UpdateUserResponse);
  };
}

function resendInvite(services: Services) {
  return async (ctx: RequestContext): Promise<void> => {
    const principal = ctx.principal;
    if (!principal) throw new HttpError(401, 'unauthenticated', 'Sign in to use this.');
    const user = await call(() =>
      services.data.resendInvite(ctx.params.id ?? '', principal, clientIp(ctx)),
    );
    sendJson(ctx.res, 200, { ok: true, user } satisfies ResendInviteResponse);
  };
}
