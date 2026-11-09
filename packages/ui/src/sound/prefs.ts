import { useEffect, useSyncExternalStore } from 'react';
import { armSoundPriming, playSound } from './engine';
import { SOUND_DEFAULT_ON, soundEnabled, subscribeSoundEnabled, writeSoundEnabled } from './store';

/* The Sounds setting: on by default, one switch per device (store.ts). The server snapshot is
   the default, so a server render and hydration agree. */
export { soundEnabled };

/** Turn sounds on or off. Turning them on plays `toggle-on`, so the person hears what they chose. */
export function setSoundEnabled(on: boolean): void {
  writeSoundEnabled(on);
  if (on) playSound('toggle-on');
}

/** The Sounds setting, live. Also arms the first-gesture preload while sounds are on. */
export function useSoundEnabled(): boolean {
  const on = useSyncExternalStore(subscribeSoundEnabled, soundEnabled, () => SOUND_DEFAULT_ON);
  useEffect(() => (on ? armSoundPriming() : undefined), [on]);
  return on;
}
