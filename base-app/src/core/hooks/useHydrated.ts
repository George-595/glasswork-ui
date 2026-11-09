import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/* False on the server and during the browser's hydration of the server's HTML, true from the
   first render after it (and always true in a client-only app). Use it to draw something that can
   only be known in the browser - the reader's time zone, a stored preference - without making the
   first client render differ from the server's, which React reports as a hydration mismatch:

     const hydrated = useHydrated();
     <time>{format(now, hydrated ? undefined : 'Europe/London')}</time>

   Prefer a server-known value (the theme cookie, the request's address) where there is one: this
   is for what only the browser can say. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
