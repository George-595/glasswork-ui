import type {
  ActivityItem,
  AuditEvent,
  Category,
  LabelValue,
  Transaction,
  TransactionSortKey,
} from '../../shared/api.ts';
import type { DbExecutor, SqlParam } from '../infra/db/types.ts';

/* SQL for the read-mostly records: transactions, the audit log and activity.
   Newest first everywhere. Timestamps are bound as Date and read back as ISO-8601 UTC
   strings, on every driver. */

type TxRow = {
  id: string;
  occurred_at: string;
  customer: string;
  description: string;
  category: string;
  amount_minor: number | string;
  currency: string;
  status: string;
};

const TX_COLUMNS =
  'id, occurred_at, customer, description, category, amount_minor, currency, status';

function toTransaction(r: TxRow): Transaction {
  return {
    id: r.id,
    date: r.occurred_at,
    customer: r.customer,
    description: r.description,
    category: r.category as Category,
    amountMinor: Number(r.amount_minor),
    currency: 'GBP',
    status: r.status as Transaction['status'],
  };
}

/* The only columns a caller can sort by. A request never reaches the SQL text:
   it picks a key from this map, and the map holds the column. */
const SORT_COLUMN: Record<TransactionSortKey, string> = {
  date: 'occurred_at',
  customer: 'customer',
  description: 'description',
  category: 'category',
  amount: 'amount_minor',
  status: 'status',
};

/** Already validated by the service: the sort keys are whitelisted, the numbers are integers. */
export interface TransactionFilters {
  /** Lower-cased search text; matched against customer and description. */
  q?: string;
  status: readonly string[];
  category: readonly string[];
  /** Inclusive lower bound on occurred_at (an ISO instant or YYYY-MM-DD, read as UTC). */
  from?: string;
  /** Exclusive upper bound on occurred_at. */
  before?: string;
}
export interface TransactionPageSpec extends TransactionFilters {
  sort: readonly { key: TransactionSortKey; desc: boolean }[];
  limit: number;
  offset: number;
}

/* LIKE has no portable backslash escape (MySQL reads it as a string escape), so
   '!' is the escape character on every driver. */
function likePattern(text: string): string {
  return `%${text.replace(/[!%_]/g, (c) => `!${c}`)}%`;
}

/* WHERE for the filters, leaving out the facet named in `omit`. Values are
   always bound; only fixed column names and placeholders are in the text. */
function where(f: TransactionFilters, omit?: 'status' | 'category') {
  const clauses: string[] = [];
  const params: SqlParam[] = [];
  if (f.q) {
    clauses.push(`(LOWER(customer) LIKE ? ESCAPE '!' OR LOWER(description) LIKE ? ESCAPE '!')`);
    const pattern = likePattern(f.q);
    params.push(pattern, pattern);
  }
  if (f.from) {
    clauses.push('occurred_at >= ?');
    params.push(new Date(f.from));
  }
  if (f.before) {
    clauses.push('occurred_at < ?');
    params.push(new Date(f.before));
  }
  if (omit !== 'status' && f.status.length > 0) {
    clauses.push(`status IN (${f.status.map(() => '?').join(', ')})`);
    params.push(...f.status);
  }
  if (omit !== 'category' && f.category.length > 0) {
    clauses.push(`category IN (${f.category.map(() => '?').join(', ')})`);
    params.push(...f.category);
  }
  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

export function transactionsRepository(db: DbExecutor) {
  async function facet(column: 'status' | 'category', f: TransactionFilters) {
    const w = where(f, column);
    const rows = await db.query<{ k: string; n: number | string }>(
      `SELECT ${column} AS k, COUNT(*) AS n FROM transactions ${w.sql} GROUP BY ${column}`,
      w.params,
    );
    return new Map(rows.map((r) => [r.k, Number(r.n)]));
  }

  return {
    async list(): Promise<Transaction[]> {
      const rows = await db.query<TxRow>(
        `SELECT ${TX_COLUMNS} FROM transactions ORDER BY occurred_at DESC`,
      );
      return rows.map(toTransaction);
    },
    async byId(id: string): Promise<Transaction | null> {
      const rows = await db.query<TxRow>(`SELECT ${TX_COLUMNS} FROM transactions WHERE id = ?`, [
        id,
      ]);
      const row = rows[0];
      return row ? toTransaction(row) : null;
    },
    /** One customer's transactions other than `exceptId`: the newest `limit`, and how many in all. */
    async relatedTo(
      customer: string,
      exceptId: string,
      limit: number,
    ): Promise<{ count: number; items: Transaction[] }> {
      // LIMIT is inlined as a checked integer (see activityRepository.latest).
      const n = Math.max(1, Math.min(100, Math.floor(limit)));
      const counted = await db.query<{ n: number | string }>(
        'SELECT COUNT(*) AS n FROM transactions WHERE customer = ? AND id <> ?',
        [customer, exceptId],
      );
      const rows = await db.query<TxRow>(
        `SELECT ${TX_COLUMNS} FROM transactions WHERE customer = ? AND id <> ?
         ORDER BY occurred_at DESC, id LIMIT ${n}`,
        [customer, exceptId],
      );
      return { count: Number(counted[0]?.n ?? 0), items: rows.map(toTransaction) };
    },
    /** One page of the filtered, sorted rows, plus the total behind it. */
    async page(spec: TransactionPageSpec): Promise<{ rows: Transaction[]; total: number }> {
      const w = where(spec);
      const counted = await db.query<{ n: number | string }>(
        `SELECT COUNT(*) AS n FROM transactions ${w.sql}`,
        w.params,
      );
      const order = [
        ...spec.sort.map((s) => `${SORT_COLUMN[s.key]} ${s.desc ? 'DESC' : 'ASC'}`),
        'id',
      ].join(', ');
      // LIMIT and OFFSET are inlined as checked integers: MySQL rejects them bound.
      const limit = Math.max(1, Math.min(100, Math.floor(spec.limit)));
      const offset = Math.max(0, Math.floor(spec.offset));
      const rows = await db.query<TxRow>(
        `SELECT ${TX_COLUMNS} FROM transactions ${w.sql}
         ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`,
        w.params,
      );
      return { rows: rows.map(toTransaction), total: Number(counted[0]?.n ?? 0) };
    },
    /** Row counts per status and per category, each under every filter but its own. */
    async facets(f: TransactionFilters): Promise<{
      status: Map<string, number>;
      category: Map<string, number>;
    }> {
      return { status: await facet('status', f), category: await facet('category', f) };
    },
    /** The spend split, aggregated in the database. */
    async totalsByCategory(): Promise<LabelValue[]> {
      const rows = await db.query<{ category: string; total: number | string }>(
        `SELECT category, SUM(amount_minor) AS total
         FROM transactions GROUP BY category ORDER BY total DESC`,
      );
      return rows.map((r) => ({ label: r.category, value: Number(r.total) }));
    },
    /** Spend per category and status, aggregated in the database. */
    async totalsByCategoryAndStatus(): Promise<
      { category: string; status: string; total: number }[]
    > {
      const rows = await db.query<{ category: string; status: string; total: number | string }>(
        `SELECT category, status, SUM(amount_minor) AS total
         FROM transactions GROUP BY category, status`,
      );
      return rows.map((r) => ({ category: r.category, status: r.status, total: Number(r.total) }));
    },
    async insert(t: Transaction): Promise<void> {
      await db.execute(
        `INSERT INTO transactions
           (id, occurred_at, customer, description, category, amount_minor, currency, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          t.id,
          new Date(t.date),
          t.customer,
          t.description,
          t.category,
          t.amountMinor,
          t.currency,
          t.status,
        ],
      );
    },
  };
}

type AuditRow = {
  id: string;
  occurred_at: string;
  actor_label: string;
  action: string;
  target: string;
  ip: string | null;
  outcome: string;
};

/** What the audit log records beyond the wire event: who (when they have an account) and why. */
export interface AuditInsert extends AuditEvent {
  actorUserId?: string | null;
  detail?: string | null;
}

export function auditRepository(db: DbExecutor) {
  return {
    async list(): Promise<AuditEvent[]> {
      const rows = await db.query<AuditRow>(
        'SELECT id, occurred_at, actor_label, action, target, ip, outcome FROM audit_events ORDER BY occurred_at DESC, id DESC',
      );
      return rows.map((r) => ({
        id: r.id,
        at: r.occurred_at,
        actor: r.actor_label,
        action: r.action as AuditEvent['action'],
        target: r.target,
        ip: r.ip ?? '',
        outcome: r.outcome as AuditEvent['outcome'],
      }));
    },
    /** Retention: deletes events that happened before `before`. */
    async deleteOccurredBefore(before: Date): Promise<number> {
      const r = await db.execute('DELETE FROM audit_events WHERE occurred_at < ?', [before]);
      return r.rowsAffected;
    },
    async insert(e: AuditInsert): Promise<void> {
      await db.execute(
        `INSERT INTO audit_events
           (id, occurred_at, actor_user_id, actor_label, action, target, ip, outcome, detail)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.id,
          new Date(e.at),
          e.actorUserId ?? null,
          e.actor,
          e.action,
          e.target,
          e.ip === '' ? null : e.ip,
          e.outcome,
          e.detail ?? null,
        ],
      );
    },
  };
}

type ActivityRow = {
  id: string;
  occurred_at: string;
  actor: string;
  summary: string;
  kind: string;
};

export function activityRepository(db: DbExecutor) {
  return {
    async latest(limit: number): Promise<ActivityItem[]> {
      // LIMIT is inlined as a checked integer: MySQL rejects a bound LIMIT ? in prepared statements.
      const n = Math.max(1, Math.min(100, Math.floor(limit)));
      const rows = await db.query<ActivityRow>(
        `SELECT id, occurred_at, actor, summary, kind FROM activity ORDER BY occurred_at DESC, id DESC LIMIT ${n}`,
      );
      return rows.map((r) => ({
        id: r.id,
        at: r.occurred_at,
        actor: r.actor,
        summary: r.summary,
        kind: r.kind as ActivityItem['kind'],
      }));
    },
    async insert(a: ActivityItem): Promise<void> {
      await db.execute(
        'INSERT INTO activity (id, occurred_at, actor, summary, kind) VALUES (?, ?, ?, ?, ?)',
        [a.id, new Date(a.at), a.actor, a.summary, a.kind],
      );
    },
  };
}
