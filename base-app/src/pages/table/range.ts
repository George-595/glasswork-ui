/* The date filter's arithmetic: the picker speaks UK calendar days (`2026-10-08`), the API
   speaks instants. A day runs from UK midnight to the next UK midnight (23 to 25 hours across
   a clock change), the same days the table's Date column shows. */
const ZONE = 'Europe/London';
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE });
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The UK calendar day of an instant, `YYYY-MM-DD`. */
export const ukDay = (at: Date): string => dayFormat.format(at);

/** `value` if it is a real `YYYY-MM-DD` day, else ''. (A URL can carry anything.) */
export function cleanDay(value: string): string {
  if (!DAY.test(value)) return '';
  return Number.isNaN(Date.parse(`${value}T12:00:00Z`)) ? '' : value;
}

/** The instant a UK day starts, as ISO text. */
export function dayStart(day: string): string {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  const midnightUtc = Date.UTC(y, m - 1, d);
  // UK midnight is 00:00Z in winter and 23:00Z the evening before in summer
  for (const at of [midnightUtc, midnightUtc - 3_600_000]) {
    if (ukDay(new Date(at)) === day && ukDay(new Date(at - 60_000)) !== day) {
      return new Date(at).toISOString();
    }
  }
  return new Date(midnightUtc).toISOString();
}

/** The instant the day after `day` starts: the exclusive end of `day`. */
export function dayEnd(day: string): string {
  const [y = 1970, m = 1, d = 1] = day.split('-').map(Number);
  return dayStart(ukDay(new Date(Date.UTC(y, m - 1, d + 1, 12))));
}

/** The API's `from` / `before` for a chosen range; an open end is left out. */
export function rangeBounds(from: string, to: string): { from?: string; before?: string } {
  return {
    ...(from ? { from: dayStart(from) } : {}),
    ...(to ? { before: dayEnd(to) } : {}),
  };
}
