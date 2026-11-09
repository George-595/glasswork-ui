import type { MountBackground } from './types';
import { mountShaderScene } from './gl';
import { NOISE } from './noise';
import { WASH } from './wash';

/* Hive — a honeycomb that breathes.

   A lattice of hexagons, about seven cells tall whatever the screen, laid over the shared
   colour wash (wash.ts), so the whole page glows softly and the comb is the light on top of
   it. Each cell's light is a broad, slow wave rolling across the comb on a diagonal plus the
   cell's own slow flicker (noise sampled at the cell's centre, so a cell is one even light).
   A lit cell glows from its centre and its walls brighten; a quiet cell keeps a fine wall.
   Walls are drawn to the pixel (their softening is one screen pixel wide at any size), so
   the comb stays crisp on a large screen.

   The same render-on-demand rules as every backdrop: the component draws it at 30 fps at
   most, only where the device can afford it, and as one still frame everywhere else. */
const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
${NOISE}
${WASH}
// distance from a cell's centre to its wall: 0 at the centre, 0.5 on the wall
float wall(vec2 g) {
  g = abs(g);
  return max(dot(g, vec2(0.8660254, 0.5)), g.y);
}

void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  const float CELLS = 7.0;
  vec2 uv = p * CELLS;
  float pixel = CELLS / uRes.y; // one screen pixel, in cell units

  // nearest centre of two offset rectangular lattices = the hexagonal one
  vec2 span = vec2(1.7320508, 1.0);
  vec2 a = mod(uv, span) - 0.5 * span;
  vec2 b = mod(uv - 0.5 * span, span) - 0.5 * span;
  vec2 g = dot(a, a) < dot(b, b) ? a : b;
  vec2 id = uv - g;
  float d = wall(g);

  // the cell's light: a slow diagonal wave plus its own flicker
  float wave = 0.5 + 0.5 * sin(dot(id, vec2(0.32, 0.21)) - t * 0.45);
  float own = valueNoise(id * 0.37 + vec2(t * 0.06, -t * 0.04));
  float light = clamp(smoothstep(0.6, 1.0, wave) * 0.8 + smoothstep(0.58, 0.9, own), 0.0, 1.0);

  // a crisp wall about two pixels wide, shared by neighbours; a glow from lit centres
  float rim = 1.0 - smoothstep(pixel * 0.6, pixel * 1.8, 0.5 - d);
  float glow = (1.0 - 0.55 * smoothstep(0.0, 0.48, d)) * light;

  vec4 pools = wash(p, t * 0.6, 1.0);
  vec3 lit = mix(uC1, uC2, own);
  vec3 colour = mix(pools.rgb, lit, clamp(glow * 1.3, 0.0, 1.0));
  colour = min(colour * (1.0 + 0.45 * rim * (0.4 + 0.6 * light)), vec3(1.0));

  float alpha = clamp(pools.a * 0.5 + rim * (0.35 + 0.55 * light) + glow * 0.55, 0.0, 1.0);
  gl_FragColor = vec4(colour * alpha, alpha);
}
`;

export const mount: MountBackground = (container, colors) =>
  mountShaderScene(container, colors, FRAGMENT);
