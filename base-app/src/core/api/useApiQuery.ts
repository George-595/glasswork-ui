import { useCallback, useEffect, useEffectEvent, useState } from 'react';
import { ApiError } from './client';
import { useInitialData } from './initial';

export type QueryState<T> =
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: ApiError };

type Settled<T> = Exclude<QueryState<T>, { status: 'loading' }>;

/** Where a query's first answer may come from: the server's copy of this API path (see
    initial.tsx), turned into the hook's `T` by `read` (the same step `load` applies to the raw
    response). Make one with `fromServer`. */
export interface QueryCache<T> {
  path: string;
  read(raw: unknown): T;
}

/** `useApiQuery(load, key, fromServer(apiPaths.kpis(30), (r: KpisResponse) => r.kpis))`.
    Without `select` the raw response is the data. */
export function fromServer<Raw, T = Raw>(path: string, select?: (raw: Raw) => T): QueryCache<T> {
  return { path, read: (raw) => (select ? select(raw as Raw) : (raw as unknown as T)) };
}

/* Loads data on mount (and whenever `key` changes) and tracks its state.
   - Each request has a token; only the answer for the current token is shown,
     so a slow earlier answer never overwrites a newer one, and a new key or a
     reload() shows 'loading' at once without an extra render.
   - Nothing is set after unmount.
   - With `cache`, the very first render is 'success' from the server's copy of the answer when
     there is one (a server render prefetched it), and no request is made for it. The copy is for
     that first key only: reload() or another key fetches as usual, and never looks at it again.
   Pages render a skeleton for 'loading' and an <ErrorState> for 'error'. */
export function useApiQuery<T>(
  load: () => Promise<T>,
  key: string | number = '',
  cache?: QueryCache<T>,
): QueryState<T> & { reload: () => void } {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ token: string; state: Settled<T> } | null>(null);
  const token = `${key}#${attempt}`;
  const run = useEffectEvent(() => load());

  // The server's answer for the first key, read once at mount. It is dropped (during render, the
  // allowed way to adjust state) the moment the key moves on, and never looked at again.
  const initial = useInitialData();
  const [seed, setSeed] = useState<{ token: string; data: T } | null>(() => {
    const raw = cache ? initial?.peek(cache.path) : undefined;
    return cache && raw !== undefined ? { token, data: cache.read(raw) } : null;
  });
  if (seed !== null && seed.token !== token) setSeed(null);
  const seeded = seed !== null && seed.token === token;

  useEffect(() => {
    if (seeded) return; // drawn from the server's copy: nothing to fetch
    let current = true;
    run().then(
      (data) => {
        if (current) setResult({ token, state: { status: 'success', data } });
      },
      (err: unknown) => {
        if (!current) return;
        const error =
          err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Unexpected error.');
        setResult({ token, state: { status: 'error', error } });
      },
    );
    return () => {
      current = false;
    };
  }, [token, seeded]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  const state: QueryState<T> =
    result && result.token === token
      ? result.state
      : seeded
        ? { status: 'success', data: seed.data }
        : { status: 'loading' };
  return { ...state, reload };
}
