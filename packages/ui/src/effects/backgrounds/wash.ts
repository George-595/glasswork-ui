/* The colour wash both backdrops stand on: three soft, luminous pools of light, one per ramp
   colour. Each pool is a long ellipse, slowly turning and wandering on its own path (periods
   of about a minute, never in step), so the page reads as sweeps of light rather than spots.
   Where pools overlap their colours blend by weight and their light adds up like light does
   (1 - the product of what each lets through); where none reaches, the page shows through.

   Needs uC0, uC1, uC2 declared and NOISE (softOctaves) included before it. */
export const WASH = `
float pool(vec2 q, vec2 centre, float angle, float length, float tightness) {
  vec2 d = q - centre;
  float c = cos(angle);
  float s = sin(angle);
  d = vec2(c * d.x + s * d.y, -s * d.x + c * d.y);
  d.x /= length;
  return exp(-dot(d, d) * tightness);
}

// spread 1 = broad pools that nearly meet; larger = tighter pools with more quiet page between
vec4 wash(vec2 p, float t, float spread) {
  vec2 drift = 0.06 * (vec2(softOctaves(p * 0.9 + vec2(t * 0.05, 0.0)), softOctaves(p * 0.9 + vec2(3.0, -t * 0.04))) - 0.5);
  vec2 q = p + drift;
  float wa = pool(q, vec2(-0.6 + 0.3 * sin(t * 0.11), 0.22 + 0.18 * sin(t * 0.17 + 1.0)), 0.5 + 0.3 * sin(t * 0.05), 1.9, 3.2 * spread);
  float wb = pool(q, vec2(0.6 + 0.26 * sin(t * 0.13 + 2.0), 0.2 + 0.16 * cos(t * 0.09)), -0.6 + 0.25 * cos(t * 0.06), 1.7, 3.0 * spread);
  float wc = pool(q, vec2(0.05 + 0.4 * cos(t * 0.07 + 4.0), -0.38 + 0.14 * sin(t * 0.15 + 3.0)), 0.15 * sin(t * 0.08), 2.3, 2.6 * spread);
  float sum = wa + wb + wc;
  vec3 colour = (uC0 * wa + uC1 * wb + uC2 * wc) / max(sum, 0.0001);
  float light = 1.0 - (1.0 - wa) * (1.0 - wb) * (1.0 - wc);
  return vec4(colour, light);
}
`;
