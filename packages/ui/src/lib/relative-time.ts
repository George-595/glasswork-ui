/* Relative time for the kit: "5 minutes ago", "yesterday", "3 days ago", then a plain date.
   Pure: `now` is a parameter, so a test (or a server render) never reads the clock.
   Intl.RelativeTimeFormat does the words; en-GB by default. */
export type TimeInput = Date | string | number;

export function toDate(value: TimeInput): Date {
  return value instanceof Date ? value : new Date(value);
}

const UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['minute', 60],
  ['hour', 3600],
  ['day', 86400],
  ['week', 604800],
];

/** "3 Aug 2026" */
export function formatAbsoluteDate(value: TimeInput, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(toDate(value));
}

/** "3 Aug 2026, 14:05", for a `title`. */
export function formatAbsoluteDateTime(value: TimeInput, locale = 'en-GB'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(toDate(value));
}

/** "just now", "5 minutes ago", "2 hours ago", "yesterday", "3 days ago", "2 weeks ago", then "3 Aug 2026". */
export function formatRelativeTime(value: TimeInput, now: TimeInput, locale = 'en-GB'): string {
  const then = toDate(value).getTime();
  const at = toDate(now).getTime();
  if (Number.isNaN(then) || Number.isNaN(at)) return '';
  const seconds = Math.round((at - then) / 1000);
  if (seconds < -60) return formatAbsoluteDate(value, locale);
  if (seconds < 45) return 'just now';
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  let chosen: readonly [Intl.RelativeTimeFormatUnit, number] = UNITS[0] as readonly [
    Intl.RelativeTimeFormatUnit,
    number,
  ];
  for (const unit of UNITS) {
    if (seconds >= unit[1]) chosen = unit;
  }
  const count = Math.max(1, Math.floor(seconds / chosen[1]));
  if (chosen[0] === 'week' && count >= 5) return formatAbsoluteDate(value, locale);
  return rtf.format(-count, chosen[0]);
}
