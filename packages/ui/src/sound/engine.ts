import {
  ATTENTION_SOUNDS,
  isAttentionSound,
  type PlayableSound,
  SOUND_NAMES,
  SOUND_URLS,
} from './sounds';
import { attentionSoundEnabled, soundEnabled, soundVolume } from './store';

/* The sound engine: one AudioContext and one master gain, every buffer fetched and decoded once.

   `playSound(name)` is safe to call from anywhere: it does nothing on the server, with sounds
   off, in a hidden tab or where there is no AudioContext, plays the same sound at most once per
   60 ms, and swallows every error, because a sound must never break the page. Call it only in
   answer to something a person did (ENGINEERING: interface sounds).

   Whenever a sound would play (sounds on, tab visible) a `ui:sound` event with `{ name }` is
   dispatched on `window` first, so a test or an e2e run can see sounds without any audio.

   Two attention sounds (`chime`, `alarm`) are not interface sounds: they follow the device's own
   attention-sounds switch (off by default) and not the interface-sounds one, so a device that has
   not asked for them never plays one. Every sound is scaled by the device's level (`soundVolume`)
   and by an optional `volume` of its own. `repeatSound` plays one again and again until stopped,
   and `soundArmed()` says whether a gesture has unlocked audio on this page yet (autoplay). */
const THROTTLE_MS = 60;
const MASTER_GAIN = 1;

type ContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
let master: GainNode | null = null;
let armed = false;
const armListeners = new Set<() => void>();
const buffers = new Map<PlayableSound, Promise<AudioBuffer | null>>();
const lastPlayed = new Map<PlayableSound, number>();

/** May this sound play on this device right now? The switch that governs it, and a visible tab. */
function allowed(name: PlayableSound): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false;
  if (document.hidden) return false;
  return isAttentionSound(name) ? attentionSoundEnabled() : soundEnabled();
}

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

function loadBuffer(ctx: AudioContext, name: PlayableSound): Promise<AudioBuffer | null> {
  const cached = buffers.get(name);
  if (cached) return cached;
  // a sound with no file (an attention sound not rendered yet) is silent: never fetch the page in its place
  if (!SOUND_URLS[name]) {
    const none = Promise.resolve(null);
    buffers.set(name, none);
    return none;
  }
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
    if (ctx.state === 'running') setArmed();
    const names: readonly PlayableSound[] = attentionSoundEnabled()
      ? [...SOUND_NAMES, ...ATTENTION_SOUNDS]
      : SOUND_NAMES;
    await Promise.all(names.map((n) => loadBuffer(ctx, n)));
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
    if (soundEnabled() || attentionSoundEnabled()) void primeSounds();
  };
  window.addEventListener('pointerdown', go, true);
  window.addEventListener('keydown', go, true);
  return off;
}

async function start(name: PlayableSound, volume: number): Promise<void> {
  const ctx = getContext();
  if (!ctx || !master) return;
  if (ctx.state === 'suspended') await ctx.resume();
  if (ctx.state === 'running') setArmed();
  const buffer = await loadBuffer(ctx, name);
  if (!buffer) return;
  master.gain.value = MASTER_GAIN * soundVolume();
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  if (volume < 1) {
    const level = ctx.createGain();
    level.gain.value = volume;
    source.connect(level);
    level.connect(master);
  } else source.connect(master);
  source.start();
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Play a sound, if its switch is on: an interface sound with Sounds on, an attention sound with this device's
    attention sounds on. `volume` (0 to 1, default 1) is on top of the device's level. Never throws. */
export function playSound(name: PlayableSound, options: { volume?: number } = {}): void {
  try {
    if (!allowed(name)) return;
    const now = Date.now();
    const last = lastPlayed.get(name);
    if (last !== undefined && now - last < THROTTLE_MS) return;
    lastPlayed.set(name, now);
    window.dispatchEvent(new CustomEvent('ui:sound', { detail: { name } }));
    start(name, clamp01(options.volume ?? 1)).catch(() => {});
  } catch {
    // never break the page
  }
}

export interface RepeatOptions {
  /** The gap between plays. */
  everyMs: number;
  /** After this long, play every `slowEveryMs` instead (the alarm: every 4 s, then every 30 s after 3 minutes). */
  slowAfterMs?: number;
  slowEveryMs?: number;
  volume?: number;
  /** The clock the gaps run on (default the global timers): an app passes its own so a test or a fake clock moves them. */
  timers?: {
    setTimeout(fn: () => void, ms: number): unknown;
    clearTimeout(id: never): void;
  };
}

/** Play a sound now and again and again until the returned `stop()` is called. Time is counted by the gaps
    themselves, so it follows whatever clock the timers follow. A play that is not allowed (the switch is off, the tab
    is hidden) is skipped and the next one is still scheduled, so it resumes by itself. Never throws. */
export function repeatSound(name: PlayableSound, options: RepeatOptions): () => void {
  let stopped = false;
  let elapsed = 0;
  const clock = options.timers ?? {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: never) => clearTimeout(id),
  };
  let timer: unknown;
  const gap = () =>
    options.slowAfterMs !== undefined &&
    options.slowEveryMs !== undefined &&
    elapsed >= options.slowAfterMs
      ? options.slowEveryMs
      : options.everyMs;
  const tick = () => {
    if (stopped) return;
    playSound(name, options.volume === undefined ? {} : { volume: options.volume });
    const wait = gap();
    elapsed += wait;
    timer = clock.setTimeout(tick, wait);
  };
  tick();
  return () => {
    stopped = true;
    clock.clearTimeout(timer as never);
  };
}

/* ---- autoplay: is audio unlocked on this page yet? ---- */

/** True once a gesture has unlocked audio on this page (the context is running). A wall tablet is armed by one
    tap after every load. It is false on the server and before any tap. */
export function soundArmed(): boolean {
  return armed;
}

export function subscribeSoundArmed(listener: () => void): () => void {
  armListeners.add(listener);
  const off = watchGestures();
  return () => {
    armListeners.delete(listener);
    if (armListeners.size === 0) off();
  };
}

function setArmed(): void {
  if (armed) return;
  armed = true;
  for (const l of armListeners) l();
}

/** Listen for the events a browser counts as a user activation (`pointerup`, `click`, `keydown`; never `pointerdown`,
    which on touch is not one) and, on the first, resume the context. It is armed when the context runs. */
function watchGestures(): () => void {
  if (typeof window === 'undefined' || armed) return () => {};
  const events = ['pointerup', 'click', 'keydown'] as const;
  const off = () => {
    for (const e of events) window.removeEventListener(e, go, true);
  };
  function go() {
    try {
      const ctx = getContext();
      if (!ctx) return;
      const done = () => {
        if (ctx.state === 'running') {
          setArmed();
          off();
        }
      };
      if (ctx.state === 'running') done();
      else ctx.resume().then(done, () => {});
    } catch {
      // never break the page
    }
  }
  for (const e of events) window.addEventListener(e, go, true);
  return off;
}

/** Forget the context, the buffers and the throttle. For tests only. */
export function resetSoundEngine(): void {
  context = null;
  master = null;
  armed = false;
  buffers.clear();
  lastPlayed.clear();
}
