import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './client';

export type AsyncState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: T }
  | { status: 'error'; error: ApiError };

/* Runs an async call and tracks its state. Results that arrive after unmount are ignored.
   Nothing is aborted: keep it simple. */
export function useApiAction<A extends unknown[], T>(
  fn: (...a: A) => Promise<T>,
): { state: AsyncState<T>; run: (...a: A) => Promise<void>; reset(): void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'idle' });
  const mounted = useRef(false);
  // Each run (and each reset) takes a new number; only the latest run may set state.
  const latest = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (...args: A): Promise<void> => {
      const turn = ++latest.current;
      setState({ status: 'loading' });
      try {
        const data = await fn(...args);
        if (mounted.current && turn === latest.current) setState({ status: 'success', data });
      } catch (err) {
        if (!mounted.current || turn !== latest.current) return;
        const error =
          err instanceof ApiError ? err : new ApiError(0, 'unknown', 'Unexpected error.');
        setState({ status: 'error', error });
      }
    },
    [fn],
  );

  const reset = useCallback(() => {
    ++latest.current;
    setState({ status: 'idle' });
  }, []);

  return { state, run, reset };
}
