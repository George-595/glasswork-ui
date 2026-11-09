import type { Kpi, LabelValue, MetricPoint } from '../../shared/api.ts';
import type { DbExecutor } from '../infra/db/types.ts';

/* SQL for the dashboard metrics: daily revenue and costs, KPIs, monthly sign-ups. */
export function metricsRepository(db: DbExecutor) {
  return {
    /** Every day stored, oldest first. */
    async revenueDaily(): Promise<{ revenue: MetricPoint[]; costs: MetricPoint[] }> {
      const rows = await db.query<{
        day: string;
        revenue_minor: number | string;
        costs_minor: number | string;
      }>('SELECT day, revenue_minor, costs_minor FROM revenue_daily ORDER BY day');
      return {
        revenue: rows.map((r) => ({ date: r.day, value: Number(r.revenue_minor) })),
        costs: rows.map((r) => ({ date: r.day, value: Number(r.costs_minor) })),
      };
    },
    async insertRevenueDay(day: string, revenueMinor: number, costsMinor: number): Promise<void> {
      await db.execute(
        'INSERT INTO revenue_daily (day, revenue_minor, costs_minor) VALUES (?, ?, ?)',
        [day, revenueMinor, costsMinor],
      );
    },

    async kpis(): Promise<Kpi[]> {
      const rows = await db.query<{
        id: string;
        label: string;
        current_value: number | string;
        previous_value: number | string;
        unit: string;
        trend: string;
      }>('SELECT id, label, current_value, previous_value, unit, trend FROM kpis ORDER BY ord');
      return rows.map((r) => ({
        id: r.id as Kpi['id'],
        label: r.label,
        value: Number(r.current_value),
        previous: Number(r.previous_value),
        unit: r.unit as Kpi['unit'],
        trend: JSON.parse(r.trend) as number[],
      }));
    },
    async insertKpi(k: Kpi, ord: number): Promise<void> {
      await db.execute(
        'INSERT INTO kpis (id, ord, label, current_value, previous_value, unit, trend) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [k.id, ord, k.label, k.value, k.previous, k.unit, JSON.stringify(k.trend)],
      );
    },

    async signups(): Promise<LabelValue[]> {
      const rows = await db.query<{ label: string; signups: number | string }>(
        'SELECT label, signups FROM signups_monthly ORDER BY ord',
      );
      return rows.map((r) => ({ label: r.label, value: Number(r.signups) }));
    },
    async insertSignups(ord: number, s: LabelValue): Promise<void> {
      await db.execute('INSERT INTO signups_monthly (ord, label, signups) VALUES (?, ?, ?)', [
        ord,
        s.label,
        s.value,
      ]);
    },

    /** True when the table holds no rows (seeding only fills empty tables). */
    async isEmpty(
      table:
        | 'revenue_daily'
        | 'kpis'
        | 'signups_monthly'
        | 'transactions'
        | 'audit_events'
        | 'activity'
        | 'notifications',
    ): Promise<boolean> {
      const [row] = await db.query<{ n: number | string }>(`SELECT COUNT(*) AS n FROM ${table}`);
      return Number(row?.n ?? 0) === 0;
    },
  };
}
export type MetricsRepository = ReturnType<typeof metricsRepository>;
