export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function sum(ns: readonly number[]): number {
  return ns.reduce((total, n) => total + n, 0);
}

/* Arithmetic mean. An empty list has no mean; it returns 0 rather than NaN. */
export function mean(ns: readonly number[]): number {
  return ns.length === 0 ? 0 : sum(ns) / ns.length;
}

/* Ratio change from previous to current (0.1 means +10%). Null when previous is 0. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
