import { useSyncExternalStore } from 'react';

/* The unread-notification count as a tiny store, so the bell, the /notifications page and the
   document title all read one number. It imports nothing from the app (Page in core/ui reads it for
   the tab title, and the provider that fills it imports core/ui, so the two must not share a file). */
let count = 0;
const listeners = new Set<() => void>();

export function setUnreadCount(next: number): void {
  const value = Math.max(0, Math.floor(next));
  if (value === count) return;
  count = value;
  for (const listener of listeners) listener();
}

export function getUnreadCount(): number {
  return count;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current unread count; 0 when nobody is signed in or it has not loaded yet. */
export function useUnreadCount(): number {
  return useSyncExternalStore(subscribe, getUnreadCount, () => 0);
}
