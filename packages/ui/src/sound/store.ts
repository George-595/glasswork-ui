/* The Sounds setting's store: whether interface sounds are on, one switch per device, kept in
   localStorage `ui-sounds` ('on' | 'off'), on by default. An external store, so every Switch and
   the engine read the same answer and a change in another tab arrives through the `storage`
   event. Every storage access is guarded: in a private window or with site data blocked the
   choice lasts for the page's life (`fallback`) and nothing throws. The engine reads it here;
   prefs.ts adds the hook and the setter that plays a confirmation. */
export const SOUND_KEY = 'ui-sounds';
export const SOUND_DEFAULT_ON = true;

const listeners = new Set<() => void>();
/** The choice when storage cannot hold it. */
let fallback: boolean | null = null;

/** Whether sounds are on right now. */
export function soundEnabled(): boolean {
  if (fallback !== null) return fallback;
  try {
    const stored = window.localStorage.getItem(SOUND_KEY);
    if (stored === 'off') return false;
    if (stored === 'on') return true;
  } catch {
    // storage blocked: the default stands
  }
  return SOUND_DEFAULT_ON;
}

export function writeSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_KEY, on ? 'on' : 'off');
    fallback = null;
  } catch {
    fallback = on;
  }
  for (const l of listeners) l();
}

export function subscribeSoundEnabled(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === SOUND_KEY || e.key === null) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

/** Forget the in-memory fallback. For tests only. */
export function resetSoundStore(): void {
  fallback = null;
}
