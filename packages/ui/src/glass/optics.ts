/* The optics of Liquid Glass, ported to TypeScript from Glass HQ's Liquid
   Glass (MIT, (c) 2026 Glass HQ; see THIRD_PARTY_NOTICES.md):

   - `materials`, `edgeDisplacement`   <- src/core/materials.ts, src/core/optics.ts
   - `mapScale`                        <- src/gpu/geometry.ts
   - `renderMaterialPixels`            <- src/gpu/maps.wgsl (fs_main), run on the CPU
   - `toneTable`                       <- src/dom/material-graph.ts (toneMarkup)

   Upstream renders the maps with a WebGPU fragment shader through its `vgpu`
   dependency. Here the same per-pixel maths runs in a plain loop, once per
   size (maps.ts caches the result), so there is no GPU device, no extra
   dependency and the maps exist wherever the SVG path can run.

   One deliberate change: upstream's outline is a Lisse squircle. Ours is the
   circular-arc rounded rectangle CSS `border-radius` draws, because the
   backdrop is clipped by border-radius and the field must match that clip. */

export type GlassAppearance = 'light' | 'dark';

/** The "regular" material, verbatim. */
export const materials = {
  regular: {
    blur: 7.33,
    refraction: 60,
    light: { fillSigma: 23, fillOpacity: 0.34, tone: [0.36, 0.67, -0.1113, 1.1031] },
    dark: { fillSigma: 21.8, fillOpacity: 0.65, tone: [0.105, 0.83, -0.2091, 1.0648] },
  },
} as const;

/** Displacement at signed distance `distance` (negative inside), across an
    edge band of 1 / inverseHeight pixels: the profile of a convex lens rim. */
export function edgeDisplacement(distance: number, amount: number, inverseHeight: number): number {
  const depth = Math.max(0, Math.min(1, -distance * inverseHeight));
  return amount * (1 - Math.max(0, Math.min(1, Math.sqrt((2 - depth) * depth))));
}

/** Pixels per CSS pixel a map is rendered at: the display's ratio up to 2,
    lowered for surfaces too big for a 4096-pixel map. */
export function mapScale(width: number, height: number, dpr: number): number {
  const ratio = Math.max(1, Math.min(dpr, 2));
  const fit = Math.min(1, 4096 / ((width + 4) * ratio), 4096 / ((height + 4) * ratio));
  return fit < 1 ? Math.max(0.25, ratio * fit) : ratio;
}

/** The regular material's tone curve as an feFuncR/G/B table (33 values). */
export function toneTable(appearance: GlassAppearance): string {
  const spec = materials.regular[appearance];
  const [a, b, q] = spec.tone;
  const weight = appearance === 'dark' ? 0.9 : 0.8;
  return Array.from({ length: 33 }, (_, n) => {
    const v = n / 32;
    const toned = a + b * v + q * v * v;
    return Number((weight * toned + (1 - weight) * v).toFixed(4));
  }).join(' ');
}

export interface MapGeometry {
  /** CSS pixels of the border box. */
  width: number;
  height: number;
  /** CSS border-radius, clamped to half the short side. */
  radius: number;
  dpr: number;
  appearance: GlassAppearance;
  /** Width in CSS pixels of the rim band where the surface fill thins out. */
  band: number;
  /** Fill opacity left at the very rim, as a fraction of the token fill. */
  rimFill: number;
}

export interface MaterialPixels {
  /** Pixels across and down: each map covers the box plus 2 CSS px a side. */
  columns: number;
  rows: number;
  /** Displacement in red and green, 0.5 neutral; shape coverage in alpha. */
  field: Uint8Array;
  /** The specular highlight as an alpha mask (white, alpha = coverage): painted in the
      `lens-light` effect colour by the layer that wears it. */
  highlight: Uint8Array;
  /** The side shading of the rim as an alpha mask: painted in `lens-shade`. Under the
      highlight, so light over a dark rim exactly as upstream's single overlay composites. */
  shade: Uint8Array;
  /** Ours, not upstream's: where the token fill sits (alpha), so the
      refraction shows at the rim while text inside keeps its AA fill. */
  body: Uint8Array;
}

const sat = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const byte = (x: number) => Math.round(sat(x) * 255);

/** Signed distance (negative inside) from a rounded rectangle centred on the
    origin, and the outward unit normal, in screen axes (y down). */
export function roundedRectField(
  x: number,
  y: number,
  halfWidth: number,
  halfHeight: number,
  radius: number,
): { d: number; nx: number; ny: number } {
  const qx = Math.abs(x) - (halfWidth - radius);
  const qy = Math.abs(y) - (halfHeight - radius);
  const sx = x < 0 ? -1 : 1;
  const sy = y < 0 ? -1 : 1;
  if (qx > 0 && qy > 0) {
    const length = Math.hypot(qx, qy);
    return { d: length - radius, nx: (qx / length) * sx, ny: (qy / length) * sy };
  }
  if (qx > qy) return { d: Math.max(qx, qy) - radius, nx: sx, ny: 0 };
  return { d: Math.max(qx, qy) - radius, nx: 0, ny: sy };
}

/** The field, highlight, shade and body planes for one surface: maps.wgsl fs_main. */
export function renderMaterialPixels(g: MapGeometry): MaterialPixels {
  return renderPlanes(g, mapScale(g.width, g.height, g.dpr), true, true);
}

/** The displacement field alone, at FIELD_SCALE of the usual resolution. It is smooth (a
    20px edge ramp) and the SVG filter interpolates it, so a half-resolution field costs a
    quarter of the pixels and looks the same. It does not depend on the appearance. */
export const FIELD_SCALE = 0.5;
export function renderFieldPixels(g: MapGeometry): MaterialPixels {
  return renderPlanes(
    g,
    Math.max(0.5, mapScale(g.width, g.height, g.dpr) * FIELD_SCALE),
    true,
    false,
  );
}

/** The rim planes alone (highlight, shade, body): these are the ones that depend on the
    appearance, so a theme switch redraws only these. */
export function renderRimPixels(g: MapGeometry): MaterialPixels {
  return renderPlanes(g, mapScale(g.width, g.height, g.dpr), false, true);
}

const NONE = new Uint8Array(0);

function renderPlanes(
  g: MapGeometry,
  scale: number,
  wantField: boolean,
  wantRim: boolean,
): MaterialPixels {
  const columns = Math.ceil((g.width + 4) * scale);
  const rows = Math.ceil((g.height + 4) * scale);
  const size = columns * rows * 4;
  const field = wantField ? new Uint8Array(size) : NONE;
  const highlightPlane = wantRim ? new Uint8Array(size) : NONE;
  const shadePlane = wantRim ? new Uint8Array(size) : NONE;
  const body = wantRim ? new Uint8Array(size) : NONE;
  const halfWidth = g.width / 2;
  const halfHeight = g.height / 2;
  const radius = Math.max(0, Math.min(g.radius, halfWidth, halfHeight));
  const dark = g.appearance === 'dark' ? 1 : 0;
  const stepX = (g.width + 4) / columns;
  const stepY = (g.height + 4) / rows;
  const spread = 1.08;
  const sideSpread = 0.98;

  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      const px = (column + 0.5) * stepX - (g.width + 4) / 2;
      const py = (row + 0.5) * stepY - (g.height + 4) / 2;
      const { d, nx, ny } = roundedRectField(px, py, halfWidth, halfHeight, radius);
      // fwidth(d) of a distance field is |n.x| dx + |n.y| dy; floor 1 / dpr.
      const aa = Math.max(Math.abs(nx) * stepX + Math.abs(ny) * stepY, 1 / scale);
      const coverage = sat(0.5 - d / aa);
      const edge = edgeDisplacement(d, 1, 0.05);
      const i = (row * columns + column) * 4;

      // Field plane.
      if (wantField) {
        field[i] = byte(0.5 - nx * edge * 0.5);
        field[i + 1] = byte(0.5 - ny * edge * 0.5);
        field[i + 2] = 128;
        field[i + 3] = byte(coverage);
      }
      if (!wantRim) continue;

      // Overlay plane: top/bottom light kept off the side outline.
      const directional = sat((Math.abs(ny) - Math.cos(spread)) / (1 - Math.cos(spread))) ** 1.25;
      const diffuseDir =
        sat((Math.abs(ny) - Math.cos(spread * 0.65)) / (1 - Math.cos(spread * 0.65))) ** 1.25;
      const stroke = sat((d + 0.9) / aa + 0.5) * sat(0.5 - d / aa);
      let specular = directional * stroke;
      specular = specular / (1 + 0.5 * (1 - specular));
      const diffuse = diffuseDir * 0.18 * (1 - sat(-d / 4.5)) ** 2 * coverage;
      // the inner diffuse haze stays faint (full strength it reads as a glow); dark keeps less
      const highlight = sat(specular * mix(0.9, 0.82, dark) + diffuse * mix(0.35, 0.12, dark));
      const adjusted = d - 0.5;
      const falloff = 1 - sat(-adjusted / 0.5);
      const ramp = mix(falloff > 0 ? 1 : 0, falloff, 0.75);
      const outline = ramp * sat((adjusted + 0.5) / aa + 0.5) * sat(-adjusted / aa + 0.5);
      const cosSide = Math.cos(sideSpread);
      const wa = sat((nx - cosSide) / (1 - cosSide)) * outline;
      const wb = sat((-nx - cosSide) / (1 - cosSide)) * outline;
      const shade = (wa / (1 + 0.4 * (1 - wa)) + wb / (1 + 0.4 * (1 - wb))) * mix(0.32, 0.3, dark);
      // Two masks, not one grey image: the highlight (painted `lens-light`, which carries
      // the dark-mode dimming) over the shade (painted `lens-shade`). Stacked, they
      // cover highlight + shade * (1 - highlight), the single overlay's alpha.
      highlightPlane.fill(255, i, i + 3);
      highlightPlane[i + 3] = byte(highlight);
      shadePlane.fill(255, i, i + 3);
      shadePlane[i + 3] = byte(shade);

      // Body plane: the token fill, thinned across the rim band only.
      const inner = g.band > 0 ? sat(-d / g.band) : 1;
      const smooth = inner * inner * (3 - 2 * inner);
      body[i] = 255;
      body[i + 1] = 255;
      body[i + 2] = 255;
      // keep the fill mostly solid at the rim; a thinned rim lets the backdrop through as a
      // pale band, which reads as a glow (dark more so, so it keeps more)
      const rimFill = mix(g.rimFill, 0.9, dark);
      body[i + 3] = byte(coverage * mix(rimFill, 1, smooth));
    }
  }
  return { columns, rows, field, highlight: highlightPlane, shade: shadePlane, body };
}
