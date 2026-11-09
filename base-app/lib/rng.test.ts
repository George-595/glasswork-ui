import { describe, expect, it } from 'vitest';
import { createRng } from './rng.ts';

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('gives different sequences for different seeds', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('returns values in [0, 1)', () => {
    const rng = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int is inclusive at both bounds', () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.int(2, 5));
    expect([...seen].toSorted()).toEqual([2, 3, 4, 5]);
  });

  it('int rejects max below min', () => {
    expect(() => createRng(1).int(5, 2)).toThrow(RangeError);
  });

  it('pick covers every item over 1000 draws', () => {
    const rng = createRng(11);
    const items = ['a', 'b', 'c', 'd'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(rng.pick(items));
    expect(seen.size).toBe(items.length);
  });

  it('pick rejects an empty list', () => {
    expect(() => createRng(1).pick([])).toThrow(RangeError);
  });

  it('bool respects the probability', () => {
    const rng = createRng(5);
    let yes = 0;
    for (let i = 0; i < 2000; i++) if (rng.bool(0.25)) yes++;
    expect(yes / 2000).toBeGreaterThan(0.2);
    expect(yes / 2000).toBeLessThan(0.3);
  });

  it('normal centres on the mean', () => {
    const rng = createRng(9);
    let total = 0;
    for (let i = 0; i < 4000; i++) total += rng.normal(10, 2);
    expect(total / 4000).toBeGreaterThan(9.8);
    expect(total / 4000).toBeLessThan(10.2);
  });
});
