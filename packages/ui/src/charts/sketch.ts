/* sketch — hand-drawn strokes for SVG, the kit's own (in the spirit of rough.js, written from
   scratch): every line is drawn twice with a slight bow and wobble, rectangles overshoot their
   corners, curves wander a little off their path, and fills are hachure. All of it is
   deterministic for a seed, so a drawing can "boil" between a few seeds, the way hand-drawn
   animation redraws each frame, without ever jumping somewhere new.

   Output is SVG path data only; colour is the caller's (roles, as classes). */

export interface Pt {
  x: number;
  y: number;
}

/** A small seeded random number generator (mulberry32): the same seed, the same drawing. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from a string (an id), so each shape wobbles its own way. */
export function seedOf(text: string, frame = 0): number {
  let h = 2166136261 ^ frame;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const spread = (rnd: () => number, amount: number) => (rnd() * 2 - 1) * amount;

/** One stroke from a to b: ends nudged, the middle bowed off the straight line. */
function stroke(a: Pt, b: Pt, rnd: () => number, rough: number): string {
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const nx = -(b.y - a.y) / len;
  const ny = (b.x - a.x) / len;
  const bow = spread(rnd, Math.min(3.2, len * 0.015 + 0.6) * rough);
  const j = 1.4 * rough;
  const t = 0.4 + rnd() * 0.2;
  const s = { x: a.x + spread(rnd, j), y: a.y + spread(rnd, j) };
  const e = { x: b.x + spread(rnd, j), y: b.y + spread(rnd, j) };
  const c = { x: a.x + (b.x - a.x) * t + nx * bow, y: a.y + (b.y - a.y) * t + ny * bow };
  return `M${r1(s.x)},${r1(s.y)} Q${r1(c.x)},${r1(c.y)} ${r1(e.x)},${r1(e.y)}`;
}

/** A line drawn twice, as a hand goes over it. */
export function sketchLine(a: Pt, b: Pt, seed: number, rough = 1): string {
  const rnd = seeded(seed);
  return `${stroke(a, b, rnd, rough)} ${stroke(a, b, rnd, rough * 0.8)}`;
}

/** A rectangle: four double strokes that run a little past each corner. */
export function sketchRect(x: number, y: number, w: number, h: number, seed: number): string {
  const rnd = seeded(seed);
  const o = () => 2 + rnd() * 3; // overshoot
  const side = (a: Pt, b: Pt) => {
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    const oa = o();
    const ob = o();
    const s = { x: a.x - ux * oa, y: a.y - uy * oa };
    const e = { x: b.x + ux * ob, y: b.y + uy * ob };
    return `${stroke(s, e, rnd, 1)} ${stroke(a, b, rnd, 0.7)}`;
  };
  return [
    side({ x, y }, { x: x + w, y }),
    side({ x: x + w, y }, { x: x + w, y: y + h }),
    side({ x: x + w, y: y + h }, { x, y: y + h }),
    side({ x, y: y + h }, { x, y }),
  ].join(' ');
}

/** Hachure: diagonal strokes filling a rectangle, a little loose at the edges. */
export function sketchHachure(
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  gap = 9,
): string {
  const rnd = seeded(seed);
  const out: string[] = [];
  const inset = 4;
  const x0 = x + inset;
  const y0 = y + inset;
  const ww = w - 2 * inset;
  const hh = h - 2 * inset;
  // lines x - y = k at 45 degrees, from the bottom-left corner across
  for (let k = -hh + gap / 2; k < ww; k += gap) {
    const a = { x: x0 + Math.max(k, 0), y: y0 + hh - Math.max(0, -k) };
    const runX = ww - Math.max(k, 0);
    const runY = hh - Math.max(0, -k);
    const run = Math.min(runX, runY);
    const b = { x: a.x + run, y: a.y - run };
    out.push(stroke(a, b, rnd, 0.9));
  }
  return out.join(' ');
}

function cubicAt(c: readonly [Pt, Pt, Pt, Pt], t: number): Pt {
  const u = 1 - t;
  const [p0, p1, p2, p3] = c;
  return {
    x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
    y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
  };
}

/** Points through `pts` as a smooth path (Catmull-Rom as cubics). */
function smooth(pts: readonly Pt[]): string {
  const first = pts[0];
  if (!first) return '';
  let d = `M${r1(first.x)},${r1(first.y)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${r1(c1.x)},${r1(c1.y)} ${r1(c2.x)},${r1(c2.y)} ${r1(p2.x)},${r1(p2.y)}`;
  }
  return d;
}

/** A cubic curve drawn by hand, twice, with an open arrowhead at its end. */
export function sketchCurve(curve: readonly [Pt, Pt, Pt, Pt], seed: number, arrow = true): string {
  const rnd = seeded(seed);
  const pass = (amount: number) => {
    const pts: Pt[] = [];
    const n = 14;
    let wander = 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = cubicAt(curve, t);
      const q = cubicAt(curve, Math.min(1, t + 0.01));
      const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
      // a slow wander, pinned at both ends
      wander += spread(rnd, 0.9 * amount);
      const pin = Math.sin(Math.PI * t);
      pts.push({
        x: p.x - ((q.y - p.y) / len) * wander * pin,
        y: p.y + ((q.x - p.x) / len) * wander * pin,
      });
    }
    return smooth(pts);
  };
  let d = `${pass(1)} ${pass(0.7)}`;
  if (arrow) {
    const tip = curve[3];
    const back = cubicAt(curve, 0.96);
    const ang = Math.atan2(tip.y - back.y, tip.x - back.x);
    for (const side of [-1, 1]) {
      const a = ang + Math.PI + side * (0.45 + spread(rnd, 0.08));
      const len = 9 + spread(rnd, 1.5);
      d += ` ${sketchLine(tip, { x: tip.x + Math.cos(a) * len, y: tip.y + Math.sin(a) * len }, seed + side, 0.5)}`;
    }
  }
  return d;
}

/** A loose underline scribble across `width`: out, a tight turn, and most of the way back. */
export function sketchUnderline(width: number, height: number, seed: number): string {
  const rnd = seeded(seed);
  const mid = height / 2;
  const pts: Pt[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    pts.push({ x: 2 + ((width - 6) * i) / n, y: mid - 1.5 + spread(rnd, 1.6) + (i / n) * 1.5 });
  }
  for (let i = n; i >= 2; i--) {
    pts.push({ x: 8 + ((width - 16) * i) / n, y: mid + 2.5 + spread(rnd, 1.6) - (i / n) * 1.2 });
  }
  return smooth(pts);
}
