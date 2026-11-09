/* The sea glass fragment shader.

   Ported from Blueemi/sea-glass-demo (MIT, © its author; see THIRD_PARTY_NOTICES.md). One
   full-screen pass draws the paper and every piece of glass on it: each piece is a rounded
   box lifted into a dome ("slice"), walked down the line of sight to find where the eye enters
   the glass, then lit by the sun with a frosted, sand-etched surface. The paper carries every
   piece's shadow, coloured by the glass, with the bright focused patch the dome bends the light
   into.

   Changes from upstream:
   - every colour is handed in as a uniform read from a role (uPaper, uSun, uSky, uTint);
     the shader holds none of its own (ENGINEERING.md §14, 30-31). The numbers left are
     light amounts, never colours;
   - uClear draws no paper: the canvas is transparent, a piece's shadow is a soft veil and
     the page shows through, so a stage can sit on any surface;
   - uFrost scales the white frost (dark mode keeps it low so `fg` text stays readable);
   - uNight (dark mode) lights the glass the way it reads at night: the bodies stay deep (so
     `fg` text keeps its contrast) and the colour lives in the light instead: a glowing rim in
     the glass's own hue, light pooling in that hue on the paper beside it, and a crisp
     moonlight highlight. Without it, deep tints on dark paper read as dull clay;
   - the flashlight and the per-frame dither are gone (a still frame must not change). */
export const MAX_PIECES = 24;

export const VERTEX_SHADER = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

export const FRAGMENT_SHADER = `
precision highp float;
#define MAXN ${MAX_PIECES}
uniform vec2 uRes;
uniform float uDpr;
uniform float uExpo;
uniform float uTilt;
uniform float uClear;
uniform float uFrost;
uniform float uNight;
uniform vec3 uL;
uniform vec3 uSun;
uniform vec3 uSky;
uniform vec3 uPaper;
uniform int uN;
uniform vec4 uRect[MAXN];   // center x, center y, half width, half height (css px)
uniform vec4 uRad[MAXN];    // corner radii: top-left, top-right, bottom-right, bottom-left
uniform vec4 uShape[MAXN];  // edge reach, thickness, lift, opacity (+2 when the piece rests on another)
uniform vec4 uTint[MAXN];   // linear glass colour, frost
uniform vec4 uMisc[MAXN];   // seed, edge wobble, density, glow

float hash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);
}
float fbm(vec2 p){ float s = 0., a = .5; for(int i = 0; i < 4; i++){ s += a * vnoise(p); p = p * 2.03 + vec2(17.3, 9.1); a *= .5; } return s; }
float sdBox(vec2 p, vec2 b, vec4 r){
  float rr = p.x < 0. ? (p.y < 0. ? r.x : r.w) : (p.y < 0. ? r.y : r.z);
  rr = min(rr, min(b.x, b.y));
  vec2 q = abs(p) - b + rr;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - rr;
}
float wob(vec2 q, vec4 M){ return (vnoise(q * .0065 + M.x) + vnoise(q * .02 + M.x * 1.7) * .25) * M.y; }
float wobble(vec2 q, vec4 M){ return wob(q, M) - wob(vec2(0.), M); }
float slice(vec2 q, vec4 R, vec4 C, float E, float u){
  float k = E * (1. - sqrt(max(0., 1. - u * u)));
  vec2 b = max(R.zw - k, vec2(.5));
  return sdBox(q, b, min(C + k, vec4(min(b.x, b.y))));
}
vec3 muted(vec3 T){ return mix(vec3(dot(T, vec3(.2126, .7152, .0722))), T, mix(.92, 1., uNight)); }
// the tint's hue at full brightness: the colour of light that has passed through it
vec3 hue(vec3 T){ return T / max(max(T.r, T.g), max(T.b, 1e-4)); }
vec3 albedo(vec2 p){
  float m = fbm(p * .011) * .6 + fbm(p * vec2(.2, .05)) * .4;
  float g = hash(floor(p * uDpr));
  return uPaper * (.972 + .05 * m + .016 * (g - .5));
}
float vignette(vec2 p){
  vec2 view = uRes / uDpr;
  vec2 rel = (p - view * .5) / max(view.x, view.y);
  return 1. - .2 * dot(rel, rel);
}
vec3 bare(vec2 p){ return albedo(p) * (uSky * .36 + uSun * .74) * vignette(p); }
vec3 paper(vec2 p, float blur){
  vec3 L = uL;
  vec2 dir = -L.xy / max(L.z, .25);
  vec3 direct = vec3(1.), caus = vec3(0.);
  float occ = 0.;
  for(int i = 0; i < MAXN; i++){
    if(i >= uN) break;
    vec4 R = uRect[i], S = uShape[i];
    if(S.w > 1.5) continue;
    float Z = S.z, H = S.y, top = Z + H;
    vec2 q = p - R.xy - vec2(0., uTilt * (Z + H * .05));
    vec2 o1 = dir * top, pad = R.zw + vec2(24. + top * .5 + blur);
    vec2 lo = min(vec2(0.), o1) - pad, hi = max(vec2(0.), o1) + pad;
    if(q.x < lo.x || q.y < lo.y || q.x > hi.x || q.y > hi.y) continue;
    vec4 C = uRad[i], M = uMisc[i];
    float wv = wobble(q - dir * (Z + H * .5), M);
    float s = 0., thru = 0.;
    for(int k = 0; k < 8; k++){
      float u = (float(k) + .5) / 8., z = Z + H * u;
      float w = 1. + z * .14 + blur;
      float cov = 1. - smoothstep(-w, w, slice(q - dir * z, R, C, S.x, u) + wv);
      s = max(s, cov); thru += cov;
    }
    s *= S.w * S.w; thru /= 8.;
    vec3 T = muted(uTint[i].rgb);
    direct *= mix(vec3(1.), pow(T, vec3(M.z * (1.2 + 2. * thru))) * .26, s);
    vec2 oc = dir * (Z + H * .65);
    oc *= min(1., (H + 6.) / max(length(oc), 1e-3));
    float rc = min(R.z, R.w) * .6, wc = 3. + H * .3 + blur;
    float c = 1. - smoothstep(-wc, wc, sdBox(q - oc, R.zw * .6, vec4(rc)) + wv);
    caus += c * s * mix(pow(T, vec3(M.z * 2.2)) * 1.25, hue(T) * .55, uNight);
    float d0 = slice(q, R, C, S.x, 0.) + wv;
    occ = max(occ, exp(-max(d0, 0.) / (2. + Z)) * (1. - smoothstep(0., 20., Z)) * .35 * S.w);
  }
  vec3 lit = albedo(p) * (uSky * .36 * (1. - occ) + uSun * .74 * (direct + caus * (1. - uNight))) * vignette(p);
  // at night the light through the glass pools on the paper as a soft glow of its own
  return lit + caus * uSun * uNight * .16;
}
vec4 pebble(vec2 p, vec4 R, vec4 C, vec4 S, vec4 Tn, vec4 M, vec3 under, bool top){
  float E = S.x, H = S.y, tl = uTilt;
  vec2 q0 = p - R.xy + vec2(0., tl * H * .95);
  float wv = wobble(q0, M);
  float dPrev = 1e5, zPrev = H, dMin = 1e5, zMin = 0., zHit = -1.;
  for(int k = 0; k <= 10; k++){
    float z = H * (1. - float(k) / 10.);
    float d = slice(q0 + vec2(0., tl * (z - H)), R, C, E, z / H) + wv;
    if(d < dMin){ dMin = d; zMin = z; }
    if(zHit < 0. && d <= 0.) zHit = k == 0 ? z : mix(zPrev, z, dPrev / max(dPrev - d, 1e-4));
    dPrev = d; zPrev = z;
  }
  float cov = 1. - smoothstep(-.7, .7, dMin);
  if(cov <= 0.) return vec4(0.);
  if(zHit < 0.) zHit = zMin;
  float u = clamp(zHit / H, 0., .995);
  vec2 q = q0 + vec2(0., tl * (zHit - H));
  float d0 = slice(q, R, C, E, u);
  vec2 g = vec2(slice(q + vec2(.75, 0.), R, C, E, u) - d0, slice(q + vec2(0., .75), R, C, E, u) - d0);
  g /= max(length(g), 1e-4);
  vec3 n = normalize(vec3(g, (E / H) * u / sqrt(1. - u * u)));
  vec2 lp = q * .018 + M.x * 2.3;
  n = normalize(n + vec3(vnoise(lp) - .5, vnoise(lp + 17.1) - .5, 0.) * .3 * n.z);
  vec3 V = normalize(vec3(0., tl, 1.));
  vec3 L = uL, Hh = normalize(L + V);
  vec3 sun = uSun;
  vec3 G = muted(Tn.rgb);
  float frost = Tn.a * uFrost, dens = M.z;
  float lit = clamp(dot(n, L), 0., 1.);
  vec2 dirN = normalize(-L.xy + vec2(1e-5));
  float far = clamp(.5 + .9 * dot(n.xy, dirN), 0., 1.);
  float sat = clamp(.08 + .2 * u + .9 * pow(far, 2.2), 0., 1.);
  vec3 pale = pow(G, vec3(dens * .6)), deep = pow(G, vec3(dens * 2.3));
  float grain = vnoise(p * uDpr * .75 + M.x * 9.) * .65 + vnoise(q * .35 + M.x * 3.) * .35;
  vec3 col = mix(pale, deep, sat) * (sun * (.48 + .26 * lit + .3 * far) + uSky * .26) * (.96 + .08 * grain);
  if(top) under = paper(p + n.xy * 3., 5. + H * .5);
  col += under * pow(G, vec3(dens * (.5 + u))) * .12;
  col += (sun * (.02 + .2 * lit * lit) + uSky * .03) * frost * (1. - .5 * sat) * (.5 + grain);
  float away = clamp(dot(n.xy, dirN), 0., 1.) * (1. - n.z);
  col += sun * deep * away * .45;
  col += sun * pow(max(dot(n, Hh), 0.), 12.) * .06 * frost * (.6 + .8 * grain);
  vec2 sg = q / 1.8 + M.x * 7.;
  vec2 ci = floor(sg);
  float sd = length((fract(sg) - vec2(hash(ci + 1.3), hash(ci + 2.9)) * .8 - .1) * 1.8);
  float aw = .7 / uDpr;
  float speck = step(.945, hash(ci)) * (1. - smoothstep(.4 - aw, .4 + aw, sd)) * (.45 + .55 * hash(ci + 4.4));
  col += sun * speck * (.2 + .8 * lit) * frost * 1.1;
  col += G * M.w * (.18 + .3 * (1. - n.z));
  if(uNight > .5){
    vec3 glow = hue(G);
    float edge = 1. - n.z;
    // light caught in the glass: a rim in its own hue, brightest on the side away from the moon
    col += glow * pow(edge, 3.) * (.3 + .7 * far) * (.8 + .4 * grain);
    // and a thin, crisp moonlight sheen on the near slope (never on the flat top, where the text is)
    float slope = smoothstep(.3, .7, edge);
    col += sun * pow(max(dot(n, Hh), 0.), 90.) * .45 * slope;
    col += sun * smoothstep(.6, .95, edge) * lit * .16;
    // pulse and lit glow in the glass's hue, not its deep body colour
    col += glow * M.w * (.06 + .6 * edge * edge);
  }
  return vec4(col, cov);
}
vec3 grade(vec3 c){
  c *= uExpo;
  c = mix(c, 1. - .2 * exp((.8 - c) / .2), step(.8, c));
  return pow(max(c, vec3(0.)), vec3(1. / 2.2));
}
void main(){
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
  vec3 col = paper(p, 0.);
  vec3 ground = col;
  float glass = 0.;
  for(int i = 0; i < MAXN; i++){
    if(i >= uN) break;
    vec4 R = uRect[i], S = uShape[i], C = uRad[i];
    vec2 q = p - R.xy;
    bool nested = S.w > 1.5;
    float a = nested ? S.w - 2. : S.w, tH = uTilt * S.y;
    if(nested){
      if(abs(q.x) > R.z + 40. || abs(q.y) > R.w + 40.) continue;
      vec2 dir = -uL.xy / max(uL.z, .25);
      float zs = S.z + S.y * .7, w = 1.5 + zs * .35;
      float s = 1. - smoothstep(-w, w, sdBox(q - dir * zs - vec2(0., tH * .05), R.zw, C));
      col *= mix(vec3(1.), muted(uTint[i].rgb) * .45 + .3, s * .5 * a);
    }
    if(q.x < -R.z - 6. || q.x > R.z + 6. || q.y < -R.w - 6. || q.y > R.w + 6.) continue;
    vec4 g = pebble(p, R, C, S, uTint[i], uMisc[i], col, !nested);
    col = mix(col, g.rgb, g.a * a);
    if(!nested) glass = glass + (1. - glass) * g.a * a;
  }
  vec3 graded = grade(col);
  graded += (hash(gl_FragCoord.xy) - .5) / 255.;
  if(uClear < .5){
    gl_FragColor = vec4(graded, 1.);
    return;
  }
  // no paper: the shadow is a veil of the shaded paper's colour, as strong as it darkens
  vec3 b = bare(p);
  float shade = clamp(1. - dot(ground, vec3(.2126, .7152, .0722)) / max(dot(b, vec3(.2126, .7152, .0722)), 1e-4), 0., 1.) * .85;
  vec4 veil = vec4(grade(ground) * .35 * shade, shade);
  gl_FragColor = mix(veil, vec4(graded, 1.), glass);
}
`;
