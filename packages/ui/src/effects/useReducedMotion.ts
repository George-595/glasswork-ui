import { useSyncExternalStore } from 'react';

/* useReducedMotion — true when the reader asked for less motion.

   On the server, and during hydration, it reports `true`: every effect
   renders its static form first, then animates once the client has checked
   the media query. That keeps server and client markup identical and means
   no frame of motion ever reaches a reader who opted out. */
const QUERY = '(prefers-reduced-motion: reduce)';

function mediaQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(QUERY);
}

function subscribe(onChange: () => void): () => void {
  const mql = mediaQuery();
  if (!mql) return () => {};
  mql.addEventListener('change', onChange);
  return () => mql.removeEventListener('change', onChange);
}

function getSnapshot(): boolean {
  return mediaQuery()?.matches ?? false;
}

function getServerSnapshot(): boolean {
  return true;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
