// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_PREFS, setDefaultSkin } from '../src/theme/themeCookie';
import { initialSkin } from '../src/theme/useTheme';

describe('setDefaultSkin', () => {
  afterEach(() => setDefaultSkin('enterprise'));

  it('is enterprise unless an app says otherwise', () => {
    expect(DEFAULT_PREFS.skin).toBe('enterprise');
    expect(initialSkin()).toBe('enterprise');
  });

  it('gives a first visit the app’s skin, and a stored choice still wins', () => {
    setDefaultSkin('glass');
    expect(DEFAULT_PREFS.skin).toBe('glass');
    expect(initialSkin()).toBe('glass');
    localStorage.setItem('ui-skin', 'enterprise');
    try {
      // a visitor who picked a skin keeps it, whatever the default
      expect(initialSkin()).toBe('enterprise');
    } finally {
      localStorage.clear();
    }
  });
});
