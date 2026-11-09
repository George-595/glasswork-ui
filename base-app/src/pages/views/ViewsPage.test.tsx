import { afterEach, describe, expect, it } from 'vitest';
import { formatViolations, runAxe } from '~/test/axe';
import { click, getByRole, queryByText } from '~/test/dom';
import { mockApi } from '~/test/mockApi';
import { flush, type Rendered, type RenderOptions, render as renderRaw } from '~/test/render';
import ViewsPage from './ViewsPage';

const mounted: Rendered[] = [];
async function render(opts?: RenderOptions) {
  const r = await renderRaw(<ViewsPage />, opts);
  mounted.push(r);
  await flush();
  return r;
}
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount().catch(() => {});
});

const VIEWS = [
  {
    id: 'v1',
    title: 'Spend by category',
    tool: 'show_chart',
    createdAt: '2026-10-14T09:00:00Z',
    visual: {
      kind: 'chart',
      chart: 'bar',
      title: 'Spend by category',
      format: 'gbp',
      series: [
        {
          name: 'Total',
          points: [
            { x: 'Software', y: 1200 },
            { x: 'Travel', y: 300 },
          ],
        },
      ],
    },
  },
  {
    id: 'v2',
    title: 'This month',
    tool: 'show_kpis',
    createdAt: '2026-10-14T09:01:00Z',
    visual: {
      kind: 'kpis',
      title: 'This month',
      tiles: [{ label: 'Revenue', value: 4200, format: 'gbp', change: 0.12 }],
    },
  },
  {
    id: 'v3',
    title: 'Broken',
    tool: 'show_table',
    createdAt: '2026-10-14T09:02:00Z',
    visual: null,
    error: 'status: must be one of paid, pending',
  },
];

function viewsApi(views: unknown[] = VIEWS) {
  let list = [...views] as { id: string }[];
  const api = mockApi({
    routes: {
      'GET /api/views': () => ({ body: { ok: true, views: list } }),
      'POST /api/actions/delete_view': (req) => {
        const id = (req.body as { input: { id: string } }).input.id;
        list = list.filter((v) => v.id !== id);
        return { body: { ok: true, result: { id } } };
      },
    },
  });
  return api;
}

describe('ViewsPage', () => {
  it('draws each pinned view, and says why one cannot be drawn', async () => {
    viewsApi();
    const view = await render();
    expect(view.container.querySelectorAll('h1')).toHaveLength(1);
    expect(view.container.querySelector('figure')?.textContent).toContain('Spend by category');
    expect(queryByText(document.body, 'Revenue')).not.toBeNull();
    expect(queryByText(document.body, 'status: must be one of paid, pending')).not.toBeNull();
  });

  it('removes a view through the delete_view action, after confirming', async () => {
    const api = viewsApi();
    await render();
    await click(getByRole(document.body, 'button', 'Remove view: Spend by category'));
    await click(getByRole(document.body, 'button', 'Remove view'));
    await flush();
    expect(api.calls).toContain('POST /api/actions/delete_view');
    expect(document.querySelector('figure')).toBeNull();
  });

  it('points to the assistant when nothing is pinned', async () => {
    viewsApi([]);
    await render();
    expect(queryByText(document.body, 'Nothing pinned yet')).not.toBeNull();
    expect(getByRole(document.body, 'link', 'Open the assistant').getAttribute('href')).toContain(
      'assistant',
    );
  });

  it('axe: views and empty, in every skin and mode', async () => {
    for (const skin of ['enterprise', 'glass'] as const) {
      for (const mode of ['light', 'dark'] as const) {
        viewsApi();
        const a = await render({ skin, mode });
        expect(formatViolations(await runAxe(document.body))).toBe('');
        await a.unmount();
        viewsApi([]);
        const b = await render({ skin, mode });
        expect(formatViolations(await runAxe(document.body))).toBe('');
        await b.unmount();
      }
    }
  });
});
