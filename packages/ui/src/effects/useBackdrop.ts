import { useCallback, useContext, useSyncExternalStore } from 'react';
import {
  type Backdrop,
  DEFAULT_BACKDROP,
  isBackdrop,
  readThemeCookie,
  updateThemeCookie,
  upgradeBackdrop,
} from '../theme/themeCookie';
import { ThemeSeedContext } from '../theme/themeSeed';
import { SHADER_PRESETS } from './shaders/presets';

/* useBackdrop — the reader's choice of glass-skin backdrop, persisted.

   A Backdrop is one of the two kit scenes ('tide', 'hive') or one of
   the four shader presets. AppShell reads this when its `background` prop is
   not set, so a Settings page can offer a picker with nothing more than:

     const [backdrop, setBackdrop] = useBackdrop();
     <NativeSelect value={backdrop} onChange={(e) => setBackdrop(e.target.value as Backdrop)}>
       {BACKDROPS.map(…)}
     </NativeSelect>

   Stored in localStorage under `ui-backdrop`. Storage can be blocked
   (private windows, site data off) and can throw on either read or write:
   every access is guarded, and the choice then lasts for the page only (an
   in-memory copy keeps every hook in the page in step). Tabs follow each
   other through the `storage` event. The default is 'tide', the calm one. Names from before
   Nov 2026 ('aurora', 'iridescence') are read as their successors (themeCookie.ts).

   The choice is also kept in the `ui-theme` cookie (theme/themeCookie.ts), so a server can paint
   it; a server render (and the hydration of it) starts from the seed in <ThemeSeedContext>. */
export type { Backdrop } from '../theme/themeCookie';
export { DEFAULT_BACKDROP, isBackdrop } from '../theme/themeCookie';

export const BACKDROPS = [
  'tide',
  'hive',
  ...SHADER_PRESETS,
] as const satisfies readonly Backdrop[];
export const BACKDROP_KEY = 'ui-backdrop';

/** Set once a choice is made in this page, so a blocked store still works. */
let memory: Backdrop | null = null;
const listeners = new Set<() => void>();

function readStored(): Backdrop | null {
  try {
    const v = upgradeBackdrop(window.localStorage.getItem(BACKDROP_KEY));
    return isBackdrop(v) ? v : null;
  } catch {
    return null;
  }
}

function snapshot(): Backdrop {
  if (typeof window === 'undefined') return DEFAULT_BACKDROP;
  return memory ?? readStored() ?? readThemeCookie()?.backdrop ?? DEFAULT_BACKDROP;
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === BACKDROP_KEY) {
      memory = null; // another tab chose: read its value
      fn();
    }
  };
  if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
  };
}

export function setBackdrop(next: Backdrop): void {
  if (!isBackdrop(next)) return;
  memory = next;
  try {
    window.localStorage.setItem(BACKDROP_KEY, next);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
  updateThemeCookie({ backdrop: next });
  for (const fn of listeners) fn();
}

/** The chosen backdrop and its setter. */
export function useBackdrop(): readonly [Backdrop, (next: Backdrop) => void] {
  const seed = useContext(ThemeSeedContext);
  const value = useSyncExternalStore(subscribe, snapshot, () => seed?.backdrop ?? DEFAULT_BACKDROP);
  const set = useCallback((next: Backdrop) => setBackdrop(next), []);
  return [value, set] as const;
}

/** Test seam: forget the in-memory choice. */
export function resetBackdropMemory(): void {
  memory = null;
  for (const fn of listeners) fn();
}
