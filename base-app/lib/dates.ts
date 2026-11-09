/* Date helpers. Every formatter takes an explicit timeZone; the default is the UK. */
const DEFAULT_TZ = 'Europe/London';
const DAY_MS = 86_400_000;

/* Fixed unit lengths for relative times (approximate by design). */
const UNITS: readonly { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { unit: 'year', seconds: 365 * 86_400 },
  { unit: 'month', seconds: 30 * 86_400 },
  { unit: 'day', seconds: 86_400 },
  { unit: 'hour', seconds: 3_600 },
  { unit: 'minute', seconds: 60 },
  { unit: 'second', seconds: 1 },
];

export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * DAY_MS);
}

export function formatDate(
  iso: string,
  style: 'short' | 'medium' | 'long' = 'medium',
  timeZone = DEFAULT_TZ,
): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: style, timeZone }).format(new Date(iso));
}

export function formatDateTime(iso: string, timeZone = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(iso));
}

export function formatRelative(iso: string, now: Date): string {
  const diffSeconds = (new Date(iso).getTime() - now.getTime()) / 1000;
  const magnitude = Math.abs(diffSeconds);
  const rtf = new Intl.RelativeTimeFormat('en-GB', { numeric: 'always' });
  const chosen = UNITS.find((u) => magnitude >= u.seconds) ?? UNITS[UNITS.length - 1];
  if (!chosen) throw new Error('formatRelative: no unit');
  return rtf.format(Math.round(diffSeconds / chosen.seconds), chosen.unit);
}
