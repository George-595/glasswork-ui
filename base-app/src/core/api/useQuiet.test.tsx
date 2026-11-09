import { afterEach, describe, expect, it } from 'vitest';
import { flush, type Rendered, render } from '~/test/render';
import type { ApiError } from './client';
import { mapQuery, type Query, useQuiet } from './useQuiet';

/* useQuiet keeps the last good answer on screen while a refetch loads, so a change over the
   live stream does not flash every panel to a skeleton. The first load and a Retry still show it. */
let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
});

const reload = () => {};
const error = { status: 500, code: 'internal_error', message: 'Boom' } as ApiError;

function Probe({ query }: { query: Query<number> }) {
  const q = useQuiet(query);
  return <p>{q.status === 'success' ? `ok ${q.data}` : q.status}</p>;
}
const shown = () => document.querySelector('p')?.textContent;

async function show(query: Query<number>) {
  if (view) await view.rerender(<Probe query={query} />);
  else view = await render(<Probe query={query} />);
  await flush(1);
}

describe('useQuiet', () => {
  it('shows loading on a first load', async () => {
    await show({ status: 'loading', reload });
    expect(shown()).toBe('loading');
  });

  it('keeps the last good answer while the next one loads, then shows the new one', async () => {
    await show({ status: 'success', data: 1, reload });
    await show({ status: 'loading', reload });
    expect(shown()).toBe('ok 1');
    await show({ status: 'success', data: 2, reload });
    expect(shown()).toBe('ok 2');
  });

  it('shows a failure, and a Retry after it shows loading rather than a stale answer', async () => {
    await show({ status: 'success', data: 1, reload });
    await show({ status: 'error', error, reload });
    expect(shown()).toBe('error');
    await show({ status: 'loading', reload });
    expect(shown()).toBe('loading');
  });
});

describe('mapQuery', () => {
  it('converts an answer and leaves loading and failure alone', () => {
    expect(mapQuery({ status: 'success', data: 2, reload }, (n) => n * 10)).toMatchObject({
      status: 'success',
      data: 20,
    });
    expect(mapQuery<number, number>({ status: 'loading', reload }, (n) => n)).toMatchObject({
      status: 'loading',
    });
    expect(mapQuery<number, number>({ status: 'error', error, reload }, (n) => n)).toMatchObject({
      status: 'error',
    });
  });
});
