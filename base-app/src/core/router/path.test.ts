import { describe, expect, it } from 'vitest';
import { hrefFor, isAppHref, NAVIGATE_EVENT, navigate, normalizePath, splitTarget } from './path';

describe('normalizePath', () => {
  it.each([
    ['', '/'],
    ['/', '/'],
    ['/admin/users/', '/admin/users'],
    ['/table?x=1', '/table'],
    ['/a/b/?x=1#frag', '/a/b'],
    ['/home', '/home'],
    ['home', '/home'],
    // the old hash form still names its route
    ['#', '/'],
    ['#/', '/'],
    ['#/admin/users/', '/admin/users'],
    ['#/table?x=1', '/table'],
  ])('normalises %j to %j', (input, expected) => {
    expect(normalizePath(input)).toBe(expected);
  });
});

describe('splitTarget and hrefFor', () => {
  it('splits a target into path, query and fragment, each normalised', () => {
    expect(splitTarget('/table/?q=1#top')).toEqual({
      path: '/table',
      search: '?q=1',
      hash: '#top',
    });
    expect(splitTarget('#/table?q=1')).toEqual({ path: '/table', search: '?q=1', hash: '' });
    expect(splitTarget('/x?')).toEqual({ path: '/x', search: '', hash: '' });
  });

  it('is the path itself: a real href', () => {
    expect(hrefFor('/table')).toBe('/table');
    expect(hrefFor('/')).toBe('/');
    expect(hrefFor('table/?q=1#x')).toBe('/table?q=1#x');
    expect(hrefFor('#/table')).toBe('/table');
  });
});

describe('isAppHref', () => {
  it('is a path on this site that is not the API', () => {
    expect(isAppHref('/table?x=1')).toBe(true);
    expect(isAppHref('/')).toBe(true);
    expect(isAppHref('/api/files/1')).toBe(false);
    expect(isAppHref('//evil.example/x')).toBe(false);
    expect(isAppHref('https://example.test/')).toBe(false);
    expect(isAppHref('#main')).toBe(false);
    expect(isAppHref('mailto:a@b.test')).toBe(false);
  });
});

describe('navigate', () => {
  it('pushes (or replaces) an entry and announces the change', () => {
    window.history.replaceState(null, '', '/');
    let heard = 0;
    const on = () => {
      heard += 1;
    };
    window.addEventListener(NAVIGATE_EVENT, on);
    const before = window.history.length;
    navigate('/table?page=2');
    expect(`${window.location.pathname}${window.location.search}`).toBe('/table?page=2');
    expect(window.history.length).toBe(before + 1);
    navigate('/graphs', { replace: true });
    expect(window.location.pathname).toBe('/graphs');
    expect(window.history.length).toBe(before + 1);
    expect(heard).toBe(2);
    navigate('/graphs'); // already there: nothing happens
    expect(heard).toBe(2);
    window.removeEventListener(NAVIGATE_EVENT, on);
  });
});
