import { describe, expect, it } from 'vitest';
import type { Kpi, MetricPoint } from '../../shared/api.ts';
import { isKpiRange, kpisForRange } from './kpi-range.ts';

const day = (i: number, value: number): MetricPoint => ({
  date: `2026-01-${String(i + 1).padStart(2, '0')}`,
  value,
});
const kpi = (over: Partial<Kpi> & Pick<Kpi, 'id'>): Kpi => ({
  label: 'Thing',
  value: 10,
  previous: 9,
  unit: 'count',
  trend: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  ...over,
});

describe('isKpiRange', () => {
  it('accepts 7, 30 and 90 only', () => {
    expect([7, 30, 90].every(isKpiRange)).toBe(true);
    expect([0, 14, 60, 91].some(isKpiRange)).toBe(false);
  });
});

describe('kpisForRange', () => {
  const at = (days: 7 | 30 | 90) => kpisForRange(stored, [day(0, 1)], days)[1];
  const stored = [
    kpi({ id: 'revenue', label: 'Revenue, last 30 days', unit: 'money' }),
    kpi({ id: 'active-users' }),
  ];

  it('revenue is the last N days against the N before, and drops "last 30 days" from its label', () => {
    // 14 days: the first 7 are worth 1 each, the last 7 are worth 3 each
    const daily = Array.from({ length: 14 }, (_, i) => day(i, i < 7 ? 1 : 3));
    const [rev] = kpisForRange(stored, daily, 7);
    expect(rev).toMatchObject({ label: 'Revenue', value: 21, previous: 7 });
  });

  it('with only part of the earlier range stored, compares daily averages rather than inventing days', () => {
    // 10 stored days, range 7: 3 earlier days at 2 each -> average 2 -> previous 14 for 7 days
    const early = Array.from({ length: 3 }, (_, i) => day(i, 2));
    const recent = Array.from({ length: 7 }, (_, i) => day(i + 3, 5));
    const [rev] = kpisForRange(stored, [...early, ...recent], 7);
    expect(rev).toMatchObject({ value: 35, previous: 14 });
  });

  it('with no earlier days at all, the change is nil', () => {
    const daily = Array.from({ length: 7 }, (_, i) => day(i, 4));
    const [rev] = kpisForRange(stored, daily, 7);
    expect(rev).toMatchObject({ value: 28, previous: 28 });
  });

  it('point-in-time KPIs keep their value and compare with the weekly trend point N days back', () => {
    expect(at(7)).toMatchObject({ value: 10, previous: 11 }); // 1 week back: trend[10]
    expect(at(30)).toMatchObject({ previous: 8 }); // 4 weeks back: trend[7]
    expect(at(90)).toMatchObject({ previous: 1 }); // 13 weeks: clamped to the oldest point
  });
});
