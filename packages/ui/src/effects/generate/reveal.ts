import { quietLagMonitor, revealIsPlain } from '../lowPower';
import { type AsciiIcon, type AsciiInput, type AsciiPart, buildAscii } from './ascii';

/* generate() — "an agent is building this": the element is drawn in from its own structure,
   then handed over to the real UI. The kit's own reveal, written for @apps/ui (Nov 2026).

   The element is measured first (its boxes, the line boxes of its text, its icons and, with
   `traceSvg`, a chart's own marks), then drawn by one of two renderers over it:

   draft (default) · a drafting table. A faint sheet of guide lines comes up round the element
     and hairline construction lines run out from its main edges. A pen in the brand colour walks
     the outline, then every box inside it in reading order; dimension lines measure the element
     (their figures count up as they are drawn) and crop marks register its main parts. Text
     arrives as bars that grow line by line, a chart as its own marks stroke by stroke. Then the
     real element develops in through a soft circle that grows from its centre, a faint ring of
     light on its front, while the drawing dissolves ahead of it.
   ascii · the element rebuilt in glyphs (ascii.ts): a pen plotter in the enterprise skin, frost
     in glass (`plot` and `frost` pick one).

   `skeleton-texts` adds, beside the element where the page has room, a spec sheet typed out from
   what was measured (or from `code`) and a step line under it: the `steps`, then `done`.

   The contract every caller relies on:
   - The element is hidden (opacity 0) and inert from the call until it is shown, and every
     inline style the reveal touches is put back as it was; `data-generating` marks a run.
   - One scheduler: a single requestAnimationFrame loop for every run, building at most one
     overlay a frame, so a dashboard of thirty tiles never builds them all in one frame.
   - Reduced motion, or a page that forces `power="low"` or asks to save data, gets a plain
     fade and no overlay. A zero-size element, or one with no 2D canvas for `ascii`, is shown
     as it is at once.
   - A second run on the same element cancels the first; `skipAllGenerations()` or a
     `ui:generate-skip` event on window shows everything at once (the axe scans use it).
   - The overlay is decoration: aria-hidden, no pointer events, drawn inside the nearest
     `[data-generate-host]` (the app shell) so a sticky top bar stays above it.
   Colours are roles, read from styles/effects.css (`--gen-*`); nothing here names a colour. */

export type GenerateMode = 'skeleton' | 'skeleton-texts';
/** `draft` is the drafting-table drawing; `ascii` rebuilds the element in glyphs, in the look of
    the skin on <html data-skin> (`plot` for enterprise, `frost` for glass); `plot` and `frost`
    pick one. */
export type GenerateRender = 'draft' | 'ascii' | 'plot' | 'frost';

export interface GenerateOptions {
  /** `skeleton` (the drawing and the reveal) or `skeleton-texts` (plus a spec sheet and a step
      line, where the page has room). Default skeleton. */
  mode?: GenerateMode;
  /** ms of drawing; the whole run is about duration × 1.09. Keep it in 1400–3600. Default 2400. */
  duration?: number;
  /** ms before it starts (stagger several elements with it). Default 0. */
  delay?: number;
  /** The step line (skeleton-texts). */
  steps?: readonly string[];
  /** The last step, shown as the element comes in. Default "Ready". */
  done?: string;
  /** Lines for the spec sheet; default derived from what was measured. */
  code?: readonly string[] | null;
  /** The spec sheet's heading; default the aria-label or first heading. */
  title?: string | null;
  /** Most parts drawn (the largest are kept). Default 60. */
  maxParts?: number;
  /** Main parts that get construction lines and crop marks. Default 5. */
  keys?: number;
  /** Trace large SVGs (charts) mark by mark instead of drawing them as a box. Default false. */
  traceSvg?: boolean;
  /** How it is drawn. Default draft. `ascii` ignores `mode` (no spec sheet). */
  render?: GenerateRender;
  onDone?: ((el: HTMLElement) => void) | null;
}

export interface GenerateRun {
  /** Resolves when the real element is fully in. */
  finished: Promise<void>;
  /** Stops at once and shows the element as it is. */
  cancel: () => void;
  element: HTMLElement;
}

const NS = 'http://www.w3.org/2000/svg';
/** The run lasts this many durations: the drawing is 0–1, the hand-over runs a little past it. */
const END = 1.09;
/** The glyph renderers redraw a canvas: 30 frames a second is plenty for them. */
const ASCII_FRAME_MS = 32;
/** Room round the element for the dimension lines and the sheet's fade (px). */
const ROOM = 30;
/** A large SVG (a chart) is traced mark by mark with `traceSvg`; a small one is an icon. */
const LARGE_SVG = 120;
const MAX_MARKS = 400;

// ─── small maths ───
const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const span = (a: number, b: number, p: number) => clamp((p - a) / (b - a));
const easeOut = (q: number) => 1 - (1 - q) ** 3;
const settle = (q: number) => 1 - (1 - q) ** 4;
const inOut = (q: number) => (q < 0.5 ? 4 * q * q * q : 1 - (-2 * q + 2) ** 3 / 2);
const round1 = (n: number) => Math.round(n * 10) / 10;

// ─── measuring the element ───

interface Measured extends AsciiInput {
  /** Indices into `parts` of the main boxes (largest first). */
  keys: number[];
  title: string;
  spec: string[];
}

/** The alpha of a computed colour, whatever notation the browser reports it in. */
function alphaOf(colour: string): number {
  if (!colour || colour === 'transparent') return 0;
  const slash = colour.match(/\/\s*([\d.]+)(%?)\s*\)$/);
  if (slash) return Number(slash[1]) / (slash[2] ? 100 : 1);
  const rgba = colour.match(/^rgba\(.*,\s*([\d.]+)\s*\)$/);
  if (rgba) return Number(rgba[1]);
  return 1;
}

/** Does this element draw a box of its own (a border, a fill, a shadow), or is it a control? */
function drawsBox(node: Element, cs: CSSStyleDeclaration): boolean {
  if (/^(BUTTON|INPUT|SELECT|TEXTAREA|IMG|VIDEO|CANVAS|PROGRESS|METER)$/.test(node.tagName)) {
    return true;
  }
  const border =
    parseFloat(cs.borderTopWidth) > 0 &&
    cs.borderTopStyle !== 'none' &&
    alphaOf(cs.borderTopColor) > 0.05;
  const side =
    parseFloat(cs.borderLeftWidth) > 0 &&
    cs.borderLeftStyle !== 'none' &&
    alphaOf(cs.borderLeftColor) > 0.05;
  const fill =
    alphaOf(cs.backgroundColor) > 0.04 || (!!cs.backgroundImage && cs.backgroundImage !== 'none');
  return border || side || fill;
}

const SHAPES = 'path, rect, circle, ellipse, line, polyline, polygon';
const SHAPE_ATTRS = [
  'd',
  'x',
  'y',
  'width',
  'height',
  'rx',
  'ry',
  'cx',
  'cy',
  'r',
  'x1',
  'y1',
  'x2',
  'y2',
  'points',
];

/** An SVG's visible shapes as element-local paths (each with the matrix that places it). */
function shapesOf(svg: SVGSVGElement, left: number, top: number, limit: number): AsciiIcon[] {
  const out: AsciiIcon[] = [];
  for (const shape of svg.querySelectorAll<SVGGraphicsElement>(SHAPES)) {
    if (out.length >= limit) break;
    if (shape.closest('defs, clipPath, mask, symbol, marker, pattern')) continue;
    const cs = getComputedStyle(shape);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const ctm = typeof shape.getScreenCTM === 'function' ? shape.getScreenCTM() : null;
    if (!ctm) continue;
    const attrs: Record<string, string> = {};
    for (const name of SHAPE_ATTRS) {
      const v = shape.getAttribute(name);
      if (v !== null) attrs[name] = v;
    }
    out.push({
      tag: shape.tagName.toLowerCase(),
      attrs,
      m: [ctm.a, ctm.b, ctm.c, ctm.d, ctm.e - left, ctm.f - top],
      src: shape,
    });
  }
  return out;
}

/** The line boxes of an element's own text (its direct text nodes), element-local. */
function lineBoxes(node: Element, left: number, top: number) {
  const lines: { x: number; x2: number; y: number; h: number }[] = [];
  for (const child of node.childNodes) {
    if (child.nodeType !== 3 || !child.nodeValue?.trim()) continue;
    const range = document.createRange();
    range.selectNodeContents(child);
    const rects = typeof range.getClientRects === 'function' ? range.getClientRects() : [];
    for (const r of rects) {
      if (r.width < 2 || r.height < 2) continue; // visually hidden text
      const y = r.top - top;
      const line = lines.find((l) => Math.abs(l.y - y) < 2);
      if (line) {
        line.x = Math.min(line.x, r.left - left);
        line.x2 = Math.max(line.x2, r.right - left);
      } else lines.push({ x: r.left - left, x2: r.right - left, y, h: r.height });
    }
  }
  return lines;
}

function measure(
  el: HTMLElement,
  o: Required<Pick<GenerateOptions, 'maxParts' | 'keys'>> & {
    traceSvg: boolean;
    title?: string | null;
    code?: readonly string[] | null;
  },
): Measured {
  const root = el.getBoundingClientRect();
  const { left, top } = root;
  const w = root.width;
  const h = root.height;
  const rootStyle = getComputedStyle(el);
  const r = Math.min(parseFloat(rootStyle.borderTopLeftRadius) || 0, w / 2, h / 2);

  const boxes: AsciiPart[] = [];
  const texts: AsciiPart[] = [];
  const icons: AsciiPart[] = [];
  let marks = 0;
  let headings: string[] = [];
  let actions = 0;
  let lines = 0;

  const visit = (node: Element) => {
    const cs = getComputedStyle(node);
    // the element itself is hidden while it is drawn: only its descendants are judged
    const hidden = cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0;
    if (node !== el && hidden) return;
    const b = node.getBoundingClientRect();
    const local = { x: b.left - left, y: b.top - top, w: b.width, h: b.height };
    const shown = b.width >= 2 && b.height >= 2;

    if (node instanceof SVGSVGElement) {
      if (!shown) return;
      const large = b.width >= LARGE_SVG && b.height >= LARGE_SVG * 0.6;
      if (large && !o.traceSvg) {
        boxes.push({ kind: 'box', ...local, r: 6, el: node });
        return;
      }
      const paths = shapesOf(node, left, top, large ? MAX_MARKS - marks : 24);
      if (large) marks += paths.length;
      if (paths.length) icons.push({ kind: 'icon', ...local, el: node, paths });
      if (large) {
        // a chart's labels are text too
        for (const t of node.querySelectorAll('text')) {
          const tb = t.getBoundingClientRect();
          if (tb.width < 2 || !t.textContent?.trim()) continue;
          const y = tb.top - top;
          texts.push({
            kind: 'text',
            x: tb.left - left,
            y,
            w: tb.width,
            h: tb.height,
            el: t,
            lines: [{ x: tb.left - left, x2: tb.right - left, y, h: tb.height }],
          });
        }
      }
      return;
    }

    if (shown && node !== el) {
      if (drawsBox(node, cs)) {
        const nr = parseFloat(cs.borderTopLeftRadius) || 0;
        boxes.push({ kind: 'box', ...local, r: Math.min(nr, b.width / 2, b.height / 2), el: node });
      }
      if (/^(BUTTON|A|INPUT|SELECT|TEXTAREA)$/.test(node.tagName)) actions++;
      if (/^H[1-6]$/.test(node.tagName) && node.textContent?.trim()) {
        headings.push(node.textContent.trim());
      }
    }
    const own = lineBoxes(node, left, top);
    if (own.length) {
      lines += own.length;
      const x = Math.min(...own.map((l) => l.x));
      const y = Math.min(...own.map((l) => l.y));
      const x2 = Math.max(...own.map((l) => l.x2));
      const y2 = Math.max(...own.map((l) => l.y + l.h));
      texts.push({ kind: 'text', x, y, w: x2 - x, h: y2 - y, el: node, lines: own });
    }
    for (const child of node.children) visit(child);
  };
  visit(el);

  // the largest parts are kept, then everything is put back in reading order
  const area = (p: AsciiPart) => p.w * p.h;
  const reading = (a: AsciiPart, b: AsciiPart) => (Math.abs(a.y - b.y) > 4 ? a.y - b.y : a.x - b.x);
  const kept = [...boxes, ...texts]
    .sort((a, b) => area(b) - area(a))
    .slice(0, Math.max(0, o.maxParts));
  const parts = [...kept, ...icons].sort(reading);
  const keys = parts
    .map((p, i) => [p, i] as const)
    .filter(([p]) => p.kind === 'box' && p.w * p.h < w * h * 0.95)
    .sort(([a], [b]) => area(b) - area(a))
    .slice(0, Math.max(0, o.keys))
    .map(([, i]) => i);

  headings = headings.slice(0, 1);
  const title = o.title ?? el.getAttribute('aria-label') ?? headings[0] ?? el.tagName.toLowerCase();
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const spec = o.code?.length
    ? [...o.code]
    : [
        `frame    ${Math.round(w)} × ${Math.round(h)}`,
        `radius   ${round1(r)}px`,
        ...(headings[0] ? [`heading  ${headings[0]}`] : []),
        `boxes    ${boxes.length}`,
        `text     ${plural(lines, 'line', 'lines')}`,
        ...(marks ? [`marks    ${marks}`] : []),
        ...(actions ? [`actions  ${actions}`] : []),
      ];
  return { w, h, r, parts, keys, title, spec };
}

// ─── the draft renderer ───

type Point = readonly [number, number];
interface Stroke {
  node: SVGElement;
  from: number;
  to: number;
  /** The pen's path along this stroke, for its head; none for marks. */
  pts?: Point[];
  lens?: number[];
  shown: number;
}

/** A rounded rectangle as points, clockwise from its top-left straight edge. */
function roundRect(x: number, y: number, w: number, h: number, r: number): Point[] {
  const k = Math.max(0, Math.min(r, w / 2, h / 2));
  const pts: Point[] = [];
  const arc = (cx: number, cy: number, a0: number) => {
    const steps = k > 2 ? 8 : 1;
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * k, cy + Math.sin(a) * k]);
    }
  };
  pts.push([x + k, y]);
  arc(x + w - k, y + k, -Math.PI / 2);
  arc(x + w - k, y + h - k, 0);
  arc(x + k, y + h - k, Math.PI / 2);
  arc(x + k, y + k, Math.PI);
  pts.push([x + k, y]);
  return pts;
}

const pathOf = (pts: Point[]) =>
  pts.map(([x, y], i) => `${i ? 'L' : 'M'}${round1(x)} ${round1(y)}`).join('');

function lengthsOf(pts: Point[]): number[] {
  const out = [0];
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1] ?? [0, 0];
    const [bx, by] = pts[i] ?? [0, 0];
    out.push((out[i - 1] ?? 0) + Math.hypot(bx - ax, by - ay));
  }
  return out;
}

/** The point a fraction `q` of the way along a polyline. */
function along(pts: Point[], lens: number[], q: number): Point {
  const total = lens[lens.length - 1] ?? 0;
  const d = q * total;
  let i = 1;
  while (i < lens.length - 1 && (lens[i] ?? 0) < d) i++;
  const a = pts[i - 1] ?? [0, 0];
  const b = pts[i] ?? a;
  const l0 = lens[i - 1] ?? 0;
  const seg = (lens[i] ?? 0) - l0 || 1;
  const t = (d - l0) / seg;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.appendChild(node);
  return node;
}

let clipIds = 0;

interface DraftInput {
  el: HTMLElement;
  M: Measured;
  layer: HTMLDivElement;
  prev: Saved;
  texts: boolean;
  steps: readonly string[];
  done: string;
  room: { left: number; right: number; below: number };
}

function buildDraft({ el, M, layer, prev, texts, steps, done, room }: DraftInput) {
  const { w, h, r, parts, keys } = M;
  const es = el.style;
  const sheet = svg('svg', {
    class: 'ui-gen-draft',
    width: w + 2 * ROOM,
    height: h + 2 * ROOM,
    viewBox: `${-ROOM} ${-ROOM} ${w + 2 * ROOM} ${h + 2 * ROOM}`,
    'aria-hidden': 'true',
  });
  sheet.style.left = `${-ROOM}px`;
  sheet.style.top = `${-ROOM}px`;
  layer.appendChild(sheet);
  const clipId = `ui-gen-clip-${++clipIds}`;
  const clip = svg('clipPath', { id: clipId }, svg('defs', {}, sheet));
  svg('path', { d: pathOf(roundRect(0, 0, w, h, r)) }, clip);

  // 1. the sheet: guide lines every 24px, over the element and a little beyond
  const grid = svg('g', { class: 'ui-gen-grid', opacity: 0 }, sheet);
  const GAP = 24;
  for (let x = GAP; x < w; x += GAP) {
    svg('line', { x1: x, x2: x, y1: -ROOM * 0.6, y2: h + ROOM * 0.6 }, grid);
  }
  for (let y = GAP; y < h; y += GAP) {
    svg('line', { x1: -ROOM * 0.6, x2: w + ROOM * 0.6, y1: y, y2: y }, grid);
  }

  const strokes: Stroke[] = [];
  const stroke = (node: SVGElement, from: number, to: number, pts?: Point[]): Stroke => {
    node.setAttribute('pathLength', '1');
    node.setAttribute('stroke-dasharray', '1 1');
    node.setAttribute('stroke-dashoffset', '1');
    const s: Stroke = { node, from, to, pts, lens: pts ? lengthsOf(pts) : undefined, shown: -1 };
    strokes.push(s);
    return s;
  };

  // 2. construction lines: each main box's edges run out across the sheet
  const cons = svg('g', { class: 'ui-gen-cons' }, sheet);
  keys.forEach((k, i) => {
    const p = parts[k];
    if (!p) return;
    const at = 0.04 + i * 0.035;
    const lines: [Point, Point][] = [
      [
        [p.x, p.y],
        [-ROOM, p.y],
      ],
      [
        [p.x + p.w, p.y],
        [w + ROOM, p.y],
      ],
      [
        [p.x, p.y],
        [p.x, -ROOM],
      ],
      [
        [p.x, p.y + p.h],
        [p.x, h + ROOM],
      ],
    ];
    lines.forEach(([a, b], j) => {
      const node = svg('path', { d: pathOf([a, b]) }, cons);
      stroke(node, at + j * 0.012, at + j * 0.012 + 0.2);
    });
  });

  // 3. the pen: the outline, then every box in reading order
  const ink = svg('g', { class: 'ui-gen-ink' }, sheet);
  const outline = roundRect(0, 0, w, h, r);
  const pens: Stroke[] = [];
  pens.push(
    stroke(svg('path', { d: pathOf(outline), class: 'ui-gen-outline' }, ink), 0.06, 0.34, outline),
  );
  const boxes = parts.filter((p) => p.kind === 'box');
  boxes.forEach((p, i) => {
    const pts = roundRect(p.x, p.y, p.w, p.h, p.r ?? 0);
    const from = 0.2 + (boxes.length > 1 ? (i / (boxes.length - 1)) * 0.3 : 0);
    pens.push(stroke(svg('path', { d: pathOf(pts) }, ink), from, from + 0.14, pts));
  });

  // 4. a chart's own marks, stroke by stroke, and its icons
  const marks = svg('g', { class: 'ui-gen-marks' }, sheet);
  const shapes = parts.flatMap((p) => (p.kind === 'icon' ? (p.paths ?? []) : []));
  shapes.forEach((ip, i) => {
    const node = svg(
      ip.tag as 'path',
      {
        ...ip.attrs,
        transform: `matrix(${ip.m.join(' ')})`,
        'vector-effect': 'non-scaling-stroke',
      },
      marks,
    );
    const from = 0.32 + (shapes.length > 1 ? (i / (shapes.length - 1)) * 0.26 : 0);
    stroke(node, from, from + 0.12);
  });

  // 5. text: a bar per line, growing from where the line starts
  const bars: {
    node: SVGRectElement;
    x: number;
    w: number;
    from: number;
    to: number;
    shown: number;
  }[] = [];
  const barGroup = svg('g', { class: 'ui-gen-bars' }, sheet);
  const textLines = parts.flatMap((p) => (p.kind === 'text' ? (p.lines ?? []) : []));
  textLines.forEach((l, i) => {
    const bh = Math.max(3, Math.min(9, l.h * 0.42));
    const node = svg(
      'rect',
      { x: l.x, y: l.y + (l.h - bh) / 2, width: 0, height: bh, rx: bh / 2 },
      barGroup,
    );
    const from = 0.26 + (textLines.length > 1 ? (i / (textLines.length - 1)) * 0.3 : 0);
    bars.push({ node, x: l.x, w: Math.max(4, l.x2 - l.x), from, to: from + 0.12, shown: -1 });
  });

  // 6. dimensions: the element's width above it and its height to its left, with figures that
  // count up as the lines are drawn; crop marks at the corners of the main boxes
  const dims = svg('g', { class: 'ui-gen-dims' }, sheet);
  const dy = -ROOM * 0.55;
  const dx = -ROOM * 0.55;
  const tick = (x: number, y: number) => `M${x - 3} ${y + 3}L${x + 3} ${y - 3}`;
  stroke(svg('path', { d: `M0 ${dy}L${w} ${dy}` }, dims), 0.12, 0.3);
  stroke(svg('path', { d: `M${dx} 0L${dx} ${h}` }, dims), 0.16, 0.34);
  const ticks = svg(
    'path',
    { d: tick(0, dy) + tick(w, dy) + tick(dx, 0) + tick(dx, h), class: 'ui-gen-ticks', opacity: 0 },
    dims,
  );
  const figure = (x: number, y: number, rotate: boolean) => {
    const g = svg('g', { opacity: 0, transform: rotate ? `rotate(-90 ${x} ${y})` : '' }, dims);
    const chip = svg('rect', { class: 'ui-gen-chip', height: 13, rx: 3 }, g);
    const t = svg('text', { x, y: y + 3.6, 'text-anchor': 'middle', class: 'ui-gen-figure' }, g);
    return { g, chip, t, x, y };
  };
  const figW = figure(w / 2, dy, false);
  const figH = figure(dx, h / 2, true);
  const crops = svg('g', { class: 'ui-gen-crops' }, sheet);
  const cropMarks = keys.map((k, i) => {
    const p = parts[k];
    if (!p) return null;
    const L = 6;
    const o = 3;
    const d = [
      `M${p.x - o - L} ${p.y - o}H${p.x - o}V${p.y - o - L}`,
      `M${p.x + p.w + o + L} ${p.y - o}H${p.x + p.w + o}V${p.y - o - L}`,
      `M${p.x - o - L} ${p.y + p.h + o}H${p.x - o}V${p.y + p.h + o + L}`,
      `M${p.x + p.w + o + L} ${p.y + p.h + o}H${p.x + p.w + o}V${p.y + p.h + o + L}`,
    ].join('');
    const node = svg('path', { d, opacity: 0 }, crops);
    return { node, from: 0.22 + i * 0.05, shown: -1 };
  });

  // 7. the pen's head, and the ring of light on the developing front
  const head = svg('g', { class: 'ui-gen-pen', opacity: 0 }, sheet);
  svg('circle', { r: 7, class: 'ui-gen-pen-halo' }, head);
  svg('circle', { r: 2.4, class: 'ui-gen-pen-tip' }, head);
  const ringClip = svg('g', { 'clip-path': `url(#${clipId})` }, sheet);
  const ring = svg('circle', { class: 'ui-gen-ring', r: 0, opacity: 0 }, ringClip);

  // the develop: a soft circle from just above the centre, wide enough to reach every corner
  const cx = w / 2;
  const cy = h * 0.46;
  const soft = Math.max(60, Math.min(w, h) * 0.35);
  const reach = Math.hypot(Math.max(cx, w - cx), Math.max(cy, h - cy)) + soft;
  const D0 = 0.64;
  const D1 = 1.0;

  // skeleton-texts: a spec sheet beside the element (or under it) and a step line under it
  let specRows: { node: HTMLElement; text: string; from: number; shown: number }[] = [];
  let panel: HTMLDivElement | null = null;
  let ticker: { box: HTMLElement; text: HTMLElement; current: number } | null = null;
  if (texts) {
    const sheetPanel = document.createElement('div');
    panel = sheetPanel;
    sheetPanel.className = 'ui-gen-sheet';
    // beside the element where the page has room (right first), else under it, else not at all
    const SHEET = 236;
    const side = room.right >= SHEET ? 'right' : room.left >= SHEET ? 'left' : null;
    sheetPanel.style.left =
      side === 'right' ? `${w + 16}px` : side === 'left' ? `${-SHEET}px` : '0px';
    sheetPanel.style.top = side ? '0px' : `${h + 44}px`;
    if (!side && room.below < 160) sheetPanel.style.display = 'none';
    const head2 = document.createElement('div');
    head2.className = 'ui-gen-sheet-head';
    head2.textContent = M.title;
    sheetPanel.appendChild(head2);
    const rows = M.spec.slice(0, 8);
    specRows = rows.map((text, i) => {
      const row = document.createElement('div');
      row.className = 'ui-gen-sheet-row';
      sheetPanel.appendChild(row);
      return { node: row, text, from: 0.1 + i * 0.07, shown: -1 };
    });
    layer.appendChild(sheetPanel);
    const box = document.createElement('div');
    box.className = 'ui-gen-ticker';
    box.style.top = `${h + 12}px`;
    const mark = document.createElement('i');
    const text = document.createElement('span');
    box.append(mark, text);
    layer.appendChild(box);
    ticker = { box, text, current: -2 };
  }
  const allSteps = steps.length
    ? steps
    : ['Measuring', 'Drafting the structure', 'Placing the content'];

  let develop = -1;
  return {
    frame(p: number) {
      // the sheet comes up, and goes as the element develops; whatever is left beyond the
      // element's edge (the dimensions, the sheet's fade) goes with the last of it
      const out = 1 - span(D0 + 0.1, END, p);
      const last = String(Math.round((1 - span(0.94, END, p)) * 100) / 100);
      if (sheet.style.opacity !== last) sheet.style.opacity = last;
      if (panel) panel.style.opacity = String(Math.round(out * 100) / 100);
      grid.setAttribute('opacity', String(round1(easeOut(span(0, 0.16, p)) * out * 100) / 100));

      for (const s of strokes) {
        const q = settle(span(s.from, s.to, p));
        const v = Math.round((1 - q) * 1000) / 1000;
        if (v !== s.shown) {
          s.shown = v;
          s.node.setAttribute('stroke-dashoffset', String(v));
          // a mark is tinted in once its stroke is drawn, so a bar reads as a drafted shape
          if (v === 0) s.node.setAttribute('data-in', '');
        }
      }
      for (const b of bars) {
        const q = easeOut(span(b.from, b.to, p));
        const v = Math.round(q * b.w);
        if (v !== b.shown) {
          b.shown = v;
          b.node.setAttribute('width', String(v));
        }
      }
      for (const c of cropMarks) {
        if (!c) continue;
        const v = Math.round(easeOut(span(c.from, c.from + 0.1, p)) * 100) / 100;
        if (v !== c.shown) {
          c.shown = v;
          c.node.setAttribute('opacity', String(v));
        }
      }

      // the dimension figures count up with their lines, then settle on the true size
      ticks.setAttribute('opacity', String(Math.round(span(0.12, 0.2, p) * 100) / 100));
      for (const [fig, size, q] of [
        [figW, w, span(0.14, 0.32, p)],
        [figH, h, span(0.18, 0.36, p)],
      ] as const) {
        fig.g.setAttribute('opacity', String(Math.round(span(0, 0.25, q) * 100) / 100));
        const text = `${Math.round(size * settle(q))}`;
        if (fig.t.textContent !== text) {
          fig.t.textContent = text;
          const cw = text.length * 6.2 + 8;
          fig.chip.setAttribute('x', String(fig.x - cw / 2));
          fig.chip.setAttribute('y', String(fig.y - 6.5));
          fig.chip.setAttribute('width', String(cw));
        }
      }

      // the pen's head rides on the stroke being drawn
      const live = [...pens].reverse().find((s) => p >= s.from && p < s.to);
      if (live?.pts && live.lens) {
        const [x, y] = along(live.pts, live.lens, settle(span(live.from, live.to, p)));
        head.setAttribute('transform', `translate(${round1(x)} ${round1(y)})`);
        head.setAttribute('opacity', '1');
      } else head.setAttribute('opacity', '0');

      // the develop: the real element through a growing soft circle, the drawing dissolving ahead
      const q = inOut(span(D0, D1, p));
      if (p >= D0) {
        const R = q * reach;
        const inner = Math.max(0, R - soft);
        es.opacity = prev.opacity;
        const m = `radial-gradient(circle at ${round1(cx)}px ${round1(cy)}px, currentColor ${round1(inner)}px, transparent ${round1(R)}px)`;
        if (q < 1) {
          es.maskImage = m;
          es.setProperty('-webkit-mask-image', m);
        } else {
          es.maskImage = prev.mask;
          es.setProperty('-webkit-mask-image', prev.webkitMask);
        }
        const hide = `radial-gradient(circle at ${round1(cx + ROOM)}px ${round1(cy + ROOM)}px, transparent ${round1(inner + soft * 0.15)}px, currentColor ${round1(R + soft * 0.35)}px)`;
        sheet.style.maskImage = hide;
        sheet.style.setProperty('-webkit-mask-image', hide);
        ring.setAttribute('cx', String(round1(cx)));
        ring.setAttribute('cy', String(round1(cy)));
        ring.setAttribute('r', String(round1(Math.max(0, R - soft * 0.45))));
        ring.setAttribute('opacity', String(Math.round(Math.sin(Math.PI * q) * 70) / 100));
        develop = q;
      } else if (develop < 0) es.opacity = '0';

      if (specRows.length) {
        for (const row of specRows) {
          const n = Math.round(span(row.from, row.from + 0.12, p) * row.text.length);
          if (n !== row.shown) {
            row.shown = n;
            row.node.textContent = row.text.slice(0, n);
          }
        }
      }
      if (ticker) {
        const i =
          p >= D0 ? -1 : Math.min(allSteps.length - 1, Math.floor((p / D0) * allSteps.length));
        if (i !== ticker.current) {
          ticker.current = i;
          ticker.text.textContent = i < 0 ? done : (allSteps[i] ?? '');
          ticker.box.toggleAttribute('data-done', i < 0);
        }
        ticker.box.style.opacity = String(Math.round(span(0, 0.08, p) * out * 100) / 100);
      }
    },
  };
}

// ─── runs and the one scheduler ───

interface Saved {
  opacity: string;
  clipPath: string;
  filter: string;
  mask: string;
  webkitMask: string;
  transition: string;
  inert: boolean;
}

interface Run {
  el: HTMLElement;
  o: GenerateOptions;
  D: number;
  saved: Saved;
  host: HTMLElement;
  layer: HTMLDivElement | null;
  stage: { frame: (p: number, t: number) => void } | null;
  ascii: boolean;
  start: number;
  lastFrame: number;
  at: { x: number; y: number };
  timers: ReturnType<typeof setTimeout>[];
  state: 'waiting' | 'queued' | 'live' | 'over';
  resolve: () => void;
}

const runs = new Set<Run>();
const byElement = new WeakMap<HTMLElement, Run>();
const queue: Run[] = [];
let frameId = 0;
let listening = false;

function wake() {
  if (!frameId && (queue.length || [...runs].some((r) => r.state === 'live'))) {
    frameId = requestAnimationFrame(loop);
  }
}

function loop(now: number) {
  frameId = 0;
  // at most one overlay is built a frame
  const next = queue.shift();
  if (next && next.state === 'queued') build(next, now);
  for (const run of runs) if (run.state === 'live') tick(run, now);
  wake();
}

function reducedMotion() {
  try {
    return (
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

/** Where the element sits in its host's coordinates. */
function placeOf(run: Run) {
  const r = run.el.getBoundingClientRect();
  const host = run.host;
  if (host === document.body) {
    return { x: r.left + (window.scrollX || 0), y: r.top + (window.scrollY || 0) };
  }
  const hr = host.getBoundingClientRect();
  return {
    x: r.left - hr.left - host.clientLeft + host.scrollLeft,
    y: r.top - hr.top - host.clientTop + host.scrollTop,
  };
}

function build(run: Run, now: number) {
  const { el, o } = run;
  if (!el.isConnected) return finish(run);
  const box = el.getBoundingClientRect();
  if (!(box.width > 0 && box.height > 0)) return finish(run);
  const render = o.render ?? 'draft';
  const skin = document.documentElement.getAttribute('data-skin');
  const look =
    render === 'plot' || render === 'frost'
      ? render
      : render === 'ascii'
        ? skin === 'glass'
          ? 'frost'
          : 'plot'
        : null;

  const layer = document.createElement('div');
  layer.className = 'ui-gen';
  layer.setAttribute('aria-hidden', 'true');
  const at = placeOf(run);
  Object.assign(layer.style, {
    left: `${at.x}px`,
    top: `${at.y}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
  });
  run.host.appendChild(layer);
  run.layer = layer;
  run.at = at;

  try {
    const M = measure(el, {
      maxParts: o.maxParts ?? 60,
      keys: o.keys ?? 5,
      traceSvg: !!o.traceSvg,
      title: o.title,
      code: o.code,
    });
    if (look) {
      const seed = (Math.random() * 1000) | 0;
      run.stage = buildAscii(el, M, layer, look, run.D, run.saved, seed);
      run.ascii = true;
    } else {
      const hostWidth =
        run.host === document.body ? document.documentElement.clientWidth : run.host.clientWidth;
      const hostHeight =
        run.host === document.body ? document.documentElement.scrollHeight : run.host.scrollHeight;
      const draft = buildDraft({
        el,
        M,
        layer,
        prev: run.saved,
        texts: o.mode === 'skeleton-texts',
        steps: o.steps ?? [],
        done: o.done ?? 'Ready',
        room: {
          left: at.x,
          right: hostWidth - (at.x + box.width),
          below: hostHeight - (at.y + box.height),
        },
      });
      run.stage = { frame: (p) => draft.frame(p) };
    }
  } catch (error) {
    console.warn('generate: shown without its drawing', error);
    return finish(run);
  }
  run.state = 'live';
  run.start = now;
  run.lastFrame = -Infinity;
  quietLagMonitor(performance.now() + run.D * END + 200);
  tick(run, now);
}

function tick(run: Run, now: number) {
  const p = (now - run.start) / run.D;
  if (p >= END) return finish(run);
  if (run.ascii && now - run.lastFrame < ASCII_FRAME_MS) return;
  run.lastFrame = now;
  // keep the overlay on the element if the page moves under it
  const at = placeOf(run);
  if (run.layer && (at.x !== run.at.x || at.y !== run.at.y)) {
    run.at = at;
    run.layer.style.left = `${at.x}px`;
    run.layer.style.top = `${at.y}px`;
  }
  try {
    run.stage?.frame(Math.max(0, p), now - run.start);
  } catch (error) {
    console.warn('generate: drawing stopped', error);
    finish(run);
  }
}

function restore(el: HTMLElement, s: Saved) {
  const es = el.style;
  es.opacity = s.opacity;
  es.clipPath = s.clipPath;
  es.filter = s.filter;
  es.maskImage = s.mask;
  es.setProperty('-webkit-mask-image', s.webkitMask);
  es.transition = s.transition;
  if (!s.inert) el.removeAttribute('inert');
  el.removeAttribute('data-generating');
}

function finish(run: Run) {
  if (run.state === 'over') return;
  run.state = 'over';
  for (const t of run.timers) clearTimeout(t);
  run.layer?.remove();
  run.layer = null;
  run.stage = null;
  restore(run.el, run.saved);
  runs.delete(run);
  if (byElement.get(run.el) === run) byElement.delete(run.el);
  run.resolve();
  run.o.onDone?.(run.el);
}

/** Show every element being generated at once, as it is. */
export function skipAllGenerations() {
  for (const run of [...runs]) finish(run);
  queue.length = 0;
}

/** Draw `el` in from its own structure, then hand it over (see the top of this file). */
export function generate(el: HTMLElement, options: GenerateOptions = {}): GenerateRun {
  const earlier = byElement.get(el);
  if (earlier) finish(earlier);
  if (!listening && typeof window !== 'undefined') {
    listening = true;
    window.addEventListener('ui:generate-skip', skipAllGenerations);
  }
  const es = el.style;
  const saved: Saved = {
    opacity: es.opacity,
    clipPath: es.clipPath,
    filter: es.filter,
    mask: es.maskImage,
    webkitMask: es.getPropertyValue('-webkit-mask-image'),
    transition: es.transition,
    inert: el.hasAttribute('inert'),
  };
  let resolve: () => void = () => {};
  const finished = new Promise<void>((r) => {
    resolve = r;
  });
  const D = Math.max(400, options.duration ?? 2400);
  const run: Run = {
    el,
    o: options,
    D,
    saved,
    host: el.parentElement?.closest<HTMLElement>('[data-generate-host]') ?? document.body,
    layer: null,
    stage: null,
    ascii: false,
    start: 0,
    lastFrame: 0,
    at: { x: 0, y: 0 },
    timers: [],
    state: 'waiting',
    resolve,
  };
  runs.add(run);
  byElement.set(el, run);
  es.opacity = '0';
  el.setAttribute('inert', '');
  el.setAttribute('data-generating', options.mode ?? 'skeleton');
  const delay = Math.max(0, options.delay ?? 0);

  if (reducedMotion() || revealIsPlain()) {
    // a plain fade: no drawing, nothing moves but the opacity
    run.timers.push(
      setTimeout(() => {
        es.transition = 'opacity var(--dur-base, 200ms) var(--ease-out, ease-out)';
        es.opacity = saved.opacity;
      }, delay + 16),
      setTimeout(() => finish(run), delay + 320),
    );
  } else {
    const enqueue = () => {
      if (run.state !== 'waiting') return;
      run.state = 'queued';
      queue.push(run);
      wake();
    };
    if (delay) run.timers.push(setTimeout(enqueue, delay));
    else enqueue();
    // never leave an element hidden: if frames stop coming (a background tab), it is shown
    run.timers.push(setTimeout(() => finish(run), delay + D * END + 2500));
  }

  return { finished, cancel: () => finish(run), element: el };
}
