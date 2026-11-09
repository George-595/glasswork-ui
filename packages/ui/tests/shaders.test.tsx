// @vitest-environment jsdom
/* The shader backdrops: what "motion never costs access" and "one GPU
   context per page" promise (ENGINEERING.md §5). jsdom has no WebGPU, so the
   `shaders` package is replaced by a counting stub (ShaderScene is the only
   file that imports it); what is under test is the component around it: the
   feature detection, the fallbacks, the guard, the pauses and the preference. */
import axe from 'axe-core';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  BACKDROPS,
  ShaderAccent,
  ShaderBackdrop,
  Sidebar,
  setBackdrop,
  Topbar,
  useBackdrop,
} from '../src';
import { PRIORITY_BACKDROP, resetGpuClaims } from '../src/effects/shaders/guard';
import { intensityOpacity, luminance, resolvePalette, toHex } from '../src/effects/shaders/palette';
import { resetBackdropMemory } from '../src/effects/useBackdrop';

/* jsdom cannot resolve a role's var() to numbers (a browser does): stand in for the role
   resolver. `roles.readable = false` is the "role not defined" case. */
const roles = vi.hoisted(() => ({ readable: true }));
vi.mock('../src/effects/cssColor', async (importActual) => {
  const actual = await importActual<typeof import('../src/effects/cssColor')>();
  const pick = () => (roles.readable ? ([0.2, 0.3, 0.4] as const) : null);
  return {
    ...actual,
    resolveCssColor: pick,
    resolveCssColors: (values: readonly string[]) =>
      roles.readable ? values.map(() => [0.2, 0.3, 0.4] as const) : null,
  };
});

const scene = vi.hoisted(() => ({ mounts: 0, live: 0, throwOnRender: false, unavailable: false }));

vi.mock('../src/effects/shaders/ShaderScene', async () => {
  const { useEffect } = await import('react');
  return {
    default: function FakeScene({
      preset,
      onReady,
      onUnavailable,
    }: {
      preset: string;
      onReady?: () => void;
      onUnavailable?: () => void;
    }) {
      if (scene.throwOnRender) throw new Error('GPU lost');
      useEffect(() => {
        scene.mounts += 1;
        scene.live += 1;
        if (scene.unavailable) onUnavailable?.();
        else onReady?.();
        return () => {
          scene.live -= 1;
        };
      }, [preset, onReady, onUnavailable]);
      return <div className="fake-scene" data-preset={preset} />;
    },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let reducedMotion = false;
let reducedTransparency = false;
let host: HTMLDivElement;
let root: Root;

function setGpu(value: unknown) {
  Object.defineProperty(navigator, 'gpu', { configurable: true, value });
}
const goodGpu = () => setGpu({ requestAdapter: async () => ({}) });

beforeEach(() => {
  reducedMotion = false;
  reducedTransparency = false;
  scene.mounts = 0;
  scene.live = 0;
  scene.throwOnRender = false;
  scene.unavailable = false;
  window.localStorage.clear();
  resetBackdropMemory();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion')
      ? reducedMotion
      : query.includes('reduced-transparency')
        ? reducedTransparency
        : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  // jsdom has no canvas backend: report "no context", as a browser without one would
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  Reflect.deleteProperty(navigator, 'gpu');
  document.documentElement.removeAttribute('data-skin');
  document.documentElement.removeAttribute('data-theme');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetGpuClaims();
});

function render(node: ReactNode) {
  act(() => root.render(node));
  return host;
}

/** Let the probe, the lazy import and the effects they trigger run. */
async function settle() {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

describe('ShaderBackdrop: feature detection and fallbacks', () => {
  it('is decorative and renders an empty static div on the server', () => {
    const html = renderToStaticMarkup(<ShaderBackdrop fallback="static" preset="liquid-metal" />);
    expect(html).toBe(
      '<div style="--ui-shader-intensity:0.6" aria-hidden="true" inert="" class="ui-shader" data-preset="liquid-metal" data-view="static"></div>',
    );
  });

  it('without navigator.gpu falls back to the animated background and never throws', async () => {
    const el = render(<ShaderBackdrop />);
    await settle();
    expect(el.querySelector('.ui-fx-bg')).not.toBeNull();
    expect(el.querySelector('.ui-shader')).toBeNull();
    expect(scene.mounts).toBe(0);
  });

  it("without navigator.gpu and fallback='static' draws the token gradient", async () => {
    const el = render(<ShaderBackdrop fallback="static" />);
    await settle();
    const bg = el.querySelector('.ui-shader');
    expect(bg?.getAttribute('data-view')).toBe('static');
    expect(el.querySelector('.ui-fx-bg')).toBeNull();
    expect(scene.mounts).toBe(0);
  });

  it('falls back when the adapter request rejects', async () => {
    setGpu({
      requestAdapter: async () => {
        throw new Error('no adapter');
      },
    });
    const el = render(<ShaderBackdrop />);
    await settle();
    expect(el.querySelector('.ui-fx-bg')).not.toBeNull();
    expect(scene.mounts).toBe(0);
  });

  it('falls back when the adapter request resolves to nothing', async () => {
    setGpu({ requestAdapter: async () => null });
    const el = render(<ShaderBackdrop fallback="static" />);
    await settle();
    expect(scene.mounts).toBe(0);
    expect(el.querySelector('.ui-shader')?.getAttribute('data-view')).toBe('static');
  });

  it('mounts the lazy scene once an adapter is confirmed, and fades it in', async () => {
    goodGpu();
    const el = render(<ShaderBackdrop preset="aurora-noise" />);
    expect(scene.mounts).toBe(0);
    await settle();
    expect(scene.mounts).toBe(1);
    const bg = el.querySelector('.ui-shader');
    expect(bg?.getAttribute('data-view')).toBe('live');
    expect(bg?.hasAttribute('data-live')).toBe(true);
    expect(el.querySelector('.fake-scene')?.getAttribute('data-preset')).toBe('aurora-noise');
  });

  it('falls back when the scene throws', async () => {
    goodGpu();
    scene.throwOnRender = true;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const el = render(<ShaderBackdrop fallback="static" />);
    await settle();
    expect(el.querySelector('.fake-scene')).toBeNull();
    expect(el.querySelector('.ui-shader')?.getAttribute('data-view')).toBe('static');
    expect(el.querySelector('[role="alert"]')).toBeNull();
  });

  it('falls back when the package reports the GPU unusable', async () => {
    goodGpu();
    scene.unavailable = true;
    const el = render(<ShaderBackdrop />);
    await settle();
    expect(el.querySelector('.ui-fx-bg')).not.toBeNull();
    expect(scene.live).toBe(0);
  });
});

describe('ShaderBackdrop: motion, transparency and the page guard', () => {
  it('under reduced motion draws the static gradient and starts no scene', async () => {
    goodGpu();
    reducedMotion = true;
    const el = render(<ShaderBackdrop />);
    await settle();
    expect(scene.mounts).toBe(0);
    expect(el.querySelector('.ui-shader')?.getAttribute('data-view')).toBe('static');
    expect(el.querySelector('.ui-fx-bg')).toBeNull();
  });

  it('under reduced transparency mounts nothing and shows the solid surface', async () => {
    goodGpu();
    reducedTransparency = true;
    const el = render(<ShaderBackdrop />);
    await settle();
    expect(scene.mounts).toBe(0);
    expect(el.querySelector('.ui-shader')?.getAttribute('data-view')).toBe('solid');
  });

  it('allows one GPU context per page: a second instance renders the static gradient', async () => {
    goodGpu();
    const el = render(
      <>
        <ShaderBackdrop data-testid="first" />
        <ShaderBackdrop data-testid="second" preset="liquid-metal" />
      </>,
    );
    await settle();
    expect(scene.mounts).toBe(1);
    expect(scene.live).toBe(1);
    expect(el.querySelector('[data-testid="first"]')?.getAttribute('data-view')).toBe('live');
    expect(el.querySelector('[data-testid="second"]')?.getAttribute('data-view')).toBe('static');
  });

  it('hands the context to the next instance when the owner unmounts', async () => {
    goodGpu();
    const el = render(
      <>
        <ShaderBackdrop data-testid="first" />
        <ShaderBackdrop data-testid="second" />
      </>,
    );
    await settle();
    render(<ShaderBackdrop data-testid="second" />);
    await settle();
    expect(scene.live).toBe(1);
    expect(el.querySelector('[data-testid="second"]')?.getAttribute('data-view')).toBe('live');
  });

  it('a ShaderAccent yields the context to a ShaderBackdrop, and shows its gradient', async () => {
    goodGpu();
    const el = render(
      <>
        <ShaderAccent data-testid="accent" />
        <ShaderBackdrop data-testid="backdrop" />
      </>,
    );
    await settle();
    expect(scene.live).toBe(1);
    expect(el.querySelector('[data-testid="backdrop"]')?.getAttribute('data-view')).toBe('live');
    expect(el.querySelector('[data-testid="accent"]')?.getAttribute('data-view')).toBe('static');
  });

  it('a lone ShaderAccent runs the scene', async () => {
    goodGpu();
    const el = render(<ShaderAccent />);
    await settle();
    expect(scene.live).toBe(1);
    expect(el.querySelector('.ui-shader-accent')?.getAttribute('data-view')).toBe('live');
  });

  it('priority: the backdrop outranks the accent', () => {
    expect(PRIORITY_BACKDROP).toBeGreaterThan(1);
  });

  it('lets the scene go while the tab is hidden, and brings it back', async () => {
    goodGpu();
    render(<ShaderBackdrop />);
    await settle();
    expect(scene.live).toBe(1);
    let hidden = true;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    expect(scene.live).toBe(0);
    hidden = false;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    expect(scene.live).toBe(1);
    Reflect.deleteProperty(document, 'hidden');
  });

  it('lets the scene go while it is off screen', async () => {
    goodGpu();
    let notify: IntersectionObserverCallback = () => {};
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback) {
          notify = cb;
        }
        observe() {}
        disconnect() {}
        unobserve() {}
      },
    );
    render(<ShaderBackdrop />);
    await settle();
    expect(scene.live).toBe(1);
    act(() => notify([{ isIntersecting: false } as IntersectionObserverEntry], {} as never));
    await settle();
    expect(scene.live).toBe(0);
    act(() => notify([{ isIntersecting: true } as IntersectionObserverEntry], {} as never));
    await settle();
    expect(scene.live).toBe(1);
  });

  it('is aria-hidden, inert and clicks pass through (decorative)', async () => {
    goodGpu();
    const el = render(<ShaderBackdrop />);
    await settle();
    const bg = el.querySelector('.ui-shader');
    expect(bg?.getAttribute('aria-hidden')).toBe('true');
    expect(bg?.hasAttribute('inert')).toBe(true);
    expect(el.querySelector('.ui-shader [role]')).toBeNull();
  });
});

describe('palettes: roles handed to the GPU', () => {
  it('intensity is the canvas opacity: clamped, with a sane default', () => {
    expect(intensityOpacity(0.5)).toBe(0.5);
    expect(intensityOpacity(7)).toBe(1);
    expect(intensityOpacity(-1)).toBe(0);
    expect(intensityOpacity(Number.NaN)).toBeGreaterThan(0);
  });

  it('formats channels as hex and measures luminance (a flag, not a colour)', () => {
    // 0.2 / 0.4 / 0.6 of 255 are 51 / 102 / 153: asserted per channel, with no colour literal
    const hex = toHex([0.2, 0.4, 0.6]);
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect([1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16))).toEqual([51, 102, 153]);
    expect(luminance([1, 1, 1])).toBeCloseTo(1);
    expect(luminance([0, 0, 0])).toBe(0);
  });

  it('reads the shader roles from the page, and makes no colour of its own', () => {
    const probe = document.createElement('div');
    document.body.append(probe);
    const p = resolvePalette(probe);
    probe.remove();
    expect(p?.bg).toMatch(/^#[0-9a-f]{6}$/);
    expect(p?.a).toMatch(/^#[0-9a-f]{6}$/);
    expect(typeof p?.dark).toBe('boolean');
  });

  it('returns no palette when a role cannot be read: the static gradient stays', () => {
    roles.readable = false;
    const bare = document.createElement('div');
    document.body.append(bare);
    expect(resolvePalette(bare)).toBeNull();
    bare.remove();
    roles.readable = true;
  });
});

function Picker() {
  const [backdrop, set] = useBackdrop();
  return (
    <button type="button" onClick={() => set('mesh')}>
      {backdrop}
    </button>
  );
}

describe('useBackdrop', () => {
  it('defaults to tide, the calm one', () => {
    expect(render(<Picker />).textContent).toBe('tide');
  });

  it('reads a choice saved under an old name as its successor', () => {
    window.localStorage.setItem('ui-backdrop', 'aurora');
    expect(render(<Picker />).textContent).toBe('tide');
    act(() => root.render(null));
    window.localStorage.setItem('ui-backdrop', 'iridescence');
    resetBackdropMemory();
    expect(render(<Picker />).textContent).toBe('hive');
  });

  it('persists the choice under ui-backdrop and shares it across hooks', () => {
    const el = render(
      <>
        <Picker />
        <Picker />
      </>,
    );
    act(() => (el.querySelector('button') as HTMLButtonElement).click());
    expect(window.localStorage.getItem('ui-backdrop')).toBe('mesh');
    expect(Array.from(el.querySelectorAll('button'), (b) => b.textContent)).toEqual([
      'mesh',
      'mesh',
    ]);
  });

  it('reads a saved choice, and ignores a value that is not a backdrop', () => {
    window.localStorage.setItem('ui-backdrop', 'liquid-metal');
    expect(render(<Picker />).textContent).toBe('liquid-metal');
    act(() => root.render(null));
    window.localStorage.setItem('ui-backdrop', 'neon');
    resetBackdropMemory();
    expect(render(<Picker />).textContent).toBe('tide');
  });

  it('survives localStorage throwing on read and write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const el = render(<Picker />);
    expect(el.textContent).toBe('tide');
    act(() => (el.querySelector('button') as HTMLButtonElement).click());
    expect(el.textContent).toBe('mesh'); // lasts for the page
  });

  it('lists the six backdrops', () => {
    expect(BACKDROPS).toEqual([
      'tide',
      'hive',
      'mesh',
      'liquid-metal',
      'aurora-noise',
      'glass-caustics',
    ]);
  });
});

describe('AppShell backdrop', () => {
  const shell = (props: { background?: Parameters<typeof AppShell>[0]['background'] }) => (
    <AppShell
      brand="App"
      sidebar={
        <Sidebar
          sections={[{ items: [{ id: 'home', title: 'Home', href: '#/' }] }]}
          current="home"
        />
      }
      topbar={<Topbar title="Home" />}
      {...props}
    >
      <p>Body</p>
    </AppShell>
  );

  it('glass skin: the saved shader preset is the backdrop when `background` is unset', async () => {
    goodGpu();
    document.documentElement.setAttribute('data-skin', 'glass');
    setBackdrop('liquid-metal');
    const el = render(shell({}));
    await settle();
    expect(el.querySelector('.ui-shader')?.getAttribute('data-preset')).toBe('liquid-metal');
  });

  it('an explicit `background` wins over the saved choice', async () => {
    document.documentElement.setAttribute('data-skin', 'glass');
    setBackdrop('liquid-metal');
    const el = render(shell({ background: 'hive' }));
    await settle();
    expect(el.querySelector('.ui-shader')).toBeNull();
    expect(el.querySelector('.ui-fx-bg')?.getAttribute('data-variant')).toBe('hive');
  });

  it('default is tide', async () => {
    document.documentElement.setAttribute('data-skin', 'glass');
    const el = render(shell({}));
    await settle();
    expect(el.querySelector('.ui-fx-bg')?.getAttribute('data-variant')).toBe('tide');
  });

  it('the enterprise skin never renders a shader', async () => {
    goodGpu();
    document.documentElement.setAttribute('data-skin', 'enterprise');
    setBackdrop('mesh');
    const el = render(shell({ background: 'glass-caustics' }));
    await settle();
    expect(el.querySelector('.ui-shader, .ui-fx-bg')).toBeNull();
    expect(scene.mounts).toBe(0);
  });
});

describe('axe: enterprise and glass, light and dark', () => {
  const passes = [
    ['enterprise', 'light'],
    ['enterprise', 'dark'],
    ['glass', 'light'],
    ['glass', 'dark'],
  ] as const;
  for (const [skin, theme] of passes) {
    it(`${skin} ${theme}: backdrop, accent and fallbacks have no violations`, async () => {
      goodGpu();
      document.documentElement.setAttribute('data-skin', skin);
      document.documentElement.setAttribute('data-theme', theme);
      const el = render(
        <main>
          <h1>Shaders</h1>
          <div className="ui-shader-host">
            <ShaderAccent preset="aurora-noise" />
            <p>Hero copy</p>
          </div>
          <ShaderBackdrop preset="glass-caustics" />
          <ShaderBackdrop fallback="static" />
        </main>,
      );
      await settle();
      // jsdom computes no layout, so contrast is the browser gate's job (check:a11y)
      const results = await axe.run(el, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
        rules: { 'color-contrast': { enabled: false } },
      });
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }
});
