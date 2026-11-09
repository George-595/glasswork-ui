import { addDays, toISODate } from '../lib/dates.ts';
import { sum } from '../lib/numbers.ts';
import { createRng, type Rng } from '../lib/rng.ts';
import { FAKE_NOW, FAKE_SEED } from './constants.ts';
import { memoByCount } from './memo.ts';
import { getTransactions } from './transactions.ts';
import type { Category, Kpi, LabelValue, MetricPoint } from './types.ts';

const CATEGORIES: readonly Category[] = ['Software', 'Hardware', 'Services', 'Travel', 'Office'];
const MONTH_LABELS = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: '2-digit',
  timeZone: 'UTC',
});

/* Seed offsets: 3 = revenue, 4 = KPIs, 5 = signups. */
const REVENUE_OFFSET = 3;
const KPI_OFFSET = 4;
const SIGNUP_OFFSET = 5;

/* Daily revenue in pence, with a weekly wave, slow growth and noise. */
function buildRevenue(days: number): {
  revenue: readonly MetricPoint[];
  costs: readonly MetricPoint[];
} {
  const rng = createRng(FAKE_SEED + REVENUE_OFFSET);
  const now = new Date(FAKE_NOW);
  const revenue: MetricPoint[] = [];
  const costs: MetricPoint[] = [];
  for (let i = 0; i < days; i++) {
    const date = toISODate(addDays(now, i - (days - 1)));
    const wave = 1 + 0.25 * Math.sin(i / 6.5);
    const growth = 0.8 + (0.4 * i) / days;
    const noise = 1 + rng.normal(0, 0.06);
    const day = Math.max(0, Math.round(1_800_000 * wave * growth * noise));
    const costRatio = 0.6 + rng.next() * 0.15;
    revenue.push({ date, value: day });
    costs.push({ date, value: Math.round(day * costRatio) });
  }
  return { revenue, costs };
}

const cachedRevenue = memoByCount(buildRevenue);

export function getRevenueSeries(days = 90): {
  revenue: readonly MetricPoint[];
  costs: readonly MetricPoint[];
} {
  return cachedRevenue(days);
}

/* Twelve points: a random walk around `start`, rounded to `digits` decimal places. */
function walk(rng: Rng, start: number, digits: number): number[] {
  const scale = 10 ** digits;
  const points: number[] = [];
  let v = start;
  for (let i = 0; i < 12; i++) {
    points.push(Math.round(v * scale) / scale);
    v = Math.max(0, v * (1 + rng.normal(0.01, 0.05)));
  }
  return points;
}

function buildKpis(): readonly Kpi[] {
  const rng = createRng(FAKE_SEED + KPI_OFFSET);
  const series = getRevenueSeries().revenue.map((p) => p.value);
  const n = series.length;

  // Revenue KPI: last 30 days against the 30 before, and weekly totals for the sparkline.
  const revenueValue = sum(series.slice(n - 30));
  const revenuePrevious = sum(series.slice(n - 60, n - 30));
  const weekly: number[] = [];
  for (let k = 0; k < 12; k++) {
    const start = n - 84 + k * 7;
    weekly.push(sum(series.slice(start, start + 7)));
  }

  const usersValue = rng.int(9_000, 15_000);
  const conversionValue = rng.int(250, 480) / 10_000;
  const ticketsValue = rng.int(20, 60);

  return [
    {
      id: 'revenue',
      label: 'Revenue, last 30 days',
      value: revenueValue,
      previous: revenuePrevious,
      unit: 'money',
      trend: weekly,
    },
    {
      id: 'active-users',
      label: 'Active users',
      value: usersValue,
      previous: rng.int(8_500, 14_500),
      unit: 'count',
      trend: walk(rng, usersValue * 0.85, 0),
    },
    {
      id: 'conversion',
      label: 'Conversion rate',
      value: conversionValue,
      previous: rng.int(250, 480) / 10_000,
      unit: 'percent',
      trend: walk(rng, conversionValue, 4),
    },
    {
      id: 'open-tickets',
      label: 'Open tickets',
      value: ticketsValue,
      previous: rng.int(20, 60),
      unit: 'count',
      trend: walk(rng, ticketsValue * 1.1, 0),
    },
  ];
}

let cachedKpis: readonly Kpi[] | undefined;

export function getKpis(): readonly Kpi[] {
  cachedKpis ??= buildKpis();
  return cachedKpis;
}

/* Sum of every transaction's amount per category, in the Category order. */
export function getCategoryBreakdown(): readonly LabelValue[] {
  const totals = new Map<Category, number>(CATEGORIES.map((c) => [c, 0]));
  for (const t of getTransactions()) {
    totals.set(t.category, (totals.get(t.category) ?? 0) + t.amountMinor);
  }
  return CATEGORIES.map((c) => ({ label: c, value: totals.get(c) ?? 0 }));
}

function buildSignups(months: number): readonly LabelValue[] {
  const rng = createRng(FAKE_SEED + SIGNUP_OFFSET);
  const now = new Date(FAKE_NOW);
  const rows: LabelValue[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const growth = (months - i) * 4;
    rows.push({ label: MONTH_LABELS.format(monthStart), value: rng.int(30, 90) + growth });
  }
  return rows;
}

const cachedSignups = memoByCount(buildSignups);

export function getMonthlySignups(months = 12): readonly LabelValue[] {
  return cachedSignups(months);
}
