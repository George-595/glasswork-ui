import type { Kpi, MetricPoint } from '../../shared/api.ts';

/* The KPIs over a chosen range (7, 30 or 90 days), for the dashboard's range control.

   Only revenue has a daily history, so it is worked out for real: the sum of the last
   `days` days against the sum of the `days` before them. When the stored history does not
   reach back that far (a 90-day range over 90 stored days) the days that do exist are
   compared by their daily average, so the change is never invented.

   Active users, conversion and open tickets are point-in-time figures with a 12-point
   weekly trend. They keep their current value and are compared with the trend point
   `days` back (rounded to whole weeks, and no further back than the trend goes). */
export const KPI_RANGES = [7, 30, 90] as const;
export type KpiRange = (typeof KPI_RANGES)[number];

export function isKpiRange(n: number): n is KpiRange {
  return (KPI_RANGES as readonly number[]).includes(n);
}

const sum = (points: readonly MetricPoint[]) => points.reduce((a, p) => a + p.value, 0);

export function kpisForRange(
  stored: readonly Kpi[],
  daily: readonly MetricPoint[],
  days: KpiRange,
): Kpi[] {
  const weeks = Math.max(1, Math.round(days / 7));
  return stored.map((k) => {
    if (k.id === 'revenue') {
      const current = daily.slice(-days);
      const before = daily.slice(-2 * days, -days);
      const previous =
        before.length === 0
          ? sum(current)
          : before.length === days
            ? sum(before)
            : Math.round((sum(before) / before.length) * current.length);
      return { ...k, label: 'Revenue', value: sum(current), previous };
    }
    const back = k.trend[Math.max(0, k.trend.length - 1 - weeks)] ?? k.previous;
    return { ...k, previous: back };
  });
}
