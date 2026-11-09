import type { MountBackground } from './types';
import { mountShaderScene } from './gl';
import { NOISE } from './noise';
import { WASH } from './wash';

/* Tide — slow silk.

   Three luminous pools of the ramp colours drift across the page on their own slow paths
   (the shared wash, wash.ts), so the colours stay distinct and clear and blend only where
   they meet. Across the lit pools runs a faint silk: long folds where a broad noise field
   crosses its contours, catching a little more light. Where no pool reaches, the page shows
   through, so text on the page always has a quiet place to sit.

   Calm by design: a pool takes about a minute to wander and return. The component draws it at
   30 fps at most, and only on a device that can afford it; elsewhere it is one still frame. */
const FRAGMENT = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uC0;
uniform vec3 uC1;
uniform vec3 uC2;
${NOISE}
${WASH}
void main() {
  vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  vec4 pools = wash(p, t, 2.4);

  // long, soft folds across the lit pools: light catching silk
  float f = softOctaves(p * 1.3 + vec2(t * 0.03, -t * 0.02));
  float folds = 0.5 + 0.5 * sin((f * 4.6 + p.y * 1.4 + t * 0.04) * 3.14159);
  float silk = smoothstep(0.2, 1.0, folds) * pools.a;

  vec3 colour = min(pools.rgb * (0.92 + 0.16 * f + 0.14 * silk), vec3(1.0));
  // a soft shoulder: the pools glow at their heart and fade long and slow into the page
  float body = pools.a * pools.a * (3.0 - 2.0 * pools.a);
  float alpha = clamp(body * (0.94 + 0.08 * silk), 0.0, 1.0);
  gl_FragColor = vec4(colour * alpha, alpha);
}
`;

export const mount: MountBackground = (container, colors) =>
  mountShaderScene(container, colors, FRAGMENT);
