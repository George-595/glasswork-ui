/* CSS colour → linear 0..1 RGB for WebGL uniforms.

   Effects take colours as CSS strings (by default role references such as
   `var(--chart-1)`, never a value), so they follow the skin and the mode. Resolving a role to
   numbers for a canvas is handing the role over; nothing here makes a new colour. WebGL needs
   numbers: resolveCssColor lets the browser compute the colour on a hidden
   probe inside the effect's own element (so the probe sees the same
   cascade), then parses the computed `rgb()` / `color(srgb …)` value. */

export type Rgb = readonly [number, number, number];

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function fromHex(hex: string): Rgb | null {
  const h = hex.slice(1);
  const full =
    h.length === 3 || h.length === 4
      ? h
          .slice(0, 3)
          .split('')
          .map((c) => c + c)
          .join('')
      : h.slice(0, 6);
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  const n = Number.parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/** Parse a computed CSS colour. Returns null for anything it cannot read. */
export function parseCssColor(input: string): Rgb | null {
  const value = input.trim().toLowerCase();
  if (value.startsWith('#')) return fromHex(value);
  const rgb = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(value);
  if (rgb) {
    const [, r, g, b] = rgb;
    return [clamp01(Number(r) / 255), clamp01(Number(g) / 255), clamp01(Number(b) / 255)];
  }
  const srgb = /^color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/.exec(value);
  if (srgb) {
    const [, r, g, b] = srgb;
    return [clamp01(Number(r)), clamp01(Number(g)), clamp01(Number(b))];
  }
  return null;
}

/** The computed colour string for any CSS colour, in `host`'s cascade
    (for canvas 2D, which cannot read `var()`). Falls back to `currentColor`
    of the host. */
export function computedColor(value: string, host: Element): string {
  if (typeof document === 'undefined' || typeof getComputedStyle !== 'function') return value;
  const probe = document.createElement('span');
  probe.style.display = 'none';
  probe.style.color = value;
  host.append(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  return computed || getComputedStyle(host).color;
}

/** Resolve any CSS colour (token references included) in `host`'s cascade. */
export function resolveCssColor(value: string, host: Element): Rgb | null {
  return parseCssColor(computedColor(value, host)) ?? parseCssColor(value);
}

/** Resolve a list of roles, or null when any cannot be read (there is no colour to invent:
    the caller keeps its static form). */
export function resolveCssColors(values: readonly string[], host: Element): Rgb[] | null {
  const out: Rgb[] = [];
  for (const v of values) {
    const rgb = resolveCssColor(v, host);
    if (!rgb) return null;
    out.push(rgb);
  }
  return out;
}
