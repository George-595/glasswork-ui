/* Category axis labels. TanStack lays tick labels out at the width of each
   band; ISO dates ("2026-09-02") are far too long for that and run together,
   so a date series gets a short en-GB label and the axis is thinned by the
   room there actually is, never by guesswork. */

const ISO_DAY = /^\d{4}-\d{2}-\d{2}(?:T|$)/;
const DAY_MS = 86_400_000;
const isoTime = (s: string) => Date.parse(`${s.slice(0, 10)}T00:00:00Z`);

/** True when every label is an ISO date (or date-time), so it can be shown as a date. */
export const allIsoDates = (labels: readonly string[]) =>
  labels.length > 0 && labels.every((l) => ISO_DAY.test(l) && Number.isFinite(isoTime(l)));

/** The default x label: ISO dates become "2 Sept" (or "Sept 26" once they span about a
    year or more); anything else is left as written. */
export function defaultXFormat(labels: readonly string[]): (label: string) => string {
  if (!allIsoDates(labels)) return (l) => l;
  const times = labels.map(isoTime);
  const span = Math.max(...times) - Math.min(...times);
  const options: Intl.DateTimeFormatOptions =
    span >= 300 * DAY_MS
      ? { month: 'short', year: '2-digit', timeZone: 'UTC' }
      : { day: 'numeric', month: 'short', timeZone: 'UTC' };
  const fmt = new Intl.DateTimeFormat('en-GB', options);
  return (l) => (ISO_DAY.test(l) ? fmt.format(new Date(isoTime(l))) : l);
}

/** Px of room a label needs: its estimated text width plus a gutter, never under `min`. */
export const labelRoom = (labels: readonly string[], min = 72, charPx = 6.6) =>
  Math.max(min, Math.max(0, ...labels.map((l) => l.length)) * charPx + 16);

/** Every n-th item so that each gets at least `room` px of the `span` px the axis has.
    The first is always kept and the rest are evenly spaced, so labels never collide. */
export function thinLabels<T>(items: readonly T[], span: number, room: number): T[] {
  if (items.length <= 1 || span <= 0) return [...items];
  const fit = Math.max(1, Math.floor(span / room));
  if (items.length <= fit) return [...items];
  const step = Math.ceil(items.length / fit);
  return items.filter((_, i) => i % step === 0);
}
