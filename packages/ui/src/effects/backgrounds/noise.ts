/* Shared GLSL for the backdrops: a hash, smooth value noise and a few octaves of it.
   GLSL ES 1.00, so WebGL1 and WebGL2 both compile it. */
export const NOISE = `
float hash21(vec2 p) {
  p = fract(p * vec2(233.34, 851.73));
  p += dot(p, p + 23.45);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float octaves(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  mat2 turn = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) {
    sum += amp * valueNoise(p);
    p = turn * p;
    amp *= 0.5;
  }
  return sum;
}

// three octaves: broad shapes only, for fields that must stay calm behind text
float softOctaves(vec2 p) {
  float sum = 0.0;
  float amp = 0.55;
  mat2 turn = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 3; i++) {
    sum += amp * valueNoise(p);
    p = turn * p;
    amp *= 0.45;
  }
  return sum;
}
`;
