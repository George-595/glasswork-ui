// @vitest-environment jsdom
/* The studio set: behaviour of the components new in the November 2026 pass, and an axe pass
   over them. jsdom has no layout, so axe's colour-contrast rule is off here; contrast and
   touch size are held by the browser pass of `npm run check:a11y` (fixture/ShowcaseStudio). */
import axe from 'axe-core';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { StudioShowcase } from '../fixture/ShowcaseStudio';
import {
  Accordion,
  Coverflow,
  contrastRatio,
  DropletSlider,
  DropletSwitch,
  FrostReveal,
  GlassHeatmap,
  LiveIsland,
  NetworkGraph,
  PrismDonut,
  RadarChart,
  ScatterChart,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const g = globalThis as { ResizeObserver?: unknown };
  g.ResizeObserver ??= ResizeObserverStub;
  const proto = Element.prototype as Partial<{
    hasPointerCapture: (id: number) => boolean;
    releasePointerCapture: (id: number) => void;
    setPointerCapture: (id: number) => void;
    scrollIntoView: () => void;
  }>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
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
});

const render = (node: React.ReactNode) => act(() => root.render(node));
const press = (el: Element | null) => {
  if (!el) throw new Error('nothing to press');
  act(() => (el as HTMLElement).click());
};
const key = (el: Element | null, k: string) => {
  if (!el) throw new Error('nothing to key');
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
  });
};

describe('studio set', () => {
  it('passes axe (no contrast in jsdom) in both skins and modes', async () => {
    render(<StudioShowcase />);
    for (const skin of ['enterprise', 'glass']) {
      for (const theme of ['light', 'dark']) {
        document.documentElement.dataset.skin = skin;
        document.documentElement.dataset.theme = theme;
        const r = await axe.run(host, { rules: { 'color-contrast': { enabled: false } } });
        expect(r.violations.map((v) => `${v.id}: ${v.nodes[0]?.html}`)).toEqual([]);
      }
    }
  });

  it('accordion opens and closes a section', () => {
    render(
      <Accordion
        items={[
          { id: 'a', title: 'First', content: 'One' },
          { id: 'b', title: 'Second', content: 'Two' },
        ]}
      />,
    );
    const second = [...host.querySelectorAll('button')].find((b) =>
      b.textContent?.includes('Second'),
    );
    expect(second?.getAttribute('aria-expanded')).toBe('false');
    press(second ?? null);
    expect(second?.getAttribute('aria-expanded')).toBe('true');
  });

  it('coverflow: arrows move the front cover, which is the one tab stop', () => {
    render(
      <Coverflow
        label="Work"
        items={[
          { id: 'a', title: 'Alpha' },
          { id: 'b', title: 'Beta' },
          { id: 'c', title: 'Gamma' },
        ]}
      />,
    );
    const front = () => host.querySelector('[aria-current="true"]');
    expect(front()?.getAttribute('aria-label')).toBe('Alpha, 1 of 3');
    key(front(), 'ArrowRight');
    expect(front()?.getAttribute('aria-label')).toBe('Beta, 2 of 3');
    expect(host.querySelectorAll('[data-cover][tabindex="0"]').length).toBe(1);
    key(front(), 'End');
    expect(front()?.getAttribute('aria-label')).toBe('Gamma, 3 of 3');
  });

  it('droplet switch toggles aria-checked; droplet slider is a labelled range', () => {
    let last: boolean | null = null;
    render(
      <>
        <DropletSwitch label="Wi-Fi" onCheckedChange={(v) => (last = v)} />
        <DropletSlider label="Volume" defaultValue={40} format={(v) => `${v}%`} />
      </>,
    );
    const sw = host.querySelector('[role="switch"]');
    expect(sw?.getAttribute('aria-checked')).toBe('false');
    press(sw);
    expect(sw?.getAttribute('aria-checked')).toBe('true');
    expect(last).toBe(true);
    const range = host.querySelector('input[type="range"]');
    expect(range?.getAttribute('aria-valuetext')).toBe('40%');
    expect(host.querySelector(`label[for="${range?.id}"]`)?.textContent).toBe('Volume');
  });

  it('frost reveal keeps the content inert until shown', () => {
    render(<FrostReveal label="Balance">£12</FrostReveal>);
    const content = host.querySelector('[aria-hidden="true"][inert]');
    expect(content?.textContent).toBe('£12');
    press(
      [...host.querySelectorAll('button')].find((b) => b.textContent === 'Show balance') ?? null,
    );
    expect(host.querySelector('[inert]')).toBeNull();
    expect(host.querySelector('button[aria-label="Hide balance"]')).not.toBeNull();
  });

  it('live island opens to a card and swaps the second activity in', () => {
    render(
      <LiveIsland
        activities={[
          { id: 'a', icon: 'zap', title: 'Deploying', detail: 'Step 1 of 5' },
          { id: 'b', icon: 'music', title: 'Focus mix' },
        ]}
      />,
    );
    const head = host.querySelector('.ui-island-head');
    expect(head?.getAttribute('aria-expanded')).toBe('false');
    press(host.querySelector('button[aria-label="Show Focus mix"]'));
    expect(head?.textContent).toContain('Focus mix');
    press(head);
    expect(head?.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('[role="status"]')?.textContent).toBe('Focus mix');
  });

  it('charts carry their data in a table and a summary label', () => {
    render(
      <>
        <ScatterChart
          title="Size"
          xLabel="Area"
          yLabel="Price"
          series={[{ name: 'Flats', points: [{ x: 40, y: 180, label: 'Flat 1' }] }]}
        />
        <RadarChart
          title="Effort"
          axes={['A', 'B', 'C']}
          series={[{ name: 'Kit', values: [1, 2, 3] }]}
        />
        <PrismDonut
          title="Spend"
          data={[
            { label: 'Hosting', value: 3 },
            { label: 'Tools', value: 1 },
          ]}
        />
        <NetworkGraph
          title="Team"
          nodes={[
            { id: 'a', label: 'Lead' },
            { id: 'b', label: 'API' },
          ]}
          links={[{ source: 'a', target: 'b' }]}
        />
        <GlassHeatmap title="Visits" rows={['Mon']} columns={['9am', '12pm']} values={[[2, 8]]} />
      </>,
    );
    const captions = [...host.querySelectorAll('caption')].map((c) => c.textContent);
    expect(captions).toEqual([
      'Size: data',
      'Effort: data',
      'Spend: data',
      'Team: data',
      'Visits: data',
    ]);
    expect(
      host.querySelector('[aria-label^="Spend: 2 parts"]')?.getAttribute('aria-label'),
    ).toContain('Hosting 75%');
    expect(host.querySelector('[aria-label^="Team: 2 nodes and 1 links"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Mon · 12pm: 8"]')).not.toBeNull();
  });

  it('contrast ratio follows WCAG', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([119, 119, 119], [255, 255, 255])).toBeCloseTo(4.48, 2);
  });
});
