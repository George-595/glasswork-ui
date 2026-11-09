// @vitest-environment jsdom
/* The small kit additions the base-app pages needed: PageHero, ChartFailure, Slider `hideLabel`,
   Card `fullHeight` and Text `size="title"`. Structure, behaviour, and axe in every skin and mode
   (colour-contrast is off in jsdom; the colour gate holds it). */
import axe from 'axe-core';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button, Card, ChartCard, ChartFailure, PageHero, Slider, Text } from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const g = globalThis as { ResizeObserver?: unknown; IntersectionObserver?: unknown };
  g.ResizeObserver ??= ResizeObserverStub;
  g.IntersectionObserver ??= ResizeObserverStub;
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
  const proto = Element.prototype as Partial<{
    hasPointerCapture: (id: number) => boolean;
    releasePointerCapture: (id: number) => void;
    setPointerCapture: (id: number) => void;
  }>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
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

const render = (node: ReactNode) => act(() => root.render(node));
const $ = <E extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as E;

describe('PageHero', () => {
  it('shows the headline, the subtitle and the actions, with no heading of its own', () => {
    render(
      <PageHero
        title="Good morning, Ada"
        subtitle="Thursday"
        actions={<Button size="sm">Range</Button>}
      />,
    );
    expect(host.textContent).toContain('Good morning, Ada');
    expect(host.textContent).toContain('Thursday');
    expect($('button')?.textContent).toBe('Range');
    expect(host.querySelector('h1,h2,h3,h4,h5,h6')).toBeNull();
  });

  it('draws the shader accent in the glass skin only', async () => {
    document.documentElement.setAttribute('data-skin', 'enterprise');
    render(<PageHero title="Hello" />);
    expect(host.querySelector('.ui-shader-accent')).toBeNull();
    act(() => document.documentElement.setAttribute('data-skin', 'glass'));
    await act(async () => {});
    expect(host.querySelector('.ui-shader-accent')).not.toBeNull();
  });
});

describe('ChartFailure', () => {
  it('says what failed and offers Retry inside a ChartCard alert', () => {
    const retry = vi.fn<() => void>();
    render(
      <ChartCard title="Revenue" error={<ChartFailure what="revenue" onRetry={retry} />}>
        <div />
      </ChartCard>,
    );
    const alerts = host.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.textContent).toContain('Couldn’t load revenue.');
    act(() => (alerts[0]!.querySelector('button') as HTMLElement).click());
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('has no button without onRetry', () => {
    render(<ChartFailure what="spend" />);
    expect(host.querySelector('button')).toBeNull();
  });
});

describe('Slider hideLabel', () => {
  it('keeps the label for assistive tech and still names the thumb', () => {
    render(<Slider label="Rate slider" hideLabel showValue={false} />);
    const label = $('.ui-slider-label');
    expect(label.closest('.ui-slider-head')?.classList.contains('sr-only')).toBe(true);
    const thumb = $('[role="slider"]');
    expect(document.getElementById(thumb.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Rate slider',
    );
  });

  it('shows the label by default', () => {
    render(<Slider label="Rate" />);
    expect($('.ui-slider-head').classList.contains('sr-only')).toBe(false);
  });
});

describe('Card fullHeight and Text title', () => {
  it('fullHeight adds h-full; the default does not', () => {
    render(
      <>
        <Card data-testid="a" fullHeight />
        <Card data-testid="b" />
      </>,
    );
    expect($('[data-testid="a"]').classList.contains('h-full')).toBe(true);
    expect($('[data-testid="b"]').classList.contains('h-full')).toBe(false);
  });

  it('title is the h2 type token', () => {
    render(<Text size="title">£1,000</Text>);
    expect($('p').className).toContain('--t-h2');
  });
});

describe('axe: the pieces, every skin and mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(
          <main>
            <h1>Page</h1>
            <PageHero title="Good morning" subtitle="Today" actions={<Button>Go</Button>} />
            <ChartCard title="Revenue" error={<ChartFailure what="revenue" onRetry={() => {}} />}>
              <div />
            </ChartCard>
            <Slider label="Rate slider" hideLabel showValue={false} />
            <Card fullHeight>
              <Text size="title">£1</Text>
            </Card>
          </main>,
        );
        const results = await axe.run(document.body, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
          },
          rules: { 'color-contrast': { enabled: false } },
          resultTypes: ['violations'],
        });
        const report = results.violations
          .map(
            (v) =>
              `${v.id}: ${v.help}\n${v.nodes.map((n) => `  ${n.target.join(' ')}`).join('\n')}`,
          )
          .join('\n');
        expect(report).toBe('');
      });
    }
  }
});
