/* The kit's interface sounds: eleven small mono WAVs in ./assets, rendered offline from earshot's
   sound bank by scripts/render-sounds.py (see the README's Sounds section). Each import is a
   hashed asset URL (Vite's `?no-inline`), so the audio adds no JavaScript and is fetched only
   when a sound first plays or is primed. Vitest and the server build resolve the same imports. */

import approvalUrl from './assets/approval.wav?no-inline';
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

export type SoundName = (typeof SOUND_NAMES)[number];

export const SOUND_URLS: Readonly<Record<SoundName, string>> = {
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
};
