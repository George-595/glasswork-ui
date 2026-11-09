import { afterEach, describe, expect, it } from 'vitest';
import { readHashParam, removeHashParam } from './hashParam';

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('fragment parameters (a one-time token)', () => {
  it('reads a parameter, or an empty string', () => {
    expect(readHashParam('token', '#token=abc_DEF-1')).toBe('abc_DEF-1');
    expect(readHashParam('token', '#token=abc&x=1')).toBe('abc');
    expect(readHashParam('token', '#main')).toBe('');
    expect(readHashParam('token', '')).toBe('');
  });

  it('still reads the old hash-route form', () => {
    expect(readHashParam('token', '#/reset-password?token=abc_DEF-1')).toBe('abc_DEF-1');
    expect(readHashParam('token', '#/reset-password')).toBe('');
  });

  it('removes only that parameter, keeps the path, query and the others, and adds no history entry', () => {
    window.history.replaceState(null, '', '/accept-invite?a=1#token=secret&x=1');
    const entries = window.history.length;
    removeHashParam('token');
    expect(window.location.hash).toBe('#x=1');
    expect(window.location.href).not.toContain('secret');
    expect(`${window.location.pathname}${window.location.search}`).toBe('/accept-invite?a=1');
    expect(window.history.length).toBe(entries); // replaced, not pushed
    removeHashParam('x');
    expect(window.location.hash).toBe('');
    expect(window.location.href.endsWith('#')).toBe(false);
  });

  it('removes a token from the old form too', () => {
    window.history.replaceState(null, '', '/#/accept-invite?token=secret&x=1');
    removeHashParam('token');
    expect(window.location.hash).toBe('#/accept-invite?x=1');
  });

  it('does nothing when the parameter is not there', () => {
    window.history.replaceState(null, '', '/forgot-password#main');
    removeHashParam('token');
    expect(window.location.hash).toBe('#main');
  });
});
