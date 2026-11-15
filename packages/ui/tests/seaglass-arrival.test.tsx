// @vitest-environment jsdom
/* The sea glass engine arrives late (SeaGlassStage fetches it when the stage first draws). A theme or skin change
   while it is on its way must not be lost: the stage reads the roles again at arrival. */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Lighting } from '../src/seaglass/engine';
import { forgetVerdict } from '../src/seaglass/perf';
import { SeaGlassStage } from '../src/seaglass/SeaGlassStage';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => {
  let open: () => void = () => {};
  return {
    rgb: [0.9, 0.9, 0.9] as readonly [number, number, number],
    lights: [] as Lighting[],
    gate: new Promise<void>((resolve) => {
      open = resolve;
    }),
    release: () => open(),
  };
});

vi.mock('../src/effects/cssColor', async (importActual) => {
  const actual = await importActual<typeof import('../src/effects/cssColor')>();
  return { ...actual, resolveCssColor: () => state.rgb };
});
// the factory waits on the gate: the stage's import() does not resolve until the test lets it
vi.mock('../src/seaglass/engine', async () => {
  await state.gate;
  return {
    SeaGlassEngine: {
      create: () => ({
        setLighting: (l: Lighting) => state.lights.push(l),
        setPieces: () => {},
        setMode: () => {},
        invalidate: () => {},
        destroy: () => {},
      }),
    },
  };
});

afterEach(() => forgetVerdict());

describe('SeaGlassStage engine arrival', () => {
  it('lights the engine with the roles as they are when it arrives, not as they were when it was asked for', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: false,
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(<SeaGlassStage>content</SeaGlassStage>);
    });
    expect(state.lights).toEqual([]); // the engine is still on its way
    state.rgb = [0.1, 0.1, 0.1]; // dark mode comes on during the fetch
    await act(async () => {
      state.release();
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(state.lights.length).toBeGreaterThan(0);
    const last = state.lights[state.lights.length - 1];
    expect(last?.paper).toEqual([0.1, 0.1, 0.1]);
    expect(last?.dark).toBe(true);
    await act(async () => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  });
});
