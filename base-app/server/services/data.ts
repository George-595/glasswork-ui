import {
  TRANSACTION_CATEGORIES,
  TRANSACTION_SORT_KEYS,
  TRANSACTION_STATUSES,
  TRANSACTIONS_DEFAULT_PAGE_SIZE,
  TRANSACTIONS_MAX_PAGE_SIZE,
  TRANSACTIONS_MAX_SEARCH_LENGTH,
} from '../../lib/transactions.ts';
import type {
  ActivityItem,
  AuditEvent,
  InviteUserBody,
  Kpi,
  LabelValue,
  MetricPoint,
  Role,
  SessionUser,
  SpendByStatusResponse,
  Transaction,
  TransactionDetailResponse,
  TransactionFacets,
  TransactionSortKey,
  TransactionsPageResponse,
  TransactionsQuery,
  UpdateUserBody,
  User,
} from '../../shared/api.ts';
import { afterCommit } from '../infra/db/after-commit.ts';
import type { DbClient, DbExecutor } from '../infra/db/types.ts';
import { newId } from '../lib/ids.ts';
import { createRepositories } from '../repositories/index.ts';
import { ServiceError } from './errors.ts';
import { type KpiRange, kpisForRange } from './kpi-range.ts';
import type { Notifier } from './notifications.ts';
import { noopOutbox, noopStreams, type Outbox, type StreamDisconnector } from './platform-deps.ts';
import { emailLink, TOKEN_TTL_WORDS, type TokenService } from './tokens.ts';

/* The app's read models and its one write (inviting a user). Routes call
   these; these call repositories; repositories hold the SQL. */
const ROLES: readonly Role[] = ['admin', 'editor', 'viewer'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SORT_KEYS: readonly string[] = TRANSACTION_SORT_KEYS;
const STATUSES: readonly string[] = TRANSACTION_STATUSES;
const CATEGORIES: readonly string[] = TRANSACTION_CATEGORIES;
const DEFAULT_SORT = [{ key: 'date', desc: true }] as const;
const RELATED_LIMIT = 5;

/* An ISO 8601 date or UTC timestamp (2026-10-01, 2026-10-01T09:00:00Z). Stored times are
   ISO text, so these compare as text and need no date maths in SQL. */
const INSTANT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?Z)?$/;
function instantParam(value: string | undefined, name: 'from' | 'before'): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!INSTANT.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ServiceError(
      'invalid',
      `invalid_${name}`,
      `"${name}" must be an ISO 8601 date or UTC time.`,
      name,
    );
  }
  return value;
}

/* Checks every part of a table-mode query and fills the defaults. Each failure
   names the field that is wrong, so the client can point at it. */
function planTransactionsQuery(query: TransactionsQuery) {
  const page = query.page ?? 1;
  if (!Number.isInteger(page) || page < 1 || page > 1_000_000) {
    throw new ServiceError(
      'invalid',
      'invalid_page',
      '"page" must be a whole number from 1.',
      'page',
    );
  }
  const pageSize = query.pageSize ?? TRANSACTIONS_DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > TRANSACTIONS_MAX_PAGE_SIZE) {
    throw new ServiceError(
      'invalid',
      'invalid_page_size',
      `"pageSize" must be a whole number from 1 to ${TRANSACTIONS_MAX_PAGE_SIZE}.`,
      'pageSize',
    );
  }
  const sort: { key: TransactionSortKey; desc: boolean }[] = [];
  for (const raw of query.sort ?? []) {
    const desc = raw.startsWith('-');
    const key = desc ? raw.slice(1) : raw;
    if (!SORT_KEYS.includes(key)) {
      throw new ServiceError(
        'invalid',
        'invalid_sort',
        `Cannot sort by "${key.slice(0, 40)}". Use ${TRANSACTION_SORT_KEYS.join(', ')}.`,
        'sort',
      );
    }
    if (sort.some((s) => s.key === key)) {
      throw new ServiceError('invalid', 'invalid_sort', `"${key}" is in "sort" twice.`, 'sort');
    }
    sort.push({ key: key as TransactionSortKey, desc });
  }
  const q = (query.q ?? '').trim();
  if (q.length > TRANSACTIONS_MAX_SEARCH_LENGTH) {
    throw new ServiceError(
      'invalid',
      'invalid_q',
      `"q" can be at most ${TRANSACTIONS_MAX_SEARCH_LENGTH} characters.`,
      'q',
    );
  }
  const status = [...new Set(query.status ?? [])];
  const bad = status.find((v) => !STATUSES.includes(v));
  if (bad !== undefined) {
    throw new ServiceError(
      'invalid',
      'invalid_status',
      `Unknown status "${bad.slice(0, 40)}". Use ${TRANSACTION_STATUSES.join(', ')}.`,
      'status',
    );
  }
  const category = [...new Set(query.category ?? [])];
  const badCategory = category.find((v) => !CATEGORIES.includes(v));
  if (badCategory !== undefined) {
    throw new ServiceError(
      'invalid',
      'invalid_category',
      `Unknown category "${badCategory.slice(0, 40)}". Use ${TRANSACTION_CATEGORIES.join(', ')}.`,
      'category',
    );
  }
  const from = instantParam(query.from, 'from');
  const before = instantParam(query.before, 'before');
  if (from !== undefined && before !== undefined && from >= before) {
    throw new ServiceError(
      'invalid',
      'invalid_range',
      '"from" must be earlier than "before".',
      'from',
    );
  }
  return {
    page,
    pageSize,
    // newest first unless the caller chose an order; id breaks every tie
    sort: sort.length > 0 ? sort : [...DEFAULT_SORT],
    filters: { q: q.toLowerCase(), status, category, from, before },
  };
}

function fillFacet<K extends string>(keys: readonly K[], counts: Map<string, number>) {
  return Object.fromEntries(keys.map((k) => [k, counts.get(k) ?? 0])) as Record<K, number>;
}

/* What the users writes tell the rest of the server. All optional: without them the writes
   behave as before and nobody is told or emailed. */
export interface DataServiceOptions {
  now?: () => Date;
  /** Told when a role or status changes (the user) and when someone is invited (the other admins). */
  notifier?: Notifier;
  /** Re-roles a user's open streams after the transaction commits. RealtimeHub satisfies it. */
  realtime?: {
    setRole(userId: string, role: Role): void;
  };
  /** Invitation links: without `tokens` an invitation is recorded but no email is sent. */
  tokens?: TokenService;
  outbox?: Outbox;
  appBaseUrl?: string;
  /** Closes a suspended user's open event streams. */
  streams?: StreamDisconnector;
}

export function createDataService(db: DbClient, opts: DataServiceOptions = {}) {
  const repos = createRepositories(db);
  const now = opts.now ?? (() => new Date());
  const outbox = opts.outbox ?? noopOutbox;
  const appBaseUrl = opts.appBaseUrl ?? 'http://localhost:5173';
  const streams = opts.streams ?? noopStreams;

  /* A fresh invitation token and its email, in the caller's transaction (a rollback sends
     nothing; issuing voids the user's older links). */
  const sendInvite = async (
    tx: DbExecutor,
    target: Pick<User, 'id' | 'name' | 'email'>,
    inviterName: string,
  ): Promise<void> => {
    if (!opts.tokens) return;
    const issued = await opts.tokens.issue(tx, target.id, 'invite');
    await outbox.sendEmail(tx, {
      to: target.email,
      template: 'invite',
      data: {
        name: target.name,
        inviterName,
        link: emailLink(appBaseUrl, 'accept-invite', issued.token),
        expiresIn: TOKEN_TTL_WORDS.invite,
      },
    });
  };

  return {
    transactions: (): Promise<Transaction[]> => repos.transactions.list(),
    /** Table mode: one filtered, sorted page and the facet counts for its filters. */
    async transactionsPage(
      query: TransactionsQuery,
    ): Promise<Omit<TransactionsPageResponse, 'ok'>> {
      const plan = planTransactionsQuery(query);
      const [{ rows, total }, counts] = await Promise.all([
        repos.transactions.page({
          ...plan.filters,
          sort: plan.sort,
          limit: plan.pageSize,
          offset: (plan.page - 1) * plan.pageSize,
        }),
        repos.transactions.facets(plan.filters),
      ]);
      const facets: TransactionFacets = {
        status: fillFacet(TRANSACTION_STATUSES, counts.status),
        category: fillFacet(TRANSACTION_CATEGORIES, counts.category),
      };
      return { transactions: rows, total, page: plan.page, pageSize: plan.pageSize, facets };
    },
    /** Every transaction a filter matches (up to `cap`), newest first, for the agent's
        summaries: the same checks as table mode, without its page size limit. */
    async transactionsMatching(
      query: Pick<TransactionsQuery, 'q' | 'status' | 'category' | 'from' | 'before' | 'sort'>,
      cap = 10_000,
    ): Promise<{ rows: Transaction[]; total: number }> {
      const plan = planTransactionsQuery(query);
      const limit = Math.max(1, Math.min(10_000, Math.floor(cap)));
      return repos.transactions.page({ ...plan.filters, sort: plan.sort, limit, offset: 0 });
    },
    /** One transaction and the same customer's other ones, for a detail drawer. */
    async transaction(id: string): Promise<Omit<TransactionDetailResponse, 'ok'>> {
      const transaction = await repos.transactions.byId(id);
      if (!transaction) {
        throw new ServiceError('not_found', 'transaction_not_found', 'No such transaction.');
      }
      const related = await repos.transactions.relatedTo(
        transaction.customer,
        transaction.id,
        RELATED_LIMIT,
      );
      return { transaction, relatedCount: related.count, related: related.items };
    },
    activity: (): Promise<ActivityItem[]> => repos.activity.latest(8),
    /** The stored KPIs; with `days`, measured over that range against the one before it. */
    async kpis(days?: KpiRange): Promise<Kpi[]> {
      const stored = await repos.metrics.kpis();
      if (days === undefined) return stored;
      return kpisForRange(stored, (await repos.metrics.revenueDaily()).revenue, days);
    },
    categories: (): Promise<LabelValue[]> => repos.transactions.totalsByCategory(),
    signups: (): Promise<LabelValue[]> => repos.metrics.signups(),
    auditLog: (): Promise<AuditEvent[]> => repos.audit.list(),
    users: (): Promise<User[]> => repos.users.list(),
    async dbPing(): Promise<{ driver: DbClient['driver']; latencyMs: number }> {
      const { latencyMs } = await db.ping();
      return { driver: db.driver, latencyMs };
    },

    /** The last `days` days of revenue and costs, oldest first; with `compare`, also the
        revenue of the `days` before them. */
    async revenue(
      days: number,
      compare = false,
    ): Promise<{ revenue: MetricPoint[]; costs: MetricPoint[]; previousRevenue?: MetricPoint[] }> {
      const all = await repos.metrics.revenueDaily();
      const current = { revenue: all.revenue.slice(-days), costs: all.costs.slice(-days) };
      return compare
        ? { ...current, previousRevenue: all.revenue.slice(-2 * days, -days) }
        : current;
    },

    /** Spend per category, split by status, every category present in each status. */
    async spendByStatus(): Promise<SpendByStatusResponse['breakdown']> {
      const rows = await repos.transactions.totalsByCategoryAndStatus();
      const total = new Map(rows.map((r) => [`${r.category}|${r.status}`, r.total]));
      return TRANSACTION_STATUSES.map((status) => ({
        status,
        data: TRANSACTION_CATEGORIES.map((category) => ({
          label: category,
          value: total.get(`${category}|${status}`) ?? 0,
        })),
      }));
    },

    /** Changes a user's role and/or status. Rules, checked inside one transaction: an admin
        cannot change their own role or suspend themself, the last active admin cannot be
        demoted or suspended, 'active' is only for a suspended user. One audit event per
        change. Suspending ends the user's sessions. */
    async updateUser(
      id: string,
      body: UpdateUserBody,
      actor: SessionUser,
      ip: string,
    ): Promise<User> {
      const wantsRole = body.role !== undefined;
      const wantsStatus = body.status !== undefined;
      if (!wantsRole && !wantsStatus) {
        throw new ServiceError('invalid', 'invalid_body', 'Send a role or a status.');
      }
      if (wantsRole && !ROLES.includes(body.role as Role)) {
        throw new ServiceError('invalid', 'invalid_role', 'Choose a role.', 'role');
      }
      if (wantsStatus && body.status !== 'active' && body.status !== 'suspended') {
        throw new ServiceError(
          'invalid',
          'invalid_status',
          'Status can only be set to active or suspended.',
          'status',
        );
      }
      // someone else moved this user's status between our read and our write
      const changedMeanwhile = () =>
        new ServiceError(
          'conflict',
          'user_changed',
          'This user changed while you were saving. Reload and try again.',
          'status',
        );
      const updated = await db.transaction(async (tx) => {
        const r = createRepositories(tx);
        const target = await r.users.findById(id);
        if (!target) throw new ServiceError('not_found', 'user_not_found', 'No such user.');

        const newRole = body.role ?? target.role;
        const roleChanges = wantsRole && newRole !== target.role;
        const suspends = body.status === 'suspended' && target.status !== 'suspended';
        const reactivates = body.status === 'active' && target.status === 'suspended';
        if (body.status === 'active' && target.status !== 'suspended') {
          throw new ServiceError(
            'conflict',
            'not_suspended',
            'Only a suspended user can be reactivated.',
            'status',
          );
        }

        if (target.id === actor.id && (roleChanges || suspends)) {
          throw new ServiceError(
            'conflict',
            'cannot_modify_self',
            'You cannot change your own role or suspend your own account.',
          );
        }
        const losesAdmin =
          target.role === 'admin' && target.status === 'active' && (roleChanges || suspends);
        if (losesAdmin && (await r.users.countActiveAdmins(target.id)) === 0) {
          throw new ServiceError(
            'conflict',
            'last_admin',
            'This is the last active admin. Make someone else an admin first.',
          );
        }

        const when = now();
        const at = when.toISOString();
        const audit = (action: AuditEvent['action'], detail: string) =>
          r.audit.insert({
            id: newId(),
            at,
            actorUserId: actor.id,
            actor: actor.name,
            action,
            target: detail,
            ip,
            outcome: 'success',
          });

        if (roleChanges) {
          await r.users.setRole(target.id, newRole, when);
          await audit('user.role', `${target.email} (${target.role} → ${newRole})`);
          await opts.notifier?.notify(tx, {
            userId: target.id,
            kind: 'account',
            title: 'Your role changed',
            body: `${actor.name} changed your role from ${target.role} to ${newRole}.`,
          });
          afterCommit(tx, () => opts.realtime?.setRole(target.id, newRole));
        }
        let status = target.status;
        if (suspends) {
          if (!(await r.users.moveStatus(target.id, [target.status], 'suspended', when)))
            throw changedMeanwhile();
          await r.sessions.revokeForUser(target.id, when);
          status = 'suspended';
          await audit('user.suspend', target.email);
          await opts.notifier?.notify(tx, {
            userId: target.id,
            kind: 'account',
            title: 'Your account was suspended',
            body: 'You are signed out everywhere. Ask an admin if you think this is a mistake.',
          });
          // their sessions were revoked above: end the open streams once that is committed
          afterCommit(tx, () => streams.disconnectUser(target.id));
        } else if (reactivates) {
          // someone who never set a password goes back to waiting for their invite
          status = (await r.users.hasPassword(target.id)) ? 'active' : 'invited';
          if (!(await r.users.moveStatus(target.id, ['suspended'], status, when)))
            throw changedMeanwhile();
          await audit('user.reactivate', target.email);
          await opts.notifier?.notify(tx, {
            userId: target.id,
            kind: 'account',
            title: 'Your account was reactivated',
            body: 'An admin restored your access.',
          });
        }
        return { ...target, role: newRole, status };
      });
      return updated;
    },

    /** Re-sends an invitation to a user who has not accepted yet: a fresh token (the old link
        stops working) and a fresh email, and the audit event. */
    async resendInvite(id: string, actor: SessionUser, ip: string): Promise<User> {
      return db.transaction(async (tx) => {
        const r = createRepositories(tx);
        const target = await r.users.findById(id);
        if (!target) throw new ServiceError('not_found', 'user_not_found', 'No such user.');
        if (target.status !== 'invited') {
          throw new ServiceError(
            'conflict',
            'not_invited',
            'Only a user who has not accepted yet can be sent a new invitation.',
          );
        }
        await sendInvite(tx, target, actor.name);
        await r.audit.insert({
          id: newId(),
          at: now().toISOString(),
          actorUserId: actor.id,
          actor: actor.name,
          action: 'user.resend_invite',
          target: target.email,
          ip,
          outcome: 'success',
        });
        return target;
      });
    },

    /** Creates an invited user (no password yet) and records it in the audit log. */
    async inviteUser(body: InviteUserBody, actor: SessionUser, ip: string): Promise<User> {
      const name = body.name.trim();
      const email = body.email.trim().toLowerCase();
      if (name === '' || name.length > 200) {
        throw new ServiceError('invalid', 'invalid_name', 'Enter a name.', 'name');
      }
      if (!EMAIL.test(email) || email.length > 254) {
        throw new ServiceError('invalid', 'invalid_email', 'Enter a valid email address.', 'email');
      }
      if (!ROLES.includes(body.role)) {
        throw new ServiceError('invalid', 'invalid_role', 'Choose a role.', 'role');
      }
      const at = now().toISOString();
      const user: User = {
        id: newId(),
        name,
        email,
        role: body.role,
        status: 'invited',
        team: 'Unassigned',
        createdAt: at,
        lastActiveAt: at,
      };
      await db.transaction(async (tx) => {
        const r = createRepositories(tx);
        if (await r.users.findCredentialsByEmail(email)) {
          throw new ServiceError(
            'conflict',
            'email_taken',
            'A user with that email already exists.',
            'email',
          );
        }
        await r.users.insert(user);
        // "Send welcome email" off: the person is recorded, no link exists until an admin re-sends
        if (body.sendWelcome) await sendInvite(tx, user, actor.name);
        await r.audit.insert({
          id: newId(),
          at,
          actorUserId: actor.id,
          actor: actor.name,
          action: 'user.invite',
          target: email,
          ip,
          outcome: 'success',
        });
        await opts.notifier?.notifyAdmins(
          tx,
          {
            kind: 'team',
            title: 'Invitation sent',
            body: `${actor.name} invited ${name} (${email}) as ${body.role}.`,
            link: '/admin/users',
          },
          { exceptUserId: actor.id },
        );
      });
      return user;
    },
  };
}
export type DataService = ReturnType<typeof createDataService>;
