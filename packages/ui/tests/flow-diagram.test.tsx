// @vitest-environment jsdom
/* FlowDiagram: the layering, the turn to top-to-bottom when narrow, the text list a screen
   reader reads, and axe in every skin and mode. */
import axe from 'axe-core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FlowDiagram, layerNodes } from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub;
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-skin');
});

const NODES = [
  { id: 'order', label: 'Order placed' },
  { id: 'pay', label: 'Payment', detail: 'card or invoice' },
  { id: 'ship', label: 'Shipped' },
  { id: 'refund', label: 'Refunded' },
];
const EDGES = [
  { from: 'order', to: 'pay' },
  { from: 'pay', to: 'ship', label: 'paid' },
  { from: 'pay', to: 'refund', label: 'failed' },
  { from: 'refund', to: 'order', label: 'retry' },
];

describe('layerNodes', () => {
  it('layers by longest path from a start and ignores a loop back', () => {
    expect(Object.fromEntries(layerNodes(NODES, EDGES))).toEqual({
      order: 0,
      pay: 1,
      ship: 2,
      refund: 2,
    });
  });

  it('copes with a graph that is all loop, and with unknown ids', () => {
    const l = layerNodes(
      [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'a' },
        { from: 'a', to: 'zz' },
      ],
    );
    expect(Object.fromEntries(l)).toEqual({ a: 0, b: 1 });
  });
});

describe('FlowDiagram', () => {
  it('draws one named image, a box per step, and lists the flow as text', () => {
    act(() => root.render(<FlowDiagram title="Order flow" nodes={NODES} edges={EDGES} />));
    const svg = host.querySelector('svg[role="img"]');
    expect(svg?.getAttribute('aria-label')).toBe('Order flow: a diagram of 4 steps, listed below');
    expect(host.querySelectorAll('svg > g > rect')).toHaveLength(4 + 3);
    const items = [...host.querySelectorAll('ol li')].map((li) => li.textContent);
    expect(items).toEqual([
      'Order placed, then Payment',
      'Payment (card or invoice), then Shipped (paid) or Refunded (failed)',
      'Shipped',
      'Refunded, then Order placed (retry)',
    ]);
  });

  it('turns top-to-bottom when the box is too narrow for left-to-right', () => {
    // the measured width starts at 480: three layers left to right need about 680
    act(() => root.render(<FlowDiagram title="Order flow" nodes={NODES} edges={EDGES} />));
    const svg = host.querySelector('svg[role="img"]');
    const [, , vw] = (svg?.getAttribute('viewBox') ?? '').split(' ').map(Number);
    // top to bottom: as wide as the widest layer (two boxes), not three layers side by side
    expect(vw).toBe(2 * 176 + 24 + 16);
  });
});

describe('axe: FlowDiagram, every skin and mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        act(() =>
          root.render(
            <main>
              <h1>Diagrams</h1>
              <FlowDiagram
                title="Order flow"
                description="What happens to an order"
                nodes={NODES}
                edges={EDGES}
              />
              <FlowDiagram title="Down" direction="down" nodes={NODES} edges={EDGES} />
            </main>,
          ),
        );
        const results = await axe.run(document.body, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
          },
          rules: { 'color-contrast': { enabled: false } },
          resultTypes: ['violations'],
        });
        expect(results.violations.map((v) => `${v.id}: ${v.help}`).join('\n')).toBe('');
      });
    }
  }
});
