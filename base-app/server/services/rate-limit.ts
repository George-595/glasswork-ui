/* A small in-memory sliding-window counter, for the endpoints that cost something or can be
   guessed at (forgot password, token links, password change, uploads). One process, which is
   what this template runs; a deployment with several instances moves this behind a shared store.

   `hit` records an attempt and says whether it is within the limit. The map is capped (oldest
   keys first), so random keys cannot grow it without bound. */
export interface RateLimiterOptions {
  max: number;
  windowMs: number;
  now?: () => Date;
  maxKeys?: number;
}

export function createRateLimiter(opts: RateLimiterOptions) {
  const now = opts.now ?? (() => new Date());
  const maxKeys = opts.maxKeys ?? 10_000;
  const hits = new Map<string, number[]>();

  const recent = (key: string): number[] => {
    const cutoff = now().getTime() - opts.windowMs;
    const list = (hits.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length === 0) hits.delete(key);
    else hits.set(key, list);
    return list;
  };

  return {
    /** Counts an attempt. False when the key is already at its limit (the attempt is not counted). */
    hit(key: string): boolean {
      const list = recent(key);
      if (list.length >= opts.max) return false;
      list.push(now().getTime());
      hits.delete(key);
      hits.set(key, list);
      while (hits.size > maxKeys) {
        const oldest = hits.keys().next().value;
        if (oldest === undefined) break;
        hits.delete(oldest);
      }
      return true;
    },
    /** True when the key is at its limit, without counting. */
    blocked(key: string): boolean {
      return recent(key).length >= opts.max;
    },
    /** Counts an attempt unconditionally (a failure recorded after the fact). */
    record(key: string): void {
      const list = recent(key);
      list.push(now().getTime());
      hits.delete(key);
      hits.set(key, list);
    },
    clear(key: string): void {
      hits.delete(key);
    },
  };
}
export type RateLimiter = ReturnType<typeof createRateLimiter>;
