import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/* False on the server and during the browser's hydration of the server's HTML, true from the
   first render after it (and always true in a client-only app). For text only the browser can
   write right - a time in the reader's own zone - so the first client render matches the server's
   HTML and the right text follows at once (a different text during hydration is a mismatch React
   reports and answers by throwing the server's markup away). */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
