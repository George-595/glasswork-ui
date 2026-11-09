import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installPreloadRecovery,
  isChunkLoadError,
  reloadForNewVersion,
  resetChunkRecovery,
} from './chunk-errors';

afterEach(() => {
  resetChunkRecovery();
});

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    data,
  };
}

describe('isChunkLoadError', () => {
  it.each([
    [
      'Chrome',
      'Failed to fetch dynamically imported module: https://x.test/assets/ToolOnePage-3f2a.js',
    ],
    ['Firefox', 'error loading dynamically imported module: https://x.test/assets/a.js'],
    ['Safari', 'Importing a module script failed.'],
    ['Vite CSS preload', 'Unable to preload CSS for /assets/a-1.css'],
  ])('recognises the %s wording', (_browser, message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it('is false for a fault in a page, and for things that are not errors', () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined (reading 'x')"))).toBe(
      false,
    );
    expect(isChunkLoadError(new TypeError('Failed to fetch'))).toBe(false);
    expect(isChunkLoadError('dynamically imported module')).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
  });
});

describe('reloadForNewVersion', () => {
  it('reloads once and remembers when', () => {
    const reload = vi.fn<() => void>();
    const store = memory();
    expect(
      reloadForNewVersion({ online: () => true, now: () => 1000, storage: () => store, reload }),
    ).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(store.data.get('app-chunk-reload-at')).toBe('1000');
  });

  it('does not loop: a second failure inside a minute is left to show its message', () => {
    const reload = vi.fn<() => void>();
    const store = memory({ 'app-chunk-reload-at': '1000' });
    const deps = { online: () => true, now: () => 1000 + 59_000, storage: () => store, reload };
    expect(reloadForNewVersion(deps)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    // a minute later it is a new deploy, so it may reload again
    expect(reloadForNewVersion({ ...deps, now: () => 1000 + 61_000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does nothing offline: a reload with no connection would lose the app', () => {
    const reload = vi.fn<() => void>();
    expect(
      reloadForNewVersion({ online: () => false, now: () => 1, storage: () => memory(), reload }),
    ).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does nothing when it cannot remember having reloaded (no sessionStorage, or it throws)', () => {
    const reload = vi.fn<() => void>();
    expect(reloadForNewVersion({ online: () => true, storage: () => null, reload })).toBe(false);
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {},
    };
    expect(reloadForNewVersion({ online: () => true, storage: () => throwing, reload })).toBe(
      false,
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it('a reload already under way answers true without a second reload', () => {
    const reload = vi.fn<() => void>();
    const deps = { online: () => true, now: () => 5, storage: () => memory(), reload };
    expect(reloadForNewVersion(deps)).toBe(true);
    expect(reloadForNewVersion({ ...deps, storage: () => memory() })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('installPreloadRecovery', () => {
  it('reloads once on vite:preloadError and swallows the error', () => {
    const reload = vi.fn<() => void>();
    const target = new EventTarget();
    const remove = installPreloadRecovery(target as unknown as Window, {
      online: () => true,
      now: () => 10,
      storage: () => memory(),
      reload,
    });
    const first = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(first);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(first.defaultPrevented).toBe(true);
    remove();
    target.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves the error to throw when no reload is allowed (offline)', () => {
    const reload = vi.fn<() => void>();
    const target = new EventTarget();
    installPreloadRecovery(target as unknown as Window, {
      online: () => false,
      storage: () => memory(),
      reload,
    });
    const event = new Event('vite:preloadError', { cancelable: true });
    target.dispatchEvent(event);
    expect(reload).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });
});
