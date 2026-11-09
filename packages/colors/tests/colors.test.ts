import { describe, expect, it } from 'vitest';
import { contrast, flatten, parse, rgb } from '../src/colour.ts';
import { colorsCss, themeCss } from '../src/css.ts';
import { faviconSvg } from '../src/favicon.ts';
import { runGate } from '../src/gate.ts';
import { EFFECTS, ROLES, THEMES } from '../src/roles.ts';

describe('colour arithmetic', () => {
  it('parses and writes palette colours', () => {
    expect(parse('#4f69d9')).toEqual([79, 105, 217, 1]);
    expect(rgb('#4f69d9', 0.16)).toBe('rgba(79, 105, 217, 0.16)');
    expect(rgb('#4f69d9')).toBe('#4f69d9');
  });
  it('composites and measures contrast like WCAG', () => {
    expect(flatten(['#ffffff', 'rgba(0, 0, 0, 0.5)'])).toBe('#808080');
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
  });
});

describe('the role table', () => {
  it('every theme gives every role and effect a value', () => {
    for (const theme of Object.values(THEMES)) {
      for (const r of ROLES) expect(theme.roles[r]).toBeTruthy();
      for (const e of EFFECTS) expect(theme.effects[e]).toBeTruthy();
    }
  });
  it('every role colour is a palette colour (hex or rgba from one)', () => {
    for (const theme of Object.values(THEMES)) {
      for (const r of ROLES) expect(() => parse(theme.roles[r])).not.toThrow();
    }
  });
  it('passes the contrast gate in every skin and mode', () => {
    expect(runGate()).toEqual([]);
  });
});

describe('the generated CSS', () => {
  const css = colorsCss();
  it('defines every role in all four blocks, glass fallbacks last', () => {
    for (const r of ROLES) expect(css.split(`--${r}:`).length - 1).toBeGreaterThanOrEqual(6);
    expect(css.lastIndexOf('prefers-reduced-transparency')).toBeGreaterThan(
      css.lastIndexOf('[data-skin="glass"][data-theme="light"]'),
    );
  });
  it('maps every role to a Tailwind colour and wipes the stock palette', () => {
    const theme = themeCss();
    expect(theme).toContain('--color-*: initial;');
    for (const r of ROLES) expect(theme).toContain(`--color-${r}: var(--${r});`);
  });
});

describe('the favicon', () => {
  it('is painted with the enterprise main-action pair, light and dark', () => {
    const svg = faviconSvg();
    expect(svg).not.toContain('undefined');
    expect(svg).toContain(`fill:${THEMES['enterprise-light'].roles.primary}`);
    expect(svg).toContain(`stroke:${THEMES['enterprise-dark'].roles['on-primary']}`);
  });
});
