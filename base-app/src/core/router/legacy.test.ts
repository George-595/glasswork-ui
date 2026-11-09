import { afterEach, describe, expect, it } from 'vitest';
import html from '../../../index.html?raw';
import { legacyHashTarget, upgradeLegacyHash } from './legacy';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

const CASES: readonly [string, string | null][] = [
  ['#/', '/'],
  ['#/table', '/table'],
  ['#/table?page=2&q=a', '/table?page=2&q=a'],
  ['#/admin/users/', '/admin/users'],
  // a one-time token never reaches a server: it moves into the fragment
  ['#/reset-password?token=abc_DEF-1', '/reset-password#token=abc_DEF-1'],
  ['#/accept-invite?token=a%2Fb&x=1', '/accept-invite?x=1#token=a%2Fb'],
  // not route addresses
  ['', null],
  ['#', null],
  ['#main', null],
  ['#token=abc', null],
];

describe('legacyHashTarget', () => {
  it.each(CASES)('%j becomes %j', (hash, expected) => {
    expect(legacyHashTarget(hash)).toBe(expected);
  });
});

describe('upgradeLegacyHash', () => {
  it('rewrites an old address in place and says so', () => {
    window.history.replaceState(null, '', '/#/table?page=2');
    const entries = window.history.length;
    expect(upgradeLegacyHash()).toBe(true);
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(
      '/table?page=2',
    );
    expect(window.history.length).toBe(entries);
  });

  it('leaves any other address alone', () => {
    window.history.replaceState(null, '', '/table#main');
    expect(upgradeLegacyHash()).toBe(false);
    expect(window.location.hash).toBe('#main');
  });
});

/* index.html runs the same rules in an inline script, before anything is drawn, so a server renders
   the right page for an old link. Run that script against every case here. */
describe('the inline script in index.html', () => {
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '';

  it.each(CASES.filter(([, expected]) => expected !== null))('sends %j to %j', (hash, expected) => {
    const replaced: string[] = [];
    const run = new Function('location', 'document', 'matchMedia', 'localStorage', script);
    run(
      { hash, replace: (to: string) => replaced.push(to) },
      { documentElement: { dataset: {} }, cookie: 'ui-theme=system.glass.aurora.dark' },
      () => ({ matches: false }),
      { getItem: () => null },
    );
    expect(replaced).toEqual([expected]);
  });

  it('does nothing about the address for a route that is already a path', () => {
    const replaced: string[] = [];
    const root = { dataset: { themeMode: 'system' } as Record<string, string> };
    const run = new Function('location', 'document', 'matchMedia', 'localStorage', script);
    run(
      { hash: '#main', replace: (to: string) => replaced.push(to) },
      { documentElement: root, cookie: 'ui-theme=system.glass.aurora.dark' },
      () => ({ matches: true }),
      { getItem: () => null },
    );
    expect(replaced).toEqual([]);
    expect(root.dataset.theme).toBe('light'); // 'system' is settled by the device
  });
});
