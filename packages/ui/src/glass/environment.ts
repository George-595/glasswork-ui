import { useSyncExternalStore } from 'react';
import { isLowPower, subscribeLowPower } from '../effects/lowPower';

/* Which glass a surface can draw, read from the page:

   plain   - not the glass skin (enterprise): no filter at all;
   solid   - glass skin, but prefers-reduced-transparency or forced-colors:
             no filter, glass.css maps the surfaces to solid tokens;
   blur    - glass skin, but no SVG filters in backdrop-filter (WebKit and
             Gecko accept the syntax and draw nothing): glass.css's CSS blur;
   refract - glass skin on Chromium, with a fine pointer, on a device that is not low power
             (effects/lowPower.ts) and a screen of at most 2x: the Liquid Glass SVG filter.
             A phone gets `blur` instead, which is a plain translucent fill on content.

   The server, and hydration, always see `plain`; nothing here reads window
   during render on the server. */

export type GlassMode = 'plain' | 'solid' | 'blur' | 'refract';
export interface GlassEnvironment {
  mode: GlassMode;
  appearance: 'light' | 'dark';
}

/** Port of upstream's src/dom/engine.ts: Chromium draws SVG filters on the
    GPU; iOS browsers report other brands but are WebKit underneath. */
export function isWebKit(agent: Pick<Navigator, 'vendor' | 'userAgent'>): boolean {
  return (
    agent.vendor === 'Apple Computer, Inc.' ||
    (/AppleWebKit\//.test(agent.userAgent) &&
      !/(?:Chrome|Chromium|Edg|OPR|SamsungBrowser)\//.test(agent.userAgent))
  );
}
export function isGecko(agent: Pick<Navigator, 'userAgent'>): boolean {
  return /Gecko\//.test(agent.userAgent) && !/like Gecko/.test(agent.userAgent);
}

/** True where `backdrop-filter: url(#filter)` actually renders: Chromium. */
export function supportsSvgBackdrop(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (isWebKit(navigator) || isGecko(navigator)) return false;
  if (typeof ResizeObserver === 'undefined') return false;
  const css = (globalThis as { CSS?: { supports?: (p: string, v: string) => boolean } }).CSS;
  try {
    return css?.supports?.('backdrop-filter', 'url(#a)') === true;
  } catch {
    return false;
  }
}

function query(media: string): boolean {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(media).matches;
  } catch {
    return false;
  }
}

const SERVER = 'plain|dark';

/** Refraction is for a fine pointer on a machine that can afford it: not a phone, not a
    low-power device, not a very dense screen. Everything else gets the blur material, which
    glass.css leaves as a plain translucent fill on content. */
function canRefract(): boolean {
  if (!supportsSvgBackdrop() || isLowPower()) return false;
  const ratio = typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1;
  return ratio <= 2;
}

function compute(): string {
  if (typeof document === 'undefined') return SERVER;
  const root = document.documentElement;
  const theme = root.getAttribute('data-theme');
  const dark = theme === 'dark' || (theme !== 'light' && !query('(prefers-color-scheme: light)'));
  const appearance = dark ? 'dark' : 'light';
  if (root.getAttribute('data-skin') !== 'glass') return `plain|${appearance}`;
  if (query('(prefers-reduced-transparency: reduce)') || query('(forced-colors: active)')) {
    return `solid|${appearance}`;
  }
  return `${canRefract() ? 'refract' : 'blur'}|${appearance}`;
}

const MEDIA = [
  '(prefers-color-scheme: light)',
  '(prefers-reduced-transparency: reduce)',
  '(forced-colors: active)',
];

/* ONE subscription for the whole page. Every glass surface used to attach its own
   MutationObserver and three matchMedia listeners (a dozen cards, forty cells): now the first
   subscriber attaches them once, the last detaches them, and the answer is cached between
   changes. Unsubscribed (a first render, a test), it is computed fresh each time. */
const listeners = new Set<() => void>();
let cached: string | null = null;
let detach: (() => void) | null = null;

function changed() {
  cached = null;
  for (const fn of listeners) fn();
}

function attach(): () => void {
  const observer = new MutationObserver(changed);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-skin', 'data-theme'],
  });
  const lists: MediaQueryList[] = [];
  if (typeof window.matchMedia === 'function') {
    for (const media of MEDIA) {
      const list = window.matchMedia(media);
      list.addEventListener('change', changed);
      lists.push(list);
    }
  }
  const offPower = subscribeLowPower(changed);
  return () => {
    observer.disconnect();
    for (const list of lists) list.removeEventListener('change', changed);
    offPower();
  };
}

function subscribe(onChange: () => void): () => void {
  if (typeof document === 'undefined') return () => {};
  listeners.add(onChange);
  if (!detach) {
    cached = null;
    detach = attach();
  }
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && detach) {
      detach();
      detach = null;
      cached = null;
    }
  };
}

function snapshot(): string {
  if (!detach) return compute();
  cached ??= compute();
  return cached;
}

function parse(value: string): GlassEnvironment {
  const [mode, appearance] = value.split('|');
  return {
    mode: mode === 'solid' || mode === 'blur' || mode === 'refract' ? mode : 'plain',
    appearance: appearance === 'light' ? 'light' : 'dark',
  };
}

/** The glass this page can draw now; re-renders when the skin, the theme or
    a relevant media query changes. */
export function useGlassEnvironment(): GlassEnvironment {
  return parse(useSyncExternalStore(subscribe, snapshot, () => SERVER));
}
