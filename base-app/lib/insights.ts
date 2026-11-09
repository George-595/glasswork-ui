/* Small reductions the dashboards draw from the transactions the API already returns, so the
   heatmap and the gauge need no extra endpoint. Pure; structural types (lib imports nothing). */

/** How many of the ISO timestamps fall on each UTC calendar day, oldest first. Days with none
    are left out (a calendar heatmap counts a missing day as zero). */
export function countByDay(timestamps: readonly string[]): { date: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const t of timestamps) {
    const date = t.slice(0, 10);
    counts.set(date, (counts.get(date) ?? 0) + 1);
  }
  return Array.from(counts, ([date, count]) => ({ date, count })).toSorted((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
}

/** Of the payments that settled one way or the other (paid or failed), the share that paid, as a
    percentage 0..100. Pending and refunded are still in flight or reversed, so they are not
    counted. `null` when nothing has settled. */
export function paymentSuccess(
  rows: readonly { status: string }[],
): { percent: number; paid: number; settled: number } | null {
  const paid = rows.filter((r) => r.status === 'paid').length;
  const settled = paid + rows.filter((r) => r.status === 'failed').length;
  return settled === 0 ? null : { percent: (paid / settled) * 100, paid, settled };
}
