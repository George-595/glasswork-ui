// @vitest-environment jsdom
/* The data-viz imports: ActivityHeatmap, Gauge, UsageMeter, Treemap, Timeline (and the pure
   squarify / heatLevel / fitLabel behind them), plus KpiTile's countUp prop. Behaviour, keyboard,
   and axe in all four skin × mode passes. */
import axe from 'axe-core';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HEAT_DAYS, VizShowcase } from '../fixture/VizShowcase';
import {
  ActivityHeatmap,
  ChartCard,
  fitLabel,
  Gauge,
  heatLevel,
  KpiTile,
  squarify,
  Timeline,
  TimelineItem,
  Treemap,
  UsageMeter,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
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
const key = (el: Element | null, k: string, init: KeyboardEventInit = {}) =>
  act(() => {
    el?.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, ...init }));
  });

describe('squarify', () => {
  const rect = { x: 0, y: 0, w: 400, h: 200 };
  const items = [
    { id: 'a', value: 50 },
    { id: 'b', value: 30 },
    { id: 'c', value: 15 },
    { id: 'd', value: 5 },
    { id: 'z', value: 0 },
  ];
  it('tiles the rectangle exactly, in proportion', () => {
    const out = squarify(items, rect);
    const area = (id: string) => {
      const r = out.get(id);
      return r ? r.w * r.h : Number.NaN;
    };
    const total = items.reduce((a, i) => a + area(i.id), 0);
    expect(total).toBeCloseTo(400 * 200, 3);
    expect(area('a') / total).toBeCloseTo(0.5, 5);
    expect(area('d') / total).toBeCloseTo(0.05, 5);
  });
  it('keeps every tile inside the rectangle and gives a zero value a zero rect', () => {
    const out = squarify(items, rect);
    for (const r of out.values()) {
      expect(r.x).toBeGreaterThanOrEqual(-1e-6);
      expect(r.y).toBeGreaterThanOrEqual(-1e-6);
      expect(r.x + r.w).toBeLessThanOrEqual(400 + 1e-6);
      expect(r.y + r.h).toBeLessThanOrEqual(200 + 1e-6);
    }
    expect(out.get('z')).toMatchObject({ w: 0, h: 0 });
  });
  it('handles nothing to draw', () => {
    expect(squarify([], rect).size).toBe(0);
    expect(squarify([{ id: 'a', value: 0 }], rect).get('a')).toMatchObject({ w: 0 });
  });
});

describe('heatLevel and fitLabel', () => {
  it('maps counts onto five levels by quarters of the busiest day', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => heatLevel(n, 8))).toEqual([
      0, 1, 1, 2, 2, 3, 3, 4, 4,
    ]);
  });
  it('takes explicit thresholds', () => {
    expect([1, 5, 10, 50].map((n) => heatLevel(n, 50, [2, 10, 20]))).toEqual([1, 2, 2, 4]);
  });
  it('hides a label that cannot fit and clips one that is too long', () => {
    expect(fitLabel('Software', 30)).toBeNull();
    expect(fitLabel('Software', 200)).toBe('Software');
    const clipped = fitLabel('A very long category name', 100);
    expect(clipped?.endsWith('…')).toBe(true);
    expect((clipped?.length ?? 99) < 25).toBe(true);
  });
});

describe('ActivityHeatmap', () => {
  const small = [
    { date: '2026-08-03', count: 2 }, // Monday
    { date: '2026-08-05', count: 8 },
    { date: '2026-08-12', count: 1 },
    { date: '2026-08-16', count: 4 }, // Sunday
  ];
  const heatmap = (extra: Partial<Parameters<typeof ActivityHeatmap>[0]> = {}) =>
    render(
      <ActivityHeatmap
        title="Transactions"
        days={small}
        unit={{ one: 'transaction', other: 'transactions' }}
        {...extra}
      />,
    );

  it('is a grid of seven weekday rows with every day named', () => {
    heatmap();
    const grid = $$('[role="grid"]')[0];
    expect(grid?.getAttribute('aria-label')).toContain('Transactions');
    expect($$('[role="row"]', grid)).toHaveLength(7);
    const cells = $$('[role="gridcell"]', grid);
    expect(cells).toHaveLength(14); // 3 Aug to 16 Aug: two whole weeks
    expect(cells[0]?.getAttribute('aria-label')).toBe('Mon, 3 Aug 2026: 2 transactions');
    expect($$('[data-date="2026-08-12"]')[0]?.getAttribute('aria-label')).toContain(
      '1 transaction',
    );
    expect($$('[data-date="2026-08-12"]')[0]?.getAttribute('aria-label')).not.toContain(
      'transactions',
    );
    expect($$('[data-date="2026-08-04"]')[0]?.getAttribute('aria-label')).toContain(
      '0 transactions',
    );
  });

  it('has exactly one tab stop, and arrows move by day and week', () => {
    heatmap();
    const stops = () => $$('[role="gridcell"][tabindex="0"]');
    expect(stops()).toHaveLength(1);
    const first = $$('[data-date="2026-08-03"]')[0] as HTMLElement;
    act(() => first.focus());
    key(first, 'ArrowDown');
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-08-04');
    key(document.activeElement, 'ArrowRight');
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-08-11');
    key(document.activeElement, 'ArrowLeft');
    key(document.activeElement, 'ArrowLeft'); // nothing before the range: stays
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-08-04');
    expect(stops()).toHaveLength(1);
    expect(stops()[0]?.getAttribute('data-date')).toBe('2026-08-04');
    key(document.activeElement, 'End', { ctrlKey: true });
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-08-16');
    key(document.activeElement, 'Home', { ctrlKey: true });
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-08-03');
    key(document.activeElement, 'End');
    expect(document.activeElement?.getAttribute('data-date')).toBe('2026-08-10');
  });

  it('shows the focused day in the readout line, and reports a chosen day', () => {
    const chosen: string[] = [];
    heatmap({ onSelectDate: (d) => chosen.push(d) });
    const cell = $$('[data-date="2026-08-05"]')[0] as HTMLElement;
    act(() => cell.focus());
    expect($$('.ui-heatmap-readout')[0]?.textContent).toContain('8 transactions');
    key(cell, 'Enter');
    act(() => cell.click());
    expect(chosen).toEqual(['2026-08-05', '2026-08-05']);
  });

  it('draws five visibly distinct levels and the busiest day is the top one', () => {
    heatmap();
    expect($$('[data-date="2026-08-05"]')[0]?.getAttribute('data-level')).toBe('4');
    expect($$('[data-date="2026-08-04"]')[0]?.getAttribute('data-level')).toBe('0');
  });

  it('starts weeks on Sunday on request', () => {
    heatmap({ weekStartsOn: 0 });
    const rows = $$('[role="row"]');
    expect(rows[0]?.querySelectorAll('[role="gridcell"]')[0]?.getAttribute('aria-label')).toContain(
      'Sun',
    );
  });

  it('lists every day in the data table the card can show', () => {
    render(
      <ChartCard title="Card" defaultShowTable>
        <ActivityHeatmap title="Transactions" days={small} />
      </ChartCard>,
    );
    const table = $$('table.ui-chart-table')[0];
    expect($$('tbody tr', table)).toHaveLength(14);
    expect(table?.textContent).toContain('Wed, 5 Aug 2026');
  });

  it('says so when there is nothing to draw', () => {
    render(<ActivityHeatmap title="Transactions" days={[]} emptyMessage="Quiet." />);
    expect($$('.ui-chart-empty')[0]?.textContent).toBe('Quiet.');
    expect($$('[role="grid"]')).toHaveLength(0);
  });
});

describe('Gauge', () => {
  it('is a meter with the tone as a word', () => {
    render(<Gauge label="Pass rate" value={91} low={70} high={85} optimum={100} />);
    const m = $$('[role="meter"]')[0];
    expect(m?.getAttribute('aria-valuenow')).toBe('91');
    expect(m?.getAttribute('aria-valuetext')).toBe('91, Good');
    expect(m?.textContent).toContain('Good');
    render(<Gauge label="Refunds" value={14} low={5} high={10} optimum={0} />);
    expect($$('[role="meter"]')[0]?.getAttribute('aria-valuetext')).toBe('14, Poor');
    render(<Gauge label="Mid" value={45} low={30} high={60} optimum={90} />);
    expect($$('[role="meter"]')[0]?.getAttribute('aria-valuetext')).toBe('45, Caution');
  });
  it('is neutral and wordless without regions, and clamps to its range', () => {
    render(<Gauge label="Load" value={140} max={100} />);
    const m = $$('[role="meter"]')[0];
    expect(m?.getAttribute('data-tone')).toBe('neutral');
    expect(m?.getAttribute('aria-valuenow')).toBe('100');
    expect(m?.getAttribute('aria-valuetext')).toBe('100');
  });
  it('draws no value arc at zero', () => {
    render(<Gauge label="Load" value={0} />);
    expect($$('svg path.hidden')).toHaveLength(1);
  });
});

describe('UsageMeter', () => {
  const parts = [
    { id: 'a', label: 'Docs', value: 30 },
    { id: 'b', label: 'Images', value: 20 },
  ];
  it('names every part and the total on the meter', () => {
    render(
      <UsageMeter label="Storage" limit={100} segments={parts} formatValue={(v) => `${v} GB`} />,
    );
    const m = $$('[role="meter"]')[0];
    expect(m?.getAttribute('aria-valuenow')).toBe('50');
    expect(m?.getAttribute('aria-valuemax')).toBe('100');
    expect(m?.getAttribute('aria-valuetext')).toContain('50 GB of 100 GB used (50%)');
    expect(m?.getAttribute('aria-valuetext')).toContain('Docs 30 GB, Images 20 GB');
    expect($$('.ui-usage-legend li')).toHaveLength(3); // two parts and the free space
    expect(m?.getAttribute('data-state')).toBe('ok');
  });
  it('says almost full and over limit in words', () => {
    render(
      <UsageMeter label="Seats" limit={50} segments={[{ id: 'a', label: 'All', value: 46 }]} />,
    );
    expect($$('.ui-usage-figure')[0]?.textContent).toContain('Almost full');
    render(
      <UsageMeter label="Seats" limit={50} segments={[{ id: 'a', label: 'All', value: 60 }]} />,
    );
    const m = $$('[role="meter"]')[0];
    expect($$('.ui-usage-figure')[0]?.textContent).toContain('Over limit');
    expect(m?.getAttribute('aria-valuenow')).toBe('50');
    expect(m?.getAttribute('aria-valuetext')).toContain('Over the limit');
  });
});

describe('Treemap', () => {
  const data = [
    { label: 'Software', value: 48 },
    { label: 'Hardware', value: 32 },
    { label: 'Travel', value: 12 },
    { label: 'Office', value: 8 },
  ];
  it('is a list of named tiles with one tab stop and the data in a table', () => {
    render(
      <ChartCard title="Card" defaultShowTable>
        <Treemap title="Spend" data={data} />
      </ChartCard>,
    );
    const tiles = $$('[role="listitem"]');
    expect(tiles).toHaveLength(4);
    expect(tiles[0]?.getAttribute('aria-label')).toBe('Software: 48, 48%');
    expect(tiles.filter((t) => t.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect($$('table.ui-chart-table tbody tr')).toHaveLength(4);
  });
  it('moves with arrows and Home/End, and the readout follows', () => {
    render(<Treemap title="Spend" data={data} />);
    const first = $$('[role="listitem"]')[0] as HTMLElement;
    act(() => first.focus());
    key(first, 'ArrowRight');
    expect(document.activeElement?.getAttribute('data-tile')).toBe('1');
    expect($$('.ui-treemap-readout')[0]?.textContent).toContain('Hardware');
    key(document.activeElement, 'End');
    expect(document.activeElement?.getAttribute('data-tile')).toBe('3');
    key(document.activeElement, 'Home');
    expect(document.activeElement?.getAttribute('data-tile')).toBe('0');
  });
  it('labels the tiles that have room and not the others', () => {
    render(
      <Treemap
        title="Spend"
        height={200}
        data={[
          { label: 'Software', value: 1000 },
          { label: 'Tiny', value: 1 },
        ]}
      />,
    );
    const text = $$('svg text').map((t) => t.textContent);
    expect(text).toContain('Software');
    expect(text).not.toContain('Tiny');
  });
  it('says so when empty', () => {
    render(<Treemap title="Spend" data={[]} />);
    expect($$('.ui-chart-empty')).toHaveLength(1);
  });
});

describe('Timeline', () => {
  it('is an ordered list whose dots are named in words', () => {
    render(
      <Timeline aria-label="History">
        <TimelineItem title="Placed" />
        <TimelineItem
          tone="success"
          title="Paid"
          time={<time dateTime="2026-09-01">1 Sept</time>}
        />
        <TimelineItem tone="danger" title="Delivery failed" />
        <TimelineItem tone="warning" title="Check address" status="Needs a review" />
      </Timeline>,
    );
    expect($$('ol')).toHaveLength(1);
    const items = $$('li');
    expect(items).toHaveLength(4);
    expect(items[0]?.textContent).toBe('Placed');
    expect(items[1]?.textContent).toContain('Completed: Paid');
    expect(items[2]?.textContent).toContain('Failed: Delivery failed');
    expect(items[3]?.textContent).toContain('Needs a review: Check address');
    // each non-neutral tone has its own glyph, so colour is never the only cue
    expect(items[1]?.querySelector('.ui-timeline-dot svg')).not.toBeNull();
    expect(items[0]?.querySelector('.ui-timeline-dot svg')).toBeNull();
  });
});

describe('KpiTile countUp', () => {
  it('counts up by default and shows the figure at once with countUp={false}', () => {
    render(<KpiTile label="Revenue" value={1234} />);
    const rolls = $$('.ui-kpi-value .ui-roll');
    expect(rolls).toHaveLength(1);
    const roll = rolls[0] as Element;
    expect((roll.querySelector('.ui-sr-only') ?? roll).textContent).toBe('1,234');
    render(<KpiTile label="Revenue" value={1234} countUp={false} />);
    expect($$('.ui-kpi-value .ui-roll')).toHaveLength(0);
    expect($$('.ui-kpi-value')[0]?.textContent).toBe('1,234');
  });
});

describe('axe: the data-viz showcase in every skin and mode', () => {
  const passes = [
    ['enterprise', 'dark'],
    ['enterprise', 'light'],
    ['glass', 'dark'],
    ['glass', 'light'],
  ] as const;

  it('has no violations', async () => {
    render(
      <>
        <VizShowcase />
        <ChartCard title="Card" defaultShowTable>
          <ActivityHeatmap title="Visible table" days={HEAT_DAYS.slice(0, 40)} />
        </ChartCard>
      </>,
    );
    for (const [skin, theme] of passes) {
      document.documentElement.setAttribute('data-skin', skin);
      document.documentElement.setAttribute('data-theme', theme);
      const result = await axe.run(host, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        rules: { 'color-contrast': { enabled: false } },
        resultTypes: ['violations'],
      });
      expect(
        result.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
        `${skin} ${theme}`,
      ).toEqual([]);
    }
    document.documentElement.removeAttribute('data-skin');
    document.documentElement.removeAttribute('data-theme');
  });
});
