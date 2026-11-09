import { type RefObject, useEffect, useLayoutEffect, useRef } from 'react';
import type { GenerateOptions, GenerateRun } from './reveal';

/* The drawing code (reveal.ts and the ascii plotter behind it) is about 16 kB gzip and is not needed
   to show a screen, only to play the reveal over it, so it is its own file: fetched as soon as a
   screen that may play one is up (the first useGenerate to mount), in step with the data it will
   draw, and never in the way of the first paint or of hydration. If it cannot be fetched the
   content is simply shown as it is. */
let engine: Promise<typeof import('./reveal')> | undefined;
function loadEngine(): Promise<typeof import('./reveal')> {
  engine ??= import('./reveal').catch((error: unknown) => {
    engine = undefined; // not kept: the next screen tries again
    throw error;
  });
  return engine;
}

/* useGenerate — plays generate() over an element the moment its content arrives.

   `ready` is "the real content is rendered": the generation plays when it turns true after
   being false during this mount (data arrived after a loading state), never for content that
   was there from the first render (a cached result is not a loading moment). `onMount`
   plays it once on mount instead, for UI that is itself the result (an AI reply's card).

   Several elements that start together are staggered (about 180ms apart) so a dashboard
   builds piece by piece. It plays only for an element that is in view when its content
   lands: one below the fold is shown as it is, and never plays later as it scrolls in (a
   reveal built during a scroll is what janks one). Every one plays, on every device, sharing one scheduler
   (reveal.ts); only reduced motion, Save-Data or `power="low"` gets a plain fade
   (effects/lowPower.ts). `each` plays it on every child of the element instead of the element itself (a row
   of tiles). Unmounting, a new loading state or a `ui:generate-skip` event on window shows
   the element as it is at once. A zero-size element (not laid out yet, or a test DOM) is
   shown as it is: there is nothing to draw. */
export interface UseGenerateOptions extends Omit<GenerateOptions, 'onDone'> {
  /** Play once on mount, whatever `ready` was. Default false. */
  onMount?: boolean;
  /** Play only if the element is in view when its content lands; off-screen it is shown as it
      is, with no reveal later. False plays wherever it is. Default true. */
  inView?: boolean;
  /** Play on each element child instead of the element itself. Default false. */
  each?: boolean;
}

const STAGGER = 180;
const EACH_STAGGER = 260;
let lastStart = 0;
let slot = 0;
/** A delay that staggers this start after others requested in the same moment. */
function staggered() {
  const now = performance.now();
  slot = now - lastStart < 120 ? slot + 1 : 0;
  lastStart = now;
  return Math.min(slot, 8) * STAGGER;
}

/** A fraction of the target (or of the screen, for a target taller than the screen) that has to
    be showing before the drawing starts: enough to be worth watching, not a sliver. */
const SHOWING = 0.2;
/** One threshold per percent, so the observer calls back as the visible part grows through the
    bar below. A tall target's visible part is a few percent of it, and a callback only comes
    when a threshold is crossed. */
const THRESHOLDS = Array.from({ length: 101 }, (_, i) => i / 100);

/** Is enough of the target on screen? 20% of it, but never more than 20% of the screen:
    a feed five screens tall can never be 20% visible, and waiting for that left it hidden
    (opacity 0) on a phone. */
export function enoughShowing(entry: IntersectionObserverEntry): boolean {
  if (!entry.isIntersecting) return false;
  if (!entry.boundingClientRect || !entry.intersectionRect) return true;
  const screen = entry.rootBounds?.height || window.innerHeight || Infinity;
  const target = entry.boundingClientRect.height;
  const bar = SHOWING * Math.min(target || Infinity, screen);
  return entry.intersectionRect.height >= bar - 0.5;
}

const sized = (el: HTMLElement) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
};

export function useGenerate<T extends HTMLElement>(
  ref: RefObject<T | null>,
  ready: boolean,
  options: UseGenerateOptions = {},
) {
  const { onMount = false, inView = true, each = false, ...gen } = options;
  useEffect(() => {
    loadEngine().catch(() => undefined);
  }, []);
  const armed = useRef(onMount);
  const opts = useRef(gen);
  useLayoutEffect(() => {
    opts.current = gen;
    if (!ready) armed.current = true; // a loading state: the next ready plays
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!ready || !armed.current || !el) return;
    armed.current = false;
    const targets = each ? [...el.children].filter((c) => c instanceof HTMLElement) : [el];
    if (!targets.length || !sized(el)) return;

    // hidden from the first frame, so the real content never flashes before its drawing
    // ...and out of reach: a hidden button must not take focus or a tap (WCAG 2.4.7)
    const held = targets.map((t) => [t, t.style.opacity, t.hasAttribute('inert')] as const);
    for (const t of targets) {
      t.style.opacity = '0';
      t.setAttribute('inert', '');
    }
    el.setAttribute('data-generate-pending', '');
    const release = () => {
      for (const [t, o, inert] of held) {
        if (t.hasAttribute('data-generating')) continue;
        t.style.opacity = o;
        if (!inert) t.removeAttribute('inert');
      }
      el.removeAttribute('data-generate-pending');
    };

    const runs: GenerateRun[] = [];
    let settled = false;
    let frame = 0;
    let io: IntersectionObserver | null = null;
    let done = false;
    let cancelled = false;
    const start = () => {
      if (done) return;
      done = true;
      io?.disconnect();
      // the drawing code first (it is on its way since the screen mounted), then two frames: a
      // chart sizes itself to its box in the frame after it mounts
      loadEngine().then(
        ({ generate }) => {
          if (cancelled) return;
          frame = requestAnimationFrame(() => {
            frame = requestAnimationFrame(() => {
              release();
              const base = staggered() + (opts.current.delay ?? 0);
              targets.forEach((t, i) => {
                if (!t.isConnected || !sized(t)) return;
                runs.push(
                  generate(t, { ...opts.current, delay: base + (each ? i * EACH_STAGGER : 0) }),
                );
              });
              void Promise.all(runs.map((r) => r.finished)).then(() => {
                settled = true;
              });
            });
          });
        },
        () => {
          // the drawing code could not be fetched: show the content as it is
          if (cancelled) return;
          settled = true;
          release();
        },
      );
    };
    const skip = () => {
      done = true;
      cancelled = true;
      io?.disconnect();
      cancelAnimationFrame(frame);
      release();
    };
    window.addEventListener('ui:generate-skip', skip);
    if (inView && typeof IntersectionObserver === 'function') {
      // the first report decides whether it is on screen at all: below the fold, show it as it
      // is (no hidden content, no drawing nobody watches); a sliver in view waits for enough
      let first = true;
      io = new IntersectionObserver(
        (entries) => {
          if (done) return;
          const was = first;
          first = false;
          if (entries.some(enoughShowing)) start();
          else if (was && !entries.some((e) => e.isIntersecting)) {
            settled = true;
            skip();
          }
        },
        { threshold: THRESHOLDS },
      );
      io.observe(el);
    } else start();

    return () => {
      // cut short before it played out (React's dev double mount, a quick re-render): try again
      if (!settled) armed.current = true;
      window.removeEventListener('ui:generate-skip', skip);
      skip();
      for (const r of runs) r.cancel();
    };
  }, [ready, each, inView, ref]);
}
