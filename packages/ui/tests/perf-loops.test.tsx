// @vitest-environment jsdom
/* The loops and caps behind "glass mode is laggy" (ENGINEERING.md §5, performance): the sea
   glass engine stops asking for frames when nothing moves and caps its canvas, the material
   maps are shared across sizes and themes. jsdom has no GPU: WebGL is a recording proxy. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMaterialMaps, renderMaterialPixels } from '../src/glass';
import { bucketGeometry, getMaterialMaps, peekMaterialMaps } from '../src/glass/maps';
import { renderFieldPixels, renderRimPixels } from '../src/glass/optics';
import { MAX_DPR, MAX_DPR_COARSE, PIXEL_BUDGET, SeaGlassEngine } from '../src/seaglass/engine';
import { PROBE_MS } from '../src/seaglass/perf';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* ---- the sea glass engine ---- */

function fakeGl() {
  const draws = { count: 0 };
  const gl = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'getParameter') return () => 1000;
        if (prop === 'getShaderPrecisionFormat') return () => ({ precision: 23 });
        if (prop === 'getExtension') return () => ({ loseContext: () => {} });
        if (prop === 'drawArrays') return () => draws.count++;
        return () => ({});
      },
    },
  ) as unknown as WebGLRenderingContext;
  return { gl, draws };
}

function engineHost(width = 390, height = 844) {
  const host = document.createElement('div');
  Object.defineProperty(host, 'clientWidth', { value: width });
  Object.defineProperty(host, 'clientHeight', { value: height });
  document.body.append(host);
  const canvas = document.createElement('canvas');
  host.append(canvas);
  return { host, canvas };
}

describe('the sea glass engine loop', () => {
  let media: Record<string, boolean>;
  beforeEach(() => {
    media = {};
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
    vi.stubGlobal('devicePixelRatio', 3);
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
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  function make(mode: 'live' | 'still', size?: [number, number]) {
    const { host, canvas } = engineHost(...(size ?? [390, 844]));
    const { gl, draws } = fakeGl();
    vi.spyOn(canvas, 'getContext').mockReturnValue(gl as never);
    const engine = SeaGlassEngine.create(canvas, host, { clear: false, mode, intro: false });
    if (!engine) throw new Error('engine did not start');
    engine.setLighting({
      paper: [1, 1, 1],
      sun: [1, 1, 1],
      sky: [1, 1, 1],
      tints: Array.from({ length: 7 }, () => [0.5, 0.5, 0.5] as const),
      dark: false,
    });
    return { engine, draws, canvas };
  }

  it('draws every frame during the lag probe, then stops asking for frames when idle', async () => {
    const { engine, draws } = make('live');
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    await vi.advanceTimersByTimeAsync(1000);
    const probing = draws.count;
    expect(probing).toBeGreaterThan(30);
    await vi.advanceTimersByTimeAsync(PROBE_MS + 1000);
    // the probe is over and nothing moves: the loop has stopped
    raf.mockClear();
    const settled = draws.count;
    await vi.advanceTimersByTimeAsync(2000);
    expect(raf).not.toHaveBeenCalled();
    expect(draws.count).toBe(settled);
    engine.destroy();
  });

  it('wakes for an invalidate and rests again', async () => {
    const { engine, draws } = make('live');
    await vi.advanceTimersByTimeAsync(PROBE_MS + 1500);
    const rest = draws.count;
    engine.invalidate();
    await vi.advanceTimersByTimeAsync(200);
    expect(draws.count).toBeGreaterThan(rest);
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    await vi.advanceTimersByTimeAsync(1500);
    raf.mockClear();
    await vi.advanceTimersByTimeAsync(1000);
    expect(raf).not.toHaveBeenCalled();
    engine.destroy();
  });

  it('a still engine draws once and has no loop', async () => {
    const { engine, draws } = make('still');
    await vi.advanceTimersByTimeAsync(1000);
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    expect(draws.count).toBeGreaterThanOrEqual(1);
    const once = draws.count;
    await vi.advanceTimersByTimeAsync(3000);
    expect(raf).not.toHaveBeenCalled();
    expect(draws.count).toBe(once);
    engine.destroy();
  });

  it('caps the canvas ratio at 1.5 (1.25 on touch) and the pixel budget', () => {
    expect(MAX_DPR).toBe(1.5);
    expect(MAX_DPR_COARSE).toBe(1.25);
    const fine = make('still');
    expect(fine.canvas.width).toBe(Math.round(390 * 1.5));
    fine.engine.destroy();
    media = { 'pointer: coarse': true };
    const touch = make('still');
    expect(touch.canvas.width).toBe(Math.round(390 * 1.25));
    expect(touch.canvas.height).toBe(Math.round(844 * 1.25));
    touch.engine.destroy();
    const wide = make('still', [1600, 1000]);
    expect(wide.canvas.width * wide.canvas.height).toBeLessThanOrEqual(PIXEL_BUDGET * 1.01);
    wide.engine.destroy();
  });
});

/* ---- the material maps ---- */

describe('material maps', () => {
  beforeEach(() => clearMaterialMaps());
  const g = {
    width: 301,
    height: 130,
    radius: 14,
    dpr: 1,
    appearance: 'light' as const,
    band: 14,
    rimFill: 0.65,
  };

  it('buckets big sizes to 8px and leaves small controls exact', () => {
    expect(bucketGeometry(g)).toMatchObject({ width: 304, height: 136 });
    expect(bucketGeometry({ ...g, width: 95, height: 40 })).toMatchObject({
      width: 95,
      height: 40,
    });
    // two cards a few pixels apart share their maps
    expect(bucketGeometry({ ...g, width: 299 }).width).toBe(bucketGeometry(g).width);
  });

  it('the field does not depend on the theme and is half the pixels of a full map', () => {
    const light = renderFieldPixels(g);
    const dark = renderFieldPixels({ ...g, appearance: 'dark' });
    expect(Buffer.from(light.field).equals(Buffer.from(dark.field))).toBe(true);
    const full = renderMaterialPixels(g);
    expect(light.columns * light.rows).toBeLessThan((full.columns * full.rows) / 3);
    // the rim planes do depend on it
    const rimLight = renderRimPixels(g);
    const rimDark = renderRimPixels({ ...g, appearance: 'dark' });
    expect(Buffer.from(rimLight.highlight).equals(Buffer.from(rimDark.highlight))).toBe(false);
  });

  it('serves the same maps again from the cache, and a theme switch reuses the field', async () => {
    expect(peekMaterialMaps(g)).toBeUndefined();
    const light = await getMaterialMaps(g);
    expect(peekMaterialMaps(g)).toBe(light);
    expect(light.field).toMatch(/^data:image\/png;base64,/);
    const dark = await getMaterialMaps({ ...g, appearance: 'dark' });
    expect(dark.field).toBe(light.field);
    expect(dark.highlight).not.toBe(light.highlight);
  });
});
