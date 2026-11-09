// @vitest-environment jsdom
/* The chart kit's second set: horizontal / grouped / stacked bars, area and
   comparison lines, the interactive legend, tick thinning, ChartCard (visible
   data table, loading / error / empty) and the Sparkline options. Axe runs on a
   ChartCard around each chart in all four skin x mode passes. */
import axe from 'axe-core';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { allIsoDates, defaultXFormat, labelRoom, thinLabels } from '../src/charts/axis';
import {
  AreaChart,
  BarChart,
  type BarSeries,
  ChartCard,
  DonutChart,
  LineChart,
  type LineSeries,
  Sparkline,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // reduced motion: TanStack snaps to the end state, so removed marks leave the DOM at once
  window.matchMedia = ((query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
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
const click = (el: HTMLElement | undefined) => act(() => el?.click());

const REGIONS: BarSeries[] = [
  {
    name: 'This year',
    data: [
      { label: 'North', value: 30 },
      { label: 'South', value: 20 },
      { label: 'West', value: 40 },
    ],
  },
  {
    name: 'Last year',
    data: [
      { label: 'North', value: 25 },
      { label: 'South', value: 28 },
      { label: 'West', value: 35 },
    ],
  },
];

const days = (n: number, from = Date.UTC(2026, 8, 1)) =>
  Array.from({ length: n }, (_, i) => new Date(from + i * 86_400_000).toISOString().slice(0, 10));
const DAILY: LineSeries[] = [
  { name: 'Sales', points: days(30).map((x, i) => ({ x, y: 10 + (i % 7) })) },
  { name: 'Costs', points: days(30).map((x, i) => ({ x, y: 6 + (i % 5) })) },
];
const THIS_VS_LAST: LineSeries[] = [
  {
    name: 'This week',
    points: [
      { x: 'Mon', y: 4 },
      { x: 'Tue', y: 6 },
      { x: 'Wed', y: 5 },
    ],
  },
  {
    name: 'Last week',
    variant: 'comparison',
    points: [
      { x: 'Mon', y: 3 },
      { x: 'Tue', y: 4 },
      { x: 'Wed', y: 6 },
    ],
  },
];

describe('BarChart: orientation and series', () => {
  it('draws grouped bars: one bar per category per series, one table row per category', () => {
    render(<BarChart title="Orders" series={REGIONS} />);
    expect($$('.ts-chart__bar > *')).toHaveLength(6);
    expect($$('thead th').map((th) => th.textContent)).toEqual([
      'Category',
      'This year',
      'Last year',
    ]);
    expect($$('tbody tr').map((tr) => tr.textContent)).toEqual([
      'North3025',
      'South2028',
      'West4035',
    ]);
    expect($$('.ts-chart__bar-x')).toHaveLength(0);
  });

  it('tells series apart by fill pattern, in the bars and the legend', () => {
    render(<BarChart title="Orders" series={REGIONS} />);
    const fills = new Set($$('.ts-chart__bar > *').map((p) => p.getAttribute('fill')));
    expect(fills.size).toBe(2);
    const swatches = $$('.ui-chart-legend rect').map((r) => r.getAttribute('fill'));
    expect(new Set(swatches)).toEqual(fills);
    // the patterns exist in the document, and differ from one another
    const patterns = $$('pattern');
    expect(patterns).toHaveLength(8); // one per series colour (chart-1..8)
    expect(patterns[0]?.children).toHaveLength(1);
    expect(patterns[1]?.children.length).toBeGreaterThan(1);
  });

  it('stacks: the same bars, one stack per category', () => {
    render(<BarChart title="Orders" series={REGIONS} layout="stacked" />);
    const bars = $$('.ts-chart__bar > *');
    expect(bars).toHaveLength(6);
    // a stack shares one x position per category (grouped bars each have their own)
    const left = (p: HTMLElement) =>
      p.getAttribute('x') ?? /M([\d.]+)/.exec(p.getAttribute('d') ?? '')?.[1];
    const lefts = bars.map((b) => Number(left(b))).sort((p, q) => p - q);
    const clusters = lefts.filter((v, i) => i === 0 || v - (lefts[i - 1] as number) > 12).length;
    expect(clusters).toBe(3);
    expect($$('tbody tr')).toHaveLength(3);
    expect($$('svg[role="img"]')[0]?.getAttribute('aria-label')).toContain('Stacked bar chart');
    // a stack is labelled with its total
    expect($$('.ts-chart__text text').map((t) => t.textContent)).toEqual(['55', '48', '75']);
  });

  it('horizontal: rows top to bottom in data order, labels left, value at the bar end', () => {
    render(
      <BarChart
        title="Pages"
        orientation="horizontal"
        valueFormat={(n) => `${n} views`}
        data={[
          { label: 'Home', value: 120 },
          { label: 'Pricing', value: 80 },
          { label: 'Docs', value: 40 },
        ]}
      />,
    );
    expect($$('.ts-chart__bar-x > *')).toHaveLength(3);
    const ticks = $$('.ts-chart__axes text').filter((t) =>
      t.getAttribute('data-ts-key')?.startsWith('y-tick'),
    );
    expect(ticks.map((t) => t.textContent)).toEqual(['Home', 'Pricing', 'Docs']);
    const ys = ticks.map((t) => Number(t.getAttribute('y')));
    expect(ys).toEqual([...ys].sort((p, q) => p - q));
    // category labels sit left of the plot, right-aligned
    for (const t of ticks) expect(t.getAttribute('text-anchor')).toBe('end');
    // each value is written after the end of its bar
    const values = $$('.ts-chart__text text');
    expect(values.map((t) => t.textContent)).toEqual(['120 views', '80 views', '40 views']);
    for (const v of values) expect(v.getAttribute('text-anchor')).toBe('start');
    expect($$('svg[role="img"]')[0]?.getAttribute('aria-label')).toContain('Horizontal bar chart');
  });

  it('keeps the single-series API: data, yFormat, value labels off', () => {
    render(
      <BarChart
        title="Orders"
        data={[{ label: 'N', value: 4 }]}
        yFormat={(n) => `${n}!`}
        valueLabels={false}
      />,
    );
    expect($$('tbody td').map((td) => td.textContent)).toEqual(['4!']);
    expect($$('.ts-chart__text')).toHaveLength(0);
    expect($$('.ui-chart-legend')).toHaveLength(0);
  });

  it('legend toggles a series out of the bars but not the table, and keeps one visible', () => {
    render(<BarChart title="Orders" series={REGIONS} />);
    const [a, b] = $$('.ui-chart-legend button');
    expect([a?.getAttribute('aria-pressed'), b?.getAttribute('aria-pressed')]).toEqual([
      'true',
      'true',
    ]);
    click(b);
    expect($$('.ts-chart__bar > *')).toHaveLength(3);
    expect($$('.ui-chart-legend button')[1]?.getAttribute('aria-pressed')).toBe('false');
    expect($$('thead th')).toHaveLength(3); // the table keeps every series
    expect($$('tbody tr')[0]?.textContent).toBe('North3025');
    // the last visible one cannot be hidden
    click($$('.ui-chart-legend button')[0]);
    expect($$('.ui-chart-legend button')[0]?.getAttribute('aria-pressed')).toBe('true');
    expect($$('.ts-chart__bar > *')).toHaveLength(3);
    click($$('.ui-chart-legend button')[1]);
    expect($$('.ts-chart__bar > *')).toHaveLength(6);
  });

  it('thins crowded category labels instead of letting them overlap', () => {
    const many = days(24).map((d, i) => ({ label: d, value: i + 1 }));
    render(<BarChart title="Daily" data={many} />);
    const labels = $$('.ts-chart__axes text')
      .filter((t) => t.getAttribute('data-ts-key')?.startsWith('x-tick'))
      .map((t) => Number(t.getAttribute('x')));
    expect(labels.length).toBeGreaterThan(1);
    expect(labels.length).toBeLessThan(24);
    for (let i = 1; i < labels.length; i++)
      expect((labels[i] as number) - (labels[i - 1] as number)).toBeGreaterThanOrEqual(60);
    // every category is still in the table
    expect($$('tbody tr')).toHaveLength(24);
  });
});

describe('LineChart: area, comparison, legend, ticks', () => {
  it('area draws a gradient fill under each line; without it there is none', () => {
    render(<LineChart title="Sales" series={DAILY} area />);
    expect($$('.ts-chart__area path')).toHaveLength(2);
    expect($$('linearGradient')).toHaveLength(2);
    for (const p of $$('.ts-chart__area path')) expect(p.getAttribute('fill')).toMatch(/^url\(#/);
    expect($$('stop')[0]?.getAttribute('stop-color')).toBe('var(--chart-1)');
    render(<LineChart title="Sales" series={DAILY} />);
    expect($$('.ts-chart__area')).toHaveLength(0);
    expect($$('linearGradient')).toHaveLength(0);
  });

  it('AreaChart is the same chart with the fill on, and can stack', () => {
    render(<AreaChart title="Sales" series={DAILY} />);
    expect($$('.ts-chart__area path')).toHaveLength(2);
    render(<AreaChart title="Sales" series={DAILY} stacked />);
    expect($$('.ts-chart__area path')).toHaveLength(2);
    expect($$('svg[role="img"]')[0]?.getAttribute('aria-label')).toContain('Stacked area chart');
    // the table still carries each series' own value, not the running total
    expect($$('tbody tr')[0]?.textContent).toBe('2026-09-01106');
  });

  it('draws a comparison series dashed, thinner, with no markers or fill', () => {
    render(<LineChart title="Week" series={THIS_VS_LAST} area />);
    const lines = $$('.ts-chart__line path');
    expect(lines).toHaveLength(2);
    expect(lines[0]?.getAttribute('stroke-dasharray')).toBeNull();
    expect(lines[1]?.getAttribute('stroke-dasharray')).toBe('3 4');
    expect(Number(lines[1]?.getAttribute('stroke-width'))).toBeLessThan(
      Number(lines[0]?.getAttribute('stroke-width')),
    );
    expect($$('.ui-chart-markers')).toHaveLength(1); // only the primary series has markers
    expect($$('.ts-chart__area path')).toHaveLength(1);
    // the legend shows it dashed too
    expect(
      $$('.ui-chart-legend li')[1]?.querySelector('line')?.getAttribute('stroke-dasharray'),
    ).toBe('3 4');
  });

  it('legend toggles a line out of the drawing, the readout and the axis range, never the table', () => {
    render(<LineChart title="Week" series={THIS_VS_LAST} />);
    expect($$('.ts-chart__line path')).toHaveLength(2);
    click($$('.ui-chart-legend button')[1]);
    expect($$('.ts-chart__line path')).toHaveLength(1);
    expect($$('thead th').map((th) => th.textContent)).toEqual(['x', 'This week', 'Last week']);
    const svg = $$('svg[role="img"]')[0] as HTMLElement;
    act(() => svg.focus());
    act(() => {
      svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect($$('.ui-chart-readout')[0]?.textContent).toBe('TueThis week6');
    // the last one shown stays
    click($$('.ui-chart-legend button')[0]);
    expect($$('.ts-chart__line path')).toHaveLength(1);
    expect($$('.ui-chart-legend button')[0]?.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows ISO dates as short en-GB labels and thins the axis so none collide', () => {
    render(<LineChart title="Sales" series={DAILY} />);
    const ticks = $$('.ts-chart__axes text').filter((t) =>
      t.getAttribute('data-ts-key')?.startsWith('x-tick'),
    );
    const texts = ticks.map((t) => t.textContent ?? '');
    expect(texts[0]).toBe('1 Sept');
    for (const t of texts) expect(t).toMatch(/^\d{1,2} Sep/);
    expect(ticks.length).toBeLessThan(30);
    const xs = ticks.map((t) => Number(t.getAttribute('x')));
    for (let i = 1; i < xs.length; i++)
      expect((xs[i] as number) - (xs[i - 1] as number)).toBeGreaterThanOrEqual(65);
    // the table keeps the full ISO date
    expect($$('tbody th')[0]?.textContent).toBe('2026-09-01');
  });

  it('has a narrower budget on a narrow chart, and an xFormat override', () => {
    render(<LineChart title="Sales" series={DAILY} xFormat={(x) => x.slice(8)} />);
    const texts = $$('.ts-chart__axes text')
      .filter((t) => t.getAttribute('data-ts-key')?.startsWith('x-tick'))
      .map((t) => t.textContent);
    expect(texts[0]).toBe('01');
  });
});

describe('axis helpers', () => {
  it('formats ISO dates by span', () => {
    const short = defaultXFormat(['2026-09-02', '2026-09-30']);
    expect(short('2026-09-02')).toBe('2 Sept');
    const long = defaultXFormat(['2025-01-15', '2026-09-15']);
    expect(long('2026-09-15')).toBe('Sept 26');
    expect(defaultXFormat(['Mon', 'Tue'])('Mon')).toBe('Mon');
    expect(allIsoDates(['2026-09-02', '2026-09-03T10:00:00Z'])).toBe(true);
    expect(allIsoDates(['2026-09-02', 'Mon'])).toBe(false);
    expect(allIsoDates([])).toBe(false);
  });

  it('thins labels to the room there is, keeping the first and spacing evenly', () => {
    const items = Array.from({ length: 30 }, (_, i) => i);
    const kept = thinLabels(items, 600, 72);
    expect(kept[0]).toBe(0);
    expect(kept.length).toBeLessThanOrEqual(Math.floor(600 / 72));
    const step = (kept[1] as number) - (kept[0] as number);
    for (let i = 1; i < kept.length; i++)
      expect((kept[i] as number) - (kept[i - 1] as number)).toBe(step);
    expect(thinLabels(items.slice(0, 5), 600, 72)).toHaveLength(5);
    expect(thinLabels([], 600, 72)).toEqual([]);
    expect(labelRoom(['a'])).toBe(72);
    expect(labelRoom(['a very long label indeed'])).toBeGreaterThan(72);
  });
});

describe('empty states', () => {
  it('every chart says so when there is no data, and does not crash', () => {
    render(
      <>
        <LineChart title="Line" series={[]} />
        <LineChart title="Line b" series={[{ name: 'A', points: [] }]} />
        <BarChart title="Bars" data={[]} />
        <BarChart title="Bars b" series={[]} emptyMessage="Nothing sold yet." />
        <DonutChart title="Donut" data={[]} />
        <AreaChart title="Area" series={[]} />
      </>,
    );
    expect($$('figure')).toHaveLength(6);
    expect($$('.ui-chart-empty').map((p) => p.textContent)).toEqual([
      'No data to show.',
      'No data to show.',
      'No data to show.',
      'Nothing sold yet.',
      'No data to show.',
      'No data to show.',
    ]);
    expect($$('svg[role="img"]')).toHaveLength(0);
    expect($$('table')).toHaveLength(0);
    // the title is still the figure's caption
    expect($$('figcaption')[0]?.textContent).toBe('Line');
  });
});

describe('Sparkline options', () => {
  const paths = () => $$('svg path');
  it('draws the area and the end-point dot by default', () => {
    render(<Sparkline label="Signups" values={[3, 9, 1, 5]} />);
    expect(paths()).toHaveLength(2);
    expect($$('svg circle')).toHaveLength(1);
  });
  it('area and dot can be turned off', () => {
    render(<Sparkline label="Signups" values={[3, 9, 1, 5]} area={false} dot={false} />);
    expect(paths()).toHaveLength(1);
    expect($$('svg circle')).toHaveLength(0);
  });
  it('tone auto colours by trend and says up or down in words', () => {
    render(
      <>
        <Sparkline label="Up" values={[1, 2, 5]} tone="auto" />
        <Sparkline label="Down" values={[5, 2, 1]} tone="auto" />
        <Sparkline label="Flat" values={[2, 2]} tone="auto" />
      </>,
    );
    const [up, down, flat] = $$('svg');
    expect(up?.getAttribute('aria-label')).toBe('Up: from 1 to 5, low 1, high 5, up');
    expect(down?.getAttribute('aria-label')).toBe('Down: from 5 to 1, low 1, high 5, down');
    expect(flat?.getAttribute('aria-label')).not.toMatch(/up|down/);
    expect(up?.querySelector('circle')?.getAttribute('fill')).toBe('var(--up)');
    expect(down?.querySelector('circle')?.getAttribute('fill')).toBe('var(--down)');
    expect(flat?.querySelector('circle')?.getAttribute('fill')).toBe('var(--chart-1)');
  });
});

describe('ChartCard', () => {
  it('shows header, actions, chart and footer', () => {
    render(
      <ChartCard
        title="Revenue"
        eyebrow="Sales"
        description="Monthly"
        actions={<button type="button">30 days</button>}
        footer="Updated 09:00"
      >
        <LineChart title="Revenue" series={THIS_VS_LAST} />
      </ChartCard>,
    );
    expect($$('h3')[0]?.textContent).toBe('Revenue');
    expect($$('.ui-chart-card-eyebrow')[0]?.textContent).toBe('Sales');
    expect($$('.ui-chart-card-actions button')[0]?.textContent).toBe('30 days');
    expect($$('.ui-chart-card-footnote')[0]?.textContent).toBe('Updated 09:00');
    // the chart's own caption is kept for assistive tech but not shown twice
    expect($$('figcaption')[0]?.classList.contains('ui-sr-only')).toBe(true);
    expect($$('svg[role="img"]')).toHaveLength(1);
  });

  it('"Show data table" makes the one table visible, with its caption, and hides it again', () => {
    render(
      <ChartCard title="Orders">
        <BarChart title="Orders" series={REGIONS} />
      </ChartCard>,
    );
    const sw = $$('button[role="switch"]')[0] as HTMLElement;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect($$('table')).toHaveLength(1);
    expect($$('table')[0]?.classList.contains('ui-sr-only')).toBe(true);
    expect($$('.ui-chart-table-wrap')).toHaveLength(0);

    click(sw);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    const wrap = $$('.ui-chart-table-wrap')[0] as HTMLElement;
    expect(wrap.tagName).toBe('SECTION');
    expect(wrap.getAttribute('aria-label')).toBe('Orders: data table');
    expect(wrap.tabIndex).toBe(0);
    expect($$('table')).toHaveLength(1); // one source, not a copy
    const table = $$('table')[0] as HTMLElement;
    expect(table.classList.contains('ui-sr-only')).toBe(false);
    expect(table.querySelector('caption')?.textContent).toBe(
      'Orders: data table'.replace('data table', 'data'),
    );
    expect($$('tbody tr')).toHaveLength(3);

    click(sw);
    expect($$('.ui-chart-table-wrap')).toHaveLength(0);
    expect($$('table')[0]?.classList.contains('ui-sr-only')).toBe(true);
  });

  it('can be controlled', () => {
    const seen: boolean[] = [];
    render(
      <ChartCard title="Orders" showTable={false} onShowTableChange={(v) => seen.push(v)}>
        <BarChart title="Orders" data={[{ label: 'A', value: 1 }]} />
      </ChartCard>,
    );
    click($$('button[role="switch"]')[0]);
    expect(seen).toEqual([true]);
    expect($$('.ui-chart-table-wrap')).toHaveLength(0); // the parent has not said yes
  });

  it('loading: an aria-busy skeleton that announces itself; no chart; switch disabled', () => {
    render(
      <ChartCard title="Revenue" loading height={180}>
        <LineChart title="Revenue" series={THIS_VS_LAST} />
      </ChartCard>,
    );
    const busy = $$('[aria-busy="true"]')[0] as HTMLElement;
    expect(busy.querySelector('[role="status"]')?.textContent).toBe('Loading Revenue');
    expect($$('.ui-skeleton')).toHaveLength(1);
    expect($$('svg[role="img"]')).toHaveLength(0);
    expect(($$('button[role="switch"]')[0] as HTMLButtonElement).disabled).toBe(true);
  });

  it('error: your node in an alert', () => {
    render(
      <ChartCard
        title="Revenue"
        error={
          <span>
            Could not load revenue. <button type="button">Retry</button>
          </span>
        }
      >
        <LineChart title="Revenue" series={THIS_VS_LAST} />
      </ChartCard>,
    );
    const alert = $$('[role="alert"]')[0] as HTMLElement;
    expect(alert.textContent).toContain('Could not load revenue.');
    expect(alert.querySelector('button')?.textContent).toBe('Retry');
    expect($$('svg[role="img"]')).toHaveLength(0);
  });

  it('empty: a message in place of the chart', () => {
    render(
      <>
        <ChartCard title="A" empty>
          <LineChart title="A" series={THIS_VS_LAST} />
        </ChartCard>
        <ChartCard title="B" empty={<p>No orders this week.</p>}>
          <LineChart title="B" series={THIS_VS_LAST} />
        </ChartCard>
      </>,
    );
    expect($$('.ui-chart-empty')[0]?.textContent).toBe('No data to show.');
    expect($$('.ui-chart-card-state')[1]?.textContent).toBe('No orders this week.');
    expect($$('svg[role="img"]')).toHaveLength(0);
  });

  it('a chart with no data inside a card says so itself', () => {
    render(
      <ChartCard title="Orders">
        <BarChart title="Orders" data={[]} />
      </ChartCard>,
    );
    expect($$('.ui-chart-empty')[0]?.textContent).toBe('No data to show.');
  });
});

describe('ChartCard: axe in every skin and mode', () => {
  const charts: [string, ReactNode][] = [
    ['line', <LineChart key="l" title="Revenue" series={THIS_VS_LAST} area />],
    ['area', <AreaChart key="a" title="Revenue" series={DAILY} stacked />],
    ['bar', <BarChart key="b" title="Orders" series={REGIONS} layout="stacked" />],
    [
      'horizontal bar',
      <BarChart
        key="h"
        title="Orders"
        orientation="horizontal"
        data={[
          { label: 'Home', value: 120 },
          { label: 'Docs', value: 40 },
        ]}
      />,
    ],
    [
      'donut',
      <DonutChart
        key="d"
        title="Mix"
        data={[
          { label: 'X', value: 3 },
          { label: 'Y', value: 1 },
        ]}
      />,
    ],
  ];
  const passes = [
    ['enterprise', 'dark'],
    ['enterprise', 'light'],
    ['glass', 'dark'],
    ['glass', 'light'],
  ] as const;

  for (const [name, chart] of charts) {
    it(`${name}: no violations (table off and on)`, async () => {
      render(
        <ChartCard title="Card" actions={<button type="button">Range</button>} footer="Footer">
          {chart}
        </ChartCard>,
      );
      for (const showTable of [false, true]) {
        const sw = $$('button[role="switch"]')[0] as HTMLElement;
        if ((sw.getAttribute('aria-checked') === 'true') !== showTable) click(sw);
        for (const [skin, theme] of passes) {
          document.documentElement.setAttribute('data-skin', skin);
          document.documentElement.setAttribute('data-theme', theme);
          const result = await axe.run(host, {
            runOnly: {
              type: 'tag',
              values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
            },
            // jsdom has no layout: contrast is measured by the real-browser gate (npm run a11y)
            rules: { 'color-contrast': { enabled: false } },
            resultTypes: ['violations'],
          });
          expect(
            result.violations.map(
              (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
            ),
            `${name} ${skin} ${theme} table=${showTable}`,
          ).toEqual([]);
        }
      }
      document.documentElement.removeAttribute('data-skin');
      document.documentElement.removeAttribute('data-theme');
    });
  }
});
