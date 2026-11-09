/* Memoise a generator by its count argument. The cache is per process and never invalidated:
   the data is fixed, so a cached result is always correct. */
export function memoByCount<T>(build: (count: number) => T): (count: number) => T {
  const cache = new Map<number, T>();
  return (count: number): T => {
    const hit = cache.get(count);
    if (hit !== undefined) return hit;
    const value = build(count);
    cache.set(count, value);
    return value;
  };
}
