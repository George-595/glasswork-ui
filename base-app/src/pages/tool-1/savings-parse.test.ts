import { describe, expect, it } from 'vitest';
import { validateSavings } from './savings';

const good = {
  initialMinor: '1,000',
  monthlyMinor: '£250.50',
  annualRatePct: '4.5',
  years: '10',
  compounding: 'monthly',
};

describe('savings amount parsing', () => {
  it('accepts a leading £ and real thousands groups', () => {
    const r = validateSavings(good);
    expect(r).toMatchObject({ ok: true, value: { initialMinor: 100_000, monthlyMinor: 25_050 } });
  });

  it('rejects stray commas, inner spaces and a £ in the middle', () => {
    for (const bad of ['1,2,3', '1 0', '10£', '1,00']) {
      expect(validateSavings({ ...good, initialMinor: bad }).ok).toBe(false);
    }
  });
});
