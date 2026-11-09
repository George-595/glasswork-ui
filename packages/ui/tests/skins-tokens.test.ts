/* The kit's non-colour tokens, with no browser: the elevation ladder, motion, and the glass
   material's fallbacks. Colour contrast is not measured here: every colour is a role in
   @apps/colors, whose own gate (packages/colors/src/gate.ts) measures every pair in every
   skin × mode before the CSS is even written. This test also guards that tokens.css and
   glass.css carry NO colour values at all. */
/// <reference types="node" />
// (the package's tsconfig loads no Node types; this one test reads two stylesheets as text)
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const STYLES = join(import.meta.dirname, '../src/styles');
const tokensCss = readFileSync(join(STYLES, 'tokens.css'), 'utf8');
const glassCss = readFileSync(join(STYLES, 'glass.css'), 'utf8');
const SRC = join(import.meta.dirname, '../src');
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : /\.tsx?$/.test(name) ? [path] : [];
  });
}
const strip = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('skins: no colour values outside @apps/colors', () => {
  it('tokens.css and glass.css only compose roles', () => {
    for (const css of [tokensCss, glassCss]) {
      expect(strip(css)).not.toMatch(
        /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|oklch\(|oklab\(|color-mix\(/i,
      );
    }
  });
});

describe('skins: elevation and motion tokens', () => {
  it('defines the elevation ladder 0..3, the card role and the inset', () => {
    for (const t of [
      '--elev-0',
      '--elev-1',
      '--elev-2',
      '--elev-3',
      '--elev-card',
      '--elev-inset',
    ]) {
      expect(`${tokensCss}\n${glassCss}`).toMatch(new RegExp(`${t}\\s*:`));
    }
  });

  it('builds the ladder on the role shadows, so it follows skin and mode', () => {
    expect(tokensCss).toMatch(/--elev-1:\s*var\(--glass-rim\),\s*var\(--shadow-sm\)/);
    expect(tokensCss).toMatch(/--elev-3:\s*var\(--glass-rim\),\s*var\(--shadow-lg\)/);
    expect(tokensCss).toMatch(/--elev-inset:\s*var\(--shadow-inset\)/);
  });

  it('builds the focus ring from the canvas and focus roles', () => {
    expect(tokensCss).toMatch(/--ring:\s*0 0 0 2px var\(--canvas\),\s*0 0 0 4px var\(--focus\)/);
  });

  it('defines durations, curves, and zeroes the durations under reduced motion', () => {
    for (const t of [
      '--dur-fast',
      '--dur-base',
      '--dur-slow',
      '--ease-out',
      '--ease-in',
      '--ease-in-out',
      '--ease-spring',
    ]) {
      expect(tokensCss).toMatch(new RegExp(`${t}\\s*:`));
    }
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(
      tokensCss,
    );
    expect(reduced?.[1]).toMatch(/--dur-fast:\s*0ms/);
    expect(reduced?.[1]).toMatch(/--dur-base:\s*0ms/);
    expect(reduced?.[1]).toMatch(/--dur-slow:\s*0ms/);
  });

  it('turns the blurs off wherever glass falls back to solid', () => {
    expect(glassCss).toMatch(
      /prefers-reduced-transparency: reduce\), \(forced-colors: active\)\s*\{[^}]*\{[^}]*--scrim-filter:\s*none/,
    );
    expect(glassCss).toMatch(/@supports not[^{]*\{[^}]*\{[^}]*--surface-filter:\s*none/);
  });
});

describe('skins: backdrop filters are spent on fixed chrome only (ENGINEERING.md §5)', () => {
  const css = strip(glassCss);
  it('turns no blur on for content surfaces or the scrim, in any skin', () => {
    expect(strip(tokensCss)).toMatch(/--surface-filter:\s*none/);
    expect(strip(tokensCss)).toMatch(/--scrim-filter:\s*none/);
    // glass.css never gives --surface-filter or --scrim-filter a blur
    const blurred = css
      .split('\n')
      .filter((line) => /--(surface|scrim)-filter:/.test(line) && !/:\s*none/.test(line));
    expect(blurred).toEqual([]);
  });

  it('puts the blur on --chrome-filter, lighter at low power and off in the solid fallbacks', () => {
    expect(css).toMatch(/--chrome-filter:\s*blur\(7\.33px\)/);
    expect(css).toMatch(/\[data-power="low"\]\s*\{\s*--chrome-filter:\s*blur\(6px\)/);
    expect(css).toMatch(
      /prefers-reduced-transparency: reduce\), \(forced-colors: active\)\s*\{[^}]*\{[^}]*--chrome-filter:\s*none/,
    );
    expect(css).toMatch(/@supports not[^{]*\{[^}]*\{[^}]*--chrome-filter:\s*none/);
  });

  it('paints sheets, dialogs and palettes solid, with no blur, at low power', () => {
    expect(css).toMatch(
      /\[data-power="low"\] :is\(\.ui-sheet, \.ui-dialog, \.ui-palette, \.ui-toast\)\s*\{[^}]*surface-solid[^}]*backdrop-filter:\s*none/,
    );
  });
});

describe('components: no backdrop filter on content that scrolls', () => {
  it('no component asks for glass-blur or a raw surface/scrim filter; chrome uses glass-chrome', () => {
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      const hit = /glass-blur|var\(--surface-filter\)|var\(--scrim-filter\)/.exec(text);
      expect(hit ? `${file}: ${hit[0]}` : null).toBeNull();
    }
  });
});
