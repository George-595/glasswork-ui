import { formatMoney } from '../../../lib/format.ts';
import { TRANSACTION_CATEGORIES, TRANSACTION_STATUSES } from '../../../lib/transactions.ts';
import type { AgentVisual, Role, Transaction, VisualTool } from '../../../shared/api.ts';
import type { DataService } from '../data.ts';
import type { ViewsService } from '../views.ts';
import { type Action, defineAction } from './define.ts';
import { DATA_QUERY, describeSeries, resolveQuery } from './queries.ts';
import {
  describeVisual,
  renderVisual,
  SHOW_CHART,
  SHOW_DIAGRAM,
  SHOW_KPIS,
  SHOW_TABLE,
  VISUAL_TOOLS,
} from './visuals.ts';

/* The app's actions: everything the assistant can do, and that a page can call directly. A
   new feature adds its action here and is at once reachable from the chat. Keep each one a
   thin call into a service: the rules live in the service, the action only says what the
   input is and how the result reads. */

const clip = (text: string, max = 12_000): string =>
  text.length > max ? `${text.slice(0, max)}… (cut at ${max} characters)` : text;
const json = (v: unknown) => clip(JSON.stringify(v));

const FILTERS = {
  search: { type: 'string', maxLength: 100, description: 'text in the customer or description' },
  status: { type: 'array', items: { type: 'string', enum: TRANSACTION_STATUSES }, maxItems: 4 },
  category: { type: 'array', items: { type: 'string', enum: TRANSACTION_CATEGORIES }, maxItems: 5 },
  from: { type: 'string', format: 'date', description: 'on or after this UTC day' },
  before: { type: 'string', format: 'date', description: 'before this UTC day' },
} as const;

/* Pages the assistant may link to, by the least role that sees them. */
const PAGES: Record<string, { path: string; role: Role }> = {
  home: { path: '/', role: 'viewer' },
  table: { path: '/table', role: 'viewer' },
  graphs: { path: '/graphs', role: 'viewer' },
  views: { path: '/views', role: 'viewer' },
  notifications: { path: '/notifications', role: 'viewer' },
  account: { path: '/account', role: 'viewer' },
  users: { path: '/admin/users', role: 'admin' },
  settings: { path: '/admin/settings', role: 'admin' },
  'audit-log': { path: '/admin/audit-log', role: 'admin' },
  jobs: { path: '/admin/jobs', role: 'admin' },
};

const txRow = (t: Transaction) => ({
  id: t.id,
  date: t.date.slice(0, 10),
  customer: t.customer,
  description: t.description,
  category: t.category,
  amount: t.amountMinor / 100,
  status: t.status,
});

export function createActions(deps: { data: DataService; views: ViewsService }): Action[] {
  const { data, views } = deps;

  const visualAction = <
    const S extends typeof SHOW_CHART | typeof SHOW_KPIS | typeof SHOW_TABLE | typeof SHOW_DIAGRAM,
  >(
    name: VisualTool,
    title: string,
    description: string,
    input: S,
  ) =>
    defineAction({
      name,
      title,
      description,
      effect: 'visual',
      role: 'viewer',
      input,
      run: (_ctx, i) => renderVisual(data, name, i),
      visual: (v: AgentVisual) => v,
      summary: (v: AgentVisual) => ('title' in v && v.title ? v.title : title),
      forModel: (v: AgentVisual) => describeVisual(v),
    });

  return [
    // ---- read ----
    defineAction({
      name: 'search_transactions',
      title: 'Search transactions',
      description:
        'Find transactions (payments) by text, status, category and date, newest first or by amount. Returns up to 25 rows and the total that match. Set show to true to put the rows in front of the person as a table.',
      effect: 'read',
      role: 'viewer',
      input: {
        type: 'object',
        properties: {
          ...FILTERS,
          sort: { type: 'string', enum: ['-date', 'date', '-amount', 'amount'] },
          limit: { type: 'integer', minimum: 1, maximum: 25 },
          show: { type: 'boolean', description: 'show the rows to the person as a table' },
        },
        additionalProperties: false,
      },
      async run(_ctx, i) {
        const page = await data.transactionsPage({
          page: 1,
          pageSize: i.limit ?? 10,
          sort: [i.sort ?? '-date'],
          ...(i.search ? { q: i.search } : {}),
          ...(i.status ? { status: i.status } : {}),
          ...(i.category ? { category: i.category } : {}),
          ...(i.from ? { from: i.from } : {}),
          ...(i.before ? { before: i.before } : {}),
        });
        return { total: page.total, rows: page.transactions.map(txRow) };
      },
      summary: (r) => `${r.rows.length} of ${r.total}`,
      visual: (r, i) =>
        i.show
          ? {
              kind: 'table',
              title: `Transactions (${r.rows.length} of ${r.total})`,
              columns: [
                { key: 'date', label: 'Date', format: 'date' },
                { key: 'customer', label: 'Customer' },
                { key: 'description', label: 'Description' },
                { key: 'category', label: 'Category' },
                { key: 'amount', label: 'Amount', format: 'gbp' },
                { key: 'status', label: 'Status' },
              ],
              rows: r.rows,
            }
          : undefined,
      forModel: (r) => json({ total: r.total, rows: r.rows, amounts: 'pounds' }),
    }),

    defineAction({
      name: 'get_transaction',
      title: 'Open a transaction',
      description: 'One transaction by id, with the same customer’s other recent transactions.',
      effect: 'read',
      role: 'viewer',
      input: {
        type: 'object',
        properties: { id: { type: 'string', minLength: 1, maxLength: 64 } },
        required: ['id'],
        additionalProperties: false,
      },
      run: async (_ctx, i) => {
        const d = await data.transaction(i.id);
        return {
          transaction: txRow(d.transaction),
          relatedCount: d.relatedCount,
          related: d.related.map(txRow),
        };
      },
      summary: (r) =>
        `${r.transaction.customer}, ${formatMoney(Math.round(r.transaction.amount * 100))}`,
      forModel: (r) => json({ ...r, amounts: 'pounds' }),
    }),

    defineAction({
      name: 'query_data',
      title: 'Read the numbers',
      description:
        'Sum, count or average transactions by category, status, customer or time (or read revenue or signups) to answer a question. The numbers come back to you; nothing is shown. To show them, use show_chart or show_table with the same query.',
      effect: 'read',
      role: 'viewer',
      input: {
        type: 'object',
        properties: { query: DATA_QUERY },
        required: ['query'],
        additionalProperties: false,
      },
      run: (_ctx, i) => resolveQuery(data, i.query),
      summary: (r) =>
        r.rows !== undefined ? `${r.rows} rows read` : `${r.series[0]?.points.length ?? 0} points`,
      forModel: (r) =>
        clip(
          `${r.rows !== undefined ? `From ${r.rows} transactions.\n` : ''}${describeSeries(r.series, r.format, 400)}`,
        ),
    }),

    defineAction({
      name: 'get_kpis',
      title: 'Read the KPIs',
      description:
        "The app's headline KPIs (revenue, active users, conversion, open tickets), optionally over the last 7, 30 or 90 days against the period before. Money is pence; percent is a ratio.",
      effect: 'read',
      role: 'viewer',
      input: {
        type: 'object',
        properties: { days: { type: 'integer', enum: [7, 30, 90] } },
        additionalProperties: false,
      },
      run: (_ctx, i) => data.kpis(i.days as 7 | 30 | 90 | undefined),
      summary: (r) => `${r.length} KPIs`,
      forModel: (r) => json(r.map(({ trend: _trend, ...k }) => k)),
    }),

    defineAction({
      name: 'get_activity',
      title: 'Read recent activity',
      description: 'The latest things that happened in the workspace.',
      effect: 'read',
      role: 'viewer',
      input: { type: 'object', properties: {}, additionalProperties: false },
      run: () => data.activity(),
      summary: (r) => `${r.length} events`,
      forModel: (r) => json(r),
    }),

    defineAction({
      name: 'list_users',
      title: 'List users',
      description: 'Everyone with an account: id, name, email, role, status, team.',
      effect: 'read',
      role: 'admin',
      input: { type: 'object', properties: {}, additionalProperties: false },
      run: async () =>
        (await data.users()).map((u) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status,
          team: u.team,
        })),
      summary: (r) => `${r.length} users`,
      forModel: (r) => json(r),
    }),

    defineAction({
      name: 'get_audit_log',
      title: 'Read the audit log',
      description: 'Recent security and admin events: who did what, when, from where.',
      effect: 'read',
      role: 'admin',
      input: {
        type: 'object',
        properties: { limit: { type: 'integer', minimum: 1, maximum: 50 } },
        additionalProperties: false,
      },
      run: async (_ctx, i) => (await data.auditLog()).slice(0, i.limit ?? 20),
      summary: (r) => `${r.length} events`,
      forModel: (r) => json(r),
    }),

    // ---- visual ----
    visualAction(
      'show_chart',
      'Draw a chart',
      'Show the person a chart. Give a query (the server reads the numbers from the database: always prefer this) or series you worked out yourself. line/area for time, bar to compare, donut for shares.',
      SHOW_CHART,
    ),
    visualAction(
      'show_kpis',
      'Show KPI tiles',
      'Show big-number tiles: the app’s headline KPIs (give days, or nothing for the stored ones) or figures you worked out from tool results (tiles).',
      SHOW_KPIS,
    ),
    visualAction(
      'show_table',
      'Show a table',
      'Show a table: a query’s numbers by group (from the database), or columns and rows you put together from tool results.',
      SHOW_TABLE,
    ),
    visualAction(
      'show_diagram',
      'Draw a diagram',
      'Draw a flow diagram (boxes and arrows) to explain a process, a sequence or how things connect. Short labels; a detail line per box is optional.',
      SHOW_DIAGRAM,
    ),
    defineAction({
      name: 'open_page',
      title: 'Link to a page',
      description:
        'Give the person a link to a page of the app. For the transactions table you can pre-set its filters. They choose whether to open it.',
      effect: 'visual',
      role: 'viewer',
      input: {
        type: 'object',
        properties: {
          page: { type: 'string', enum: Object.keys(PAGES) },
          label: { type: 'string', minLength: 1, maxLength: 60, description: 'the link text' },
          search: FILTERS.search,
          status: FILTERS.status,
          category: FILTERS.category,
          from: { type: 'string', format: 'date', description: 'table: first day' },
          to: { type: 'string', format: 'date', description: 'table: last day (inclusive)' },
        },
        required: ['page', 'label'],
        additionalProperties: false,
      },
      async run(ctx, i) {
        const page = PAGES[i.page];
        const rank = { viewer: 0, editor: 1, admin: 2 };
        if (!page || rank[ctx.user.role] < rank[page.role]) {
          return { path: '/', label: i.label };
        }
        const params = new URLSearchParams();
        if (i.page === 'table') {
          if (i.search) params.set('q', i.search);
          if (i.status?.length) params.set('status', i.status.join(','));
          if (i.category?.length) params.set('category', i.category.join(','));
          if (i.from) params.set('from', i.from);
          if (i.to) params.set('to', i.to);
        }
        const qs = params.toString();
        return { path: qs ? `${page.path}?${qs}` : page.path, label: i.label };
      },
      visual: (r): AgentVisual => ({ kind: 'link', label: r.label, path: r.path }),
      summary: (r) => r.path,
      forModel: (r) => describeVisual({ kind: 'link', label: r.label, path: r.path }),
    }),

    // ---- write ----
    defineAction({
      name: 'save_view',
      title: 'Save a view',
      description:
        'Pin a visual to the person’s Views page, where it is drawn fresh from the database each time. Give the show_* tool and the same input you gave it. Use when they ask to save, pin or keep a chart.',
      effect: 'write',
      role: 'viewer',
      input: {
        type: 'object',
        properties: {
          title: { type: 'string', minLength: 1, maxLength: 200 },
          tool: { type: 'string', enum: VISUAL_TOOLS },
          spec: { type: 'object', description: 'the input of that show_* call' },
        },
        required: ['title', 'tool', 'spec'],
        additionalProperties: false,
      },
      run: (ctx, i) => views.save(ctx.user, i.title, i.tool, i.spec),
      summary: (v) => `Saved “${v.title}”`,
      forModel: (v) => `Saved the view "${v.title}" (id ${v.id}). It is on the Views page.`,
    }),
    defineAction({
      name: 'delete_view',
      title: 'Remove a saved view',
      description: 'Remove one of the person’s saved views by id.',
      effect: 'write',
      role: 'viewer',
      confirm: true,
      destructive: true,
      input: {
        type: 'object',
        properties: { id: { type: 'string', minLength: 1, maxLength: 64 } },
        required: ['id'],
        additionalProperties: false,
      },
      run: async (ctx, i) => {
        await views.remove(ctx.user, i.id);
        return { id: i.id };
      },
      summary: () => 'Removed',
      describe: (i) => ({
        title: 'Remove a saved view',
        details: [{ term: 'View', detail: i.id }],
      }),
    }),
    defineAction({
      name: 'invite_user',
      title: 'Invite a user',
      description: 'Create an account for someone and (by default) email them an invitation link.',
      effect: 'write',
      role: 'admin',
      confirm: true,
      input: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 1, maxLength: 200 },
          email: { type: 'string', minLength: 3, maxLength: 254 },
          role: { type: 'string', enum: ['admin', 'editor', 'viewer'] },
          sendWelcome: { type: 'boolean', description: 'email the invitation (default true)' },
        },
        required: ['name', 'email', 'role'],
        additionalProperties: false,
      },
      run: (ctx, i) =>
        data.inviteUser(
          { name: i.name, email: i.email, role: i.role, sendWelcome: i.sendWelcome ?? true },
          ctx.user,
          ctx.ip,
        ),
      summary: (u) => `Invited ${u.email}`,
      forModel: (u) => json({ invited: { id: u.id, name: u.name, email: u.email, role: u.role } }),
      describe: (i) => ({
        title: `Invite ${i.name}`,
        details: [
          { term: 'Email', detail: i.email },
          { term: 'Role', detail: i.role },
          { term: 'Invitation email', detail: (i.sendWelcome ?? true) ? 'Sent now' : 'Not sent' },
        ],
      }),
    }),
    defineAction({
      name: 'update_user',
      title: 'Change a user',
      description:
        'Change a user’s role, or suspend or reactivate them (id from list_users). Suspending signs them out everywhere.',
      effect: 'write',
      role: 'admin',
      confirm: true,
      destructive: true,
      input: {
        type: 'object',
        properties: {
          userId: { type: 'string', minLength: 1, maxLength: 64 },
          role: { type: 'string', enum: ['admin', 'editor', 'viewer'] },
          status: { type: 'string', enum: ['active', 'suspended'] },
        },
        required: ['userId'],
        additionalProperties: false,
      },
      run: (ctx, i) =>
        data.updateUser(
          i.userId,
          { ...(i.role ? { role: i.role } : {}), ...(i.status ? { status: i.status } : {}) },
          ctx.user,
          ctx.ip,
        ),
      summary: (u) => `${u.email}: ${u.role}, ${u.status}`,
      forModel: (u) =>
        json({ updated: { id: u.id, email: u.email, role: u.role, status: u.status } }),
      describe: async (i) => {
        const target = (await data.users()).find((u) => u.id === i.userId);
        return {
          title: i.status === 'suspended' ? 'Suspend a user' : 'Change a user',
          details: [
            { term: 'User', detail: target ? `${target.name} (${target.email})` : i.userId },
            ...(i.role ? [{ term: 'New role', detail: i.role }] : []),
            ...(i.status ? [{ term: 'New status', detail: i.status }] : []),
          ],
        };
      },
    }),
  ];
}
