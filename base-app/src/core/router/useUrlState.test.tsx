import { act, useEffect } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { locationNow } from '~/test/location';
import { render } from '~/test/render';
import { usePath } from './location';
import { buildSearch, param, queryOf, readParams } from './urlParams';
import { type SetUrlState, useUrlState } from './useUrlState';

const STATUSES = ['paid', 'pending', 'failed'] as const;
const schema = {
  q: param.string(),
  page: param.number(1, { min: 1, integer: true }),
  sort: param.oneOf(['-date', 'date', 'amount'], '-date'),
  tags: param.list(),
  status: param.listOf(STATUSES),
};

describe('param parsers', () => {
  it('string: absent and default both read as the default', () => {
    const p = param.string('x');
    expect(p.read(null)).toBe('x');
    expect(p.read('y')).toBe('y');
    expect(p.write('x')).toBeNull();
    expect(p.write('y')).toBe('y');
  });

  it('number: bad text, clamping and rounding', () => {
    const p = param.number(1, { min: 1, max: 9, integer: true });
    expect(p.read('abc')).toBe(1);
    expect(p.read('')).toBe(1);
    expect(p.read('0')).toBe(1);
    expect(p.read('99')).toBe(9);
    expect(p.read('2.9')).toBe(2);
    expect(p.write(1)).toBeNull();
    expect(p.write(3)).toBe('3');
  });

  it('oneOf: unknown values fall back to the default', () => {
    const p = param.oneOf(['a', 'b'], 'a');
    expect(p.read('b')).toBe('b');
    expect(p.read('zzz')).toBe('a');
  });

  it('list and listOf: split on commas, drop blanks and unknowns, omit when empty', () => {
    expect(param.list().read('a, b,,c')).toEqual(['a', 'b', 'c']);
    expect(param.list().write([])).toBeNull();
    expect(param.list().write(['a', 'b'])).toBe('a,b');
    const p = param.listOf(STATUSES);
    expect(p.read('paid,nope,paid,failed')).toEqual(['paid', 'failed']);
    expect(p.read('nope')).toEqual([]);
    expect(p.write(['paid', 'failed'])).toBe('paid,failed');
  });
});

describe('readParams and buildSearch', () => {
  it('reads values from the query string and defaults the rest', () => {
    expect(readParams(schema, '?q=foo&status=paid,failed&page=2&sort=-date')).toEqual({
      q: 'foo',
      page: 2,
      sort: '-date',
      tags: [],
      status: ['paid', 'failed'],
    });
    expect(readParams(schema, '').page).toBe(1);
    expect(readParams(schema, '').q).toBe('');
  });

  it('no query string is no parameters', () => {
    expect(queryOf('').toString()).toBe('');
  });

  it('omits defaults and keeps foreign parameters', () => {
    expect(buildSearch(schema, '', { q: 'foo', page: 2 })).toBe('?q=foo&page=2');
    expect(buildSearch(schema, '?q=foo&page=2&x=1', { page: 1 })).toBe('?q=foo&x=1');
    expect(buildSearch(schema, '?q=foo', { q: '' })).toBe('');
    expect(buildSearch(schema, '', { q: 'a' })).toBe('?q=a');
  });

  it('writes lists with readable commas and escapes the rest', () => {
    expect(buildSearch(schema, '', { status: ['paid', 'failed'], q: 'a&b c' })).toBe(
      '?status=paid,failed&q=a%26b+c',
    );
  });
});

describe('useUrlState', () => {
  let set: SetUrlState<typeof schema>;
  function Probe() {
    const [values, setValues] = useUrlState(schema);
    useEffect(() => {
      set = setValues;
    });
    return (
      <>
        <p data-testid="values">{JSON.stringify(values)}</p>
        <p data-testid="path">{usePath()}</p>
      </>
    );
  }
  const shown = (id: string) => document.querySelector(`[data-testid="${id}"]`)?.textContent ?? '';
  const values = () => JSON.parse(shown('values')) as ReturnType<typeof readParams<typeof schema>>;

  beforeEach(() => {
    window.history.replaceState(null, '', '/table');
  });

  it('reads the initial URL', async () => {
    window.history.replaceState(null, '', '/table?q=foo&page=3');
    await render(<Probe />);
    expect(values()).toMatchObject({ q: 'foo', page: 3, sort: '-date' });
  });

  it('writes to the URL, omitting defaults, and re-renders', async () => {
    await render(<Probe />);
    await act(async () => set({ q: 'acme', status: ['paid'] }));
    expect(locationNow()).toBe('/table?q=acme&status=paid');
    expect(values()).toMatchObject({ q: 'acme', status: ['paid'] });
    await act(async () => set({ q: '' }));
    expect(locationNow()).toBe('/table?status=paid');
  });

  it('replaces the history entry by default and pushes on request', async () => {
    await render(<Probe />);
    const replace = vi.spyOn(window.history, 'replaceState');
    const push = vi.spyOn(window.history, 'pushState');
    await act(async () => set({ q: 'a' }));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(push).not.toHaveBeenCalled();
    await act(async () => set({ page: 2 }, { push: true }));
    expect(push).toHaveBeenCalledTimes(1);
  });

  it('composes two writes in one tick and accepts an updater', async () => {
    await render(<Probe />);
    await act(async () => {
      set({ q: 'x' });
      set((current) => ({ page: current.page + 1 }));
    });
    expect(locationNow()).toBe('/table?q=x&page=2');
  });

  it('does nothing when the URL would not change', async () => {
    await render(<Probe />);
    const replace = vi.spyOn(window.history, 'replaceState');
    await act(async () => set({ q: '', page: 1 }));
    expect(replace).not.toHaveBeenCalled();
  });

  it('keeps the path and the #fragment it is written into', async () => {
    window.history.replaceState(null, '', '/table?page=2#section');
    await render(<Probe />);
    await act(async () => set({ q: 'z' }));
    expect(locationNow()).toBe('/table?page=2&q=z#section');
  });

  it('follows the back button (popstate) and leaves the route alone', async () => {
    await render(<Probe />);
    await act(async () => {
      window.history.replaceState(null, '', '/table?page=5');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(values().page).toBe(5);
    expect(shown('path')).toBe('/table');
  });

  it('gives the same object for the same URL, so it is safe as a dependency', async () => {
    const seen: unknown[] = [];
    function Spy() {
      const [v] = useUrlState(schema);
      seen.push(v);
      return null;
    }
    const r = await render(<Spy />);
    await r.rerender(<Spy />);
    expect(seen.at(-1)).toBe(seen.at(-2));
  });
});
