import {
  AGGREGATE_GROUPS,
  AGGREGATE_METRICS,
  AGGREGATE_SPLITS,
  aggregate,
  aggregateFormat,
} from '../../../lib/aggregate.ts';
import { TRANSACTION_CATEGORIES, TRANSACTION_STATUSES } from '../../../lib/transactions.ts';
import type { ValueFormat, VisualSeries } from '../../../shared/api.ts';
import type { Infer } from '../../lib/schema.ts';
import type { DataService } from '../data.ts';
import { ServiceError } from '../errors.ts';

/* A data query: where a visual's numbers come from. The assistant names the data and the
   server reads it from the database when the visual is drawn, so the numbers on a chart are
   the database's, never the model's, and a saved view is drawn fresh each time it opens.

   One flat object (no oneOf: the providers treat it unevenly); `resolveQuery` checks which
   fields fit the dataset. */
export const DATA_QUERY = {
  type: 'object',
  description:
    'Where the numbers come from. The server reads them from the database when the visual is drawn.',
  properties: {
    dataset: {
      type: 'string',
      enum: ['transactions', 'revenue', 'signups'],
      description:
        'transactions: payments (customer, category, status, amount, date), summed, counted or averaged. revenue: daily revenue (and costs), last N days. signups: new users per month.',
    },
    groupBy: {
      type: 'string',
      enum: AGGREGATE_GROUPS,
      description:
        'transactions: what each point or bar is. Time groups are UTC days, ISO weeks, months.',
    },
    metric: {
      type: 'string',
      enum: AGGREGATE_METRICS,
      description: 'transactions: total amount, number of transactions, or average amount.',
    },
    splitBy: {
      type: 'string',
      enum: AGGREGATE_SPLITS,
      description:
        'transactions: one series per status or category (stacked or grouped bars, several lines).',
    },
    status: { type: 'array', items: { type: 'string', enum: TRANSACTION_STATUSES }, maxItems: 4 },
    category: {
      type: 'array',
      items: { type: 'string', enum: TRANSACTION_CATEGORIES },
      maxItems: 5,
    },
    from: { type: 'string', format: 'date', description: 'transactions on or after this UTC day' },
    before: { type: 'string', format: 'date', description: 'transactions before this UTC day' },
    search: { type: 'string', maxLength: 100, description: 'text in the customer or description' },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
      description: 'groupBy customer: how many of the largest to keep (default 10)',
    },
    days: { type: 'integer', enum: [7, 30, 60, 90], description: 'revenue: how many days' },
    includeCosts: { type: 'boolean', description: 'revenue: add the costs series' },
  },
  required: ['dataset'],
  additionalProperties: false,
} as const;
export type DataQuery = Infer<typeof DATA_QUERY>;

export interface QueryResult {
  series: VisualSeries[];
  format: ValueFormat;
  /** How many rows the numbers were made from (transactions only). */
  rows?: number;
}

const toPounds = (pence: number) => Math.round(pence) / 100;

export async function resolveQuery(data: DataService, q: DataQuery): Promise<QueryResult> {
  const misfit = (field: string, dataset: string) =>
    new ServiceError('invalid', 'invalid_query', `query.${field}: does not apply to ${dataset}`);
  switch (q.dataset) {
    case 'transactions': {
      if (q.days !== undefined) throw misfit('days', 'transactions (use from and before)');
      if (q.includeCosts !== undefined) throw misfit('includeCosts', 'transactions');
      const groupBy = q.groupBy ?? 'category';
      const metric = q.metric ?? 'total';
      const { rows } = await data.transactionsMatching({
        ...(q.search ? { q: q.search } : {}),
        ...(q.status ? { status: q.status } : {}),
        ...(q.category ? { category: q.category } : {}),
        ...(q.from ? { from: q.from } : {}),
        ...(q.before ? { before: q.before } : {}),
      });
      const series = aggregate(
        rows.map((t) => ({
          date: t.date,
          customer: t.customer,
          category: t.category,
          status: t.status,
          amountMinor: t.amountMinor,
        })),
        {
          groupBy,
          metric,
          ...(q.splitBy ? { splitBy: q.splitBy } : {}),
          ...(q.limit ? { limit: q.limit } : {}),
        },
      );
      return { series, format: aggregateFormat(metric), rows: rows.length };
    }
    case 'revenue': {
      for (const f of ['groupBy', 'metric', 'splitBy', 'status', 'category', 'search'] as const) {
        if (q[f] !== undefined) throw misfit(f, 'revenue');
      }
      const r = await data.revenue(q.days ?? 30);
      const after = q.from;
      const keep = (date: string) =>
        (after ? date >= after : true) && (q.before ? date < q.before : true);
      const series: VisualSeries[] = [
        {
          name: 'Revenue',
          points: r.revenue
            .filter((p) => keep(p.date))
            .map((p) => ({ x: p.date, y: toPounds(p.value) })),
        },
      ];
      if (q.includeCosts) {
        series.push({
          name: 'Costs',
          points: r.costs
            .filter((p) => keep(p.date))
            .map((p) => ({ x: p.date, y: toPounds(p.value) })),
        });
      }
      return { series, format: 'gbp' };
    }
    case 'signups': {
      for (const f of [
        'groupBy',
        'metric',
        'splitBy',
        'status',
        'category',
        'search',
        'days',
        'includeCosts',
        'from',
        'before',
      ] as const) {
        if (q[f] !== undefined) throw misfit(f, 'signups');
      }
      const s = await data.signups();
      return {
        series: [{ name: 'Signups', points: s.map((p) => ({ x: p.label, y: p.value })) }],
        format: 'number',
      };
    }
  }
}

/** A short text of the numbers, for the model: it must be able to say what the chart shows. */
export function describeSeries(
  series: readonly VisualSeries[],
  format: ValueFormat,
  max = 60,
): string {
  return series
    .map((s) => {
      const shown = s.points.slice(0, max).map((p) => `${p.x}=${p.y}`);
      const more = s.points.length > max ? ` …(${s.points.length - max} more)` : '';
      return `${s.name} [${format}]: ${shown.join(', ')}${more}`;
    })
    .join('\n');
}
