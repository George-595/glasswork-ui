import { describe, expect, it, vi } from 'vitest';
import { ApiError, type QueryState } from '~/core/api';
import { formatViolations, runAxe } from '~/test/axe';
import { click, getByRole, getByText, queryByText } from '~/test/dom';
import { render } from '~/test/render';
import { QueryView } from './index';

type Query = QueryState<string[]> & { reload: () => void };

const view = (query: Query, extra: { empty?: boolean } = {}) => (
  <main id="main" tabIndex={-1}>
    <h1>Items</h1>
    <QueryView
      query={query}
      what="items"
      loading={<div aria-hidden="true">skeleton</div>}
      {...(extra.empty
        ? { isEmpty: (d: string[]) => d.length === 0, empty: <p>Nothing here</p> }
        : {})}
    >
      {(items) => (
        <ul>
          {items.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}
    </QueryView>
  </main>
);

describe('QueryView', () => {
  it('shows the skeleton in a named loading region', async () => {
    const { container } = await render(view({ status: 'loading', reload: vi.fn<() => void>() }));
    expect(getByRole(container, 'group', 'Loading items')).toBeTruthy();
    expect(getByText(container, 'skeleton')).toBeTruthy();
  });

  it('shows an alert with Retry on error, and Retry calls reload', async () => {
    const reload = vi.fn<() => void>();
    const { container } = await render(
      view({ status: 'error', error: new ApiError(500, 'boom', 'It broke.'), reload }),
    );
    expect(getByRole(container, 'alert').textContent).toContain('Couldn’t load items.');
    await click(getByRole(container, 'button', 'Retry'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('renders children with the data on success', async () => {
    const { container } = await render(
      view({ status: 'success', data: ['a', 'b'], reload: vi.fn<() => void>() }),
    );
    expect(getByText(container, 'a')).toBeTruthy();
    expect(getByText(container, 'b')).toBeTruthy();
  });

  it('shows the empty node instead of children when isEmpty says so', async () => {
    const { container } = await render(
      view({ status: 'success', data: [], reload: vi.fn<() => void>() }, { empty: true }),
    );
    expect(getByText(container, 'Nothing here')).toBeTruthy();
    expect(queryByText(container, 'a')).toBeNull();
  });

  it('renders children for an empty result when no empty node is given', async () => {
    const { container } = await render(
      view({ status: 'success', data: [], reload: vi.fn<() => void>() }),
    );
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(container.querySelector('ul')).not.toBeNull();
  });
});

describe('a11y QueryView', () => {
  const states: [string, Query][] = [
    ['loading', { status: 'loading', reload: () => {} }],
    ['error', { status: 'error', error: new ApiError(500, 'boom', 'It broke.'), reload: () => {} }],
    ['success', { status: 'success', data: ['a'], reload: () => {} }],
    ['empty', { status: 'success', data: [], reload: () => {} }],
  ];
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      for (const [name, query] of states) {
        it(`${name} · ${skin} · ${mode}`, async () => {
          await render(view(query, { empty: true }), { skin, mode });
          expect(formatViolations(await runAxe())).toBe('');
        });
      }
    }
  }
});
