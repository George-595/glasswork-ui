import { useSyncExternalStore } from 'react';
import { rememberedVerdict } from '../seaglass/perf';

/* lowPower — the kit's one "this device cannot afford the expensive effects" signal.

   Every costly effect (the animated glass backdrop, SVG refraction, the generate reveal, the
   sea glass loop, the sheet and dialog blurs) reads this one switch instead of guessing for
   itself, so a phone gets the cheap path from the first frame. It is true when any of these
   hold:

     - the primary pointer is coarse (a phone or a tablet);
     - navigator.deviceMemory <= 4, or navigator.hardwareConcurrency <= 6;
     - the reader asked for Save-Data;
     - prefers-reduced-motion, or prefers-reduced-transparency;
     - sea glass fell back to `still` or `flat` here within the last day (seaglass/perf.ts);
     - the page lagged on a recent load: three long animation frames over 100ms in the first
       5 seconds (startLagMonitor), remembered for a day, so a device that turns out to
       struggle is switched on its NEXT load (the page it lagged on keeps its look: a switch
       mid-session would only add another jolt).

   It sets <html data-power="low"> (AppRoot does) so CSS can follow it, and an app can force it
   either way: <AppRoot power="low">. The server, and hydration, see `false`.

   The device facts that cannot change in a session (memory, cores, Save-Data, what was
   remembered) are read once; the media queries are read live. */
export type PowerPreference = 'auto' | 'low' | 'normal';

const COARSE = '(pointer: coarse)';
const MOTION = '(prefers-reduced-motion: reduce)';
const TRANSPARENCY = '(prefers-reduced-transparency: reduce)';
const QUERIES = [COARSE, MOTION, TRANSPARENCY] as const;

export const LAG_KEY = 'ui:lowpower:lag';
/** Long animation frames over this (ms) count as a lag. */
export const LAG_FRAME_MS = 100;
/** How many of them, within LAG_WINDOW_MS of the page starting, mark the device as struggling. */
export const LAG_FRAMES = 3;
export const LAG_WINDOW_MS = 5000;
const REMEMBER_MS = 24 * 60 * 60 * 1000;

export interface PowerSignals {
  coarsePointer: boolean;
  lowMemory: boolean;
  fewCores: boolean;
  saveData: boolean;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  /** Sea glass fell back, or the page lagged, within the last day. */
  struggled: boolean;
}

let preference: PowerPreference = 'auto';
const listeners = new Set<() => void>();
const notify = () => {
  for (const fn of listeners) fn();
};

function query(media: string): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(media).matches;
  } catch {
    return false;
  }
}

function lagRemembered(now: number): boolean {
  try {
    const at = Number(globalThis.localStorage?.getItem(LAG_KEY));
    return Number.isFinite(at) && at > 0 && now - at < REMEMBER_MS;
  } catch {
    return false;
  }
}

/** What cannot change while the page is open, read on first use. */
let fixed: Pick<PowerSignals, 'lowMemory' | 'fewCores' | 'saveData' | 'struggled'> | null = null;
function readFixed() {
  if (fixed) return fixed;
  const nav = (typeof navigator === 'undefined' ? {} : navigator) as {
    deviceMemory?: number;
    hardwareConcurrency?: number;
    connection?: { saveData?: boolean };
  };
  const memory = nav.deviceMemory;
  const cores = nav.hardwareConcurrency;
  const now = Date.now();
  fixed = {
    lowMemory: typeof memory === 'number' && memory > 0 && memory <= 4,
    fewCores: typeof cores === 'number' && cores > 0 && cores <= 6,
    saveData: nav.connection?.saveData === true,
    struggled: rememberedVerdict(now) !== null || lagRemembered(now),
  };
  return fixed;
}

export function readPowerSignals(): PowerSignals {
  if (typeof window === 'undefined') {
    return {
      coarsePointer: false,
      lowMemory: false,
      fewCores: false,
      saveData: false,
      reducedMotion: false,
      reducedTransparency: false,
      struggled: false,
    };
  }
  return {
    ...readFixed(),
    coarsePointer: query(COARSE),
    reducedMotion: query(MOTION),
    reducedTransparency: query(TRANSPARENCY),
  };
}

/** Whether `signals` say the device is low power. */
export function judgePower(signals: PowerSignals): boolean {
  return (
    signals.coarsePointer ||
    signals.lowMemory ||
    signals.fewCores ||
    signals.saveData ||
    signals.reducedMotion ||
    signals.reducedTransparency
    // a remembered lag (signals.struggled) is reported, not obeyed: one slow load must never
    // strip effects from the next day's pages
  );
}

/** True when the expensive effects should take their cheap path. Not a hook: use it in event
    handlers, loops and plain modules (generate()); components call useLowPower(). */
export function isLowPower(): boolean {
  if (preference !== 'auto') return preference === 'low';
  return judgePower(readPowerSignals());
}

/** Whether the generate reveal is a plain fade for power reasons (reduced motion is checked by
    the reveal itself). The reveal is cheap enough to play on a phone: one scheduler, settled
    glyphs drawn once. So a coarse pointer, few cores or a remembered lag no longer stop it;
    only an app forcing `power="low"`, or Save-Data, does. */
export function revealIsPlain(): boolean {
  if (preference !== 'auto') return preference === 'low';
  return readFixed().saveData;
}

/** True when the device cannot afford the one thing the page is deciding about: a coarse
    pointer, for effects that only make sense under a mouse. */
export function hasCoarsePointer(): boolean {
  return typeof window !== 'undefined' && query(COARSE);
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const lists: MediaQueryList[] = [];
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    for (const q of QUERIES) {
      try {
        const list = window.matchMedia(q);
        list.addEventListener('change', onChange);
        lists.push(list);
      } catch {
        /* no such query here */
      }
    }
  }
  return () => {
    listeners.delete(onChange);
    for (const list of lists) list.removeEventListener('change', onChange);
  };
}

/** Subscribe to changes of isLowPower() (a forced preference, a media query). */
export const subscribeLowPower = subscribe;

export function useLowPower(): boolean {
  return useSyncExternalStore(subscribe, isLowPower, () => false);
}

/** Force the signal either way (AppRoot's `power` prop); 'auto' goes back to reading the device. */
export function setPowerPreference(next: PowerPreference): void {
  if (preference === next) return;
  preference = next;
  notify();
}

/** Mirror the signal on <html data-power>, for CSS. Returns the stop function. */
export function bindPowerAttribute(root: HTMLElement = document.documentElement): () => void {
  const apply = () => {
    if (isLowPower()) root.setAttribute('data-power', 'low');
    else root.removeAttribute('data-power');
  };
  apply();
  const off = subscribe(apply);
  return () => {
    off();
    root.removeAttribute('data-power');
  };
}

function rememberLag(now = Date.now()): void {
  try {
    globalThis.localStorage?.setItem(LAG_KEY, String(now));
  } catch {
    /* blocked storage: the monitor simply runs again next load */
  }
}

/** Count the page's long animation frames for its first LAG_WINDOW_MS; on LAG_FRAMES of them
    over LAG_FRAME_MS, remember the lag for a day. The verdict is read on the next load. */
let monitoring = false;
let quietUntil = 0;
/** Frames before `until` (performance.now() time) belong to an effect the page chose to play
    (the generate reveal's build), so they never count as the device struggling. */
export function quietLagMonitor(until: number): void {
  if (until > quietUntil) quietUntil = until;
}
export function startLagMonitor(): void {
  if (monitoring || typeof PerformanceObserver === 'undefined') return;
  const supported = (PerformanceObserver as { supportedEntryTypes?: readonly string[] })
    .supportedEntryTypes;
  if (!supported?.includes('long-animation-frame')) return;
  monitoring = true;
  let slow = 0;
  let observer: PerformanceObserver | null = null;
  const stop = () => observer?.disconnect();
  try {
    observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration > LAG_FRAME_MS && !(entry.startTime < quietUntil)) slow++;
      }
      if (slow >= LAG_FRAMES) {
        rememberLag();
        stop();
      }
    });
    observer.observe({ type: 'long-animation-frame', buffered: false });
    setTimeout(stop, LAG_WINDOW_MS);
  } catch {
    monitoring = false;
  }
}

/** Test seam: forget what was read once, the preference, and the monitor. */
export function resetLowPower(): void {
  fixed = null;
  preference = 'auto';
  monitoring = false;
  quietUntil = 0;
  notify();
}
