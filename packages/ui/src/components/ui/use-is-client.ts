import { useSyncExternalStore } from 'react';

const noopSubscribe = () => () => {};

/** False on the server and while hydrating, true on the client after that.
    Radix portals mount only on the client, so an overlay that must appear in
    server-rendered HTML (an open-by-default menu or tooltip) renders in
    place until this turns true. */
export function useIsClient(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
