import { describe, expect, it } from 'vitest';
import { clamp, mean, percentChange, sum } from './numbers.ts';

describe('clamp', () => {
  it('keeps values inside the range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(11, 0, 10)).toBe(10);
  });
});

describe('sum and mean', () => {
  it('sums and averages', () => {
    expect(sum([1, 2, 3])).toBe(6);
    expect(mean([1, 2, 3])).toBe(2);
  });

  it('returns 0 for an empty list', () => {
    expect(sum([])).toBe(0);
    expect(mean([])).toBe(0);
  });
});

describe('percentChange', () => {
  it('returns the ratio change', () => {
    expect(percentChange(110, 100)).toBeCloseTo(0.1);
    expect(percentChange(90, 100)).toBeCloseTo(-0.1);
  });

  it('returns null when the previous value is 0', () => {
    expect(percentChange(10, 0)).toBeNull();
  });
});
