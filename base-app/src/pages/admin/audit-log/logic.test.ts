import { describe, expect, it } from 'vitest';
import type { AuditEvent } from '~/core/api';
import {
  AUDIT_RANGE_PRESETS,
  dayKey,
  facetOptions,
  groupByDay,
  inDayRange,
  matches,
  NO_FILTERS,
  rangeStart,
} from './logic';

function ev(id: string, at: string, over: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id,
    at,
    actor: 'ada@example.com',
    action: 'login',
    target: 'session',
    ip: '192.0.2.1',
    outcome: 'success',
    ...over,
  };
}

describe('dayKey', () => {
  it('uses the UK calendar day, so 23:30 UTC in summer is already tomorrow', () => {
    expect(dayKey('2026-07-01T23:30:00Z')).toBe('2026-07-02');
    expect(dayKey('2026-12-01T23:30:00Z')).toBe('2026-12-01');
  });
});

describe('rangeStart', () => {
  const now = new Date('2026-10-10T12:00:00Z');
  it('is null for all time and a rolling window for 7 and 30 days', () => {
    expect(rangeStart('all', now)).toBeNull();
    expect(rangeStart('7d', now)).toBe(Date.parse('2026-10-03T12:00:00Z'));
    expect(rangeStart('30d', now)).toBe(Date.parse('2026-09-10T12:00:00Z'));
  });
  it('starts "today" at the UK midnight (BST: 23:00 UTC the evening before)', () => {
    expect(rangeStart('today', now)).toBe(Date.parse('2026-10-09T23:00:00Z'));
    const winter = new Date('2026-12-10T12:00:00Z');
    expect(rangeStart('today', winter)).toBe(Date.parse('2026-12-10T00:00:00Z'));
  });
});

describe('groupByDay', () => {
  it('groups newest day first, newest event first inside a day', () => {
    const groups = groupByDay([
      ev('a', '2026-10-09T08:00:00Z'),
      ev('b', '2026-10-10T08:00:00Z'),
      ev('c', '2026-10-10T09:00:00Z'),
    ]);
    expect(groups.map((g) => g.day)).toEqual(['2026-10-10', '2026-10-09']);
    expect(groups[0]?.events.map((e) => e.id)).toEqual(['c', 'b']);
  });
});

describe('matches and facetOptions', () => {
  const events = [
    ev('a', '2026-10-10T08:00:00Z', { actor: 'ada@example.com', action: 'login' }),
    ev('b', '2026-10-10T09:00:00Z', {
      actor: 'bob@example.com',
      action: 'export',
      target: 'x.csv',
    }),
    ev('c', '2026-10-09T09:00:00Z', {
      actor: 'bob@example.com',
      action: 'login',
      outcome: 'failure',
    }),
  ];

  it('searches actor, action, target and IP, case-insensitively', () => {
    expect(matches(events[1] as AuditEvent, { ...NO_FILTERS, search: 'X.CSV' }, null)).toBe(true);
    expect(matches(events[0] as AuditEvent, { ...NO_FILTERS, search: 'x.csv' }, null)).toBe(false);
    expect(matches(events[0] as AuditEvent, { ...NO_FILTERS, search: '192.0.2' }, null)).toBe(true);
  });

  it('ORs values inside a facet and ANDs across facets', () => {
    const f = { ...NO_FILTERS, actors: ['bob@example.com'], actions: ['login'] };
    expect(events.filter((e) => matches(e, f, null)).map((e) => e.id)).toEqual(['c']);
  });

  it('counts a facet under the other filters but not its own', () => {
    const f = { ...NO_FILTERS, actors: ['bob@example.com'] };
    const actors = facetOptions(events, f, null, 'actors');
    expect(actors).toEqual([
      { value: 'ada@example.com', count: 1 },
      { value: 'bob@example.com', count: 2 },
    ]);
    const actions = facetOptions(events, f, null, 'actions');
    expect(actions).toEqual([
      { value: 'export', count: 1 },
      { value: 'login', count: 1 },
    ]);
  });
});

describe('the date-range picker helpers', () => {
  it('quick ranges end today and count it (UK days, across the clock change)', () => {
    const range = (id: string, today: string) =>
      AUDIT_RANGE_PRESETS.find((p) => p.id === id)?.range(today);
    expect(range('today', '2026-10-10')).toEqual({ from: '2026-10-10', to: '2026-10-10' });
    expect(range('last-7', '2026-10-10')).toEqual({ from: '2026-10-04', to: '2026-10-10' });
    expect(range('last-30', '2026-10-10')).toEqual({ from: '2026-09-11', to: '2026-10-10' });
    // BST ended on 25 Oct 2026
    expect(range('last-7', '2026-10-27')).toEqual({ from: '2026-10-21', to: '2026-10-27' });
  });
  it('inDayRange compares the UK day, inclusive; an empty range keeps everything', () => {
    const r = { from: '2026-10-09', to: '2026-10-10' };
    expect(inDayRange('2026-10-09T00:30:00+01:00', r)).toBe(true);
    // 23:30 UTC on the 10th is 00:30 BST on the 11th
    expect(inDayRange('2026-10-10T23:30:00Z', r)).toBe(false);
    expect(inDayRange('2026-10-08T22:59:00Z', r)).toBe(false);
    expect(inDayRange('2026-08-01T10:00:00Z', { from: null, to: null })).toBe(true);
    expect(inDayRange('2026-08-01T10:00:00Z', { from: '2026-09-01', to: null })).toBe(false);
  });
});
