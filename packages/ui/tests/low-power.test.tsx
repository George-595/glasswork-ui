// @vitest-environment jsdom
/* The low-power signal (effects/lowPower.ts) and what reads it: AppRoot's data-power, the glass
   environment (a phone never refracts), the animated background (one frame, no loop), the
   generate reveal (a fade), the sea glass stage (still, no lag probe). The engine's own loop is
   in perf-loops.test.ts. */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  isLowPower,
  judgePower,
  LAG_KEY,
  type PowerSignals,
  readPowerSignals,
  resetLowPower,
  setPowerPreference,
  startLagMonitor,
} from '../src/effects/lowPower';
import { resetWebGlGuard } from '../src/effects/webglGuard';
import { clearMaterialMaps } from '../src/glass';
import { LiquidGlass } from '../src/glass/LiquidGlass';
import { AnimatedBackground, AppRoot, generate } from '../src/index';
import { forgetVerdict, rememberVerdict } from '../src/seaglass/perf';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

let media: Record<string, boolean>;
let host: HTMLDivElement;
let root: Root;

function stubBrowser(nav: Record<string, unknown> = {}) {
  vi.stubGlobal('navigator', {
    userAgent: CHROME_UA,
    vendor: 'Google Inc.',
    hardwareConcurrency: 8,
    ...nav,
  });
  vi.stubGlobal('CSS', { supports: () => true, escape: (s: string) => s });
  vi.stubGlobal(
    'matchMedia',
    (query: string) =>
      ({
        matches: Object.entries(media).some(([k, v]) => v && query.includes(k)),
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
  class Observer {
    private readonly cb: ResizeObserverCallback;
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb;
    }
    observe(target: Element) {
      this.cb(
        [
          {
            target,
            contentRect: { width: 200, height: 100 },
            borderBoxSize: [{ inlineSize: 200, blockSize: 100 }],
          } as unknown as ResizeObserverEntry,
        ],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', Observer);
}

beforeEach(() => {
  media = {};
  resetLowPower();
  resetWebGlGuard();
  clearMaterialMaps();
  forgetVerdict();
  localStorage.clear();
  stubBrowser();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-skin');
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-power');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
  resetLowPower();
});

const calm: PowerSignals = {
  coarsePointer: false,
  lowMemory: false,
  fewCores: false,
  saveData: false,
  reducedMotion: false,
  reducedTransparency: false,
  struggled: false,
};

describe('the low-power signal', () => {
  it('is off on a capable desktop and on for each signal alone', () => {
    expect(judgePower(calm)).toBe(false);
    for (const key of Object.keys(calm) as (keyof PowerSignals)[]) {
      // a remembered lag is reported but never obeyed: it must not strip the next day's effects
      expect(judgePower({ ...calm, [key]: true })).toBe(key !== 'struggled');
    }
  });

  it('reads a coarse pointer, few cores, little memory and Save-Data from the device', () => {
    expect(isLowPower()).toBe(false);
    media = { 'pointer: coarse': true };
    expect(readPowerSignals().coarsePointer).toBe(true);
    expect(isLowPower()).toBe(true);
    media = {};
    resetLowPower();
    stubBrowser({ hardwareConcurrency: 6 });
    expect(isLowPower()).toBe(true);
    resetLowPower();
    stubBrowser({ deviceMemory: 4 });
    expect(isLowPower()).toBe(true);
    resetLowPower();
    stubBrowser({ deviceMemory: 8, hardwareConcurrency: 10 });
    expect(isLowPower()).toBe(false);
    resetLowPower();
    stubBrowser({ connection: { saveData: true } });
    expect(isLowPower()).toBe(true);
  });

  it('counts reduced motion and reduced transparency', () => {
    media = { 'reduced-motion': true };
    expect(isLowPower()).toBe(true);
    media = { 'reduced-transparency': true };
    expect(isLowPower()).toBe(true);
  });

  it('does not turn a remembered sea glass fallback or page lag into low power', () => {
    rememberVerdict('still');
    resetLowPower();
    expect(isLowPower()).toBe(false);
    forgetVerdict();
    resetLowPower();
    expect(isLowPower()).toBe(false);
    localStorage.setItem(LAG_KEY, String(Date.now()));
    resetLowPower();
    expect(isLowPower()).toBe(false);
    localStorage.setItem(LAG_KEY, String(Date.now() - 25 * 60 * 60 * 1000));
    resetLowPower();
    expect(isLowPower()).toBe(false);
  });

  it('can be forced either way', () => {
    setPowerPreference('low');
    expect(isLowPower()).toBe(true);
    media = { 'pointer: coarse': true };
    setPowerPreference('normal');
    expect(isLowPower()).toBe(false);
    setPowerPreference('auto');
    expect(isLowPower()).toBe(true);
  });

  it('remembers a lag after three long animation frames over 100ms', () => {
    const observers: { cb: (l: { getEntries: () => { duration: number }[] }) => void }[] = [];
    class FakeObserver {
      static supportedEntryTypes = ['long-animation-frame'];
      constructor(cb: (l: { getEntries: () => { duration: number }[] }) => void) {
        observers.push({ cb });
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('PerformanceObserver', FakeObserver);
    startLagMonitor();
    const frames = (...d: number[]) => ({ getEntries: () => d.map((duration) => ({ duration })) });
    observers[0]?.cb(frames(90, 120, 130));
    expect(localStorage.getItem(LAG_KEY)).toBeNull();
    observers[0]?.cb(frames(101));
    expect(localStorage.getItem(LAG_KEY)).not.toBeNull();
    // the lag is remembered, but it never takes effects away
    expect(isLowPower()).toBe(false);
  });
});

describe('AppRoot', () => {
  it('mirrors the signal on <html data-power> and lets an app force it', () => {
    act(() => root.render(<AppRoot />));
    expect(document.documentElement.hasAttribute('data-power')).toBe(false);
    act(() => root.render(<AppRoot power="low" />));
    expect(document.documentElement.getAttribute('data-power')).toBe('low');
    act(() => root.render(<AppRoot power="normal" />));
    expect(document.documentElement.hasAttribute('data-power')).toBe(false);
    act(() => root.render(null));
    expect(document.documentElement.hasAttribute('data-power')).toBe(false);
  });
});

async function renderGlass(): Promise<HTMLElement> {
  await act(async () => {
    root.render(
      <LiquidGlass className="ui-card">
        <p>Text</p>
      </LiquidGlass>,
    );
  });
  for (let i = 0; i < 30 && host.querySelector('[data-lg="blur"]'); i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
  return host.firstElementChild as HTMLElement;
}

describe('glass refraction is for a fine pointer on a capable device', () => {
  beforeEach(() => document.documentElement.setAttribute('data-skin', 'glass'));

  it('refracts on a desktop', async () => {
    expect((await renderGlass()).getAttribute('data-lg')).toBe('refract');
  });

  it.each([
    ['a phone (coarse pointer)', () => (media = { 'pointer: coarse': true })],
    ['reduced motion', () => (media = { 'reduced-motion': true })],
    ['a forced low-power path', () => setPowerPreference('low')],
  ])('draws the blur material on %s, with no SVG filter and no maps', async (_name, arrange) => {
    arrange();
    const glass = await renderGlass();
    expect(glass.getAttribute('data-lg')).toBe('blur');
    expect(glass.style.backdropFilter).toBe('');
    expect(glass.querySelector('filter, .ui-lg-layer')).toBeNull();
  });

  it('draws the blur material on a very dense screen', async () => {
    vi.stubGlobal('devicePixelRatio', 3);
    expect((await renderGlass()).getAttribute('data-lg')).toBe('blur');
  });

  it('does not refract a surface that has lens off, even on a desktop', async () => {
    await act(async () => {
      root.render(
        <LiquidGlass className="ui-card" lens={false}>
          <p>Text</p>
        </LiquidGlass>,
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    const glass = host.firstElementChild as HTMLElement;
    expect(glass.getAttribute('data-lg')).toBe('blur');
    expect(glass.querySelector('filter')).toBeNull();
  });
});

/* a scene that counts what is drawn */
const scene = vi.hoisted(() => ({ mounts: 0, frames: 0 }));
vi.mock('../src/effects/backgrounds/tide', () => ({
  mount: (container: HTMLElement) => {
    scene.mounts += 1;
    const canvas = document.createElement('canvas');
    container.append(canvas);
    return {
      render: () => {
        scene.frames += 1;
      },
      resize: () => {},
      setColors: () => {},
      destroy: () => canvas.remove(),
    };
  },
}));
vi.mock('../src/effects/cssColor', async (importActual) => {
  const actual = await importActual<typeof import('../src/effects/cssColor')>();
  return {
    ...actual,
    resolveCssColor: () => [0.2, 0.3, 0.4] as const,
    resolveCssColors: (values: readonly string[]) => values.map(() => [0.2, 0.3, 0.4] as const),
  };
});

const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

describe('AnimatedBackground draws on demand', () => {
  beforeEach(() => {
    scene.mounts = 0;
    scene.frames = 0;
  });

  it('on a low-power device draws one frame and never runs a loop', async () => {
    media = { 'pointer: coarse': true };
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    await act(async () => {
      root.render(<AnimatedBackground />);
    });
    await wait(150);
    expect(scene.mounts).toBe(1);
    expect(scene.frames).toBe(1);
    expect(host.querySelector('.ui-fx-bg')?.hasAttribute('data-live')).toBe(true);
    // nothing is asking for frames any more: a second of idle adds none
    raf.mockClear();
    await wait(300);
    expect(raf).not.toHaveBeenCalled();
    expect(scene.frames).toBe(1);
  });

  it('on a capable device animates, but never faster than 30 frames a second', async () => {
    await act(async () => {
      root.render(<AnimatedBackground />);
    });
    await wait(150);
    const start = scene.frames;
    await wait(1000);
    const perSecond = scene.frames - start;
    expect(perSecond).toBeGreaterThan(5);
    expect(perSecond).toBeLessThanOrEqual(32);
  });

  it('holds the animation while the page scrolls and resumes after it settles', async () => {
    await act(async () => {
      root.render(<AnimatedBackground />);
    });
    await wait(150);
    act(() => {
      document.dispatchEvent(new Event('scroll'));
    });
    await wait(40);
    const held = scene.frames;
    await wait(100);
    expect(scene.frames).toBe(held);
    await wait(400);
    expect(scene.frames).toBeGreaterThan(held);
  });

  it('under reduced transparency starts no scene and shows the plain page colour', async () => {
    media = { 'reduced-transparency': true };
    await act(async () => {
      root.render(<AnimatedBackground />);
    });
    await wait(100);
    expect(scene.mounts).toBe(0);
    expect(host.querySelector('.ui-fx-bg')?.getAttribute('data-view')).toBe('solid');
  });
});

/** A 2D context that draws nothing. */
function stubCanvas() {
  const ctx = new Proxy(
    { createLinearGradient: () => ({ addColorStop() {} }) } as Record<string, unknown>,
    { get: (o, k) => (k in o ? o[k as string] : () => {}), set: () => true },
  );
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () => ctx as unknown as CanvasRenderingContext2D,
  );
}

describe('the generate reveal on a low-power device', () => {
  const box = () => {
    const el = document.createElement('div');
    el.textContent = 'Revenue';
    el.style.opacity = '0.9';
    Object.defineProperty(el, 'getBoundingClientRect', {
      value: () => ({ width: 200, height: 100, top: 0, left: 0, right: 200, bottom: 100 }),
    });
    document.body.append(el);
    return el;
  };

  it('is a plain fade under reduced motion: no overlay is built, the element is restored', async () => {
    vi.useFakeTimers();
    media = { 'prefers-reduced-motion': true };
    const el = box();
    const run = generate(el, { render: 'ascii' });
    expect(el.style.opacity).toBe('0');
    expect(el.querySelector('canvas, svg')).toBeNull();
    await vi.advanceTimersByTimeAsync(500);
    await run.finished;
    expect(el.style.opacity).toBe('0.9');
    expect(document.querySelector('.ui-gen')).toBeNull();
    el.remove();
  });

  it('is a plain fade when the app forces power="low"', async () => {
    vi.useFakeTimers();
    setPowerPreference('low');
    const el = box();
    const run = generate(el);
    await vi.advanceTimersByTimeAsync(500);
    await run.finished;
    expect(document.querySelector('.ui-gen')).toBeNull();
    el.remove();
  });

  it('a phone (coarse pointer, few cores) still draws the full reveal', async () => {
    vi.useFakeTimers();
    media = { 'pointer: coarse': true };
    stubCanvas();
    const el = box();
    const run = generate(el, { delay: 10, render: 'plot' });
    await vi.advanceTimersByTimeAsync(200);
    expect(document.querySelector('.ui-gen')).not.toBeNull();
    run.cancel();
    el.remove();
  });
});

describe('every reveal draws, on one shared scheduler', () => {
  it('builds all of them (no cap) from a single requestAnimationFrame loop', async () => {
    vi.useFakeTimers();
    media = { 'pointer: coarse': true };
    stubCanvas();
    const pending: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => pending.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const els = Array.from({ length: 30 }, () => {
      const el = document.createElement('div');
      Object.defineProperty(el, 'getBoundingClientRect', {
        value: () => ({ width: 200, height: 100, top: 0, left: 0, right: 200, bottom: 100 }),
      });
      document.body.append(el);
      return el;
    });
    const runs = els.map((el) => generate(el, { delay: 1, render: 'plot' }));
    await vi.advanceTimersByTimeAsync(5);
    let now = 0;
    let builtMax = 0;
    for (let f = 0; f < 120; f++) {
      expect(pending.length).toBeLessThanOrEqual(1); // one loop, however many runs
      const cb = pending.shift();
      if (!cb) break;
      const before = document.querySelectorAll('.ui-gen').length;
      now += 16.7;
      cb(now);
      const built = document.querySelectorAll('.ui-gen').length - before;
      builtMax = Math.max(builtMax, built);
    }
    // every one of them is drawn (none is faded for being over a cap)...
    expect(document.querySelectorAll('.ui-gen').length).toBe(30);
    // ...and no two builds land in the same frame
    expect(builtMax).toBeLessThanOrEqual(1);
    expect(els.every((el) => el.hasAttribute('data-generating'))).toBe(true);
    for (const r of runs) r.cancel();
    for (const el of els) el.remove();
    vi.unstubAllGlobals();
  });
});

function Probe({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}
void Probe;
