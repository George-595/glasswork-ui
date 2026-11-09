import { useCallback, useEffect, useEffectEvent, useState } from 'react';

function read<T>(key: string, initial: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? initial : (JSON.parse(raw) as T);
  } catch {
    // storage blocked, or the stored text is not JSON: behave as if nothing was saved
    return initial;
  }
}

/* useState that remembers its value in localStorage under `key` (JSON). For
   per-person conveniences such as the sidebar being collapsed, never for data
   that matters: storage can be blocked, full or cleared, and every access is
   guarded, so the hook then simply behaves like useState.
   - `initial` is used when nothing is saved (or it cannot be read).
   - The first render always uses `initial`, and the saved value is read right after mounting:
     a server cannot see localStorage, so a first client render that did would not match the
     server's HTML (a hydration mismatch). The one-frame swap is for a returning visitor only.
   - Another tab changing the key updates this one. */
export function useLocalStorage<T>(
  key: string,
  initial: T,
): readonly [T, (next: T | ((current: T) => T)) => void] {
  const [value, setValue] = useState<T>(initial);
  // `initial` is only a fallback: a fresh object each render must not resubscribe the listener
  const onExternalChange = useEffectEvent((e: StorageEvent) => {
    if (e.key !== key) return;
    setValue(e.newValue === null ? initial : read(key, initial));
  });

  const set = useCallback(
    (next: T | ((current: T) => T)) => {
      setValue((current) => {
        const resolved = typeof next === 'function' ? (next as (c: T) => T)(current) : next;
        try {
          window.localStorage.setItem(key, JSON.stringify(resolved));
        } catch {
          // not saved; the value still holds for this visit
        }
        return resolved;
      });
    },
    [key],
  );

  const readSaved = useEffectEvent(() => read(key, initial));
  // biome-ignore lint/correctness/useExhaustiveDependencies: the saved value is read on mount and when the key changes
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the saved value can only be read after hydration
    setValue(readSaved());
  }, [key]);

  useEffect(() => {
    window.addEventListener('storage', onExternalChange);
    return () => window.removeEventListener('storage', onExternalChange);
  }, []);

  return [value, set] as const;
}
