/* ascii — generate()'s second renderer: the element rebuilt in monospace glyphs on a canvas,
   from its own structure (box outlines, its real text, and a chart's own lines, bars and
   gridlines rasterised and read back as glyphs), then handed over to the real UI. One look
   per skin:

   plot (enterprise) · a pen plotter. Graph paper and rulers come up, then a pen draws the card
     in the order an engineer would: every outline walked round, the chart's series left to
     right (slopes as / and \, bars in a density ramp), then the labels typed in reading order.
     Each glyph lands in wet, hot ink that dries; the rulers follow the pen. The real UI then
     feeds in under the drawing a row at a time.
   frost (glass) · glyphs condense like frost. A drifting mist of glyphs creeps in from the
     edges, the card crystallises out of it (frame first, then data, then labels, each cell
     morphing through mist and frost into its glyph), then a band of light wipes the real UI in
     sharp behind it, the glyphs at the band rising away and a few droplets running down.

   The canvas is aria-hidden decoration (it lives in generate()'s layer); colours are roles
   read from styles/effects.css (--gen-ascii-*) when the run starts. */

export type AsciiLook = 'plot' | 'frost';

export interface AsciiIcon {
  tag: string;
  attrs: Record<string, string>;
  m: number[];
  src?: SVGGraphicsElement;
}
export interface AsciiPart {
  kind: 'box' | 'text' | 'icon';
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
  el?: Element;
  lines?: { x: number; x2: number; y: number; h: number }[];
  paths?: AsciiIcon[];
}
export interface AsciiInput {
  w: number;
  h: number;
  r: number;
  parts: AsciiPart[];
}
export interface AsciiStage {
  frame: (p: number, t: number) => void;
}

/** Canvas text lands on whole device pixels vertically. The css y at which a glyph's pixel row
    steps down (any one step: they repeat every 1/dpr), so drifting dots can be redrawn only
    when their row changes. null when the text is not snapped (then nothing is cached). */
const snapMemo = new Map<string, number | null>();
const snapEdge = (dpr: number, font: string, mg: number): number | null => {
  const key = `${dpr}|${font}`;
  if (snapMemo.has(key)) return snapMemo.get(key) ?? null;
  let edge: number | null = null;
  try {
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 40;
    const x = c.getContext('2d', { willReadFrequently: true });
    if (x) {
      x.textAlign = 'center';
      x.textBaseline = 'middle';
      x.font = font;
      const rowOf = (y: number) => {
        x.setTransform(1, 0, 0, 1, 0, 0);
        x.clearRect(0, 0, 24, 40);
        x.setTransform(
          dpr,
          0,
          0,
          dpr,
          mg * dpr - Math.floor(mg * dpr) + 0,
          mg * dpr - Math.floor(mg * dpr),
        );
        x.fillText('\u00b7', 6 / dpr, y);
        const d = x.getImageData(0, 0, 24, 40).data;
        for (let r = 0; r < 40; r++)
          for (let q = 0; q < 24; q++) if ((d[(r * 24 + q) * 4 + 3] ?? 0) > 8) return r;
        return -1;
      };
      const y0 = 12 / dpr;
      const r0 = rowOf(y0);
      for (let j = 1; j <= 64 && r0 >= 0; j++) {
        const y = y0 + j / (dpr * 32);
        if (rowOf(y) !== r0) {
          edge = y;
          break;
        }
      }
    }
  } catch {
    edge = null;
  }
  snapMemo.set(key, edge);
  return edge;
};

const CW = 7; // cell width, px
const CH = 12; // cell height, px
const MG = 22; // room around the element for the rulers, the status line and the lift
const FILL = 1;
const BOX = 2;
const MARK = 3;
const TEXT = 4;

const clamp = (x: number) => Math.max(0, Math.min(1, x));
const win = (a: number, b: number, p: number) => clamp((p - a) / (b - a));
const smooth = (a: number, b: number, x: number) => {
  const q = win(a, b, x);
  return q * q * (3 - 2 * q);
};
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const hash = (x: number) => {
  const v = Math.sin(x * 127.1 + 311.7) * 43758.5453;
  return v - Math.floor(v);
};

const GLYPHS = {
  plot: {
    h: '-',
    v: '|',
    corner: ['+', '+', '+', '+'],
    round: ['+', '+', '+', '+'],
    slash: '/',
    back: '\\',
    dot: '*',
    ramp: ' .:-=+*#',
    pill: ['[', ']'],
  },
  frost: {
    h: '─',
    v: '│',
    corner: ['┌', '┐', '└', '┘'],
    round: ['╭', '╮', '╰', '╯'],
    slash: '╱',
    back: '╲',
    dot: '•',
    ramp: ' ·░░▒▒▓',
    pill: ['(', ')'],
  },
} as const;
const NOISE = '01<>[]{}/\\|=+*#%&$@?!:;~^';

// ─── the element's SVG geometry as canvas paths ───
function shape(p: AsciiIcon): Path2D | null {
  const a = p.attrs;
  const n = (k: string) => parseFloat(a[k] ?? '') || 0;
  const s = new Path2D();
  switch (p.tag) {
    case 'path':
      return a.d ? new Path2D(a.d) : null;
    case 'rect':
      if (!n('width') || !n('height')) return null;
      s.rect(n('x'), n('y'), n('width'), n('height'));
      return s;
    case 'circle':
      s.arc(n('cx'), n('cy'), n('r'), 0, Math.PI * 2);
      return s;
    case 'ellipse':
      s.ellipse(n('cx'), n('cy'), n('rx'), n('ry'), 0, 0, Math.PI * 2);
      return s;
    case 'line':
      s.moveTo(n('x1'), n('y1'));
      s.lineTo(n('x2'), n('y2'));
      return s;
    case 'polyline':
    case 'polygon': {
      const v = (a.points ?? '')
        .trim()
        .split(/[\s,]+/)
        .map(Number);
      for (let i = 0; i + 1 < v.length; i += 2) {
        if (i) s.lineTo(v[i] ?? 0, v[i + 1] ?? 0);
        else s.moveTo(v[i] ?? 0, v[i + 1] ?? 0);
      }
      if (p.tag === 'polygon') s.closePath();
      return s;
    }
    default:
      return null;
  }
}

interface Palette {
  ink: string;
  text: string;
  paper: string;
  hot: string;
  prismA: string;
  prismB: string;
  font: string;
}
let palette: { key: string; v: Palette } | null = null;
let watching = false;
const paletteKey = () => {
  const r = document.documentElement;
  const dark =
    typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  return `${r.getAttribute('data-skin')}|${r.getAttribute('data-theme')}|${dark}`;
};

/** The six colours and the font, read through ONE style recalculation (six custom properties
    set on one probe, six computed colours read back) and cached for the skin and theme: the
    old read set a colour, forced a recalculation and cleared it again, six times a run. */
function readPalette(layer: HTMLElement): Palette {
  if (!watching && typeof MutationObserver === 'function') {
    watching = true;
    new MutationObserver(() => {
      palette = null;
    }).observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-skin', 'class'],
    });
  }
  const key = paletteKey();
  if (palette?.key === key) return palette.v;
  const probe = document.createElement('i');
  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:absolute;visibility:hidden;border:1px solid;' +
    'color:var(--gen-ascii-ink);background-color:var(--gen-ascii-text);' +
    'border-color:var(--gen-ascii-paper) var(--gen-ascii-hot) var(--gen-ascii-prism-a) var(--gen-ascii-prism-b)';
  layer.appendChild(probe);
  const cs = getComputedStyle(probe);
  const v: Palette = {
    ink: cs.color,
    text: cs.backgroundColor,
    paper: cs.borderTopColor,
    hot: cs.borderRightColor,
    prismA: cs.borderBottomColor,
    prismB: cs.borderLeftColor,
    font: getComputedStyle(layer).getPropertyValue('--gen-font').trim() || 'monospace',
  };
  probe.remove();
  palette = { key, v };
  return v;
}

/** Text a part shows: an SVG label's own text, or the element's direct text nodes. */
function textOf(el: Element | undefined) {
  if (!el) return '';
  if (el instanceof SVGElement) return el.textContent ?? '';
  let s = '';
  for (const n of el.childNodes) if (n.nodeType === 3) s += `${n.nodeValue ?? ''} `;
  return s;
}

export function buildAscii(
  el: HTMLElement,
  M: AsciiInput,
  layer: HTMLDivElement,
  look: AsciiLook,
  D: number,
  prev: { opacity: string; clipPath: string; filter: string },
  seed: number,
): AsciiStage {
  const { w, h } = M;
  const G = GLYPHS[look];
  const cols = Math.max(2, Math.floor(w / CW));
  const rows = Math.max(2, Math.floor(h / CH));
  const ox = (w - cols * CW) / 2;
  const oy = (h - rows * CH) / 2;
  const N = cols * rows;
  const glyph: string[] = Array.from({ length: N }, () => '');
  const kind = new Uint8Array(N);
  const put = (c: number, r: number, ch: string, k: number) => {
    if (c < 0 || r < 0 || c >= cols || r >= rows || !ch) return;
    const i = r * cols + c;
    // text: the first word to claim a cell keeps it (monospace runs longer than the real text)
    if (k > (kind[i] ?? 0) || (k === kind[i] && k !== TEXT)) {
      kind[i] = k;
      glyph[i] = ch;
    }
  };
  const col = (x: number) => Math.round((x - ox) / CW);
  const row = (y: number) => Math.round((y - oy) / CH);

  // ─── 1. the element as a glyph grid ───
  // the order a pen would draw it in: each outline walked round, then the text in reading order
  const outlineOrder: number[] = [];
  const textOrder: number[] = [];
  const box = (x: number, y: number, bw: number, bh: number, r: number) => {
    const c0 = Math.max(0, col(x));
    const c1 = Math.min(cols - 1, col(x + bw) - 1);
    const r0 = Math.max(0, row(y));
    const r1 = Math.min(rows - 1, row(y + bh) - 1);
    if (c1 - c0 < 1) return;
    if (r1 - r0 < 1) {
      // a button or a pill: brackets at its ends
      const rr = Math.max(0, Math.min(rows - 1, Math.floor((y + bh / 2 - oy) / CH)));
      put(c0, rr, G.pill[0], BOX);
      put(c1, rr, G.pill[1], BOX);
      outlineOrder.push(rr * cols + c0, rr * cols + c1);
      return;
    }
    for (let c = c0; c <= c1; c++) outlineOrder.push(r0 * cols + c);
    for (let q = r0 + 1; q <= r1; q++) outlineOrder.push(q * cols + c1);
    for (let c = c1 - 1; c >= c0; c--) outlineOrder.push(r1 * cols + c);
    for (let q = r1 - 1; q > r0; q--) outlineOrder.push(q * cols + c0);
    for (let c = c0 + 1; c < c1; c++) {
      put(c, r0, G.h, BOX);
      put(c, r1, G.h, BOX);
    }
    for (let q = r0 + 1; q < r1; q++) {
      put(c0, q, G.v, BOX);
      put(c1, q, G.v, BOX);
    }
    const k = r > 3 ? G.round : G.corner;
    put(c0, r0, k[0], BOX);
    put(c1, r0, k[1], BOX);
    put(c0, r1, k[2], BOX);
    put(c1, r1, k[3], BOX);
  };
  box(0, 0, w, h, M.r);
  for (const p of M.parts) if (p.kind === 'box') box(p.x, p.y, p.w, p.h, p.r ?? 0);

  // icons and chart marks: rasterised at 1px, then read back cell by cell (only the coverage
  // counts, so any opaque colour will do)
  const pal = readPalette(layer);
  const mask = pal.text;
  const icons = M.parts.filter((p) => p.kind === 'icon' && p.paths?.length);
  if (icons.length) {
    const RW = Math.ceil(w);
    const RH = Math.ceil(h);
    const rc = document.createElement('canvas');
    rc.width = RW;
    rc.height = RH;
    const ctx = rc.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const items = icons.flatMap((p) =>
        (p.paths ?? []).map((ip) => {
          const cs = ip.src ? getComputedStyle(ip.src) : null;
          const op = cs ? +cs.opacity || 0 : 1;
          const fo = cs ? (cs.fill.startsWith('url') ? 0.35 : +cs.fillOpacity || 0) : 0;
          return {
            ip,
            path: shape(ip),
            fill: cs ? cs.fill !== 'none' && fo * op > 0.04 : false,
            fillA: Math.min(1, fo * op),
            stroke: cs ? cs.stroke !== 'none' && +cs.strokeOpacity * op > 0.04 : true,
            sw: cs ? parseFloat(cs.strokeWidth) || 1 : 1.5,
            dash: cs && cs.strokeDasharray !== 'none' ? cs.strokeDasharray : '',
          };
        }),
      );
      const pass = (draw: (it: (typeof items)[number]) => boolean) => {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, RW, RH);
        let any = false;
        for (const it of items) {
          if (!it.path) continue;
          const m = it.ip.m;
          ctx.setTransform(m[0] ?? 1, m[1] ?? 0, m[2] ?? 0, m[3] ?? 1, m[4] ?? 0, m[5] ?? 0);
          if (draw(it)) any = true;
        }
        return any ? ctx.getImageData(0, 0, RW, RH).data : null;
      };
      const fills = pass((it) => {
        if (!it.fill || !it.path) return false;
        ctx.globalAlpha = it.fillA;
        ctx.fillStyle = mask;
        ctx.fill(it.path);
        return true;
      });
      ctx.globalAlpha = 1;
      const strokes = pass((it) => {
        if (!it.stroke || !it.path) return false;
        ctx.strokeStyle = mask;
        ctx.lineWidth = Math.max(1.4, it.sw);
        ctx.setLineDash(
          it.dash
            ? it.dash
                .split(/[\s,]+/)
                .map((v) => parseFloat(v) || 0)
                .filter((v) => v >= 0)
            : [],
        );
        ctx.stroke(it.path);
        return true;
      });
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x0 = Math.floor(ox + c * CW);
          const y0 = Math.floor(oy + r * CH);
          let fa = 0;
          let n = 0;
          let sx = 0;
          let sy = 0;
          let sxx = 0;
          let syy = 0;
          let sxy = 0;
          for (let y = y0; y < y0 + CH && y < RH; y++) {
            for (let x = x0; x < x0 + CW && x < RW; x++) {
              const o = (y * RW + x) * 4 + 3;
              if (fills) fa += fills[o] ?? 0;
              const a = strokes ? (strokes[o] ?? 0) : 0;
              if (a > 60) {
                n++;
                sx += x;
                sy += y;
                sxx += x * x;
                syy += y * y;
                sxy += x * y;
              }
            }
          }
          if (n >= 3) {
            // the stroke's direction in the cell, from its pixels' spread
            const mx = sx / n;
            const my = sy / n;
            const a = sxx / n - mx * mx;
            const b = syy / n - my * my;
            const d = sxy / n - mx * my;
            const disc = Math.sqrt(((a - b) / 2) ** 2 + d * d);
            const l1 = (a + b) / 2 + disc;
            const l2 = (a + b) / 2 - disc;
            const deg = (Math.atan2(2 * d, a - b) * 90) / Math.PI;
            const ch =
              l1 > 0 && l2 / l1 > 0.45 && n < CW * CH * 0.5
                ? G.dot
                : Math.abs(deg) < 24
                  ? G.h
                  : Math.abs(deg) > 66
                    ? G.v
                    : deg > 0
                      ? G.back
                      : G.slash;
            put(c, r, ch, MARK);
          } else {
            // the frost's blocks glow, so its fills sit a step lighter
            const v = (fa / 255 / (CW * CH)) * (look === 'frost' ? 0.7 : 1);
            if (v > 0.07) {
              const ramp = G.ramp;
              put(
                c,
                r,
                ramp[Math.min(ramp.length - 1, Math.ceil(v * (ramp.length - 1)))] ?? '',
                FILL,
              );
            }
          }
        }
      }
    }
  }

  // text: the real words, letter by letter along each line
  for (const p of M.parts) {
    if (p.kind !== 'text' || !p.lines) continue;
    const s = textOf(p.el).replace(/\s+/g, ' ').trim();
    let k = 0;
    for (const l of p.lines) {
      const r = Math.floor((l.y + l.h / 2 - oy) / CH);
      const c0 = col(l.x);
      const n = Math.max(1, Math.round((l.x2 - l.x) / CW));
      for (let j = 0; j < n && k < s.length; j++, k++) {
        const ch = s[k] ?? '';
        if (ch !== ' ') {
          put(c0 + j, r, ch, TEXT);
          textOrder.push(r * cols + c0 + j);
        }
      }
      if (s[k] === ' ') k++;
    }
  }

  // ─── 2. the stage ───
  const cv = document.createElement('canvas');
  cv.className = `ui-gen-ascii ui-gen-ascii--${look}`;
  // 1.5 at most: glyphs are small and soft, and the canvas is redrawn every frame
  const dpr = Math.min(1.5, window.devicePixelRatio || 1);
  const W = w + 2 * MG;
  const H = h + 2 * MG;
  cv.width = Math.ceil(W * dpr);
  cv.height = Math.ceil(H * dpr);
  Object.assign(cv.style, { left: `${-MG}px`, top: `${-MG}px`, width: `${W}px`, height: `${H}px` });
  layer.appendChild(cv);
  const g = cv.getContext('2d');
  if (!g) throw new Error('generate: no 2D canvas');
  const font = pal.font;
  const big = `500 10.5px ${font}`;
  const small = `500 7.5px ${font}`;
  const C = { ink: pal.ink, text: pal.text, paper: pal.paper, hot: pal.hot };
  // the frost's prism: a gradient across the element, drifting, so each glyph takes the tint
  // of where it stands
  const prismAt = (t: number) => {
    const shift = (t / 1400) % 1;
    const gr = g.createLinearGradient(-w * shift, 0, w * 2 - w * shift, h * 0.6);
    gr.addColorStop(0, pal.prismA);
    gr.addColorStop(0.25, pal.prismB);
    gr.addColorStop(0.5, pal.prismA);
    gr.addColorStop(0.75, pal.prismB);
    gr.addColorStop(1, pal.prismA);
    return gr;
  };

  const cx = (c: number) => ox + c * CW + CW / 2;
  const cy = (r: number) => oy + r * CH + CH / 2 + 0.5;
  const H0 = Float32Array.from({ length: N }, (_, i) => hash(i * 1.618 + seed * 7.31));
  // per cell, worked out once: its column, row and glyph centre, and the cells that hold a glyph
  const colOf = new Uint16Array(N);
  const rowOf = new Uint16Array(N);
  const cxA = new Float32Array(N);
  const cyA = new Float32Array(N);
  const held: number[] = [];
  for (let i = 0; i < N; i++) {
    const c = i % cols;
    const r = (i - c) / cols;
    colOf[i] = c;
    rowOf[i] = r;
    cxA[i] = cx(c);
    cyA[i] = cy(r);
    if (kind[i]) held.push(i);
  }
  const es = el.style;
  // the element's opacity and clip-path are written only when they change
  let lastOpacity = es.opacity;
  let lastClip = es.clipPath;
  const setOpacity = (v: string) => {
    if (v !== lastOpacity) es.opacity = lastOpacity = v;
  };
  const setClip = (v: string) => {
    if (v !== lastClip) es.clipPath = lastClip = v;
  };
  const begin = () => {
    g.setTransform(dpr, 0, 0, dpr, MG * dpr, MG * dpr);
    g.clearRect(-MG, -MG, W, H);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = big;
  };
  let fill: string | CanvasGradient = '';
  const ink = (c: string | CanvasGradient, a: number) => {
    if (c !== fill) g.fillStyle = fill = c;
    g.globalAlpha = a;
  };
  /** A hidden canvas the size of the stage, for glyphs that have stopped changing: drawn into
      once, then copied 1:1 (identity transform, whole pixels, so nothing is resampled). */
  const mkLayer = () => {
    const c = document.createElement('canvas');
    c.width = cv.width;
    c.height = cv.height;
    const x = c.getContext('2d');
    if (!x) throw new Error('generate: no 2D canvas');
    x.setTransform(dpr, 0, 0, dpr, MG * dpr, MG * dpr);
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.font = big;
    return { c, x };
  };
  const stamp = (from: HTMLCanvasElement, sy = 0, sh = cv.height) => {
    if (sh <= 0) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(from, 0, sy, cv.width, sh, 0, sy, cv.width, sh);
    g.setTransform(dpr, 0, 0, dpr, MG * dpr, MG * dpr);
  };

  // ─── plot: a pen draws the card: outlines walked round, the series left to right, the labels ───
  const seen = new Uint8Array(N);
  const take = (list: Iterable<number>, ok: (k: number) => boolean) => {
    const out: number[] = [];
    for (const i of list) {
      if (i < 0 || i >= N || seen[i] || !ok(kind[i] ?? 0)) continue;
      seen[i] = 1;
      out.push(i);
    }
    return out;
  };
  const byColumn: number[] = [];
  for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) byColumn.push(r * cols + c);
  const outline = take(outlineOrder, (k) => k === BOX);
  const series = take(byColumn, (k) => k === MARK || k === FILL);
  const labels = take(textOrder, (k) => k === TEXT);
  const rest = take(byColumn, (k) => k > 0); // anything the walks missed goes in with the labels
  const strike = new Float32Array(N).fill(9);
  const phase = (list: number[], a: number, b: number, jitter: number) => {
    list.forEach((i, j) => {
      strike[i] = a + (b - a) * (j / Math.max(1, list.length)) + jitter * ((H0[i] ?? 0) - 0.5);
    });
  };
  const P0 = 0.08;
  const PS = 0.36; // the series starts
  const PL = 0.58; // the labels start
  const P1 = 0.7;
  phase(outline, P0, PS, 0);
  phase(series, PS, PL, 0);
  phase([...labels, ...rest], PL, P1, 0.008); // typed, with a little jitter
  const path = [...outline, ...series, ...labels, ...rest];
  const byStrike = Int32Array.from(path).sort((a, b) => (strike[a] ?? 9) - (strike[b] ?? 9));
  const DRY = 350 / D; // ink is wet for 350ms
  let pen = 0; // how far along the path the pen is
  // the paper and the dried ink live on one layer: the paper is drawn once, a cell's paper is
  // cleared when the pen strikes it and its ink goes on when it dries. Each frame copies the
  // layer (below the feed line) and draws only the wet ink, the pen, the rulers and the status.
  let paper: ReturnType<typeof mkLayer> | null = null;
  let struck = 0; // byStrike[0 .. struck) have been struck
  let dried = 0; // byStrike[0 .. dried) are on the layer
  const plot = (p: number, t: number) => {
    begin();
    fill = '';
    const pin = smooth(0, 0.08, p);
    const pout = 1 - smooth(0.98, 1.07, p);
    const feed = win(0.72, 1.03, p) * (rows + 1.5); // rows above this are the real UI
    const fed = Math.floor(feed);
    const part = 1 - (feed - fed);
    // the real element feeds in under the drawing, a row at a time
    if (p < 0.72) setOpacity('0');
    else {
      setOpacity(prev.opacity);
      setClip(fed >= rows ? prev.clipPath : `inset(0 0 ${Math.max(0, h - (oy + fed * CH))}px 0)`);
    }
    if (!paper) {
      paper = mkLayer();
      const x = paper.x;
      x.fillStyle = C.paper;
      for (let pass = 0; pass < 2; pass++) {
        x.globalAlpha = pass ? 0.55 : 0.28;
        for (let i = 0; i < N; i++) {
          const major = (colOf[i] ?? 0) % 5 === 0 && (rowOf[i] ?? 0) % 5 === 0;
          if (major === !!pass) x.fillText(major ? '+' : '.', cxA[i] ?? 0, cyA[i] ?? 0);
        }
      }
    }
    const L = paper.x;
    while (struck < byStrike.length && (strike[byStrike[struck] ?? 0] ?? 9) <= p) {
      const i = byStrike[struck++] ?? 0;
      L.clearRect(ox + (colOf[i] ?? 0) * CW, oy + (rowOf[i] ?? 0) * CH, CW, CH);
    }
    let lastInk: string | null = null;
    while (dried < struck && (strike[byStrike[dried] ?? 0] ?? 9) + DRY <= p) {
      const i = byStrike[dried++] ?? 0;
      const k = kind[i] ?? 0;
      const col = k === TEXT || k === MARK ? C.text : C.ink;
      if (col !== lastInk) L.fillStyle = lastInk = col;
      L.globalAlpha = k === FILL ? 0.7 : 0.92;
      L.fillText(glyph[i] ?? '', cxA[i] ?? 0, cyA[i] ?? 0);
    }
    // the layer, from the feed line down: the row being fed at part strength
    if (fed < rows) {
      const rowTop = (r: number) =>
        Math.min(cv.height, Math.max(0, Math.floor((MG + oy + r * CH) * dpr)));
      const y0 = rowTop(fed);
      const y1 = rowTop(fed + 1);
      g.globalAlpha = pin * part;
      stamp(paper.c, y0, y1 - y0);
      g.globalAlpha = pin;
      stamp(paper.c, y1, cv.height - y1);
    }
    // the glyphs still wet: hot ink that dries
    for (let j = dried; j < struck; j++) {
      const i = byStrike[j] ?? 0;
      const k = kind[i] ?? 0;
      const r = rowOf[i] ?? 0;
      const a = r < fed ? 0 : r === fed ? part : 1;
      if (a <= 0) continue;
      const age = (p - (strike[i] ?? 9)) * D;
      ink(C.hot, 0.1 * (1 - age / 350) * a);
      g.fillRect(ox + (colOf[i] ?? 0) * CW, oy + r * CH, CW, CH);
      if (age < 160) ink(C.hot, a);
      else ink(k === TEXT || k === MARK ? C.text : C.ink, a * (k === FILL ? 0.7 : 0.92));
      g.fillText(glyph[i] ?? '', cxA[i] ?? 0, cyA[i] ?? 0);
    }
    // the pen: a dot leading a short trail, lifted where it jumps
    while (pen < path.length - 1 && (strike[path[pen + 1] ?? 0] ?? 9) <= p) pen++;
    const at = path[pen] ?? 0;
    const drawing = p > P0 && p < P1 + 0.02 && path.length > 0;
    const pc = at % cols;
    const pr = Math.floor(at / cols);
    if (drawing) {
      g.strokeStyle = C.hot;
      g.lineWidth = 1.2;
      for (let j = Math.max(1, pen - 10); j <= pen; j++) {
        const a0 = path[j - 1] ?? 0;
        const a1 = path[j] ?? 0;
        const dc = (a1 % cols) - (a0 % cols);
        const dr = Math.floor(a1 / cols) - Math.floor(a0 / cols);
        if (Math.abs(dc) > 2 || Math.abs(dr) > 2) continue; // pen up
        g.globalAlpha = 0.45 * (1 - (pen - j) / 10);
        g.beginPath();
        g.moveTo(cx(a0 % cols), cy(Math.floor(a0 / cols)));
        g.lineTo(cx(a1 % cols), cy(Math.floor(a1 / cols)));
        g.stroke();
      }
      ink(C.hot, 0.16);
      g.beginPath();
      g.arc(cx(pc), cy(pr), 5.5, 0, Math.PI * 2);
      g.fill();
      ink(C.hot, 0.95);
      g.beginPath();
      g.arc(cx(pc), cy(pr), 2.2, 0, Math.PI * 2);
      g.fill();
    }
    // the paper being fed: a line in hot ink at the feed edge
    if (p >= 0.72 && fed < rows) {
      ink(C.hot, 0.8);
      g.fillRect(ox, oy + fed * CH, cols * CW, 1);
    }
    // rulers following the pen, and the status line, in the margin
    const ma = pin * pout;
    g.font = small;
    for (let c = 0; c < cols; c += 5) {
      const on = drawing && Math.abs(c - pc) < 3;
      ink(on ? C.hot : C.paper, ma * (on ? 1 : 0.7));
      g.fillText(c % 10 ? '\u00b7' : String(c), cx(c), -7);
    }
    g.textAlign = 'right';
    for (let r = 0; r < rows; r += 2) {
      const on = drawing && Math.abs(r - pr) < 2;
      ink(on ? C.hot : C.paper, ma * (on ? 1 : 0.7));
      g.fillText(String(r).padStart(2, '0'), -4, cy(r));
    }
    g.textAlign = 'left';
    const [stage, total, s0, s1] =
      p < PS
        ? (['OUTLINE', outline.length, P0, PS] as const)
        : p < PL
          ? (['SERIES', series.length, PS, PL] as const)
          : (['LABELS', labels.length + rest.length, PL, P1] as const);
    const n = Math.min(total, Math.round(total * win(s0, s1, p)));
    const status =
      p < P1
        ? `PLOT ${cols}x${rows}  ${stage} ${n}/${total}`
        : p < 0.72
          ? `PLOT OK  ${path.length} GLYPHS`
          : `FEED ${Math.round(clamp(feed / rows) * 100)}%`;
    ink(C.ink, ma * 0.85);
    g.fillText(status + (Math.floor(t / 280) % 2 ? '_' : ''), ox, h + 9);
    g.globalAlpha = 1;
  };

  // ─── frost: glyphs condense from the edges in, crystallise into the card, then a band of
  //     light wipes the real UI in, sharp, leaving a few droplets ───
  const edge = Float32Array.from({ length: N }, (_, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    return clamp(
      Math.min(c, cols - 1 - c, r, rows - 1 - r) / Math.max(1, Math.min(cols, rows) / 2),
    );
  });
  // the frame crystallises first, then the data, then the labels and fills
  const KIND_AT = [1, 0.3, 0.14, 0.24, 0.34];
  const lock = Float32Array.from(
    { length: N },
    (_, i) => (KIND_AT[kind[i] ?? 0] ?? 1) + 0.24 * (edge[i] ?? 0) + 0.06 * (H0[i] ?? 0),
  );
  const sOf = Float32Array.from({ length: N }, (_, i) => {
    const r = Math.floor(i / cols);
    return ((i % cols) / cols) * 0.7 + (r / rows) * 0.3;
  });
  const MORPH = ' \u00b7\u2591\u2592';
  const W0 = 0.56;
  const W1 = 0.88;
  const CRYST = 200 / D; // a glyph crystallises for 200ms
  const bandAt = (p: number) => -0.08 + 1.16 * win(W0, W1, p);
  // the part of the element behind the band (where 0.7·x/w + 0.3·y/h < band), as a clip-path
  const behind = (band: number) => {
    const pts = [
      [0, 0],
      [w, 0],
      [w, h],
      [0, h],
    ] as const;
    const f = (q: readonly [number, number]) => (0.7 * q[0]) / w + (0.3 * q[1]) / h - band;
    const out: string[] = [];
    for (let k = 0; k < 4; k++) {
      const a = pts[k] ?? pts[0];
      const b = pts[(k + 1) % 4] ?? pts[0];
      const fa = f(a);
      const fb = f(b);
      if (fa <= 0) out.push(`${a[0].toFixed(1)}px ${a[1].toFixed(1)}px`);
      if (fa < 0 !== fb < 0) {
        const q = fa / (fa - fb);
        out.push(
          `${(a[0] + (b[0] - a[0]) * q).toFixed(1)}px ${(a[1] + (b[1] - a[1]) * q).toFixed(1)}px`,
        );
      }
    }
    return out.length >= 3 ? `polygon(${out.join(', ')})` : 'inset(0 100% 0 0)';
  };
  // Settled glyphs (crystallised for 200ms, the band not yet near) are drawn once, onto two
  // layers: `tintL` in a mask colour (the frame's glyphs take the drifting prism in the one
  // gradient fill below) and `textL` in the text colour. When the band reaches a cell it is
  // cleared from its layer and drawn live again, with the band's own colours.
  const byLock = Int32Array.from(held).sort((a, b) => (lock[a] ?? 9) - (lock[b] ?? 9));
  const byS = Int32Array.from(held).sort((a, b) => (sOf[a] ?? 0) - (sOf[b] ?? 0));
  const onLayer = new Uint8Array(N);
  let tintL: ReturnType<typeof mkLayer> | null = null;
  let textL: ReturnType<typeof mkLayer> | null = null;
  // the mist: `mistL` holds the drifting dots at whole-pixel offsets; `liveMist` is drawn live
  const liveMist = Int32Array.from({ length: N }, (_, i) => i).filter((i) => (H0[i] ?? 0) < 0.06);
  const layerMist = Int32Array.from({ length: N }, (_, i) => i).filter((i) => (H0[i] ?? 0) >= 0.06);
  const mistByEdge = layerMist.slice().sort((a, b) => (edge[a] ?? 0) - (edge[b] ?? 0));
  const mistByS = layerMist.slice().sort((a, b) => (sOf[a] ?? 0) - (sOf[b] ?? 0));
  const mistByLock = layerMist
    .filter((i) => kind[i])
    .sort((a, b) => (lock[a] ?? 9) - (lock[b] ?? 9));
  const mistIn = new Uint8Array(N);
  const mistY = new Float64Array(N);
  const mistK = new Int32Array(N);
  const snapY = snapEdge(dpr, small, MG);
  let mistL: ReturnType<typeof mkLayer> | null = null;
  let born = 0;
  let mBand = 0;
  let mLock = 0;
  let settled = 0; // byLock[0 .. settled) have been offered to the layers
  let cleared = 0; // byS[0 .. cleared) are behind the band's reach
  // glyphs drawn after the gradient fill, in their own colours
  const dI = new Int32Array(held.length);
  const dA = new Float32Array(held.length);
  const dY = new Float32Array(held.length);
  const dS = new Uint8Array(held.length); // 0 hot, 1 text
  const dCh: string[] = Array.from({ length: held.length }, () => '');
  const frost = (p: number, t: number) => {
    begin();
    fill = '';
    const front = easeOut(win(0, 0.3, p)) * 1.08; // the frost's reach from the edges
    const band = bandAt(p);
    const reach = band + 0.035; // cells with s below this are the band's, not the layers'
    const tint = prismAt(t);
    // the real element, wiped in behind the band
    if (p < W0) setOpacity('0');
    else {
      setOpacity(prev.opacity);
      setClip(band >= 1.02 ? prev.clipPath : behind(band));
    }
    if (!tintL || !textL) {
      tintL = mkLayer();
      textL = mkLayer();
      tintL.x.fillStyle = C.text; // only its alpha matters: the gradient fill recolours it
      textL.x.fillStyle = C.text;
    }
    // glyphs that have just settled go onto the layers, unless the band is already there
    while (settled < byLock.length && (lock[byLock[settled] ?? 0] ?? 9) + CRYST <= p) {
      const i = byLock[settled++] ?? 0;
      const si = sOf[i] ?? 0;
      if (p >= W0 && si < reach) continue;
      const k = kind[i] ?? 0;
      const x = (k === TEXT ? textL : tintL).x;
      x.globalAlpha = k === FILL ? 0.62 : 0.95;
      x.fillText(glyph[i] ?? '', cxA[i] ?? 0, cyA[i] ?? 0);
      onLayer[i] = 1;
    }
    // ...and the band takes cells back off them
    if (p >= W0) {
      while (cleared < byS.length && (sOf[byS[cleared] ?? 0] ?? 0) < reach) {
        const i = byS[cleared++] ?? 0;
        if (!onLayer[i]) continue;
        onLayer[i] = 0;
        (kind[i] === TEXT ? textL : tintL).x.clearRect(
          ox + (colOf[i] ?? 0) * CW,
          oy + (rowOf[i] ?? 0) * CH,
          CW,
          CH,
        );
      }
    }
    // everything that takes the prism is drawn in the mask colour...
    const mist = C.text;
    g.globalAlpha = 1;
    stamp(tintL.c);
    // pass 1, small: the mist, and the droplets the band leaves. Most of the mist only drifts a
    // pixel or two, so it sits on its own layer and a cell is redrawn only when its whole-pixel
    // drift changes; the twinkling cells (hash under 0.06, which include every droplet) are live.
    const mistOut = 1 - smooth(0.8, 0.95, p);
    g.font = small;
    if (mistOut * 0.2 >= 0.02) {
      if (!mistL) {
        mistL = mkLayer();
        mistL.x.font = small;
        mistL.x.fillStyle = mist;
      }
      const mx = mistL.x;
      const bandOn = p >= W0;
      // a dot is drawn at the middle of the device-pixel row its drift puts it on, and redrawn
      // only when that row changes: the pixels are the ones a live fillText would give
      const per = snapY === null ? dpr * 8 : dpr;
      const base = snapY ?? 0;
      const rowOfDot = (i: number) =>
        Math.floor(((cyA[i] ?? 0) + Math.sin(t / 900 + (H0[i] ?? 0) * 6) * 1.5 - base) * per);
      const put1 = (i: number, k: number) => {
        mx.clearRect((cxA[i] ?? 0) - 2.5, (cyA[i] ?? 0) + (mistY[i] ?? 0) - 4, 5, 8);
        mistK[i] = k;
        mistY[i] = base + (k + 0.5) / per - (cyA[i] ?? 0);
        mx.globalAlpha = kind[i] ? 0.36 : 0.2;
        mx.fillText(
          (H0[i] ?? 0) < 0.7 ? '\u00b7' : '\u2218',
          cxA[i] ?? 0,
          (cyA[i] ?? 0) + (mistY[i] ?? 0),
        );
      };
      const drop = (i: number) => {
        if (!mistIn[i]) return;
        mistIn[i] = 0;
        mx.clearRect((cxA[i] ?? 0) - 2.5, (cyA[i] ?? 0) + (mistY[i] ?? 0) - 4, 5, 8);
      };
      // cells the frost has reached
      while (born < mistByEdge.length && (edge[mistByEdge[born] ?? 0] ?? 0) <= front) {
        const i = mistByEdge[born++] ?? 0;
        if (bandOn && (sOf[i] ?? 0) < band) continue;
        if (kind[i] && p >= (lock[i] ?? 9)) continue;
        mistIn[i] = 1;
        mistY[i] = 0;
        put1(i, rowOfDot(i));
      }
      // ...and cells the band or the crystal has taken
      if (bandOn) {
        while (mBand < mistByS.length && (sOf[mistByS[mBand] ?? 0] ?? 0) < band)
          drop(mistByS[mBand++] ?? 0);
      }
      while (mLock < mistByLock.length && p >= (lock[mistByLock[mLock] ?? 0] ?? 9)) {
        drop(mistByLock[mLock++] ?? 0);
      }
      for (let j = 0; j < born; j++) {
        const i = mistByEdge[j] ?? 0;
        if (!mistIn[i]) continue;
        const k = rowOfDot(i);
        if (k !== mistK[i]) put1(i, k);
      }
      g.globalAlpha = mistOut;
      stamp(mistL.c);
      g.globalAlpha = 1;
    }
    for (let j = 0; j < liveMist.length; j++) {
      const i = liveMist[j] ?? 0;
      const e = edge[i] ?? 0;
      if (e > front) continue;
      const hs = H0[i] ?? 0;
      const s = sOf[i] ?? 0;
      if (p >= W0 && s < band) {
        if (hs >= 0.045) continue;
        const passed = W0 + (W1 - W0) * clamp((s + 0.08) / 1.16);
        const da = clamp((p - passed) / 0.24);
        if (da >= 1) continue;
        ink(mist, 0.85 * (1 - da));
        g.fillText('\u00b7', cxA[i] ?? 0, (cyA[i] ?? 0) + da * da * 10);
        continue;
      }
      const k = kind[i] ?? 0;
      if (k && p >= (lock[i] ?? 9)) continue; // crystallised: drawn in pass 2
      const twinkle = Math.sin(t / 180 + hs * 90) > 0.6;
      const a = (k ? 0.36 : 0.2) * (twinkle ? 2.4 : 1) * mistOut;
      if (a < 0.02) continue;
      ink(mist, Math.min(1, a));
      const ch = twinkle
        ? (NOISE[Math.floor(hs * 400) % NOISE.length] ?? '+')
        : hs < 0.7
          ? '\u00b7'
          : '\u2218';
      g.fillText(ch, cxA[i] ?? 0, (cyA[i] ?? 0) + Math.sin(t / 900 + hs * 6) * 1.5);
    }
    // pass 2: the crystallised glyphs that are not on a layer, bright at the band, rising as
    // it passes. Prism glyphs are drawn now; hot and text ones wait for after the fill.
    g.font = big;
    let nd = 0;
    for (let j = 0; j < held.length; j++) {
      const i = held[j] ?? 0;
      const lk = lock[i] ?? 9;
      if (p < lk || onLayer[i]) continue;
      const k = kind[i] ?? 0;
      const s = sOf[i] ?? 0;
      let dy = 0;
      let a = k === FILL ? 0.62 : 0.95;
      let tinted = k !== TEXT;
      let hot = false;
      if (p >= W0 && s < band) {
        const past = (band - s) / 0.07;
        if (past >= 1) continue;
        dy = -past * 7;
        a *= 1 - past;
        tinted = false;
        hot = true;
      } else if (p >= W0 && s < band + 0.035) {
        tinted = false;
        hot = true;
        a = 1;
      }
      const age = (p - lk) * D;
      let ch = glyph[i] ?? '';
      if (age < 200) {
        // crystallising: mist, then frost, then the glyph
        ch = MORPH[Math.floor(age / 50)] ?? ch;
        a *= 0.3 + (0.7 * age) / 200;
        tinted = false;
        hot = true;
      }
      if (tinted) {
        ink(mist, a);
        g.fillText(ch, cxA[i] ?? 0, (cyA[i] ?? 0) + dy);
      } else {
        dI[nd] = i;
        dA[nd] = a;
        dY[nd] = dy;
        dS[nd] = hot ? 0 : 1;
        dCh[nd] = ch;
        nd++;
      }
    }
    // ...then one gradient fill gives all of them their tint (the canvas samples a gradient in
    // canvas coordinates, so each pixel comes out as it did when every glyph had its own)
    g.globalCompositeOperation = 'source-in';
    g.globalAlpha = 1;
    g.fillStyle = tint;
    g.fillRect(-MG, -MG, W, H);
    g.globalCompositeOperation = 'source-over';
    fill = '';
    g.globalAlpha = 1;
    stamp(textL.c);
    for (const which of [0, 1]) {
      for (let j = 0; j < nd; j++) {
        if (dS[j] !== which) continue;
        const i = dI[j] ?? 0;
        ink(which ? C.text : C.hot, dA[j] ?? 0);
        g.fillText(dCh[j] ?? '', cxA[i] ?? 0, (cyA[i] ?? 0) + (dY[j] ?? 0));
      }
    }
    g.globalAlpha = 1;
  };

  return { frame: look === 'plot' ? plot : frost };
}
