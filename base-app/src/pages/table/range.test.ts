import { describe, expect, it } from 'vitest';
import { cleanDay, dayEnd, dayStart, rangeBounds, ukDay } from './range';

describe('UK days as instants', () => {
  it('starts a winter day at 00:00Z and a summer day an hour earlier', () => {
    expect(dayStart('2026-12-10')).toBe('2026-12-10T00:00:00.000Z');
    expect(dayStart('2026-10-10')).toBe('2026-10-09T23:00:00.000Z');
  });
  it('ends a day where the next one starts, across both clock changes', () => {
    expect(dayEnd('2026-10-10')).toBe('2026-10-10T23:00:00.000Z');
    // BST ends on 25 Oct 2026: that day is 25 hours long
    expect(dayStart('2026-10-25')).toBe('2026-10-24T23:00:00.000Z');
    expect(dayEnd('2026-10-25')).toBe('2026-10-26T00:00:00.000Z');
    // BST starts on 29 Mar 2026: that day is 23 hours long
    expect(dayStart('2026-03-29')).toBe('2026-03-29T00:00:00.000Z');
    expect(dayEnd('2026-03-29')).toBe('2026-03-29T23:00:00.000Z');
  });
  it('names the UK day of an instant', () => {
    expect(ukDay(new Date('2026-10-10T23:30:00Z'))).toBe('2026-10-11');
    expect(ukDay(new Date('2026-12-10T23:30:00Z'))).toBe('2026-12-10');
  });
  it('builds API bounds, leaving an open end out', () => {
    expect(rangeBounds('', '')).toEqual({});
    expect(rangeBounds('2026-10-10', '')).toEqual({ from: '2026-10-09T23:00:00.000Z' });
    expect(rangeBounds('2026-12-01', '2026-12-02')).toEqual({
      from: '2026-12-01T00:00:00.000Z',
      before: '2026-12-03T00:00:00.000Z',
    });
  });
  it('ignores a day that is not one', () => {
    expect(cleanDay('2026-10-10')).toBe('2026-10-10');
    expect(cleanDay('nope')).toBe('');
    expect(cleanDay('2026-13-40')).toBe('');
    expect(cleanDay('2026-10-10; DROP')).toBe('');
  });
});
