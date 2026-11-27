/* The kit's sounds: eleven small mono WAVs for interface feedback and two attention sounds, in ./assets, rendered
   offline from earshot's sound bank by scripts/render-sounds.py (see the README's Sounds section). Each import is a
   hashed asset URL (Vite's `?no-inline`), so the audio adds no JavaScript and is fetched only when a sound first
   plays or is primed. Vitest and the server build resolve the same imports.

   An empty URL means a sound with no file: the engine then plays nothing and fetches nothing. */

import alarmUrl from './assets/alarm.wav?no-inline';
import approvalUrl from './assets/approval.wav?no-inline';
import chimeUrl from './assets/chime.wav?no-inline';
import closeUrl from './assets/close.wav?no-inline';
import errorUrl from './assets/error.wav?no-inline';
import notifyUrl from './assets/notify.wav?no-inline';
import openUrl from './assets/open.wav?no-inline';
import replyUrl from './assets/reply.wav?no-inline';
import sendUrl from './assets/send.wav?no-inline';
import successUrl from './assets/success.wav?no-inline';
import tickUrl from './assets/tick.wav?no-inline';
import toggleOffUrl from './assets/toggle-off.wav?no-inline';
import toggleOnUrl from './assets/toggle-on.wav?no-inline';

/** The interface sounds: the answer to a press. */
export const SOUND_NAMES = [
  'tick',
  'toggle-on',
  'toggle-off',
  'open',
  'close',
  'send',
  'notify',
  'success',
  'error',
  'reply',
  'approval',
] as const;

/** The attention sounds: for a device that has chosen to be told (a wall tablet), never for an ordinary press.
    `chime` is a two-note door chime; `alarm` a short, urgent two-tone pulse. */
export const ATTENTION_SOUNDS = ['chime', 'alarm'] as const;

/** An interface sound. */
export type SoundName = (typeof SOUND_NAMES)[number];
export type AttentionSoundName = (typeof ATTENTION_SOUNDS)[number];
/** Any sound `playSound` can play. */
export type PlayableSound = SoundName | AttentionSoundName;

export function isAttentionSound(name: PlayableSound): name is AttentionSoundName {
  return (ATTENTION_SOUNDS as readonly string[]).includes(name);
}

export const SOUND_URLS: Readonly<Record<PlayableSound, string>> = {
  tick: tickUrl,
  'toggle-on': toggleOnUrl,
  'toggle-off': toggleOffUrl,
  open: openUrl,
  close: closeUrl,
  send: sendUrl,
  notify: notifyUrl,
  success: successUrl,
  error: errorUrl,
  reply: replyUrl,
  approval: approvalUrl,
  chime: chimeUrl,
  alarm: alarmUrl,
};
