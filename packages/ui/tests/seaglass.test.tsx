// @vitest-environment jsdom
/* Sea glass: the lag fallback (George, Oct 2026: after 5 s of lag, stop animating), the views a
   stage falls to, the flat fill a piece paints without a GPU, and the page's one WebGL context
   shared with AnimatedBackground (ENGINEERING.md §5). jsdom has no WebGL, so the engine is a
   stub that reports what the stage asked of it and lets a test hand back a verdict. */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimatedBackground } from '../src/effects';
import { claimWebGl, resetWebGlGuard, useWebGlOwner } from '../src/effects/webglGuard';
import type { EngineOptions } from '../src/seaglass/engine';
import {
  forgetVerdict,
  judgeFrames,
  LagMonitor,
  PROBE_MS,
  rememberedVerdict,
  rememberVerdict,
  WARMUP_MS,
  WATCH_FRAMES,
} from '../src/seaglass/perf';
import { SeaGlass } from '../src/seaglass/SeaGlass';
import {
  type SeaGlassReason,
  SeaGlassStage,
  type SeaGlassView,
} from '../src/seaglass/SeaGlassStage';

const roles = vi.hoisted(() => ({ readable: true }));
vi.mock('../src/effects/cssColor', async (importActual) => {
  const actual = await importActual<typeof import('../src/effects/cssColor')>();
  return { ...actual, resolveCssColor: () => (roles.readable ? ([0.9, 0.9, 0.9] as const) : null) };
});

const engine = vi.hoisted(() => ({
  available: true,
  live: 0,
  options: null as EngineOptions | null,
  modes: [] as string[],
  pieces: 0,
}));
vi.mock('../src/seaglass/engine', () => ({
  SeaGlassEngine: {
    create: (_canvas: HTMLCanvasElement, _host: HTMLElement, options: EngineOptions) => {
      if (!engine.available) return null;
      engine.live += 1;
      engine.options = options;
      engine.modes.push(options.mode);
      queueMicrotask(() => options.onReady?.());
      return {
        setLighting: () => {},
        setPieces: (handles: unknown[]) => {
          engine.pieces = handles.length;
        },
        setMode: (m: string) => engine.modes.push(m),
        invalidate: () => {},
        destroy: () => {
          engine.live -= 1;
        },
      };
    },
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let media: Record<string, boolean>;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  media = {};
  roles.readable = true;
  Object.assign(engine, { available: true, live: 0, options: null, modes: [], pieces: 0 });
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: Object.entries(media).some(([k, v]) => v && query.includes(k)),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  forgetVerdict();
  resetWebGlGuard();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  resetWebGlGuard();
  forgetVerdict();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function render(node: ReactNode) {
  await act(async () => {
    root.render(node);
    await new Promise((r) => setTimeout(r, 0));
  });
  return host;
}

function recorder() {
  const seen: [SeaGlassView, SeaGlassReason][] = [];
  return { seen, on: (v: SeaGlassView, r: SeaGlassReason) => seen.push([v, r]) };
}

const steady = (ms: number, n: number) => Array.from({ length: n }, () => ms);

describe('judgeFrames', () => {
  it('keeps a smooth device live', () => {
    expect(judgeFrames(steady(16.7, 120))).toBe('live');
  });
  it('stops animating on a slow median or a visible stutter', () => {
    expect(judgeFrames(steady(50, 60))).toBe('still');
    expect(judgeFrames([...steady(16, 80), ...steady(90, 20)])).toBe('still');
  });
  it('releases the GPU when hopeless or when barely anything drew', () => {
    expect(judgeFrames(steady(200, 20))).toBe('flat');
    expect(judgeFrames(steady(16, 3))).toBe('flat');
  });
});

describe('LagMonitor', () => {
  it('ignores the warm-up and judges at five seconds', () => {
    const m = new LagMonitor(0);
    let t = 0;
    // a terrible warm-up (shader compile, app load) is forgiven
    for (; t < WARMUP_MS; t += 300) expect(m.frame(t, 300)).toBeNull();
    for (; t < PROBE_MS; t += 16) expect(m.frame(t, 16)).toBeNull();
    expect(m.probing(PROBE_MS - 1)).toBe(true);
    expect(m.frame(PROBE_MS, 16)).toBe('live');
    expect(m.probing(PROBE_MS + 1)).toBe(false);
  });

  it('falls back when the probe window lags', () => {
    const m = new LagMonitor(0);
    let verdict = null;
    for (let t = 0; t <= PROBE_MS + 60; t += 60) verdict = m.frame(t, 60) ?? verdict;
    expect(verdict).toBe('still');
  });

  it('judges an overdue probe that drew too little as flat', () => {
    const m = new LagMonitor(0);
    m.frame(2000, 2000);
    expect(m.overdue(PROBE_MS - 1)).toBeNull();
    expect(m.overdue(PROBE_MS + 10)).toBe('flat');
    expect(m.overdue(PROBE_MS + 20)).toBeNull();
  });

  it('keeps watching after a live verdict and drops to still if it turns slow', () => {
    const m = new LagMonitor(0);
    let t = 0;
    for (; t < PROBE_MS; t += 16) m.frame(t, 16);
    m.frame(PROBE_MS, 16);
    t = PROBE_MS;
    let late = null;
    for (let i = 0; i < WATCH_FRAMES && !late; i += 1) {
      t += 16;
      late = m.frame(t, 16);
    }
    expect(late).toBeNull();
    for (let i = 0; i < WATCH_FRAMES && !late; i += 1) {
      t += 80;
      late = m.frame(t, 80);
    }
    expect(late).toBe('still');
  });

  it('forgets the window after the tab was hidden', () => {
    const m = new LagMonitor(0);
    let t = 0;
    for (; t < PROBE_MS; t += 16) m.frame(t, 16);
    m.frame(PROBE_MS, 16);
    t = PROBE_MS;
    for (let i = 0; i < WATCH_FRAMES - 1; i += 1) {
      t += 80;
      m.frame(t, 80);
    }
    m.pause();
    expect(m.frame(t + 16, 16)).toBeNull();
  });
});

describe('the remembered verdict', () => {
  it('remembers a fallback for a day', () => {
    rememberVerdict('still', 1000);
    expect(rememberedVerdict(1000 + 60_000)).toBe('still');
    expect(rememberedVerdict(1000 + 25 * 60 * 60 * 1000)).toBeNull();
    forgetVerdict();
    expect(rememberedVerdict(1000)).toBeNull();
  });
  it('shrugs off junk in storage', () => {
    localStorage.setItem('ui:seaglass:verdict', '{nope');
    expect(rememberedVerdict()).toBeNull();
  });
});

describe('SeaGlassStage', () => {
  it('starts live, then falls to still when the probe says so, and remembers it', async () => {
    const r = recorder();
    const el = await render(
      <SeaGlassStage onViewChange={r.on}>
        <SeaGlass tint="aqua">Wi-Fi</SeaGlass>
      </SeaGlassStage>,
    );
    expect(r.seen.at(-1)).toEqual(['live', 'starting']);
    expect(engine.pieces).toBe(1);
    expect(el.querySelector('.ui-seaglass')?.getAttribute('data-view')).toBe('live');
    // painting: the piece paints nothing itself
    expect(el.querySelector('[data-seaglass]')?.className).toContain('bg-transparent');

    await act(async () => engine.options?.onVerdict?.('still'));
    expect(r.seen.at(-1)).toEqual(['still', 'lagged']);
    expect(engine.modes.at(-1)).toBe('still');
    expect(rememberedVerdict()).toBe('still');
  });

  it('is lit from the upper left by default and from straight above when symmetric', async () => {
    const plain = await render(
      <SeaGlassStage>
        <SeaGlass tint="aqua">Wi-Fi</SeaGlass>
      </SeaGlassStage>,
    );
    expect(plain.querySelector('.ui-seaglass')?.hasAttribute('data-symmetric')).toBe(false);
    expect(engine.options?.symmetric).toBe(false);
    const even = await render(
      <SeaGlassStage symmetric>
        <SeaGlass tint="aqua">Wi-Fi</SeaGlass>
      </SeaGlassStage>,
    );
    expect(even.querySelector('.ui-seaglass')?.getAttribute('data-symmetric')).toBe('true');
    expect(engine.options?.symmetric).toBe(true);
  });

  it('keeps the glass, drawn once and held still, when far too slow', async () => {
    const r = recorder();
    const el = await render(
      <SeaGlassStage onViewChange={r.on}>
        <SeaGlass tint="coral">Hi</SeaGlass>
      </SeaGlassStage>,
    );
    await act(async () => engine.options?.onVerdict?.('flat'));
    expect(r.seen.at(-1)?.[1]).toBe('too-slow');
    expect(r.seen.at(-1)?.[0]).not.toBe('live');
    expect(el.querySelector('[data-seaglass]')).not.toBeNull();
  });

  it('skips the five-second lag on the next load once a fallback is remembered', async () => {
    rememberVerdict('flat');
    const r = recorder();
    await render(<SeaGlassStage onViewChange={r.on} />);
    // a remembered fallback keeps the glass, held still
    expect(r.seen.at(-1)?.[1]).toBe('remembered');
    expect(r.seen.at(-1)?.[0]).not.toBe('live');
  });

  it('is flat without WebGL, or when a role cannot be read', async () => {
    engine.available = false;
    const r = recorder();
    await render(<SeaGlassStage onViewChange={r.on} />);
    expect(r.seen.at(-1)).toEqual(['flat', 'no-webgl']);
    act(() => root.render(null));
    engine.available = true;
    roles.readable = false;
    const r2 = recorder();
    await render(<SeaGlassStage onViewChange={r2.on} />);
    expect(r2.seen.at(-1)).toEqual(['flat', 'no-webgl']);
  });

  it('honours reduced transparency (flat) and reduced motion (still)', async () => {
    media['reduced-transparency'] = true;
    const r = recorder();
    await render(<SeaGlassStage onViewChange={r.on} />);
    expect(r.seen.at(-1)).toEqual(['flat', 'reduced-transparency']);
    expect(engine.live).toBe(0);
    act(() => root.render(null));

    media = { 'reduced-motion': true };
    const r2 = recorder();
    await render(<SeaGlassStage mode="live" onViewChange={r2.on} />);
    expect(r2.seen.at(-1)).toEqual(['still', 'reduced-motion']);
    expect(engine.modes.at(-1)).toBe('still');
  });

  it('starts still on a phone ("low-power") and skips the five-second lag probe', async () => {
    media = { 'pointer: coarse': true };
    const r = recorder();
    await render(
      <SeaGlassStage onViewChange={r.on}>
        <SeaGlass>Hi</SeaGlass>
      </SeaGlassStage>,
    );
    expect(engine.modes).toEqual(['still']);
    expect(engine.options?.intro).toBe(false); // no intro drop, no probe: nothing loops
    expect(r.seen.at(-1)).toEqual(['still', 'low-power']);
  });

  it('obeys a forced mode and ignores the lag verdict meanwhile', async () => {
    const r = recorder();
    await render(<SeaGlassStage mode="still" onViewChange={r.on} />);
    expect(r.seen.at(-1)).toEqual(['still', 'forced']);
    expect(engine.options?.intro).toBe(false); // no intro drop, no probe: nothing loops
  });

  it('waits on its flat fills while another stage holds the context', async () => {
    const r = recorder();
    await render(
      <>
        <SeaGlassStage />
        <SeaGlassStage onViewChange={r.on} />
      </>,
    );
    expect(engine.live).toBe(1);
    expect(r.seen.at(-1)).toEqual(['flat', 'waiting']);
  });
});

describe('SeaGlass', () => {
  it('paints its own flat fill outside a stage, and nothing when bare', async () => {
    const el = await render(
      <>
        <SeaGlass tint="amber">a</SeaGlass>
        <SeaGlass bare>b</SeaGlass>
      </>,
    );
    const [lone, bare] = el.querySelectorAll('.ui-seaglass-piece');
    expect(lone?.className).toContain('bg-seaglass-6');
    expect(lone?.getAttribute('data-seaglass')).toBe('amber');
    expect(bare?.className).toContain('bg-transparent');
    expect(bare?.hasAttribute('data-seaglass')).toBe(false);
  });

  it('registers each glass piece once, nested ones included, and is a real button when it acts', async () => {
    const onClick = vi.fn<() => void>();
    const el = await render(
      <SeaGlassStage>
        <SeaGlass shape="pill">
          <SeaGlass as="button" type="button" tint="orchid" onClick={onClick}>
            AI mode
          </SeaGlass>
          <SeaGlass as="button" type="button" bare>
            Off
          </SeaGlass>
        </SeaGlass>
      </SeaGlassStage>,
    );
    expect(engine.pieces).toBe(2);
    const button = el.querySelector('button');
    act(() => button?.click());
    expect(onClick).toHaveBeenCalledOnce();
    expect(button?.className).toContain('focus-visible:[box-shadow:var(--ring)]');
  });
});

describe('the shared WebGL guard', () => {
  it('puts a stage ahead of a background, and hands it back when the stage goes', async () => {
    function Owner() {
      return <output>{useWebGlOwner()?.id.description ?? 'none'}</output>;
    }
    const el = await render(<Owner />);
    const owner = () => el.querySelector('output')?.textContent;
    const bg = Symbol('bg');
    const stage = Symbol('stage');
    const later = Symbol('later');
    let releaseStage = () => {};
    act(() => {
      claimWebGl(bg, 'background');
      claimWebGl(later, 'background');
      releaseStage = claimWebGl(stage, 'stage');
    });
    expect(owner()).toBe('stage');
    act(() => releaseStage());
    expect(owner()).toBe('bg');
  });

  it('keeps AnimatedBackground on its static gradient while a stage draws', async () => {
    const el = await render(
      <>
        <AnimatedBackground />
        <SeaGlassStage />
      </>,
    );
    expect(engine.live).toBe(1);
    const bg = el.querySelector('.ui-fx-bg');
    expect(bg).not.toBeNull();
    expect(bg?.hasAttribute('data-live')).toBe(false);
  });
});
