/* The lag fallback (George, Oct 2026: "if people's pcs start to lag because of it, 5s after page
   load kill it and make it static").

   For its first PROBE_MS a live stage draws every frame and times them. The first WARMUP_MS
   are ignored (the shader compiles and the app itself is busiest at load); the rest decide:

     live   frames come fast enough: keep animating (and keep watching, below);
     still  the device struggles: stop the loop and leave one drawn frame, redrawn only when
            the layout changes (no hover, no light, no pulse);
     flat   it is far too slow, or barely drew at all: release the GPU entirely and let every
            piece paint its flat role fill.

   After the probe a live stage keeps a rolling window of the frames it draws, and drops to
   `still` if that window turns slow, so a device that heats up later still gets the fallback.
   A verdict other than live is remembered for a day (per browser), so the next page load does
   not lag for five seconds first. */
export type SeaGlassVerdict = 'live' | 'still' | 'flat';

export const PROBE_MS = 5000;
export const WARMUP_MS = 1500;
/** Median frame time above this (ms) is lag: under 25 fps. */
export const STILL_MEDIAN = 40;
/** Or one frame in ten taking this long (ms) is visible stutter. */
export const STILL_P90 = 70;
/** Median above this (ms), or fewer than MIN_FRAMES frames in the window, is hopeless. */
export const FLAT_MEDIAN = 120;
export const MIN_FRAMES = 8;
/** Frames in the watchdog's rolling window. */
export const WATCH_FRAMES = 90;

function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.POSITIVE_INFINITY;
  const at = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[at] ?? Number.POSITIVE_INFINITY;
}

/** Judge a set of frame intervals (ms). */
export function judgeFrames(intervals: readonly number[]): SeaGlassVerdict {
  if (intervals.length < MIN_FRAMES) return 'flat';
  const sorted = [...intervals].sort((a, b) => a - b);
  const median = quantile(sorted, 0.5);
  if (median > FLAT_MEDIAN) return 'flat';
  if (median > STILL_MEDIAN || quantile(sorted, 0.9) > STILL_P90) return 'still';
  return 'live';
}

/** Collects frame intervals for the probe, then watches a rolling window. */
export class LagMonitor {
  private probe: number[] = [];
  private window: number[] = [];
  private decided = false;
  private readonly startedAt: number;

  constructor(startedAt: number) {
    this.startedAt = startedAt;
  }

  /** The probe is still running: draw every frame. */
  probing(now: number): boolean {
    return !this.decided && now - this.startedAt < PROBE_MS;
  }

  /** Record one drawn frame that took `interval` ms. Returns a verdict when one is due. */
  frame(now: number, interval: number): SeaGlassVerdict | null {
    const age = now - this.startedAt;
    if (!this.decided) {
      if (age >= WARMUP_MS) this.probe.push(interval);
      if (age < PROBE_MS) return null;
      this.decided = true;
      return judgeFrames(this.probe);
    }
    this.window.push(interval);
    if (this.window.length > WATCH_FRAMES) this.window.shift();
    if (this.window.length < WATCH_FRAMES) return null;
    const verdict = judgeFrames(this.window);
    return verdict === 'live' ? null : 'still';
  }

  /** The probe window has passed without enough drawn frames to judge. */
  overdue(now: number): SeaGlassVerdict | null {
    if (this.decided || now - this.startedAt < PROBE_MS) return null;
    this.decided = true;
    return judgeFrames(this.probe);
  }

  /** Forget the window (the tab was hidden: the gap is not lag). */
  pause(): void {
    this.window = [];
  }
}

const STORE_KEY = 'ui:seaglass:verdict';
const REMEMBER_MS = 24 * 60 * 60 * 1000;

/** A fallback this browser fell to within the last day, if any. */
export function rememberedVerdict(now = Date.now()): Exclude<SeaGlassVerdict, 'live'> | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { verdict?: unknown; at?: unknown };
    if (typeof saved.at !== 'number' || now - saved.at > REMEMBER_MS) return null;
    return saved.verdict === 'still' || saved.verdict === 'flat' ? saved.verdict : null;
  } catch {
    return null;
  }
}

export function rememberVerdict(verdict: Exclude<SeaGlassVerdict, 'live'>, now = Date.now()): void {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify({ verdict, at: now }));
  } catch {
    /* private mode or blocked storage: the probe simply runs again next time */
  }
}

export function forgetVerdict(): void {
  try {
    globalThis.localStorage?.removeItem(STORE_KEY);
  } catch {
    /* nothing to forget */
  }
}
