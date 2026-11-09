import { describe, expect, it } from 'vitest';
import {
  projectSavings,
  type SavingsRaw,
  type SavingsValidation,
  validateSavings,
} from './savings';

const VALID: SavingsRaw = {
  initialMinor: '1000',
  monthlyMinor: '0',
  annualRatePct: '12',
  years: '1',
  compounding: 'monthly',
};

/** The error map of a failed validation, or {} for a valid one. */
function errorsOf(v: SavingsValidation): Record<string, string> {
  return v.ok ? {} : v.errors;
}

describe('projectSavings', () => {
  it('with a zero rate, returns contributions only', () => {
    const r = projectSavings({
      initialMinor: 100_000,
      monthlyMinor: 10_000,
      annualRatePct: 0,
      years: 2,
      compounding: 'monthly',
    });
    expect(r.years.map((y) => y.balanceMinor)).toEqual([220_000, 340_000]);
    expect(r.contributedMinor).toBe(340_000);
    expect(r.interestMinor).toBe(0);
    expect(r.finalMinor).toBe(340_000);
  });

  it('annual compounding: £1,000 at 12% for one year is £1,120.00', () => {
    const r = projectSavings({
      initialMinor: 100_000,
      monthlyMinor: 0,
      annualRatePct: 12,
      years: 1,
      compounding: 'annual',
    });
    expect(r.finalMinor).toBe(112_000);
    expect(r.interestMinor).toBe(12_000);
  });

  it('monthly compounding: £1,000 at 12% for one year is £1,126.83', () => {
    const r = projectSavings({
      initialMinor: 100_000,
      monthlyMinor: 0,
      annualRatePct: 12,
      years: 1,
      compounding: 'monthly',
    });
    expect(r.finalMinor).toBe(112_683);
  });

  it('returns one row per year, with cumulative contributions', () => {
    const r = projectSavings({
      initialMinor: 0,
      monthlyMinor: 5_000,
      annualRatePct: 5,
      years: 7,
      compounding: 'annual',
    });
    expect(r.years).toHaveLength(7);
    expect(r.years[6]?.year).toBe(7);
    expect(r.years[6]?.contributedMinor).toBe(7 * 60_000);
  });
});

describe('validateSavings', () => {
  it('accepts a valid form and converts pounds to pence', () => {
    const v = validateSavings({ ...VALID, initialMinor: '1,000.50' });
    expect(v).toEqual({
      ok: true,
      value: {
        initialMinor: 100_050,
        monthlyMinor: 0,
        annualRatePct: 12,
        years: 1,
        compounding: 'monthly',
      },
    });
  });

  it('reports a bad starting amount', () => {
    const v = validateSavings({ ...VALID, initialMinor: 'lots' });
    expect(v.ok).toBe(false);
    expect(Object.keys(errorsOf(v))).toEqual(['initialMinor']);
  });

  it('reports a negative or over-large monthly amount', () => {
    const neg = validateSavings({ ...VALID, monthlyMinor: '-5' });
    expect(neg.ok).toBe(false);
    expect(errorsOf(neg).monthlyMinor).toBeDefined();
    const big = validateSavings({ ...VALID, monthlyMinor: '10000001' });
    expect(big.ok).toBe(false);
  });

  it('reports a rate above 25 and accepts 25 exactly', () => {
    const over = validateSavings({ ...VALID, annualRatePct: '25.5' });
    expect(over.ok).toBe(false);
    expect(errorsOf(over).annualRatePct).toBeDefined();
    expect(validateSavings({ ...VALID, annualRatePct: '25' }).ok).toBe(true);
  });

  it('reports years outside 1 to 50 or not whole', () => {
    for (const years of ['0', '51', '2.5', '']) {
      const v = validateSavings({ ...VALID, years });
      expect(v.ok).toBe(false);
      expect(errorsOf(v).years).toBeDefined();
    }
  });

  it('reports an unknown compounding choice', () => {
    const v = validateSavings({ ...VALID, compounding: 'daily' });
    expect(v.ok).toBe(false);
    expect(errorsOf(v).compounding).toBeDefined();
  });
});
