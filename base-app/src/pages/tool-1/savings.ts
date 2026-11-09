/* Savings projection. Pure: no React, no clock. Money is integer pence.
   Monthly contributions are added at month end. Monthly compounding applies
   rate/12 to the balance each month; annual compounding applies the rate once
   at each year end, to the balance including that year's contributions.
   Balances are rounded to whole pence at each year boundary. */
export interface SavingsInput {
  initialMinor: number;
  monthlyMinor: number;
  annualRatePct: number;
  years: number;
  compounding: 'monthly' | 'annual';
}

export interface SavingsYear {
  year: number;
  balanceMinor: number;
  contributedMinor: number;
  interestMinor: number;
}

export interface SavingsResult {
  years: SavingsYear[];
  finalMinor: number;
  contributedMinor: number;
  interestMinor: number;
}

/** The form's raw text. Amounts are in pounds; they are converted to pence here. */
export type SavingsRaw = Record<keyof SavingsInput, string>;
export type SavingsErrors = Partial<Record<keyof SavingsInput, string>>;
export type SavingsValidation =
  | { ok: true; value: SavingsInput }
  | { ok: false; errors: SavingsErrors };

const MAX_AMOUNT_MINOR = 1_000_000_000; // £10,000,000
const MAX_RATE_PCT = 25;
const MIN_YEARS = 1;
const MAX_YEARS = 50;

export function projectSavings(i: SavingsInput): SavingsResult {
  const years: SavingsYear[] = [];
  const monthlyRate = i.annualRatePct / 100 / 12;
  const yearlyRate = i.annualRatePct / 100;
  let balance = i.initialMinor;
  let contributed = i.initialMinor;

  for (let y = 1; y <= i.years; y++) {
    if (i.compounding === 'monthly') {
      for (let m = 0; m < 12; m++) {
        balance = balance * (1 + monthlyRate) + i.monthlyMinor;
      }
    } else {
      balance = (balance + 12 * i.monthlyMinor) * (1 + yearlyRate);
    }
    balance = Math.round(balance);
    contributed += 12 * i.monthlyMinor;
    years.push({
      year: y,
      balanceMinor: balance,
      contributedMinor: contributed,
      interestMinor: balance - contributed,
    });
  }

  const finalMinor = years[years.length - 1]?.balanceMinor ?? i.initialMinor;
  return {
    years,
    finalMinor,
    contributedMinor: contributed,
    interestMinor: finalMinor - contributed,
  };
}

/** "1,000.50" or "£250" to pence; null if not a plain amount with at most 2 decimals. */
function amountMinor(raw: string): number | null {
  const s = raw.trim().replace(/^£\s*/, '');
  if (!/^(\d{1,3}(,\d{3})+|\d+)(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s.replaceAll(',', '')) * 100);
}

function rate(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Number(s);
}

function wholeYears(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+$/.test(s)) return null;
  return Number(s);
}

export function validateSavings(raw: SavingsRaw): SavingsValidation {
  const errors: SavingsErrors = {};

  const initialMinor = amountMinor(raw.initialMinor);
  if (initialMinor === null || initialMinor > MAX_AMOUNT_MINOR) {
    errors.initialMinor = 'Enter the starting amount in pounds, from 0 to 10,000,000.';
  }

  const monthlyMinor = amountMinor(raw.monthlyMinor);
  if (monthlyMinor === null || monthlyMinor > MAX_AMOUNT_MINOR) {
    errors.monthlyMinor = 'Enter the monthly amount in pounds, from 0 to 10,000,000.';
  }

  const annualRatePct = rate(raw.annualRatePct);
  if (annualRatePct === null || annualRatePct > MAX_RATE_PCT) {
    errors.annualRatePct =
      'Enter the annual rate as a percentage from 0 to 25, with up to 2 decimals.';
  }

  const yearCount = wholeYears(raw.years);
  if (yearCount === null || yearCount < MIN_YEARS || yearCount > MAX_YEARS) {
    errors.years = 'Enter a whole number of years, from 1 to 50.';
  }

  const compounding = raw.compounding;
  if (compounding !== 'monthly' && compounding !== 'annual') {
    errors.compounding = 'Choose monthly or annual compounding.';
  }

  if (
    initialMinor === null ||
    monthlyMinor === null ||
    annualRatePct === null ||
    yearCount === null ||
    (compounding !== 'monthly' && compounding !== 'annual')
  ) {
    return { ok: false, errors };
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      initialMinor,
      monthlyMinor,
      annualRatePct,
      years: yearCount,
      compounding,
    },
  };
}
