import { useContext, useEffect, useEffectEvent } from 'react';
import { RealtimeContext, type RealtimeStatus } from './RealtimeProvider';

/* useEventStream('notification', (data) => …) — runs the handler for each such event on the
   shared stream while the component is mounted. `data` is the parsed JSON the server sent; type it
   with the generic (the shapes are in shared/api.ts). The handler may change every render without
   resubscribing. 'resync' is synthetic: it fires after the stream returns from a gap, and means
   "refetch what you show", because the server does not replay what was missed.

   Without a <RealtimeProvider> above it (a page rendered alone in a test) it listens to nothing. */
export function useEventStream<T = unknown>(event: string, handler: (data: T) => void): void {
  const { subscribe } = useContext(RealtimeContext);
  const run = useEffectEvent((data: unknown) => handler(data as T));
  useEffect(() => subscribe(event, run), [subscribe, event]);
}

/** The stream's connection state, for a status light or a "reconnecting…" hint. */
export function useRealtimeStatus(): RealtimeStatus {
  return useContext(RealtimeContext).status;
}
