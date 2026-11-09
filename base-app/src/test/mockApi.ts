/* mockApi — stub fetch with the real API's routes and real-shaped data (the
   same fixtures the server seeds from), so page tests exercise the client →
   API path without a server. Call it in a test before render():

     const api = mockApi();                              // signed in as an admin
     mockApi({ user: null });                            // signed out
     mockApi({ user: VIEWER });                          // a non-admin
     mockApi({ routes: { 'GET /api/transactions': { status: 500, body: … } } });
     mockApi({ delay: true }) … api.release()            // hold responses to see skeletons

   Unlisted routes answer 404 not_found, like the server. `api.calls` records
   "METHOD /path" for each request. */
import { vi } from 'vitest';
import {
  FAKE_NOW,
  getAuditLog,
  getCategoryBreakdown,
  getKpis,
  getMonthlySignups,
  getRecentActivity,
  getRevenueSeries,
  getTransactions,
  getUsers,
} from '../../fixtures/index.ts';
import { TRANSACTION_CATEGORIES, TRANSACTION_STATUSES } from '../../lib/transactions.ts';
import type {
  Notification,
  NotificationPreference,
  SessionUser,
  SettingsValues,
} from '../../shared/api';

export const ADMIN: SessionUser = {
  id: 'usr_admin',
  name: 'Ada Admin',
  email: 'admin@example.com',
  role: 'admin',
};
export const VIEWER: SessionUser = {
  id: 'usr_viewer',
  name: 'Vic Viewer',
  email: 'viewer@example.com',
  role: 'viewer',
};

export interface MockReply {
  status?: number;
  body: unknown;
}
type Handler =
  | MockReply
  | ((req: { method: string; path: string; query: URLSearchParams; body: unknown }) => MockReply);

export interface MockApiOptions {
  /** The signed-in user; null = signed out. Default ADMIN. */
  user?: SessionUser | null;
  /** Override or add routes, keyed "METHOD /api/path" (no query string). */
  routes?: Record<string, Handler>;
  /** Hold every response until release() is called. */
  delay?: boolean;
  /** Server-side settings the mock starts with (the workspace name, maintenance mode). */
  settings?: Partial<SettingsValues>;
}

export const DEFAULT_SETTINGS: SettingsValues = {
  'workspace.name': 'Base app',
  'maintenance.enabled': false,
  'maintenance.message': 'We are making some improvements and will be back soon.',
};

const ok = (body: Record<string, unknown>): MockReply => ({ body: { ok: true, ...body } });
const fail = (status: number, code: string, message: string): MockReply => ({
  status,
  body: { ok: false, error: { code, message } },
});

/* The server's table mode (any query parameter), close enough for page tests: search,
   status and category filters, facet counts under every other filter, date-descending
   order, paging. Sorting by other keys is the server's own tests' job. */
function transactionsPage(q: URLSearchParams): MockReply {
  const list = (k: string) =>
    q
      .getAll(k)
      .flatMap((v) => v.split(','))
      .filter(Boolean);
  const needle = (q.get('q') ?? '').toLowerCase();
  const status = list('status');
  const category = list('category');
  const from = q.get('from');
  const before = q.get('before');
  const page = Number(q.get('page') ?? 1);
  const pageSize = Number(q.get('pageSize') ?? 25);
  const match = (t: ReturnType<typeof getTransactions>[number], skip?: 'status' | 'category') =>
    (needle === '' ||
      t.customer.toLowerCase().includes(needle) ||
      t.description.toLowerCase().includes(needle)) &&
    (!from || t.date >= from) &&
    (!before || t.date < before) &&
    (skip === 'status' || status.length === 0 || status.includes(t.status)) &&
    (skip === 'category' || category.length === 0 || category.includes(t.category));
  const all = getTransactions().toSorted((a, b) => b.date.localeCompare(a.date));
  const rows = all.filter((t) => match(t));
  const count = <K extends string>(keys: readonly K[], skip: 'status' | 'category') =>
    Object.fromEntries(
      keys.map((k) => [k, all.filter((t) => match(t, skip) && t[skip] === k).length]),
    );
  return ok({
    transactions: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
    facets: {
      status: count(TRANSACTION_STATUSES, 'status'),
      category: count(TRANSACTION_CATEGORIES, 'category'),
    },
  });
}

/* The notifications the mock serves: three, two unread, newest first, anchored to FAKE_NOW. */
export const MOCK_NOTIFICATIONS: readonly Notification[] = [
  {
    id: 'ntf-1',
    kind: 'security',
    title: 'New sign-in to your account',
    body: 'Chrome on macOS.',
    link: null,
    createdAt: new Date(Date.parse(FAKE_NOW) - 14 * 60_000).toISOString(),
    readAt: null,
  },
  {
    id: 'ntf-2',
    kind: 'team',
    title: 'Invitation sent',
    body: 'Ada invited Priya Shah as editor.',
    link: '/admin/users',
    createdAt: new Date(Date.parse(FAKE_NOW) - 95 * 60_000).toISOString(),
    readAt: null,
  },
  {
    id: 'ntf-3',
    kind: 'account',
    title: 'Your role changed',
    body: null,
    link: null,
    createdAt: new Date(Date.parse(FAKE_NOW) - 3 * 86_400_000).toISOString(),
    readAt: new Date(Date.parse(FAKE_NOW) - 2 * 86_400_000).toISOString(),
  },
];
export const MOCK_PREFERENCES: readonly NotificationPreference[] = [
  {
    kind: 'account',
    label: 'Account',
    description: 'Changes to your account.',
    inApp: true,
    email: true,
    inAppLocked: false,
  },
  {
    kind: 'security',
    label: 'Security',
    description: 'New sign-ins and password changes.',
    inApp: true,
    email: true,
    inAppLocked: true,
  },
  {
    kind: 'team',
    label: 'Team',
    description: 'What happens around you.',
    inApp: true,
    email: false,
    inAppLocked: false,
  },
  {
    kind: 'system',
    label: 'System',
    description: 'Announcements.',
    inApp: true,
    email: false,
    inAppLocked: false,
  },
];

function defaults(user: SessionUser | null, settings: SettingsValues): Record<string, Handler> {
  const signedIn =
    (reply: () => MockReply): Handler =>
    () =>
      user ? reply() : fail(401, 'unauthenticated', 'Sign in first.');
  const admin =
    (reply: () => MockReply): Handler =>
    () =>
      !user
        ? fail(401, 'unauthenticated', 'Sign in first.')
        : user.role !== 'admin'
          ? fail(403, 'forbidden', 'Admins only.')
          : reply();
  return {
    'GET /api/health': ok({ service: 'base-app-api', uptimeSec: 1, time: '2026-10-01T09:00:00Z' }),
    'GET /api/auth/me': ok({ user }),
    'POST /api/auth/logout': ok({}),
    'GET /api/transactions': (req) =>
      !user
        ? fail(401, 'unauthenticated', 'Sign in first.')
        : req.query.size === 0
          ? ok({ transactions: [...getTransactions()] })
          : transactionsPage(req.query),
    'GET /api/activity': signedIn(() => ok({ activity: [...getRecentActivity()] })),
    'GET /api/metrics/kpis': signedIn(() => ok({ kpis: [...getKpis()] })),
    'GET /api/metrics/revenue': signedIn(() => {
      const { revenue, costs } = getRevenueSeries(90);
      return ok({ revenue: [...revenue], costs: [...costs] });
    }),
    'GET /api/metrics/categories': signedIn(() => ok({ categories: [...getCategoryBreakdown()] })),
    'GET /api/metrics/signups': signedIn(() => ok({ signups: [...getMonthlySignups()] })),
    'GET /api/metrics/spend-by-status': signedIn(() =>
      ok({
        breakdown: TRANSACTION_STATUSES.map((status) => ({
          status,
          data: TRANSACTION_CATEGORIES.map((label) => ({
            label,
            value: getTransactions()
              .filter((t) => t.status === status && t.category === label)
              .reduce((a, t) => a + t.amountMinor, 0),
          })),
        })),
      }),
    ),
    'GET /api/notifications/unread-count': signedIn(() =>
      ok({ unreadCount: MOCK_NOTIFICATIONS.filter((n) => n.readAt === null).length }),
    ),
    'GET /api/notifications': (req) =>
      !user
        ? fail(401, 'unauthenticated', 'Sign in first.')
        : ok({
            notifications: MOCK_NOTIFICATIONS.filter(
              (n) => req.query.get('unread') !== '1' || n.readAt === null,
            ),
            nextCursor: null,
          }),
    'POST /api/notifications/read-all': signedIn(() => ok({ marked: 2, unreadCount: 0 })),
    'GET /api/notifications/preferences': signedIn(() =>
      ok({ preferences: MOCK_PREFERENCES.map((p) => ({ ...p })) }),
    ),
    'GET /api/account': signedIn(() =>
      ok({
        account: user
          ? { id: user.id, name: user.name, email: user.email, role: user.role, avatarUrl: null }
          : null,
      }),
    ),
    'GET /api/account/sessions': signedIn(() =>
      ok({
        sessions: [
          {
            id: 'session-current',
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/126.0 Safari/537.36',
            ip: '203.0.113.5',
            createdAt: '2026-10-12T08:00:00.000Z',
            lastSeenAt: '2026-10-12T09:00:00.000Z',
            current: true,
          },
        ],
      }),
    ),
    'GET /api/users': admin(() => ok({ users: [...getUsers()] })),
    'GET /api/audit-log': admin(() => ok({ events: [...getAuditLog()] })),
    'GET /api/db/ping': admin(() => ok({ driver: 'sqlite', latencyMs: 1 })),
    // a stateful store: a PUT is what the next GET returns, as on the server
    'GET /api/settings': signedIn(() => ok({ settings: { ...settings } })),
    'PUT /api/settings': (req) => {
      if (!user) return fail(401, 'unauthenticated', 'Sign in first.');
      if (user.role !== 'admin') return fail(403, 'forbidden', 'Admins only.');
      Object.assign(settings, req.body as Partial<SettingsValues>);
      return ok({ settings: { ...settings } });
    },
  };
}

export function mockApi(opts: MockApiOptions = {}) {
  const user = opts.user === undefined ? ADMIN : opts.user;
  const settings: SettingsValues = { ...DEFAULT_SETTINGS, ...opts.settings };
  const routes = { ...defaults(user, settings), ...opts.routes };
  const calls: string[] = [];
  const held: (() => void)[] = [];
  let holding = opts.delay ?? false;

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), 'http://127.0.0.1');
    const method = init?.method ?? 'GET';
    const key = `${method} ${url.pathname}`;
    calls.push(key);
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    const handler = routes[key];
    const reply: MockReply = !handler
      ? fail(404, 'not_found', 'No such route')
      : typeof handler === 'function'
        ? handler({ method, path: url.pathname, query: url.searchParams, body })
        : handler;
    if (holding) await new Promise<void>((resolve) => held.push(resolve));
    return new Response(JSON.stringify(reply.body), {
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetchMock);

  return {
    calls,
    fetch: fetchMock,
    /** The mock server's settings, live: change them to see the app react. */
    settings,
    /** Start holding responses from now on (as { delay: true } does from the start). */
    hold() {
      holding = true;
    },
    /** Let held responses through (with { delay: true }). */
    release() {
      holding = false;
      for (const resolve of held.splice(0)) resolve();
    },
  };
}
