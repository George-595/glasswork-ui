import { describe, expect, it } from 'vitest';
import { type AggregateRow, aggregate, aggregateFormat, weekOf } from './aggregate.ts';

const row = (over: Partial<AggregateRow>): AggregateRow => ({
  date: '2026-10-05T10:00:00.000Z',
  customer: 'Acme',
  category: 'Software',
  status: 'paid',
  amountMinor: 1000,
  ...over,
});

describe('aggregate', () => {
  it('totals by category in the fixed order, in pounds', () => {
    const rows = [
      row({ category: 'Travel', amountMinor: 2550 }),
      row({ category: 'Software', amountMinor: 1000 }),
      row({ category: 'Software', amountMinor: 500 }),
    ];
    expect(aggregate(rows, { groupBy: 'category', metric: 'total' })).toEqual([
      {
        name: 'Total',
        points: [
          { x: 'Software', y: 15 },
          { x: 'Travel', y: 25.5 },
        ],
      },
    ]);
  });

  it('counts and averages', () => {
    const rows = [row({ amountMinor: 1000 }), row({ amountMinor: 2001 })];
    expect(aggregate(rows, { groupBy: 'status', metric: 'count' })[0]?.points).toEqual([
      { x: 'paid', y: 2 },
    ]);
    expect(aggregate(rows, { groupBy: 'status', metric: 'average' })[0]?.points).toEqual([
      { x: 'paid', y: 15.01 },
    ]);
    expect(aggregateFormat('count')).toBe('number');
    expect(aggregateFormat('average')).toBe('gbp');
  });

  it('fills the empty days, weeks and months in between with 0', () => {
    const rows = [
      row({ date: '2026-10-01T09:00:00.000Z' }),
      row({ date: '2026-10-03T23:59:00.000Z' }),
    ];
    expect(aggregate(rows, { groupBy: 'day', metric: 'count' })[0]?.points).toEqual([
      { x: '2026-10-01', y: 1 },
      { x: '2026-10-02', y: 0 },
      { x: '2026-10-03', y: 1 },
    ]);
    const months = aggregate(
      [row({ date: '2025-11-02T00:00:00.000Z' }), row({ date: '2026-02-01T00:00:00.000Z' })],
      { groupBy: 'month', metric: 'count' },
    );
    expect(months[0]?.points.map((p) => p.x)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
    const weeks = aggregate(
      [row({ date: '2026-10-01T00:00:00.000Z' }), row({ date: '2026-10-15T00:00:00.000Z' })],
      { groupBy: 'week', metric: 'count' },
    );
    expect(weeks[0]?.points).toEqual([
      { x: '2026-09-28', y: 1 },
      { x: '2026-10-05', y: 0 },
      { x: '2026-10-12', y: 1 },
    ]);
  });

  it('names a week by its Monday, Sunday included', () => {
    expect(weekOf('2026-10-11')).toBe('2026-10-05'); // a Sunday
    expect(weekOf('2026-10-12')).toBe('2026-10-12'); // a Monday
  });

  it('ranks customers by the measure and keeps the top ones', () => {
    const rows = [
      row({ customer: 'Small', amountMinor: 100 }),
      row({ customer: 'Big', amountMinor: 9000 }),
      row({ customer: 'Mid', amountMinor: 500 }),
    ];
    const out = aggregate(rows, { groupBy: 'customer', metric: 'total', limit: 2 });
    expect(out[0]?.points.map((p) => p.x)).toEqual(['Big', 'Mid']);
  });

  it('splits into one series per status, every group in each', () => {
    const rows = [
      row({ category: 'Software', status: 'paid', amountMinor: 1000 }),
      row({ category: 'Travel', status: 'failed', amountMinor: 300 }),
    ];
    expect(aggregate(rows, { groupBy: 'category', metric: 'total', splitBy: 'status' })).toEqual([
      {
        name: 'Paid',
        points: [
          { x: 'Software', y: 10 },
          { x: 'Travel', y: 0 },
        ],
      },
      {
        name: 'Failed',
        points: [
          { x: 'Software', y: 0 },
          { x: 'Travel', y: 3 },
        ],
      },
    ]);
  });

  it('gives one empty series for no rows', () => {
    expect(aggregate([], { groupBy: 'day', metric: 'total' })).toEqual([
      { name: 'Total', points: [] },
    ]);
  });
});
