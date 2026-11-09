import { describe, expect, it } from 'vitest';
import { formatPercent } from './format.ts';

describe('formatPercent rounding', () => {
  it('never shows a signed zero', () => {
    expect(formatPercent(-0.00001)).toBe('0.0%');
    expect(formatPercent(-0.00001, { sign: true })).toBe('0.0%');
  });

  it('still shows small real changes', () => {
    expect(formatPercent(-0.0006)).toBe('−0.1%');
  });
});
