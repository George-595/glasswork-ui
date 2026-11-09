import { useSyncExternalStore } from 'react';

/* Whether the browser thinks it has a connection (UX 4.0 "Offline banner"). It follows the
   window's `online` / `offline` events. `navigator.onLine` can say "online" on a captive or dead
   network, so a screen that fails still offers Retry; this only drives the banner and the
   "needs a connection" hints. Nothing is queued while offline: a wrong figure is worse than
   a delay. */
function subscribe(notify: () => void): () => void {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => {
    window.removeEventListener('online', notify);
    window.removeEventListener('offline', notify);
  };
}
const snapshot = (): boolean => navigator.onLine;
const server = (): boolean => true;

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, snapshot, server);
}
