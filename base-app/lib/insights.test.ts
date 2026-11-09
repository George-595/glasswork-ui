import { describe, expect, it } from 'vitest';
import { countByDay, paymentSuccess } from './insights.ts';

describe('countByDay', () => {
  it('counts per UTC day, oldest first, leaving empty days out', () => {
    expect(
      countByDay([
        '2026-09-03T23:59:00.000Z',
        '2026-09-01T00:00:00.000Z',
        '2026-09-03T00:00:00.000Z',
        '2026-09-01T12:00:00.000Z',
      ]),
    ).toEqual([
      { date: '2026-09-01', count: 2 },
      { date: '2026-09-03', count: 2 },
    ]);
  });
  it('is empty for nothing', () => {
    expect(countByDay([])).toEqual([]);
  });
});

describe('paymentSuccess', () => {
  it('is paid over paid-plus-failed, ignoring pending and refunded', () => {
    const rows = ['paid', 'paid', 'paid', 'failed', 'pending', 'refunded'].map((status) => ({
      status,
    }));
    expect(paymentSuccess(rows)).toEqual({ percent: 75, paid: 3, settled: 4 });
  });
  it('is null when nothing settled', () => {
    expect(paymentSuccess([{ status: 'pending' }])).toBeNull();
  });
});
