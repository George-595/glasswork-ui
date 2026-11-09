import { describe, expect, it } from 'vitest';
import { formatMoney, formatNumber, formatPercent } from './format.ts';

describe('formatMoney', () => {
  it('formats pence as GBP in en-GB', () => {
    expect(formatMoney(123456)).toBe('£1,234.56');
  });

  it('uses U+2212 for negatives, never a hyphen', () => {
    const s = formatMoney(-500);
    expect(s).toBe('−£5.00');
    expect(s).not.toContain('-');
  });

  it('adds an explicit sign when asked', () => {
    expect(formatMoney(250, 'GBP', { sign: true })).toBe('+£2.50');
    expect(formatMoney(-250, 'GBP', { sign: true })).toBe('−£2.50');
  });

  it('abbreviates when compact', () => {
    expect(formatMoney(120_000_00, 'GBP', { compact: true })).toBe('£120k');
  });
});

describe('formatNumber', () => {
  it('groups thousands with no fraction digits by default', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('honours maxFractionDigits', () => {
    expect(formatNumber(1.2345, { maxFractionDigits: 2 })).toBe('1.23');
  });

  it('uses U+2212 for negatives', () => {
    expect(formatNumber(-42)).toBe('−42');
  });

  it('abbreviates when compact', () => {
    expect(formatNumber(12_400, { compact: true })).toBe('12k');
  });
});

describe('formatPercent', () => {
  it('formats a ratio with one digit by default', () => {
    expect(formatPercent(0.1234)).toBe('12.3%');
  });

  it('honours digits and sign', () => {
    expect(formatPercent(0.05, { digits: 0, sign: true })).toBe('+5%');
    expect(formatPercent(-0.05, { digits: 1 })).toBe('−5.0%');
  });
});
