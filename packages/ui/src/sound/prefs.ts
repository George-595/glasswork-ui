import { useEffect, useSyncExternalStore } from 'react';
import { armSoundPriming, playSound, soundArmed, subscribeSoundArmed } from './engine';
import {
  ATTENTION_DEFAULT_ON,
  attentionSoundEnabled,
  SOUND_DEFAULT_ON,
  soundEnabled,
  soundVolume,
  subscribeAttentionSoundEnabled,
  subscribeSoundEnabled,
  subscribeSoundVolume,
  VOLUME_DEFAULT,
  writeAttentionSoundEnabled,
  writeSoundEnabled,
  writeSoundVolume,
} from './store';

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

/** Turn this device's attention sounds (`chime`, `alarm`) on or off: off by default, so only a device that turns
    them on (a wall tablet) ever plays one. Turning them on plays one `chime`, so the person hears what they chose. */
export function setAttentionSoundEnabled(on: boolean): void {
  writeAttentionSoundEnabled(on);
  if (on) playSound('chime', { volume: 0.5 });
}
export { attentionSoundEnabled };

/** The attention-sounds switch, live. The server snapshot is off. */
export function useAttentionSoundEnabled(): boolean {
  const on = useSyncExternalStore(
    subscribeAttentionSoundEnabled,
    attentionSoundEnabled,
    () => ATTENTION_DEFAULT_ON,
  );
  useEffect(() => (on ? armSoundPriming() : undefined), [on]);
  return on;
}

/** This device's sound level, 0 to 1 (default 1), on top of every sound's own. */
export function setSoundVolume(level: number): void {
  writeSoundVolume(level);
}
export { soundVolume };
export function useSoundVolume(): number {
  return useSyncExternalStore(subscribeSoundVolume, soundVolume, () => VOLUME_DEFAULT);
}

/** Has a gesture unlocked audio on this page yet? False on the server and before the first tap. */
export function useSoundArmed(): boolean {
  return useSyncExternalStore(subscribeSoundArmed, soundArmed, () => false);
}
export { soundArmed };
