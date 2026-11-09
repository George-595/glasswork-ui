import type { ReactElement } from 'react';
import { describe, expect, it } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { formatViolations, runAxe } from '~/test/axe';
import { click, getAllByRole, getByRole } from '~/test/dom';
import { mockApi, VIEWER } from '~/test/mockApi';
import { flush, render } from '~/test/render';
import { getRevenueSeries, getTransactions } from '../../../fixtures/index.ts';
import HomePage from './HomePage';

const SERVER_ERROR = {
  status: 500,
  body: { ok: false, error: { code: 'internal_error', message: 'Boom' } },
};

// Local time on purpose: the greeting follows the reader's clock.
const EVENING = new Date(2026, 9, 1, 19, 0);
const MORNING = new Date(2026, 9, 1, 8, 30);

const page = (now: Date = EVENING): ReactElement => (
  <AuthProvider>
    <HomePage now={now} />
  </AuthProvider>
);

function busyLabels(): string[] {
  return Array.from(document.querySelectorAll('[aria-busy="true"]')).map(
    (el) => el.getAttribute('aria-label') ?? el.textContent ?? '',
  );
}

function requested(api: ReturnType<typeof mockApi>): string[] {
  return api.fetch.mock.calls.map((c) => String(c[0]));
}

function card(title: string): HTMLElement {
  const el = Array.from(
    document.querySelectorAll<HTMLElement>('[role="group"], section[aria-labelledby]'),
  ).find((c) => {
    const id = c.getAttribute('aria-labelledby');
    return id && document.getElementById(id)?.textContent === title;
  });
  if (!el) throw new Error(`no card titled ${title}`);
  return el;
}

describe('HomePage', () => {
  it('greets the signed-in user by the time of day', async () => {
    mockApi();
    const evening = await render(page(EVENING));
    await flush();
    expect(evening.container.textContent).toContain('Good evening, Ada');
    expect(evening.container.querySelector('time[datetime="2026-10-01"]')?.textContent).toBe(
      'Thursday 1 October 2026',
    );
    await evening.unmount();

    const morning = await render(page(MORNING));
    await flush();
    expect(morning.container.textContent).toContain('Good morning, Ada');
    await morning.unmount();
  });

  it('shows a skeleton for each panel while the data loads', async () => {
    const api = mockApi({ delay: true });
    const view = await render(page());
    await flush();

    expect(getByRole(document.body, 'heading', 'Overview').tagName).toBe('H1');
    const busy = busyLabels().join(' | ');
    for (const label of [
      'Loading key figures',
      'Loading recent activity',
      'Loading Revenue and costs',
      'Loading Spend by category',
      'Loading Transactions per day',
      'Loading payment success',
    ]) {
      expect(busy).toContain(label);
    }
    expect(view.container.querySelectorAll('.ui-kpi-skeleton')).toHaveLength(4);
    expect(view.container.querySelectorAll('.ui-kpi:not(.ui-kpi-skeleton)')).toHaveLength(0);

    api.release();
    await flush();
    await view.unmount();
  });

  it('renders four KPI tiles with values, delta words, trends and a range footnote', async () => {
    mockApi();
    const view = await render(page());
    await flush();
    const tiles = Array.from(view.container.querySelectorAll<HTMLElement>('.ui-kpi'));

    expect(tiles).toHaveLength(4);
    expect(tiles.map((t) => t.querySelector('.ui-kpi-label')?.textContent)).toEqual([
      'Revenue, last 30 days',
      'Active users',
      'Conversion rate',
      'Open tickets',
    ]);
    for (const t of tiles) {
      expect(t.textContent).toContain('vs previous 30 days');
      expect(t.querySelector('.ui-kpi-trend')).not.toBeNull();
      // the change is in words as well as an arrow, never colour alone
      expect(t.querySelector('.ui-delta')?.textContent).toMatch(/(up|down|no change)/);
      // only the delta carries a direction; the figure itself stays plain ink
      expect(t.querySelector('.ui-kpi-value [data-direction]')).toBeNull();
      expect(t.querySelector('.ui-kpi-value')?.className).not.toMatch(/\b(up|down)\b/);
    }
    await view.unmount();
  });

  it('the range control refetches the KPIs and the revenue chart with the chosen days', async () => {
    const api = mockApi();
    const view = await render(page());
    await flush();

    const radios = getAllByRole(document.body, 'radio');
    expect(radios.map((r) => r.textContent)).toEqual(['7 days', '30 days', '90 days']);
    expect(getByRole(document.body, 'radio', '30 days').getAttribute('aria-checked')).toBe('true');
    expect(requested(api)).toContain('/api/metrics/kpis?days=30');
    expect(requested(api)).toContain('/api/metrics/revenue?days=30&compare=1');

    await click(getByRole(document.body, 'radio', '7 days'));
    await flush();
    expect(requested(api)).toContain('/api/metrics/kpis?days=7');
    expect(requested(api)).toContain('/api/metrics/revenue?days=7&compare=1');
    expect(view.container.textContent).toContain('vs previous 7 days');

    await click(getByRole(document.body, 'radio', '90 days'));
    await flush();
    expect(requested(api)).toContain('/api/metrics/kpis?days=90');
    expect(requested(api)).toContain('/api/metrics/revenue?days=90&compare=1');
    // each range was fetched once for each panel
    expect(requested(api).filter((u) => u.startsWith('/api/metrics/kpis'))).toHaveLength(3);
    await view.unmount();
  });

  it('draws the earlier period as a dashed comparison when the API sends it', async () => {
    const { revenue, costs } = getRevenueSeries(180);
    mockApi({
      routes: {
        'GET /api/metrics/revenue': {
          body: {
            ok: true,
            revenue: revenue.slice(90),
            costs: costs.slice(90),
            previousRevenue: revenue.slice(0, 90),
          },
        },
      },
    });
    const view = await render(page());
    await flush();

    const chart = card('Revenue and costs');
    expect(chart.textContent).toContain('Revenue, previous period');
    await click(chart.querySelector('[role="switch"]') as Element);
    const table = chart.querySelector('table');
    expect(Array.from(table?.querySelectorAll('thead th') ?? []).map((h) => h.textContent)).toEqual(
      ['x', 'Revenue', 'Costs', 'Revenue, previous period'],
    );
    await view.unmount();
  });

  it('draws transactions per day as a calendar heatmap and the payment success rate as a gauge', async () => {
    mockApi();
    const view = await render(page());
    await flush();

    const heat = card('Transactions per day');
    const cells = heat.querySelectorAll('[role="gridcell"]');
    expect(cells.length).toBeGreaterThan(150); // the seeded 180-day window
    const total = Array.from(cells).reduce(
      (a, c) =>
        a + Number(/: (\d+) transaction/.exec(c.getAttribute('aria-label') ?? '')?.[1] ?? 0),
      0,
    );
    expect(total).toBe(getTransactions().length);
    expect(heat.querySelectorAll('[role="gridcell"][tabindex="0"]')).toHaveLength(1);

    const gauge = view.container.querySelector('[role="meter"]');
    const paid = getTransactions().filter((t) => t.status === 'paid').length;
    const settled = paid + getTransactions().filter((t) => t.status === 'failed').length;
    expect(gauge?.getAttribute('aria-label')).toBe('Payment success');
    expect(Number(gauge?.getAttribute('aria-valuenow'))).toBeCloseTo((paid / settled) * 100, 5);
    expect(gauge?.getAttribute('aria-valuetext')).toMatch(/Caution|Good|Poor/);
    expect(view.container.textContent).toContain(`${paid} of ${settled} settled payments`);
    await view.unmount();
  });

  it('shows the revenue and spend charts in cards that can switch to a data table', async () => {
    mockApi();
    const view = await render(page());
    await flush();

    for (const title of ['Revenue and costs', 'Spend by category']) {
      const c = card(title);
      expect(c.querySelector('figure')).not.toBeNull();
      const visible = () =>
        Array.from(c.querySelectorAll('table')).filter((t) => !t.closest('.ui-sr-only'));
      expect(visible().length).toBe(0);
      await click(c.querySelector('[role="switch"]') as Element);
      expect(visible().length).toBe(1);
    }
    await view.unmount();
  });

  it('lists recent activity as a real list of eight events with relative times and kinds', async () => {
    mockApi();
    const view = await render(page());
    await flush();
    const feed = card('Recent activity');
    const list = feed.querySelector('ul');

    expect(list?.getAttribute('aria-label')).toBe('Recent activity');
    const items = Array.from(list?.querySelectorAll('li') ?? []);
    expect(items).toHaveLength(8);
    for (const li of items) {
      expect(li.querySelector('time')?.getAttribute('datetime')).toMatch(/^2026-/);
      expect(li.querySelector('time')?.textContent).toMatch(/ago|in /);
      expect(li.querySelector('.ui-badge')?.textContent).toMatch(
        /^(Payment|Sign-up|Ticket|Deploy)$/,
      );
      expect(li.querySelector('.ui-avatar')).not.toBeNull();
    }
    expect(feed.querySelector('table')).toBeNull();
    await view.unmount();
  });

  it('an admin gets View all (to the audit log) and all four quick actions', async () => {
    mockApi();
    const view = await render(page());
    await flush();

    const viewAll = getByRole(document.body, 'link', /^View all/);
    expect(viewAll.getAttribute('href')).toBe('/admin/audit-log');
    const actions = Array.from(card('Quick actions').querySelectorAll('a'));
    expect(actions.map((a) => a.getAttribute('href'))).toEqual([
      '/admin/users',
      '/table',
      '/tool-1',
      '/assistant',
    ]);
    expect(actions.map((a) => a.querySelector('.ui-action-item span span')?.textContent)).toEqual([
      'New invite',
      'Export transactions',
      'Open calculator',
      'Ask the assistant',
    ]);
    await view.unmount();
  });

  it('a non-admin sees no invite action and no audit-log link', async () => {
    mockApi({ user: VIEWER });
    const view = await render(page());
    await flush();

    expect(view.container.textContent).toContain('Good evening, Vic');
    expect(
      Array.from(card('Quick actions').querySelectorAll('a')).map((a) => a.getAttribute('href')),
    ).toEqual(['/table', '/tool-1', '/assistant']);
    expect(view.container.textContent).not.toContain('New invite');
    expect(view.container.querySelector('a[href="/admin/audit-log"]')).toBeNull();
    await view.unmount();
  });

  it('an empty feed says so', async () => {
    mockApi({ routes: { 'GET /api/activity': { body: { ok: true, activity: [] } } } });
    const view = await render(page());
    await flush();
    expect(card('Recent activity').textContent).toContain('Nothing has happened yet');
    expect(card('Recent activity').querySelector('ul')).toBeNull();
    await view.unmount();
  });

  it('a failed KPI request shows its own error and leaves the other panels up', async () => {
    mockApi({ routes: { 'GET /api/metrics/kpis': SERVER_ERROR } });
    const view = await render(page());
    await flush();

    expect(getByRole(document.body, 'alert').textContent).toContain('Couldn’t load key figures.');
    expect(view.container.querySelectorAll('.ui-kpi')).toHaveLength(0);
    expect(view.container.querySelectorAll('figure')).toHaveLength(3);
    expect(card('Recent activity').querySelectorAll('li')).toHaveLength(8);
    await view.unmount();
  });

  it('a failed chart request shows an alert in its card, and Retry fetches it again', async () => {
    let attempts = 0;
    const api = mockApi({
      routes: {
        'GET /api/metrics/categories': () => {
          attempts += 1;
          return attempts === 1 ? SERVER_ERROR : { body: { ok: true, categories: [] } };
        },
      },
    });
    const view = await render(page());
    await flush();

    expect(getByRole(document.body, 'alert').textContent).toContain('Couldn’t load spend.');
    expect(
      card('Spend by category').querySelector('[role="switch"]')?.hasAttribute('disabled'),
    ).toBe(true);
    await click(getByRole(document.body, 'button', 'Retry'));
    await flush();

    expect(api.calls.filter((c) => c === 'GET /api/metrics/categories')).toHaveLength(2);
    expect(document.body.textContent).not.toContain('Couldn’t load spend.');
    await view.unmount();
  });

  it('a failed activity request shows an error with Retry', async () => {
    mockApi({ routes: { 'GET /api/activity': SERVER_ERROR } });
    const view = await render(page());
    await flush();
    expect(getByRole(document.body, 'alert').textContent).toContain(
      'Couldn’t load recent activity.',
    );
    await view.unmount();
  });
});

describe('a11y Home page', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['dark', 'light'] as const) {
      it(`on success · ${skin} · ${mode}`, async () => {
        mockApi();
        const view = await render(page(), { skin, mode });
        await flush();
        expect(formatViolations(await runAxe())).toBe('');
        await view.unmount();
      });

      it(`while loading · ${skin} · ${mode}`, async () => {
        const api = mockApi({ delay: true });
        const view = await render(page(), { skin, mode });
        await flush();
        expect(formatViolations(await runAxe())).toBe('');
        api.release();
        await flush();
        await view.unmount();
      });
    }
  }
});
