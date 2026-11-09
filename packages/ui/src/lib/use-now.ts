import { useEffect, useState } from 'react';
import type { TimeInput } from './relative-time';

/* useNow — the reference time for "5 minutes ago". A fixed `now` (tests, server renders) is used
   as given; otherwise the clock is read once and then once a minute, so relative times stay
   honest without re-rendering every second. */
export function useNow(fixed?: TimeInput, everyMs = 60_000): TimeInput {
  const [tick, setTick] = useState(() => Date.now());
  useEffect(() => {
    if (fixed !== undefined) return;
    const timer = setInterval(() => setTick(Date.now()), everyMs);
    return () => clearInterval(timer);
  }, [fixed, everyMs]);
  return fixed ?? tick;
}
