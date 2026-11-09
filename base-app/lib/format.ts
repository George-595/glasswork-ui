/* en-GB formatting. Negatives use the true minus sign U+2212, never a hyphen. */
const MINUS = '−';

const toMinus = (s: string): string => s.replace(/-/g, MINUS);

export function formatMoney(
  minor: number,
  currency = 'GBP',
  opts?: { sign?: boolean; compact?: boolean },
): string {
  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    notation: opts?.compact ? 'compact' : 'standard',
    signDisplay: opts?.sign ? 'exceptZero' : 'auto',
  });
  return toMinus(formatter.format(minor / 100));
}

export function formatNumber(
  n: number,
  opts?: { maxFractionDigits?: number; compact?: boolean },
): string {
  const formatter = new Intl.NumberFormat('en-GB', {
    maximumFractionDigits: opts?.maxFractionDigits ?? 0,
    notation: opts?.compact ? 'compact' : 'standard',
  });
  return toMinus(formatter.format(n));
}

export function formatPercent(ratio: number, opts?: { digits?: number; sign?: boolean }): string {
  const digits = opts?.digits ?? 1;
  const formatter = new Intl.NumberFormat('en-GB', {
    style: 'percent',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: opts?.sign ? 'exceptZero' : 'auto',
  });
  // Round first: Intl keeps the sign of a tiny negative, giving "−0.0%".
  const rounded = Number(ratio.toFixed(digits + 2)) || 0;
  return toMinus(formatter.format(rounded));
}
