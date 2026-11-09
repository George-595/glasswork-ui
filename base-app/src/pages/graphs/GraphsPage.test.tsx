import { describe, expect, it } from 'vitest';
import { formatViolations, runAxe } from '~/test/axe';
import { click, getAllByRole, getByRole, press } from '~/test/dom';
import { mockApi } from '~/test/mockApi';
import { flush, render } from '~/test/render';
import { getTransactions } from '../../../fixtures/index.ts';
import GraphsPage from './GraphsPage';

const SERVER_ERROR = {
  status: 500,
  body: { ok: false, error: { code: 'internal_error', message: 'Boom' } },
};

const STATUSES = ['paid', 'pending', 'failed', 'refunded'] as const;
const CATEGORIES = ['Software', 'Hardware', 'Services', 'Travel', 'Office'] as const;

/* The shared mock has no spend-by-status route; this answers it from the same fixtures the
   server seeds from, grouped the way the server groups it. */
const spendByStatus = {
  body: {
    ok: true,
    breakdown: STATUSES.map((status) => ({
      status,
      data: CATEGORIES.map((label) => ({
        label,
        value: getTransactions()
          .filter((t) => t.status === status && t.category === label)
          .reduce((a, t) => a + t.amountMinor, 0),
      })),
    })),
  },
};
const ROUTES = { 'GET /api/metrics/spend-by-status': spendByStatus };

function requested(api: ReturnType<typeof mockApi>): string[] {
  return api.fetch.mock.calls.map((c) => String(c[0]));
}

function card(title: string): HTMLElement {
  const el = Array.from(document.querySelectorAll<HTMLElement>('.ui-chart-card')).find(
    (c) => c.querySelector('h3')?.textContent === title,
  );
  if (!el) throw new Error(`no chart card titled ${title}`);
  return el;
}

const CHART_TITLES = [
  'Revenue and costs',
  'New sign-ups by month',
  'Spend by category and status',
  'Spend by category',
  'Category share',
  'Spend treemap',
  'Transactions per day',
];

function busyLabels(): string[] {
  return Array.from(document.querySelectorAll('[aria-busy="true"]')).map(
    (el) => el.getAttribute('aria-label') ?? el.textContent ?? '',
  );
}

function visibleTables(root: ParentNode): HTMLTableElement[] {
  return Array.from(root.querySelectorAll('table')).filter((t) => !t.closest('.ui-sr-only'));
}

describe('GraphsPage', () => {
  it('shows a skeleton for each chart and KPI while the data loads', async () => {
    const api = mockApi({ delay: true, routes: ROUTES });
    const view = await render(<GraphsPage />);
    await flush();

    expect(getByRole(document.body, 'heading', 'Graphs').tagName).toBe('H1');
    const busy = busyLabels().join(' | ');
    expect(busy).toContain('Loading key figures');
    for (const title of CHART_TITLES) expect(busy).toContain(`Loading ${title}`);
    expect(view.container.querySelectorAll('.ui-kpi-skeleton')).toHaveLength(4);
    expect(requested(api)).toEqual(
      expect.arrayContaining([
        '/api/metrics/revenue?days=30',
        '/api/metrics/signups',
        '/api/metrics/categories',
        '/api/metrics/kpis?days=30',
        '/api/metrics/spend-by-status',
      ]),
    );

    api.release();
    await flush();
    await view.unmount();
  });

  it('renders four KPI tiles with values, delta words and trends', async () => {
    mockApi({ routes: ROUTES });
    const view = await render(<GraphsPage />);
    await flush();
    const tiles = Array.from(view.container.querySelectorAll<HTMLElement>('.ui-kpi'));

    expect(tiles).toHaveLength(4);
    for (const t of tiles) {
      expect(t.querySelector('.ui-kpi-value')?.textContent).not.toBe('');
      expect(t.querySelector('.ui-delta')?.textContent).toMatch(/(up|down|no change)/);
      expect(t.querySelector('.ui-kpi-trend')).not.toBeNull();
      expect(t.textContent).toContain('vs previous 30 days');
    }
    await view.unmount();
  });

  it('draws seven charts, each in a kit ChartCard', async () => {
    mockApi({ routes: ROUTES });
    const view = await render(<GraphsPage />);
    await flush();

    expect(view.container.querySelectorAll('figure')).toHaveLength(7);
    expect(
      Array.from(view.container.querySelectorAll('.ui-chart-card h3')).map((h) => h.textContent),
    ).toEqual(CHART_TITLES);
    // the page keeps no table or card code of its own
    expect(view.container.querySelector('.app-chart-table')).toBeNull();
    expect(view.container.querySelector('.app-hbars')).toBeNull();
    await view.unmount();
  });

  it('adds the treemap, the gauges, the budget meter and the activity timeline', async () => {
    mockApi({ routes: ROUTES });
    const view = await render(<GraphsPage />);
    await flush();

    const tiles = view.container.querySelectorAll('[role="listitem"][data-tile]');
    expect(tiles).toHaveLength(5); // the five categories
    expect(view.container.querySelectorAll('[role="gridcell"]').length).toBeGreaterThan(150);
    const meters = Array.from(view.container.querySelectorAll('[role="meter"]')).map((m) =>
      m.getAttribute('aria-label'),
    );
    expect(meters).toEqual(['Payment success', 'Refund rate', 'Budget used']);
    const budget = view.container.querySelector('[role="meter"][aria-label="Budget used"]');
    expect(budget?.getAttribute('aria-valuetext')).toContain('Almost full');
    const timeline = view.container.querySelector('ol[aria-label="Latest activity"]');
    expect(timeline?.querySelectorAll('li')).toHaveLength(6);
    await view.unmount();
  });

  it('has a 30/60/90-day range control that refetches only the revenue chart', async () => {
    const api = mockApi({ routes: ROUTES });
    const view = await render(<GraphsPage />);
    await flush();
    const revenueCalls = () => requested(api).filter((u) => u.startsWith('/api/metrics/revenue'));

    expect(getAllByRole(document.body, 'radio').map((r) => r.textContent)).toEqual([
      '30 days',
      '60 days',
      '90 days',
    ]);
    expect(getByRole(document.body, 'radio', '30 days').getAttribute('aria-checked')).toBe('true');
    expect(revenueCalls()).toEqual(['/api/metrics/revenue?days=30']);

    await click(getByRole(document.body, 'radio', '60 days'));
    await flush();
    expect(revenueCalls()).toEqual([
      '/api/metrics/revenue?days=30',
      '/api/metrics/revenue?days=60',
    ]);
    expect(card('Revenue and costs').textContent).toContain('last 60 days');
    // the other panels were not asked again
    expect(requested(api).filter((u) => u === '/api/metrics/signups')).toHaveLength(1);
    expect(requested(api).filter((u) => u.startsWith('/api/metrics/kpis'))).toHaveLength(1);
    await view.unmount();
  });

  it('ArrowRight on the range control moves to the next range and fetches it', async () => {
    const api = mockApi({ routes: ROUTES });
    const view = await render(<GraphsPage />);
    await flush();

    await press(getByRole(document.body, 'radio', '30 days'), 'ArrowRight');
    await flush();
    expect(requested(api)).toContain('/api/metrics/revenue?days=60');
    await view.unmount();
  });

  it('each chart card switches to a visible data table and back', async () => {
    mockApi({ routes: ROUTES });
    const view = await render(<GraphsPage />);
    await flush();

    for (const title of CHART_TITLES) {
      const c = card(title);
      const toggle = c.querySelector('[role="switch"]') as Element;
      expect(visibleTables(c)).toHaveLength(0);
      await click(toggle);
      expect([title, visibleTables(c).length]).toEqual([title, 1]);
      await click(toggle);
      expect(visibleTables(c)).toHaveLength(0);
    }
    await view.unmount();
  });

  it('the stacked bar chart has one series per status, in the data table too', async () => {
    mockApi({ routes: ROUTES });
    const view = await render(<GraphsPage />);
    await flush();
    const c = card('Spend by category and status');

    await click(c.querySelector('[role="switch"]') as Element);
    const heads = Array.from(c.querySelectorAll('table thead th')).map((h) => h.textContent);
    expect(heads.slice(1)).toEqual(['Paid', 'Pending', 'Failed', 'Refunded']);
    expect(c.querySelectorAll('table tbody tr')).toHaveLength(5);
    await view.unmount();
  });

  it('the legend toggles a series out of the chart and back', async () => {
    mockApi({ routes: ROUTES });
    const view = await render(<GraphsPage />);
    await flush();
    const c = card('Revenue and costs');
    const costs = getByRole(c, 'button', 'Costs');

    expect(costs.getAttribute('aria-pressed')).toBe('true');
    await click(costs);
    expect(costs.getAttribute('aria-pressed')).toBe('false');
    // the data table keeps every series
    await click(c.querySelector('[role="switch"]') as Element);
    expect(Array.from(c.querySelectorAll('table thead th')).map((h) => h.textContent)).toContain(
      'Costs',
    );
    await click(costs);
    expect(costs.getAttribute('aria-pressed')).toBe('true');
    await view.unmount();
  });

  it('a failed revenue request shows its error in the card and Retry refetches it', async () => {
    let attempts = 0;
    const api = mockApi({
      routes: {
        ...ROUTES,
        'GET /api/metrics/revenue': () => {
          attempts += 1;
          return attempts === 1 ? SERVER_ERROR : { body: { ok: true, revenue: [], costs: [] } };
        },
      },
    });
    const view = await render(<GraphsPage />);
    await flush();

    expect(getByRole(document.body, 'alert').textContent).toContain('Couldn’t load revenue.');
    expect(
      card('Revenue and costs').querySelector('[role="switch"]')?.hasAttribute('disabled'),
    ).toBe(true);
    // the range control stays usable while the chart is down
    expect(getAllByRole(document.body, 'radio')).toHaveLength(3);
    await click(getByRole(document.body, 'button', 'Retry'));
    await flush();

    expect(api.calls.filter((c) => c === 'GET /api/metrics/revenue')).toHaveLength(2);
    expect(document.body.textContent).not.toContain('Couldn’t load revenue.');
    expect(card('Revenue and costs').textContent).toContain('No data to show.');
    await view.unmount();
  });

  it('a failed KPI request shows its own error and the charts still render', async () => {
    mockApi({ routes: { ...ROUTES, 'GET /api/metrics/kpis': SERVER_ERROR } });
    const view = await render(<GraphsPage />);
    await flush();

    expect(getByRole(document.body, 'alert').textContent).toContain('Couldn’t load key figures.');
    expect(view.container.querySelectorAll('.ui-kpi')).toHaveLength(0);
    expect(view.container.querySelectorAll('figure')).toHaveLength(7);
    await view.unmount();
  });

  it('a failed spend-by-status request only takes down the cards that use it', async () => {
    mockApi({ routes: { 'GET /api/metrics/spend-by-status': SERVER_ERROR } });
    const view = await render(<GraphsPage />);
    await flush();

    // the stacked chart and the budget meter share this one request, so both say so
    const alerts = getAllByRole(document.body, 'alert').map((a) => a.textContent);
    expect(alerts).toHaveLength(2);
    expect(alerts.some((t) => t?.includes('Couldn’t load spend by status.'))).toBe(true);
    expect(alerts.some((t) => t?.includes('Couldn’t load spend against budget.'))).toBe(true);
    expect(view.container.querySelectorAll('figure')).toHaveLength(6);
    await view.unmount();
  });
});

describe('a11y Graphs page', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['dark', 'light'] as const) {
      it(`on success · ${skin} · ${mode}`, async () => {
        mockApi({ routes: ROUTES });
        const view = await render(<GraphsPage />, { skin, mode });
        await flush();
        expect(formatViolations(await runAxe())).toBe('');
        await view.unmount();
      });

      it(`while loading · ${skin} · ${mode}`, async () => {
        const api = mockApi({ delay: true, routes: ROUTES });
        const view = await render(<GraphsPage />, { skin, mode });
        await flush();
        expect(formatViolations(await runAxe())).toBe('');
        api.release();
        await flush();
        await view.unmount();
      });
    }
  }
});
