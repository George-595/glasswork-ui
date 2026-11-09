/* Seeded pseudo-random numbers (mulberry32). Same seed, same sequence, on every machine. */
export interface Rng {
  next(): number /* [0, 1) */;
  int(min: number, max: number): number /* inclusive on both ends */;
  pick<T>(items: readonly T[]): T;
  bool(p?: number): boolean;
  normal(mean: number, sd: number): number;
}

export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const int = (min: number, max: number): number => {
    if (max < min) throw new RangeError(`int: max (${max}) is below min (${min})`);
    return min + Math.floor(next() * (max - min + 1));
  };

  return {
    next,
    int,
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new RangeError('pick: empty list');
      return items[int(0, items.length - 1)] as T;
    },
    bool(p = 0.5): boolean {
      return next() < p;
    },
    normal(mean: number, sd: number): number {
      const u1 = Math.max(next(), Number.EPSILON);
      const u2 = next();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return mean + sd * z;
    },
  };
}
