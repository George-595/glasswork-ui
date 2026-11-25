import { useSyncExternalStore } from 'react';

/* useMinWidth — true while the window is at least this wide (the same breakpoints as Show and
   Tailwind: sm 640, md 768, lg 1024, xl 1280). For layouts that change what is mounted, not
   only what is shown: a phone gets one pane at a time where a desktop gets two side by side.
   When the markup is the same at every width, prefer Show (CSS only).

   On the server, and during hydration, it reports false (the phone layout), then the client
   checks the real width. */
export type MinWidth = 'sm' | 'md' | 'lg' | 'xl';

const PX: Record<MinWidth, number> = { sm: 640, md: 768, lg: 1024, xl: 1280 };

function list(at: MinWidth): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null;
  return window.matchMedia(`(min-width: ${PX[at]}px)`);
}

export function useMinWidth(at: MinWidth): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = list(at);
      if (!mql) return () => {};
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    },
    () => list(at)?.matches ?? false,
    () => false,
  );
}
