// @vitest-environment jsdom
/* LiquidGlass: the plain element outside the glass skin, the SVG
   backdrop-filter path where Chromium can draw it, the CSS fallbacks, and
   deterministic server markup. */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearMaterialMaps,
  edgeDisplacement,
  LiquidGlass,
  renderMaterialPixels,
  roundedRectField,
} from '../src/glass';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/19.0 Safari/605.1.15';

class FakeResizeObserver {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element) {
    const entry = {
      target,
      contentRect: { width: 200, height: 100 },
      borderBoxSize: [{ inlineSize: 200, blockSize: 100 }],
    } as unknown as ResizeObserverEntry;
    this.callback([entry], this as unknown as ResizeObserver);
  }
  unobserve() {}
  disconnect() {}
}

function browser(ua: string, media: Record<string, boolean> = {}) {
  vi.stubGlobal('navigator', { userAgent: ua, vendor: ua.includes('Chrome') ? 'Google Inc.' : '' });
  vi.stubGlobal('CSS', { supports: () => true, escape: (s: string) => s });
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: media[query] ?? false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  clearMaterialMaps();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-skin');
  document.documentElement.removeAttribute('data-theme');
});

async function mount() {
  await act(async () => {
    root.render(
      <LiquidGlass className="ui-card">
        <p>Readable text</p>
      </LiquidGlass>,
    );
  });
  // The maps are encoded asynchronously; let them settle.
  for (let i = 0; i < 20 && host.querySelector('[data-lg="blur"]'); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
  const glass = host.firstElementChild as HTMLElement;
  return glass;
}

describe('LiquidGlass', () => {
  it('renders a plain element with no filter in the enterprise skin', async () => {
    browser(CHROME_UA);
    document.documentElement.setAttribute('data-skin', 'enterprise');
    const glass = await mount();
    expect(glass.getAttribute('data-lg')).toBe('plain');
    expect(glass.className).toBe('ui-lg ui-card');
    expect(glass.style.backdropFilter).toBe('');
    expect(glass.querySelector('filter, .ui-lg-layer')).toBeNull();
    expect(glass.textContent).toBe('Readable text');
  });

  it('refracts through an SVG backdrop-filter in the glass skin on Chromium', async () => {
    browser(CHROME_UA);
    document.documentElement.setAttribute('data-skin', 'glass');
    document.documentElement.setAttribute('data-theme', 'dark');
    const glass = await mount();
    expect(glass.getAttribute('data-lg')).toBe('refract');
    const filter = glass.querySelector('filter');
    expect(filter).not.toBeNull();
    expect(glass.style.backdropFilter).toBe(`url("#${filter?.id}")`);
    const field = filter?.querySelector('feImage');
    expect(field?.getAttribute('href')).toMatch(/^data:image\/png;base64,/);
    expect(filter?.querySelector('feDisplacementMap')?.getAttribute('scale')).toBe('120');
    expect(glass.querySelectorAll('.ui-lg-layer[aria-hidden="true"]')).toHaveLength(3); // fill, shade, light
    // Content is never inside the filter: only the backdrop is refracted.
    expect(glass.querySelector('p')?.closest('svg')).toBeNull();
  });

  it('falls back to the CSS blur where SVG backdrop filters do not render', async () => {
    browser(SAFARI_UA);
    document.documentElement.setAttribute('data-skin', 'glass');
    const glass = await mount();
    expect(glass.getAttribute('data-lg')).toBe('blur');
    expect(glass.style.backdropFilter).toBe('');
    expect(glass.querySelector('filter')).toBeNull();
  });

  it('falls back to solid surfaces under reduced transparency and forced colours', async () => {
    for (const query of ['(prefers-reduced-transparency: reduce)', '(forced-colors: active)']) {
      browser(CHROME_UA, { [query]: true });
      document.documentElement.setAttribute('data-skin', 'glass');
      const glass = await mount();
      expect(glass.getAttribute('data-lg')).toBe('solid');
      expect(glass.style.backdropFilter).toBe('');
      expect(glass.querySelector('filter')).toBeNull();
      vi.unstubAllGlobals();
    }
  });

  it('renders deterministic markup on the server', () => {
    document.documentElement.setAttribute('data-skin', 'glass');
    const html = renderToStaticMarkup(
      <LiquidGlass as="aside" className="ui-card">
        Hi
      </LiquidGlass>,
    );
    expect(html).toBe('<aside data-lg="plain" class="ui-lg ui-card">Hi</aside>');
  });
});

describe('optics port', () => {
  it('keeps the upstream edge profile', () => {
    expect(edgeDisplacement(0, 1, 0.05)).toBe(1);
    expect(edgeDisplacement(-20, 1, 0.05)).toBe(0);
    expect(edgeDisplacement(-10, 1, 0.05)).toBeCloseTo(1 - Math.sqrt(0.75));
  });

  it('measures a rounded rectangle with outward normals', () => {
    expect(roundedRectField(0, 0, 50, 20, 8).d).toBe(-20);
    expect(roundedRectField(60, 0, 50, 20, 8)).toEqual({ d: 10, nx: 1, ny: 0 });
    const corner = roundedRectField(50, 20, 50, 20, 8);
    expect(corner.nx).toBeCloseTo(Math.SQRT1_2);
    expect(corner.ny).toBeCloseTo(Math.SQRT1_2);
  });

  it('displaces inward at the rim and not at the centre', () => {
    const g = { width: 80, height: 80, radius: 8, dpr: 1, appearance: 'dark' as const };
    const { columns, rows, field } = renderMaterialPixels({ ...g, band: 14, rimFill: 0.2 });
    const at = (x: number, y: number) => (y * columns + x) * 4;
    const centre = at(columns >> 1, rows >> 1);
    expect([field[centre], field[centre + 1]]).toEqual([128, 128]);
    // Right rim: outward normal +x, so red < 0.5 samples from the left.
    const right = at(columns - 3, rows >> 1);
    expect(field[right]).toBeLessThan(40);
  });
});
