// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { syncThemeColor } from '../src/lib/theme-color';

describe('syncThemeColor', () => {
  it('writes the page canvas role into one theme-color meta and keeps it in step', () => {
    for (const m of document.head.querySelectorAll('meta[name="theme-color"]')) m.remove();
    document.documentElement.style.setProperty('--canvas', 'test-canvas');
    syncThemeColor();
    syncThemeColor();
    const metas = document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
    expect(metas).toHaveLength(1);
    expect(metas[0]?.content).toBe('test-canvas');
    document.documentElement.style.removeProperty('--canvas');
  });
});
