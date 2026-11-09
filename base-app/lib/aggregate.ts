import { TRANSACTION_CATEGORIES, TRANSACTION_STATUSES } from './transactions.ts';

/* Transactions summed, counted or averaged by a dimension, as chart series. Pure: the server's
   agent actions run it over the rows a query found, and a page could run it over rows it
   already holds (ENGINEERING §14 rule 71).

   Money comes in as minor units and goes out as pounds, the unit every visual uses. Time
   groups are UTC days, ISO weeks (named by their Monday) and months, in order, with the empty
   ones in between filled with 0 so a line does not jump over a quiet week. Categories and
   statuses keep their fixed order; customers are ranked by the measure and cut to `limit`. */

export const AGGREGATE_GROUPS = ['category', 'status', 'customer', 'day', 'week', 'month'] as const;
export const AGGREGATE_METRICS = ['total', 'count', 'average'] as const;
export const AGGREGATE_SPLITS = ['status', 'category'] as const;
export type AggregateGroup = (typeof AGGREGATE_GROUPS)[number];
export type AggregateMetric = (typeof AGGREGATE_METRICS)[number];
export type AggregateSplit = (typeof AGGREGATE_SPLITS)[number];

export interface AggregateRow {
  /** ISO timestamp, UTC. */
  date: string;
  customer: string;
  category: string;
  status: string;
  amountMinor: number;
}
export interface AggregateSpec {
  groupBy: AggregateGroup;
  metric: AggregateMetric;
  splitBy?: AggregateSplit;
  /** Most groups to keep when grouping by customer (default 10). */
  limit?: number;
}
export interface AggregateSeries {
  name: string;
  points: { x: string; y: number }[];
}

const METRIC_NAME: Record<AggregateMetric, string> = {
  total: 'Total',
  count: 'Transactions',
  average: 'Average',
};
const DAY_MS = 86_400_000;

/** The Monday (YYYY-MM-DD) of the ISO week holding a UTC day. */
export function weekOf(day: string): string {
  const t = Date.parse(`${day}T00:00:00Z`);
  const weekday = (new Date(t).getUTCDay() + 6) % 7; // Monday 0
  return new Date(t - weekday * DAY_MS).toISOString().slice(0, 10);
}

function keyOf(row: AggregateRow, by: AggregateGroup | AggregateSplit): string {
  switch (by) {
    case 'day':
      return row.date.slice(0, 10);
    case 'week':
      return weekOf(row.date.slice(0, 10));
    case 'month':
      return row.date.slice(0, 7);
    default:
      return row[by];
  }
}

/* Every key from the first to the last, for a time group. */
function fillTime(keys: string[], by: 'day' | 'week' | 'month'): string[] {
  if (keys.length === 0) return keys;
  const sorted = [...keys].sort();
  const first = sorted[0] as string;
  const last = sorted[sorted.length - 1] as string;
  const out: string[] = [];
  if (by === 'month') {
    let [y, m] = first.split('-').map(Number) as [number, number];
    for (let guard = 0; guard < 600; guard++) {
      const key = `${y}-${String(m).padStart(2, '0')}`;
      out.push(key);
      if (key >= last) break;
      m = m === 12 ? 1 : m + 1;
      if (m === 1) y++;
    }
    return out;
  }
  const step = by === 'week' ? 7 * DAY_MS : DAY_MS;
  for (let t = Date.parse(`${first}T00:00:00Z`); out.length < 2000; t += step) {
    const key = new Date(t).toISOString().slice(0, 10);
    out.push(key);
    if (key >= last) break;
  }
  return out;
}

function measure(metric: AggregateMetric, sum: number, count: number): number {
  if (metric === 'count') return count;
  if (metric === 'total') return sum / 100;
  return count === 0 ? 0 : Math.round(sum / count) / 100;
}

/** The format a metric's numbers are in. */
export function aggregateFormat(metric: AggregateMetric): 'gbp' | 'number' {
  return metric === 'count' ? 'number' : 'gbp';
}

export function aggregate(rows: readonly AggregateRow[], spec: AggregateSpec): AggregateSeries[] {
  const cells = new Map<string, { sum: number; count: number }>(); // `${x}|${split}`
  const xs = new Set<string>();
  const splits = new Set<string>();
  for (const row of rows) {
    const x = keyOf(row, spec.groupBy);
    const split = spec.splitBy ? keyOf(row, spec.splitBy) : '';
    xs.add(x);
    splits.add(split);
    const cell = cells.get(`${x}|${split}`) ?? { sum: 0, count: 0 };
    cell.sum += row.amountMinor;
    cell.count += 1;
    cells.set(`${x}|${split}`, cell);
  }
  const value = (x: string, split: string) => {
    const c = cells.get(`${x}|${split}`);
    return measure(spec.metric, c?.sum ?? 0, c?.count ?? 0);
  };

  let order: string[];
  const by = spec.groupBy;
  if (by === 'day' || by === 'week' || by === 'month') {
    order = fillTime([...xs], by);
  } else if (by === 'category') {
    order = TRANSACTION_CATEGORIES.filter((c) => xs.has(c));
  } else if (by === 'status') {
    order = TRANSACTION_STATUSES.filter((c) => xs.has(c));
  } else {
    // customers: largest first by the measure over every split, then cut
    const limit = Math.max(1, Math.min(50, spec.limit ?? 10));
    const whole = (x: string) => {
      let sum = 0;
      let count = 0;
      for (const split of splits) {
        const c = cells.get(`${x}|${split}`);
        sum += c?.sum ?? 0;
        count += c?.count ?? 0;
      }
      return measure(spec.metric, sum, count);
    };
    order = [...xs].sort((a, b) => whole(b) - whole(a) || a.localeCompare(b)).slice(0, limit);
  }

  if (!spec.splitBy) {
    return [{ name: METRIC_NAME[spec.metric], points: order.map((x) => ({ x, y: value(x, '') })) }];
  }
  const known: readonly string[] =
    spec.splitBy === 'status' ? TRANSACTION_STATUSES : TRANSACTION_CATEGORIES;
  return known
    .filter((s) => splits.has(s))
    .map((s) => ({
      name: s.charAt(0).toUpperCase() + s.slice(1),
      points: order.map((x) => ({ x, y: value(x, s) })),
    }));
}
