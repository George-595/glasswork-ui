/* The date range the overview's figures cover, in days. */
export type Range = 7 | 30 | 90;
export const RANGES: readonly Range[] = [7, 30, 90];
export const RANGE_OPTIONS = RANGES.map((d) => ({ value: String(d), label: `${d} days` }));
