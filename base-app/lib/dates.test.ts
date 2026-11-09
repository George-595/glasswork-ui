import { describe, expect, it } from 'vitest';
import { addDays, formatDate, formatDateTime, formatRelative, toISODate } from './dates.ts';

const UTC = 'UTC';

describe('toISODate', () => {
  it('returns the UTC calendar date', () => {
    expect(toISODate(new Date('2026-10-01T23:30:00.000Z'))).toBe('2026-10-01');
  });
});

describe('addDays', () => {
  it('adds whole days without mutating the input', () => {
    const base = new Date('2026-02-27T12:00:00.000Z');
    const next = addDays(base, 2);
    expect(toISODate(next)).toBe('2026-03-01');
    expect(toISODate(base)).toBe('2026-02-27');
  });

  it('subtracts with a negative count', () => {
    expect(toISODate(addDays(new Date('2026-10-01T00:00:00.000Z'), -90))).toBe('2026-07-03');
  });
});

describe('formatDate', () => {
  it('formats in en-GB with an explicit time zone', () => {
    expect(formatDate('2026-10-01', 'long', UTC)).toBe('1 October 2026');
    expect(formatDate('2026-10-01', 'medium', UTC)).toBe('1 Oct 2026');
  });
});

describe('formatDateTime', () => {
  it('includes the time in the given zone', () => {
    const s = formatDateTime('2026-10-01T09:05:00.000Z', UTC);
    expect(s).toContain('09:05');
    expect(s).toContain('2026');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-10-01T09:00:00.000Z');

  it('describes hours in the past', () => {
    expect(formatRelative('2026-10-01T06:00:00.000Z', now)).toBe('3 hours ago');
  });

  it('describes days in the future', () => {
    expect(formatRelative('2026-10-03T09:00:00.000Z', now)).toBe('in 2 days');
  });

  it('falls back to seconds for very small gaps', () => {
    expect(formatRelative('2026-10-01T08:59:30.000Z', now)).toBe('30 seconds ago');
  });
});
