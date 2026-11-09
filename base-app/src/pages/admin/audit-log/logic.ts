import type { AuditEvent } from '~/core/api';
import type { DayRange, RangePreset } from '~/core/ui';

/* The pure half of the audit page: the date-range presets, the filters, and the
   grouping of events by calendar day. Days are UK days (Europe/London), the
   same zone every formatter in this app defaults to, so an event at 00:30 BST
   is on the day a reader would say it was. */
export type RangeId = 'all' | 'today' | '7d' | '30d';

export const RANGES: readonly { value: RangeId; label: string }[] = [
  { value: 'all', label: 'All time' },
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
];

export const RANGE_LABEL: Record<RangeId, string> = {
  all: 'All time',
  today: 'Today',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
};

const ZONE = 'Europe/London';
const DAY_MS = 86_400_000;
const dayFormat = new Intl.DateTimeFormat('en-CA', { timeZone: ZONE });

/** The UK calendar day of a moment, as YYYY-MM-DD. */
export function dayKey(at: string | Date): string {
  return dayFormat.format(typeof at === 'string' ? new Date(at) : at);
}

/** The earliest moment a preset includes, or null for "all time". "Today" starts at the
    UK midnight; the others are a rolling 7 or 30 × 24 hours back from `now`. */
export function rangeStart(range: RangeId, now: Date): number | null {
  if (range === 'all') return null;
  if (range === '7d') return now.getTime() - 7 * DAY_MS;
  if (range === '30d') return now.getTime() - 30 * DAY_MS;
  // Today: step back a minute at a time until the UK day changes (a day has 23 to 25 hours,
  // so this is at most 1500 steps and needs no time-zone arithmetic of our own).
  const today = dayKey(now);
  let t = now.getTime();
  while (dayKey(new Date(t - 60_000)) === today) t -= 60_000;
  return t;
}

/** The quick ranges of the date-range picker: Today, then the last 7, 30 and 90 days
    (UK days, ending today and counting it). */
export const AUDIT_RANGE_PRESETS: readonly RangePreset[] = [
  { id: 'today', label: 'Today', range: (today) => ({ from: today, to: today }) },
  ...[7, 30, 90].map((n) => ({
    id: `last-${n}`,
    label: `Last ${n} days`,
    range: (today: string): DayRange => ({ from: addDays(today, -(n - 1)), to: today }),
  })),
];

function addDays(day: string, n: number): string {
  const [y = 0, m = 1, d = 1] = day.split('-').map(Number);
  return dayFormat.format(new Date(Date.UTC(y, m - 1, d + n, 12)));
}

/** Whether an event's UK day falls inside the chosen days (an open end is unbounded; an
    empty range keeps everything). */
export function inDayRange(at: string, range: DayRange): boolean {
  if (!range.from && !range.to) return true;
  const day = dayKey(at);
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

export interface AuditFilters {
  search: string;
  range: RangeId;
  actors: readonly string[];
  actions: readonly string[];
  outcomes: readonly string[];
}

export const NO_FILTERS: AuditFilters = {
  search: '',
  range: 'all',
  actors: [],
  actions: [],
  outcomes: [],
};

export type FacetKey = 'actors' | 'actions' | 'outcomes';

const FIELD: Record<FacetKey, (e: AuditEvent) => string> = {
  actors: (e) => e.actor,
  actions: (e) => e.action,
  outcomes: (e) => e.outcome,
};

/** Whether an event passes every filter except the facet named in `skip`. Counting a
    facet's options with its own filter left out is what lets a count say "ticking this
    would give you N". */
export function matches(
  e: AuditEvent,
  f: AuditFilters,
  from: number | null,
  skip?: FacetKey,
): boolean {
  if (from !== null && Date.parse(e.at) < from) return false;
  const needle = f.search.trim().toLowerCase();
  if (
    needle !== '' &&
    ![e.actor, e.action, e.target, e.ip].some((v) => v.toLowerCase().includes(needle))
  ) {
    return false;
  }
  for (const key of Object.keys(FIELD) as FacetKey[]) {
    if (key === skip) continue;
    const chosen = f[key];
    if (chosen.length > 0 && !chosen.includes(FIELD[key](e))) return false;
  }
  return true;
}

export interface FacetCount {
  value: string;
  count: number;
}

/** Every value of one facet in the log (so a value that is filtered out still shows, with 0),
    counted under the other filters. Sorted by value. */
export function facetOptions(
  events: readonly AuditEvent[],
  f: AuditFilters,
  from: number | null,
  key: FacetKey,
): FacetCount[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    const value = FIELD[key](e);
    const seen = counts.get(value) ?? 0;
    counts.set(value, seen + (matches(e, f, from, key) ? 1 : 0));
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .toSorted((a, b) => a.value.localeCompare(b.value));
}

export interface DayGroup {
  day: string;
  events: AuditEvent[];
}

/** Events grouped by UK day, newest day first and, inside a day, newest event first. */
export function groupByDay(events: readonly AuditEvent[]): DayGroup[] {
  const sorted = events.toSorted((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  const groups: DayGroup[] = [];
  for (const e of sorted) {
    const day = dayKey(e.at);
    const last = groups.at(-1);
    if (last && last.day === day) last.events.push(e);
    else groups.push({ day, events: [e] });
  }
  return groups;
}
