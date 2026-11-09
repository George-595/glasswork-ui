/* Chart maths that @tanstack/charts leaves to the application: "nice" axis
   ticks (so every chart's y axis steps the same way), the default number
   format, and a monotone curve. The curve is a small port of d3-shape's
   curveMonotoneX onto TanStack's ChartCurve contract (d3-shape is not a
   dependency of this package): smooth like the shadcn examples, but it never
   overshoots the data, so a peak drawn is a peak that happened. */
import type { ChartCurve } from '@tanstack/charts';

/** Round, evenly spaced ticks covering [min, max]: steps of 1, 2, 2.5 or 5 × 10^n.
    With `integer`, only whole-number steps (1, 2, 5 × 10^n), so a chart of counts never labels 0.25. */
export function niceTicks(min: number, max: number, count = 5, integer = false): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0];
  if (min === max) {
    if (min === 0) return [0, 1];
    const pad = Math.abs(min) * 0.1;
    return niceTicks(min - pad, max + pad, count, integer);
  }
  const raw = (max - min) / Math.max(1, count - 1);
  const mag = integer
    ? Math.max(1, 10 ** Math.floor(Math.log10(raw)))
    : 10 ** Math.floor(Math.log10(raw));
  const steps = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  const step = (steps.find((s) => s * mag >= raw) ?? 10) * mag;
  const start = Math.floor(min / step) * step;
  const ticks: number[] = [];
  for (let v = start; v <= max + step * 1e-9; v += step) ticks.push(round(v, step));
  if ((ticks[ticks.length - 1] ?? 0) < max) ticks.push(round(start + ticks.length * step, step));
  return ticks;
}

// drop float noise (0.30000000000000004) to the step's precision
function round(v: number, step: number) {
  const digits = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return Number(v.toFixed(digits));
}

export const defaultFormat = (n: number) => n.toLocaleString('en-GB', { maximumFractionDigits: 2 });

type Pt = readonly [number, number];
const fx = (n: number) => Number(n.toFixed(2));

/** Tangent at each point (Fritsch–Carlson, as d3's curveMonotoneX). */
function tangents(p: readonly Pt[]): number[] {
  const n = p.length;
  const m = Array.from({ length: n }, () => 0);
  for (let i = 1; i < n - 1; i++) {
    const [x0, y0] = p[i - 1] as Pt;
    const [x1, y1] = p[i] as Pt;
    const [x2, y2] = p[i + 1] as Pt;
    const h0 = x1 - x0;
    const h1 = x2 - x1;
    const s0 = h0 ? (y1 - y0) / h0 : 0;
    const s1 = h1 ? (y2 - y1) / h1 : 0;
    const q = h0 + h1 ? (s0 * h1 + s1 * h0) / (h0 + h1) : 0;
    m[i] =
      (Math.sign(s0) + Math.sign(s1)) * Math.min(Math.abs(s0), Math.abs(s1), 0.5 * Math.abs(q));
  }
  // the ends: a one-sided three-point estimate
  const end = (a: Pt, b: Pt, t: number) => {
    const h = b[0] - a[0];
    return h ? (3 * (b[1] - a[1])) / h / 2 - t / 2 : t;
  };
  if (n > 2) {
    m[0] = end(p[0] as Pt, p[1] as Pt, m[1] ?? 0);
    m[n - 1] = end(p[n - 2] as Pt, p[n - 1] as Pt, m[n - 2] ?? 0);
  }
  return m;
}

/** The path after its first point: one cubic per segment, or a straight line for two points. */
function segments(p: readonly Pt[]): string {
  if (p.length < 3)
    return p
      .slice(1)
      .map(([x, y]) => `L${fx(x)},${fx(y)}`)
      .join('');
  const m = tangents(p);
  let d = '';
  for (let i = 0; i < p.length - 1; i++) {
    const [x0, y0] = p[i] as Pt;
    const [x1, y1] = p[i + 1] as Pt;
    const h = (x1 - x0) / 3;
    const c1 = `${fx(x0 + h)},${fx(y0 + h * (m[i] ?? 0))}`;
    const c2 = `${fx(x1 - h)},${fx(y1 - h * (m[i + 1] ?? 0))}`;
    d += `C${c1},${c2},${fx(x1)},${fx(y1)}`;
  }
  return d;
}

const moveTo = (p: readonly Pt[]) => (p[0] ? `M${fx(p[0][0])},${fx(p[0][1])}` : '');

/** A monotone cubic through the points, for lineY and areaY's `curve`. */
export const monotoneX: ChartCurve = {
  line: (points) => (points.length ? moveTo(points) + segments(points) : ''),
  area: (top, bottom) => {
    if (!top.length) return '';
    const back = bottom.toReversed();
    const first = back[0];
    const lower = first ? `L${fx(first[0])},${fx(first[1])}${segments(back)}` : '';
    return `${moveTo(top)}${segments(top)}${lower}Z`;
  },
};
