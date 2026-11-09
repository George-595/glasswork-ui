import { useSyncExternalStore } from 'react';

/* Whether a CSS media query matches, and keeps matching as the window changes. A page cannot lay
   two versions of a control out and hide one with CSS without the same control being in the page
   twice (two labels, two ids), so the screen asks once and draws the one it needs. A window with
   no matchMedia (jsdom) is treated as not matching: a phone, the screen this app is designed for
   first. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof window.matchMedia !== 'function') return () => {};
      const list = window.matchMedia(query);
      list.addEventListener('change', notify);
      return () => list.removeEventListener('change', notify);
    },
    () => typeof window.matchMedia === 'function' && window.matchMedia(query).matches,
    () => false,
  );
}

/** At least 768px wide (the kit's `md`): from there the filters sit inline, the sheets open on the
    right instead of rising from the bottom, and tables replace card lists. */
export function useWide(): boolean {
  return useMediaQuery('(min-width: 768px)');
}
