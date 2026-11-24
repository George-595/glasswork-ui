import { useCallback, useEffect, useSyncExternalStore } from 'react';

/* deferred — a module fetched on intent or when the browser is idle, for always-mounted chrome whose popup only a
   press opens (the shell's user menu, the rail's tooltips). The caller renders a stand-in with the same markup
   until the module arrives, so the first load carries a button, not the popup's whole UI SDK stack. */
export interface DeferredModule<M> {
  load(): Promise<M>;
  peek(): M | undefined;
  /** Calls `listener` when the module arrives. */
  subscribe(listener: () => void): () => void;
}

/** One dynamic import, fetched at most once; `peek` is the module once it has arrived. A failed fetch is forgotten,
    so the next `load()` tries again. */
export function deferredModule<M>(load: () => Promise<M>): DeferredModule<M> {
  let mod: M | undefined;
  let pending: Promise<M> | undefined;
  const listeners = new Set<() => void>();
  return {
    load() {
      pending ??= load().then(
        (m) => {
          mod = m;
          for (const l of listeners) l();
          return m;
        },
        (e: unknown) => {
          pending = undefined;
          throw e;
        },
      );
      return pending;
    },
    peek: () => mod,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** The module for rendering: undefined on the server and while hydrating (so hydration matches), then the module
    once it has arrived. It is fetched when the browser is idle (requestIdleCallback with
    a 2 s timeout, else setTimeout 300 ms), or at once on `request()`. A failed fetch is retried on the next
    `request()`. */
export function useDeferredModule<M>(m: DeferredModule<M>): {
  module: M | undefined;
  request: () => void;
} {
  // the server snapshot is undefined, so a hydrating tree matches the server's markup, then the client's follows
  const module = useSyncExternalStore(m.subscribe, m.peek, () => undefined);
  const request = useCallback(() => {
    m.load().catch(() => {}); // a failed fetch is forgotten: the next request() tries again
  }, [m]);
  useEffect(() => {
    if (m.peek()) return;
    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(request, { timeout: 2000 });
      return () => cancelIdleCallback(id);
    }
    const t = setTimeout(request, 300);
    return () => clearTimeout(t);
  }, [m, request]);
  return { module, request };
}
