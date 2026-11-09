import { useState } from 'react';
import type { QueryState } from './useApiQuery';

/* A refetch that does not blank the screen. `useApiQuery` goes back to `loading` on every reload,
   which is right for a first load and a Retry, but a live change arriving over the live stream
   would flash every panel to a skeleton and replay the reveal. This keeps the last good answer on
   screen while the new one loads; the first load, and a load after a failure, still show their
   skeleton. State set while rendering is React's pattern for state derived from props. */
export type Query<T> = QueryState<T> & { reload: () => void };

export function useQuiet<T>(query: Query<T>): Query<T> {
  const [last, setLast] = useState<{ data: T } | null>(null);
  if (query.status === 'success' && last?.data !== query.data) setLast({ data: query.data });
  if (query.status === 'error' && last) setLast(null);
  if (query.status === 'loading' && last) {
    return { status: 'success', data: last.data, reload: query.reload };
  }
  return query;
}

/** The same query with its answer turned into something else; loading, failure and reload are untouched. */
export function mapQuery<T, U>(query: Query<T>, convert: (data: T) => U): Query<U> {
  return query.status === 'success'
    ? { status: 'success', data: convert(query.data), reload: query.reload }
    : (query as Query<U>);
}
