import { type ReactElement, useEffect, useSyncExternalStore } from 'react';
import type { ToasterProps } from './toast';
import { selfTime, snapshot, subscribe } from './toast-store';

/* The Toaster facade. The queue is in toast-store.ts (a few hundred bytes); the Radix view is
   heavy (about 13 kB gzip with its stack), so it is fetched after hydration, not shipped in every page's
   first load. */

type ToastModule = typeof import('./toast');

let loaded: ToastModule | null = null;
let loading: Promise<void> | null = null;
const arrivals = new Set<() => void>();
const subscribeArrival = (l: () => void) => {
  arrivals.add(l);
  return () => {
    arrivals.delete(l);
  };
};

/** Fetches the view now: tests, and anything that knows a toast is coming. A failed fetch rejects and is
    forgotten, so the next call (the next push, for the Toaster) tries again. */
export function preloadToaster(): Promise<void> {
  if (loaded) return Promise.resolve();
  loading ??= import('./toast').then(
    (m) => {
      loaded = m;
      selfTime(false); // the mounted view times the toasts from here
      for (const l of arrivals) l();
    },
    (error: unknown) => {
      loading = null;
      selfTime(true); // no view: the store expires toasts itself, so an undo toast's onExpire still runs
      throw error;
    },
  );
  return loading;
}

/** The one Toaster at the app's root. Renders nothing on the server and on the first client render (so
    hydration matches), then fetches the Radix view: at once if a toast is waiting, else when the browser is
    idle (2 s at most). A toast pushed before the view arrives is kept and shown when it does. */
export function Toaster(props: ToasterProps): ReactElement | null {
  // the server and a hydrating first render read `null`, so the markup matches; a page that is not hydrating
  // (a test, a client-only root) shows a view that has already arrived at once
  const view = useSyncExternalStore(
    subscribeArrival,
    () => loaded,
    () => null,
  );

  useEffect(() => {
    if (loaded) return;
    const load = () => {
      preloadToaster().catch(() => {
        /* the next push retries (the subscription below); until then the toasts wait in the store */
      });
    };
    if (snapshot().length > 0) load();
    // a retry on the next push (not on every emit): preloadToaster keeps one import in flight at a time
    let newest = snapshot().at(-1)?.id;
    const unsubscribe = subscribe(() => {
      const latest = snapshot().at(-1)?.id;
      if (latest === newest) return;
      newest = latest;
      if (latest) load();
    });
    let cancel: () => void;
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(load, { timeout: 2000 });
      cancel = () => cancelIdleCallback(id);
    } else {
      const id = setTimeout(load, 300);
      cancel = () => clearTimeout(id);
    }
    return () => {
      unsubscribe();
      cancel();
    };
  }, []);

  return view ? <view.ToasterView {...props} /> : null;
}
