import { describe, expect, it } from 'vitest';
import { newId, UUID_V7 } from './ids.ts';

describe('newId', () => {
  it('is a lower-case UUIDv7 string of 36 characters', () => {
    const id = newId();
    expect(id).toHaveLength(36);
    expect(id).toMatch(UUID_V7);
  });

  it('starts with the clock in milliseconds', () => {
    const ms = Date.now() + 5_000_000;
    const id = newId(() => ms);
    expect(Number.parseInt(id.replace('-', '').slice(0, 12), 16)).toBe(ms);
  });

  it('is strictly increasing, even inside one millisecond', () => {
    const ms = Date.now() + 10_000_000;
    const ids = Array.from({ length: 5000 }, () => newId(() => ms));
    for (let i = 1; i < ids.length; i++) expect((ids[i] ?? '') > (ids[i - 1] ?? '')).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('sorts by creation time across milliseconds', () => {
    const base = Date.now() + 20_000_000;
    const ids = [0, 1, 2, 3].map((d) => newId(() => base + d * 5));
    expect(ids.toSorted()).toEqual(ids);
  });

  it('never goes backwards when the clock does', () => {
    const base = Date.now() + 30_000_000;
    const a = newId(() => base);
    const b = newId(() => base - 500);
    expect(b > a).toBe(true);
  });

  it('does not repeat across many calls', () => {
    expect(new Set(Array.from({ length: 20_000 }, () => newId())).size).toBe(20_000);
  });
});
