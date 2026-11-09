import { SOUND_NAMES, SOUND_URLS, type SoundName } from './sounds';
import { soundEnabled } from './store';

/* The sound engine: one AudioContext and one master gain, every buffer fetched and decoded once.

   `playSound(name)` is safe to call from anywhere: it does nothing on the server, with sounds
   off, in a hidden tab or where there is no AudioContext, plays the same sound at most once per
   60 ms, and swallows every error, because a sound must never break the page. Call it only in
   answer to something a person did (ENGINEERING: interface sounds).

   Whenever a sound would play (sounds on, tab visible) a `ui:sound` event with `{ name }` is
   dispatched on `window` first, so a test or an e2e run can see sounds without any audio. */
const THROTTLE_MS = 60;
const MASTER_GAIN = 1;

type ContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
let master: GainNode | null = null;
const buffers = new Map<SoundName, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<SoundName, number>();

function contextCtor(): ContextCtor | undefined {
  const w = window as unknown as { AudioContext?: ContextCtor; webkitAudioContext?: ContextCtor };
  return w.AudioContext ?? w.webkitAudioContext;
}

function getContext(): AudioContext | null {
  if (context) return context;
  const Ctor = contextCtor();
  if (!Ctor) return null;
  context = new Ctor();
  master = context.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(context.destination);
  return context;
}

function loadBuffer(ctx: AudioContext, name: SoundName): Promise<AudioBuffer | null> {
  const cached = buffers.get(name);
  if (cached) return cached;
  const pending = (async () => {
    try {
      const res = await fetch(SOUND_URLS[name]);
      if (!res.ok) throw new Error(`sound ${name}: ${res.status}`);
      return await ctx.decodeAudioData(await res.arrayBuffer());
    } catch {
      // forget it, so a later play may try again
      buffers.delete(name);
      return null;
    }
  })();
  buffers.set(name, pending);
  return pending;
}

/** Fetch and decode every sound now, once. Call it on the first gesture after sounds are on,
    never at page load. */
export async function primeSounds(): Promise<void> {
  try {
    if (typeof window === 'undefined' || typeof fetch !== 'function') return;
    const ctx = getContext();
    if (!ctx) return;
    await Promise.all(SOUND_NAMES.map((n) => loadBuffer(ctx, n)));
  } catch {
    // never break the page
  }
}

/** Preload on the first pointerdown or keydown. Returns the cleanup. */
export function armSoundPriming(): () => void {
  if (typeof window === 'undefined') return () => {};
  const off = () => {
    window.removeEventListener('pointerdown', go, true);
    window.removeEventListener('keydown', go, true);
  };
  const go = () => {
    off();
    if (soundEnabled()) void primeSounds();
  };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
  return off;
}

async function start(name: SoundName): Promise<void> {
  const ctx = getContext();
  if (!ctx || !master) return;
  if (ctx.state === 'suspended') await ctx.resume();
  const buffer = await loadBuffer(ctx, name);
  if (!buffer) return;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(master);
  source.start();
}

/** Play an interface sound, if sounds are on. Never throws. */
export function playSound(name: SoundName): void {
  try {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    if (!soundEnabled() || document.hidden) return;
    const now = Date.now();
    const last = lastPlayed.get(name);
    if (last !== undefined && now - last < THROTTLE_MS) return;
    lastPlayed.set(name, now);
    window.dispatchEvent(new CustomEvent('ui:sound', { detail: { name } }));
    start(name).catch(() => {});
  } catch {
    // never break the page
  }
}

/** Forget the context, the buffers and the throttle. For tests only. */
export function resetSoundEngine(): void {
  context = null;
  master = null;
  buffers.clear();
  lastPlayed.clear();
}
