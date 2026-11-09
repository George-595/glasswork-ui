// @vitest-environment jsdom
/* The charts: the accessibility contract in ChartFrame.tsx, server rendering
   (the axe gate renders a showcase with renderToStaticMarkup), and the maths
   in scale.ts. */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { markerPath } from '../src/charts/markers';
import { monotoneX, niceTicks } from '../src/charts/scale';
import { BarChart, DonutChart, LineChart, type LineSeries, Sparkline } from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

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

function render(node: ReactNode) {
  act(() => root.render(node));
  return host;
}
const $$ = (sel: string, from: ParentNode = host) =>
  Array.from(from.querySelectorAll<HTMLElement>(sel));

/** Parse server markup into a detached element, to query it like the DOM. */
function ssr(node: ReactNode) {
  const el = document.createElement('div');
  el.innerHTML = renderToStaticMarkup(node);
  return el;
}

const SERIES: LineSeries[] = [
  {
    name: 'A',
    points: [
      { x: 'Jan', y: 1 },
      { x: 'Feb', y: 3 },
      { x: 'Mar', y: 2 },
    ],
  },
  {
    name: 'B',
    points: [
      { x: 'Jan', y: 2 },
      { x: 'Mar', y: 4 },
    ],
  },
];
const ORDERS = [
  { label: 'N', value: 4 },
  { label: 'S', value: 9 },
  { label: 'W', value: -2 },
];
const MIX = [
  { label: 'X', value: 3 },
  { label: 'Y', value: 1 },
];

function all() {
  return (
    <>
      <LineChart title="Revenue" description="Monthly" series={SERIES} />
      <BarChart title="Orders" data={ORDERS} />
      <DonutChart title="Mix" data={MIX} centerLabel="4 total" />
    </>
  );
}

describe('charts: accessibility contract', () => {
  it('each chart is a figure with a figcaption', () => {
    render(all());
    const figures = $$('figure');
    expect(figures).toHaveLength(3);
    expect(figures.map((f) => f.querySelector(':scope > figcaption')?.textContent)).toEqual([
      'RevenueMonthly',
      'Orders',
      'Mix',
    ]);
  });

  it('draws one named role="img" svg per chart, with a summary label', () => {
    render(all());
    const imgs = $$('svg[role="img"]');
    expect(imgs).toHaveLength(3);
    expect(imgs[0]?.getAttribute('aria-label')).toBe(
      'Revenue. Line chart of A, B, Jan to Mar. The data table follows.',
    );
    expect(imgs[1]?.getAttribute('aria-label')).toContain('highest S at 9');
    expect(imgs[2]?.getAttribute('aria-label')).toContain('X 75%, Y 25%');
    // one image each: nothing inside claims a role of its own
    for (const svg of imgs) expect($$('[role]', svg)).toHaveLength(0);
  });

  it('carries the full data in a visually hidden table', () => {
    render(all());
    const tables = $$('figure table');
    expect(tables).toHaveLength(3);
    for (const t of tables) expect(t.classList.contains('ui-sr-only')).toBe(true);
    const line = tables[0];
    expect($$('thead th', line).map((th) => th.textContent)).toEqual(['x', 'A', 'B']);
    // a missing point shows as a dash, not a gap
    expect($$('tbody tr', line).map((tr) => tr.textContent)).toEqual(['Jan12', 'Feb3—', 'Mar24']);
    expect($$('tbody th[scope="row"]', tables[1]).map((th) => th.textContent)).toEqual([
      'N',
      'S',
      'W',
    ]);
    expect($$('tbody tr', tables[2]).map((tr) => tr.textContent)).toEqual(['X375%', 'Y125%']);
  });

  it('tells line series apart by dash and marker shape, not colour alone', () => {
    render(<LineChart title="Revenue" series={SERIES} />);
    const svg = $$('svg[role="img"]')[0] as HTMLElement;
    const dashes = $$('.ts-chart__line path', svg).map((p) => p.getAttribute('stroke-dasharray'));
    expect(new Set(dashes).size).toBe(2);
    // series B's markers are squares (shape 1), series A's circles (shape 0)
    const markers = $$('.ui-chart-markers path', svg).map((p) => p.getAttribute('d') ?? '');
    expect(markers.filter((d) => d.includes('A'))).toHaveLength(3);
    expect(markers.filter((d) => d.includes('H'))).toHaveLength(2);
    // and the legend repeats each line style with its name
    const legend = $$('.ui-chart-legend li');
    expect(legend.map((li) => li.textContent)).toEqual(['A', 'B']);
    for (const li of legend)
      expect(li.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('numbers donut slices and repeats the numbers in the legend', () => {
    render(<DonutChart title="Mix" data={MIX} centerLabel="4 total" />);
    const svg = $$('svg[role="img"]')[0] as HTMLElement;
    const texts = $$('text', svg).map((t) => t.textContent);
    expect(texts).toEqual(expect.arrayContaining(['1', '2', '4 total']));
    expect($$('.ui-donut-legend li').map((li) => li.textContent)).toEqual([
      '1X3 · 75%',
      '2Y1 · 25%',
    ]);
  });

  it('labels bars with their values when they fit', () => {
    render(<BarChart title="Orders" data={ORDERS} />);
    const svg = $$('svg[role="img"]')[0] as HTMLElement;
    expect($$('text', svg).map((t) => t.textContent)).toEqual(
      expect.arrayContaining(['N', 'S', 'W', '4', '9', '-2']),
    );
  });

  it('keeps every tooltip out of the accessibility tree', () => {
    render(all());
    // no TanStack live-region tooltip is mounted
    expect($$('.ts-chart-tooltip')).toHaveLength(0);
    expect($$('[role="status"]')).toHaveLength(0);
  });

  it('shows an aria-hidden readout for the focused x, by keyboard as by pointer', () => {
    render(<LineChart title="Revenue" series={SERIES} />);
    const svg = $$('svg[role="img"]')[0] as HTMLElement;
    expect(svg.getAttribute('tabindex')).toBe('0');
    expect($$('.ui-chart-readout')).toHaveLength(0);
    act(() => svg.focus());
    act(() => {
      svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    const readout = $$('.ui-chart-readout')[0];
    expect(readout?.getAttribute('aria-hidden')).toBe('true');
    expect(readout?.textContent).toBe('FebA3B—');
    act(() => {
      svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      svg.blur();
    });
  });

  it('uses only token colours in its own markup', () => {
    render(all());
    const html = host.innerHTML;
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b(?![^<]*<\/text>)/i);
    expect(html).toContain('var(--chart-1)');
  });

  it('Sparkline names its range', () => {
    render(<Sparkline label="Signups" values={[3, 9, 1, 5]} />);
    const svg = $$('svg')[0] as HTMLElement;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Signups: from 3 to 5, low 1, high 9');
    expect($$('path', svg).length).toBeGreaterThanOrEqual(2);
  });

  it('Sparkline survives no data', () => {
    render(<Sparkline label="Signups" values={[]} />);
    expect($$('svg')[0]?.getAttribute('aria-label')).toBe('Signups: no data');
  });
});

describe('charts: server rendering', () => {
  it('renders every chart with renderToStaticMarkup at a fallback width', () => {
    const el = ssr(
      <>
        {all()}
        <p>
          Signups <Sparkline label="Signups" values={[3, 9, 1, 5]} />
        </p>
      </>,
    );
    const imgs = $$('svg[role="img"]', el);
    expect(imgs).toHaveLength(4);
    // responsive charts lay out at 640px on the server; the donut at its size
    expect(imgs[0]?.getAttribute('viewBox')).toBe('0 0 640 240');
    expect(imgs[1]?.getAttribute('viewBox')).toBe('0 0 640 240');
    expect(imgs[2]?.getAttribute('viewBox')).toBe('0 0 220 220');
    // real geometry, not a placeholder
    expect($$('.ts-chart__line path', imgs[0] as HTMLElement).length).toBe(2);
    expect(
      $$('path', imgs[1] as HTMLElement).length + $$('rect', imgs[1] as HTMLElement).length,
    ).toBeGreaterThanOrEqual(3);
    // the sparkline stays phrasing content: no <div> inside the <p>
    expect(el.querySelector('p div')).toBeNull();
    expect($$('figure table', el)).toHaveLength(3);
  });
});

describe('charts: maths', () => {
  it('niceTicks covers the range in round steps', () => {
    expect(niceTicks(0, 100)).toEqual([0, 25, 50, 75, 100]);
    expect(niceTicks(-6, 42)).toEqual([-20, 0, 20, 40, 60]);
    expect(niceTicks(0.1, 0.9)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(niceTicks(5, 5)).toEqual([4.5, 4.75, 5, 5.25, 5.5]);
    expect(niceTicks(0, 0)).toEqual([0, 1]);
    // counts: whole-number steps only, never 0.25
    expect(niceTicks(0, 1, 5, true)).toEqual([0, 1]);
    expect(niceTicks(0, 10, 5, true)).toEqual([0, 5, 10]);
    expect(niceTicks(Number.NaN, 1)).toEqual([0]);
  });

  it('monotoneX passes through every point and never overshoots', () => {
    const pts = [
      [0, 10],
      [10, 0],
      [20, 0],
      [30, 10],
    ] as const;
    const d = monotoneX.line(pts);
    expect(d.startsWith('M0,10')).toBe(true);
    for (const [x, y] of pts.slice(1)) expect(d).toContain(`${x},${y}`);
    // every control point stays inside the data's y range
    const ys = [...d.matchAll(/[\d.-]+,([\d.-]+)/g)].map((m) => Number(m[1]));
    for (const y of ys) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(10);
    }
    expect(monotoneX.line([[0, 1]])).toBe('M0,1');
    expect(monotoneX.line([])).toBe('');
    expect(
      monotoneX
        .area(
          pts,
          pts.map(([x]) => [x, 10] as const),
        )
        .endsWith('Z'),
    ).toBe(true);
  });

  it('markerPath draws eight distinct shapes, one per series colour', () => {
    const shapes = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => markerPath(i, 10, 10));
    expect(new Set(shapes).size).toBe(8);
    expect(markerPath(8, 10, 10)).toBe(shapes[0]);
  });
});
