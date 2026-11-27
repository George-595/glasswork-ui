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

/* The two device-only switches the attention sounds add (UI.md §10.5). Both are conveniences of this one device, not
   something a person sets for the house, so they live in localStorage and nowhere else:

   - `ui-attention-sounds` ('on' | 'off'), OFF by default: a phone or a desktop never plays `chime` or `alarm`; only a
     device that turns it on (a wall tablet) does;
   - `ui-sound-volume` (0 to 1, default 1): the level of everything this device plays, on top of each sound's own. */
export const ATTENTION_KEY = 'ui-attention-sounds';
export const ATTENTION_DEFAULT_ON = false;
export const VOLUME_KEY = 'ui-sound-volume';
export const VOLUME_DEFAULT = 1;

interface Switch<T> {
  read(): T;
  write(v: T): void;
  subscribe(l: () => void): () => void;
  reset(): void;
}

function deviceSetting<T>(
  key: string,
  parse: (stored: string) => T | null,
  show: (v: T) => string,
  fallbackValue: T,
): Switch<T> {
  const listeners = new Set<() => void>();
  let memory: T | null = null;
  return {
    read() {
      if (memory !== null) return memory;
      try {
        const stored = window.localStorage.getItem(key);
        if (stored !== null) {
          const v = parse(stored);
          if (v !== null) return v;
        }
      } catch {
        // storage blocked: the default stands
      }
      return fallbackValue;
    },
    write(v) {
      try {
        window.localStorage.setItem(key, show(v));
        memory = null;
      } catch {
        memory = v;
      }
      for (const l of listeners) l();
    },
    subscribe(l) {
      listeners.add(l);
      const onStorage = (e: StorageEvent) => {
        if (e.key === key || e.key === null) l();
      };
      window.addEventListener('storage', onStorage);
      return () => {
        listeners.delete(l);
        window.removeEventListener('storage', onStorage);
      };
    },
    reset() {
      memory = null;
    },
  };
}

const attention = deviceSetting<boolean>(
  ATTENTION_KEY,
  (s) => (s === 'on' ? true : s === 'off' ? false : null),
  (v) => (v ? 'on' : 'off'),
  ATTENTION_DEFAULT_ON,
);
const volume = deviceSetting<number>(
  VOLUME_KEY,
  (s) => {
    const n = Number(s);
    return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : null;
  },
  (v) => String(v),
  VOLUME_DEFAULT,
);

export const attentionSoundEnabled = attention.read;
export const writeAttentionSoundEnabled = attention.write;
export const subscribeAttentionSoundEnabled = attention.subscribe;
export const soundVolume = volume.read;
export const writeSoundVolume = (v: number) => volume.write(Math.min(1, Math.max(0, v)));
export const subscribeSoundVolume = volume.subscribe;

/** Forget the in-memory fallbacks. For tests only. */
export function resetDeviceSoundStore(): void {
  attention.reset();
  volume.reset();
}
