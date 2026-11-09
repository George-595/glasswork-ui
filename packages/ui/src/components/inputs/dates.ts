/* Calendar-day helpers for the date pickers. A day is an ISO string `YYYY-MM-DD` (a calendar
   day, no time and no zone), so a value survives JSON and compares with `<`. Names and order
   come from `Intl`; nothing here knows a month's name. */
export type IsoDate = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toIso(d: Date): IsoDate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse `YYYY-MM-DD` as a local calendar day; null when it is not a real day. */
export function fromIso(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return toIso(d) === iso ? d : null;
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  const d = fromIso(iso) ?? new Date();
  return toIso(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

/** Move by whole months, keeping the day and clamping to the shorter month (31 Jan + 1 = 28 Feb). */
export function addMonths(iso: IsoDate, n: number): IsoDate {
  const d = fromIso(iso) ?? new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + n + 1, 0).getDate();
  return toIso(new Date(d.getFullYear(), d.getMonth() + n, Math.min(d.getDate(), last)));
}

export const monthOf = (iso: IsoDate): string => iso.slice(0, 7);
export const startOfMonth = (iso: IsoDate): IsoDate => `${monthOf(iso)}-01`;

/** Clamp a day into [min, max]. */
export function clampDay(iso: IsoDate, min?: IsoDate, max?: IsoDate): IsoDate {
  if (min && iso < min) return min;
  if (max && iso > max) return max;
  return iso;
}

/** Six weeks of days covering a month, starting on `weekStart` (0 Sunday … 1 Monday). */
export function monthGrid(month: IsoDate, weekStart = 1): IsoDate[][] {
  const first = fromIso(startOfMonth(month)) ?? new Date();
  const lead = (first.getDay() - weekStart + 7) % 7;
  const start = toIso(new Date(first.getFullYear(), first.getMonth(), 1 - lead));
  return Array.from({ length: 6 }, (_, w) =>
    Array.from({ length: 7 }, (_unused, d) => addDays(start, w * 7 + d)),
  );
}

export function weekdayNames(locale: string, weekStart = 1) {
  const long = new Intl.DateTimeFormat(locale, { weekday: 'long' });
  const short = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  // 2024-01-07 is a Sunday
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(2024, 0, 7 + ((i + weekStart) % 7));
    return { long: long.format(d), short: short.format(d) };
  });
}

export function formatDay(
  iso: IsoDate | null | undefined,
  locale: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  const d = fromIso(iso);
  return d ? new Intl.DateTimeFormat(locale, options).format(d) : '';
}

export interface DayRange {
  from: IsoDate | null;
  to: IsoDate | null;
}

export const EMPTY_RANGE: DayRange = { from: null, to: null };

/** The second click of a range: before the start it becomes the start. */
export function pickRange(range: DayRange, day: IsoDate): DayRange {
  if (!range.from || range.to) return { from: day, to: null };
  return day < range.from ? { from: day, to: range.from } : { from: range.from, to: day };
}

export interface RangePreset {
  id: string;
  label: string;
  range: (today: IsoDate) => DayRange;
}

/** "Last N days" ending today and including it. */
export const lastDays = (n: number): RangePreset => ({
  id: `last-${n}`,
  label: `Last ${n} days`,
  range: (today) => ({ from: addDays(today, -(n - 1)), to: today }),
});

export const DEFAULT_RANGE_PRESETS: readonly RangePreset[] = [
  lastDays(7),
  lastDays(30),
  lastDays(90),
];

/** Today as a local calendar day. */
export const todayIso = (): IsoDate => toIso(new Date());
