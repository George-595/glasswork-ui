import { cssVar } from '@apps/colors';
import { type Rgb, resolveCssColor } from '../cssColor';

/* The colours a shader preset is given: ROLES, handed to the GPU.

   The `shaders` package takes hex strings, but our colours live in CSS custom properties
   that change with the skin and the mode, so they are resolved here at runtime (the browser
   computes the role in the host's own cascade) and passed over as hex. No colour is made
   here: shader-a / shader-b / shader-c are chart-1..3 already mixed toward the page colour
   by MAX_TINT, shader-bg is the page colour and shader-scrim the contrast scrim, all
   precomputed per skin x mode in @apps/colors (roles.ts documents MAX_TINT and the gate
   measures text over the busiest frame).

   `intensity` is not a colour: it is the canvas opacity (see effects.css), which over the
   page colour is the same blend a runtime mix at that strength produced.

   When a role cannot be read there is no palette, and the static gradient stays. */

export interface ShaderPalette {
  /** The page colour. */
  bg: string;
  /** The three accents, already mixed toward the page colour. */
  a: string;
  b: string;
  c: string;
  /** The mode, from the luminance of the page colour (a flag, not a colour). */
  dark: boolean;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

const part = (n: number | undefined) =>
  Math.round(clamp01(n ?? 0) * 255)
    .toString(16)
    .padStart(2, '0');

/** Format channels as the hex string the shaders package takes. */
export function toHex(rgb: Rgb): string {
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

/** Relative luminance (WCAG) of an sRGB colour. */
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

export function luminance(rgb: Rgb): number {
  return 0.2126 * lin(rgb[0] ?? 0) + 0.7152 * lin(rgb[1] ?? 0) + 0.0722 * lin(rgb[2] ?? 0);
}

/** `intensity` 0..1 → canvas opacity. Out-of-range and non-numbers are clamped to a sane 0.6. */
export function intensityOpacity(intensity: number): number {
  return clamp01(Number.isFinite(intensity) ? intensity : 0.6);
}

export function resolvePalette(host: Element): ShaderPalette | null {
  const bg = resolveCssColor(cssVar('shader-bg'), host);
  const a = resolveCssColor(cssVar('shader-a'), host);
  const b = resolveCssColor(cssVar('shader-b'), host);
  const c = resolveCssColor(cssVar('shader-c'), host);
  if (!bg || !a || !b || !c) return null;
  return { bg: toHex(bg), a: toHex(a), b: toHex(b), c: toHex(c), dark: luminance(bg) < 0.4 };
}
