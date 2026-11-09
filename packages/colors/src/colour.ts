/* Colour arithmetic for the palette and the contrast gate: parse, write with alpha,
   composite one colour over another, and the WCAG 2.x contrast ratio. Pure, no DOM. */

export type Rgba = readonly [r: number, g: number, b: number, a: number];

/** '#rrggbb' or 'rgba(r, g, b, a)' → channels 0–255 and alpha 0–1. */
export function parse(colour: string): Rgba {
  const hex = /^#([0-9a-f]{6})$/i.exec(colour);
  if (hex?.[1]) {
    const n = Number.parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const fn = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\s*\)$/.exec(colour);
  if (fn)
    return [Number(fn[1]), Number(fn[2]), Number(fn[3]), fn[4] === undefined ? 1 : Number(fn[4])];
  throw new Error(`not a palette colour: ${colour}`);
}

/** A palette swatch at an alpha: '#4f69d9', 0.16 → 'rgba(79, 105, 217, 0.16)'. */
export function rgb(hex: string, alpha = 1): string {
  const [r, g, b] = parse(hex);
  return alpha >= 1 ? hex : `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** `top` laid over an opaque `base` (source-over), as an opaque colour. */
export function over(top: string, base: string): Rgba {
  const [tr, tg, tb, ta] = parse(top);
  const [br, bg, bb] = parse(base);
  return [tr * ta + br * (1 - ta), tg * ta + bg * (1 - ta), tb * ta + bb * (1 - ta), 1];
}

/** Composite a stack of layers, bottom first; the bottom must be opaque. */
export function flatten(layers: readonly string[]): string {
  const [first, ...rest] = layers;
  if (first === undefined) throw new Error('flatten: no layers');
  let acc = parse(first);
  if (acc[3] < 1) throw new Error(`flatten: the bottom layer must be opaque (${first})`);
  for (const layer of rest) acc = over(layer, toHex(acc));
  return toHex(acc);
}

export function toHex([r, g, b]: Rgba): string {
  const part = (n: number) =>
    Math.round(Math.min(255, Math.max(0, n)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

const channel = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance of an opaque colour. */
export function luminance(colour: string): number {
  const [r, g, b] = parse(colour);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG contrast ratio of two opaque colours, 1–21. */
export function contrast(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
