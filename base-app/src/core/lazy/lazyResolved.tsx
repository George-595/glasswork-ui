import { type ComponentType, lazy, useState } from 'react';

/* A lazy component that is drawn at once when its file has already arrived.

   `React.lazy` always suspends on its first render, even when the module is in the cache, so a
   server render sends a loading fallback and swaps the real content in behind it, and a hydrating
   browser finds a boundary it has to wait on. `lazyResolved` keeps the file's component once it
   has loaded: `load()` fetches it (a server render awaits it before rendering, and the browser
   before it hydrates), and from then on a component that mounts draws it synchronously, with no
   Suspense involved, so the server's HTML holds the content itself and the first client render
   matches it. A component that mounts before the file has loaded (a later move to the page) falls
   back to `React.lazy`, behind whatever Suspense boundary the caller put around it.

   The choice is made once, when a component mounts: it never swaps one branch for the other
   afterwards, which would remount the page and lose its state. */
export interface LazyResolved<P> {
  Component: ComponentType<P>;
  /** Fetches the file (once). Rejects if it cannot be fetched. */
  load: () => Promise<void>;
}

export function lazyResolved<P extends object>(
  load: () => Promise<{ default: ComponentType<P> }>,
): LazyResolved<P> {
  let resolved: ComponentType<P> | undefined;
  let pending: Promise<{ default: ComponentType<P> }> | undefined;
  const fetchOnce = () => {
    pending ??= load().then(
      (module) => {
        resolved = module.default;
        return module;
      },
      (error: unknown) => {
        pending = undefined;
        throw error;
      },
    );
    return pending;
  };
  const Lazy = lazy(fetchOnce);

  function LazyResolved(props: P) {
    const [Ready] = useState(() => resolved);
    return Ready ? <Ready {...props} /> : <Lazy {...(props as P & object)} />;
  }

  return { Component: LazyResolved, load: () => fetchOnce().then(() => undefined) };
}
