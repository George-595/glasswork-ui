import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from '../effects/useReducedMotion';
import { cn } from '../lib/cn';
import { useSafeId } from './ChartFrame';
import { FLOW_H, FLOW_W, type FlowEdge, type FlowNode, layoutFlow } from './flowLayout';
import { seedOf, sketchCurve, sketchRect } from './sketch';
import { useMeasuredWidth } from './useMeasuredWidth';

/* SketchFlow — FlowDiagram drawn by hand, and alive. The same layout (steps in layers, arrows
   from edge to edge, a phone turns it top to bottom), but every box and arrow is a pencil
   stroke (charts/sketch.ts): drawn twice, bowed, overshooting the corners; a start is drawn in
   the brand colour on a soft brand wash (no hatched edge strip: George, 16 Nov 2026).

   Motion, all of it off under reduced motion:
     - draw-in: when it scrolls into view, a pen draws it layer by layer: each box, then the
       arrows out of it, then its words;
     - boil: once drawn, the strokes redraw between three takes a few times a second, the way
       hand-drawn animation does (paused off screen and while the tab is hidden);
     - flow: a dot of brand colour runs down every arrow, over and over, staggered;
     - hover: pointing at a step lights it and every arrow in or out of it.

   For pages that tell a story (a profile, a landing page). Dashboards keep FlowDiagram.

   Access: the drawing is one image named by its title, with the same visually hidden ordered
   list of "A, then B (label)" as FlowDiagram. */
export interface SketchFlowProps {
  title: string;
  description?: string;
  nodes: readonly FlowNode[];
  edges: readonly FlowEdge[];
  direction?: 'right' | 'down';
  className?: string;
}

const TAKES = 3;
const BOIL_MS = 170;
const LAYER_MS = 650;
const DRAW_MS = 750;
/* Words at full size everywhere: 14px labels, 12px details, 12px arrow labels. On a phone the
   boxes shrink to fit the width instead of the whole drawing shrinking, and words wrap. */
const LABEL_PX = 14;
const DETAIL_PX = 12;
const EDGE_PX = 12;
const LABEL_LH = LABEL_PX * 1.2;
const DETAIL_LH = DETAIL_PX * 1.25;
const LABEL_CH = LABEL_PX * 0.56;
const DETAIL_CH = DETAIL_PX * 0.52;
const EDGE_CH = EDGE_PX * 0.55;
const PHONE_GAP = 12;

const clip = (text: string, room: number) =>
  text.length <= room ? text : `${text.slice(0, Math.max(1, room - 1)).trimEnd()}…`;

/** Greedy word wrap to `room` characters a line, at most `max` lines (the last one clipped). */
function wrap(text: string, room: number, max = 3): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (next.length <= room || !line) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length <= max) return lines.map((l) => clip(l, room));
  const kept = lines.slice(0, max);
  kept[max - 1] = clip(`${kept[max - 1]} …`, room);
  return kept;
}

interface Words {
  label: string[];
  detail: string[];
}

function wordsFor(n: FlowNode, w: number, pad: number): Words {
  const room = w - pad;
  return {
    label: wrap(n.label, Math.max(4, Math.floor(room / LABEL_CH))),
    detail: n.detail ? wrap(n.detail, Math.max(4, Math.floor(room / DETAIL_CH))) : [],
  };
}

const wordsHeight = (t: Words) =>
  t.label.length * LABEL_LH + (t.detail.length > 0 ? 3 + t.detail.length * DETAIL_LH : 0);

/** Seen yet? Once true it stays true. */
function useSeen<T extends Element>(ref: React.RefObject<T | null>, skip: boolean): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (skip || seen) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') {
      setSeen(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, skip, seen]);
  return seen;
}

/** On screen right now (for the boil loop). */
function useOnScreen<T extends Element>(ref: React.RefObject<T | null>, active: boolean): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver((entries) => setOn(entries.some((e) => e.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, [ref, active]);
  return on;
}

export function SketchFlow({
  title,
  description,
  nodes,
  edges,
  direction = 'right',
  className,
}: SketchFlowProps) {
  const prefix = useSafeId('sketch');
  const reduced = useReducedMotion();
  const { width, ref } = useMeasuredWidth();
  const box = useRef<HTMLDivElement | null>(null);
  const attach = useCallback(
    (el: HTMLDivElement | null) => {
      box.current = el;
      ref(el);
    },
    [ref],
  );
  const seen = useSeen(box, reduced);
  const onScreen = useOnScreen(box, !reduced);
  const [take, setTake] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [settled, setSettled] = useState(false);

  const layout = useMemo(() => {
    const base = layoutFlow(nodes, edges, direction, width);
    let w = FLOW_W;
    let gapRow: number | undefined;
    let pad = 16;
    if (base.dir === 'down' && width > 0 && base.scale < 0.95) {
      // a phone: narrower boxes that fit the width, so nothing is scaled down
      const counts = new Map<number, number>();
      for (const at of base.layers.values()) counts.set(at, (counts.get(at) ?? 0) + 1);
      const longest = Math.max(1, ...counts.values());
      gapRow = PHONE_GAP;
      pad = 12;
      w = Math.max(84, Math.floor((width - 28 - (longest - 1) * PHONE_GAP) / longest));
    }
    const words = new Map(nodes.map((n) => [n.id, wordsFor(n, w, pad)]));
    const h = Math.max(
      FLOW_H,
      Math.ceil(16 + Math.max(0, ...[...words.values()].map(wordsHeight))),
    );
    const laid = layoutFlow(nodes, edges, gapRow ? 'down' : direction, width, { w, h, gapRow });
    // arrow labels as pills; one that would sit on another moves down a row
    const pills: { key: string; text: string; x: number; y: number; w: number }[] = [];
    for (const l of laid.lines) {
      if (!l.label) continue;
      const text = clip(l.label, 22);
      const pw = text.length * EDGE_CH + 14;
      let y = l.mid.y;
      while (
        pills.some((q) => Math.abs(q.x - l.mid.x) < (q.w + pw) / 2 + 4 && Math.abs(q.y - y) < 24)
      )
        y += 24;
      pills.push({ key: l.key, text, x: l.mid.x, y, w: pw });
    }
    return { ...laid, words, pills: new Map(pills.map((q) => [q.key, q])) };
  }, [nodes, edges, direction, width]);
  const { place, layers, starts, lines, vw, vh, scale, words, pills, w: W, h: H } = layout;
  const deepest = Math.max(0, ...layers.values());
  const total = deepest * LAYER_MS + DRAW_MS + 600;

  // every shape in each take, worked out once per layout
  const takes = useMemo(
    () =>
      Array.from({ length: TAKES }, (_, f) => ({
        boxes: new Map(
          nodes.flatMap((n) => {
            const p = place.get(n.id);
            if (!p) return [];
            return [[n.id, { rect: sketchRect(p.x, p.y, W, H, seedOf(n.id, f)) }] as const];
          }),
        ),
        arrows: new Map(lines.map((l) => [l.key, sketchCurve(l.curve, seedOf(l.key, f))])),
      })),
    [nodes, place, lines, W, H],
  );

  const drawn = reduced || seen;
  const live = !reduced && settled;

  useEffect(() => {
    if (!seen || reduced) return;
    const t = window.setTimeout(() => setSettled(true), total);
    return () => window.clearTimeout(t);
  }, [seen, reduced, total]);

  useEffect(() => {
    if (!live || !onScreen) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setTake((t) => (t + 1) % TAKES);
    }, BOIL_MS);
    return () => window.clearInterval(id);
  }, [live, onScreen]);

  const shapes = takes[take] ?? takes[0];
  const label = new Map(nodes.map((n) => [n.id, n.label]));
  const lit = (l: { from: string; to: string }) =>
    hover !== null && (l.from === hover || l.to === hover);

  /** A stroke that a pen draws in, starting `delay` ms after the diagram is seen. */
  const pen = (delay: number) =>
    reduced
      ? undefined
      : {
          strokeDasharray: 1,
          strokeDashoffset: drawn ? 0 : 1,
          transition: settled ? undefined : `stroke-dashoffset ${DRAW_MS}ms ease-out ${delay}ms`,
        };
  const ink = (delay: number) =>
    reduced
      ? undefined
      : {
          opacity: drawn ? 1 : 0,
          transition: settled ? undefined : `opacity 400ms ease-out ${delay}ms`,
        };

  return (
    <figure className={cn('ui-sketch-flow m-0 flex min-w-0 flex-col gap-2.5', className)}>
      <figcaption className="flex flex-col gap-0.5">
        <span className="text-sm/[1.3] font-semibold text-fg">{title}</span>
        {description && <span className="text-[13px] text-fg-subtle">{description}</span>}
      </figcaption>
      <div ref={attach} className="min-w-0">
        <svg
          role="img"
          aria-label={`${title}: a diagram of ${nodes.length} steps, listed below`}
          width={vw * scale}
          height={vh * scale}
          viewBox={`-6 -6 ${vw + 12} ${vh + 12}`}
          className="block max-w-full overflow-visible"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {lines.map((l) => {
            const delay = (layers.get(l.from) ?? 0) * LAYER_MS + DRAW_MS * 0.6;
            return (
              <g key={l.key}>
                <path id={`${prefix}-${l.key}`} d={l.d} fill="none" stroke="none" />
                <path
                  d={shapes?.arrows.get(l.key)}
                  pathLength={1}
                  fill="none"
                  className={cn(
                    'stroke-[1.6] transition-colors duration-200',
                    lit(l) ? 'stroke-brand' : 'stroke-fg-subtle',
                  )}
                  style={pen(delay)}
                />
                {live && (
                  <circle r={3.5} className="fill-brand">
                    <animateMotion
                      dur="2.6s"
                      begin={`${(lines.indexOf(l) % 5) * 0.45}s`}
                      repeatCount="indefinite"
                      keyPoints="0;1"
                      keyTimes="0;1"
                      calcMode="spline"
                      keySplines="0.45 0 0.55 1"
                    >
                      <mpath href={`#${prefix}-${l.key}`} />
                    </animateMotion>
                  </circle>
                )}
              </g>
            );
          })}
          {lines.map((l) => {
            const q = pills.get(l.key);
            if (!q) return null;
            const delay = (layers.get(l.from) ?? 0) * LAYER_MS + DRAW_MS;
            return (
              <g key={`${l.key}-label`} style={ink(delay)}>
                <rect
                  x={q.x - q.w / 2}
                  y={q.y - 11}
                  width={q.w}
                  height={22}
                  rx={11}
                  className="fill-surface-solid stroke-border-subtle"
                />
                <text
                  x={q.x}
                  y={q.y + 4}
                  textAnchor="middle"
                  className="fill-fg-muted text-[12px] italic"
                >
                  {q.text}
                </text>
              </g>
            );
          })}
          {nodes.map((n) => {
            const p = place.get(n.id);
            const s = shapes?.boxes.get(n.id);
            if (!p || !s) return null;
            const delay = (layers.get(n.id) ?? 0) * LAYER_MS;
            const on = hover === n.id;
            const start = starts.has(n.id);
            return (
              <g
                key={n.id}
                onPointerEnter={() => setHover(n.id)}
                onPointerLeave={() => setHover((h) => (h === n.id ? null : h))}
              >
                <rect x={p.x} y={p.y} width={W} height={H} className="fill-surface-solid" />
                {start && (
                  <rect
                    x={p.x}
                    y={p.y}
                    width={W}
                    height={H}
                    className="fill-brand-soft"
                    style={ink(delay + DRAW_MS * 0.4)}
                  />
                )}
                <path
                  d={s.rect}
                  pathLength={1}
                  fill="none"
                  className={cn(
                    'transition-colors duration-200',
                    on || start ? 'stroke-brand stroke-[1.9]' : 'stroke-fg-muted stroke-[1.5]',
                  )}
                  style={pen(delay)}
                />
                <g style={ink(delay + DRAW_MS * 0.5)}>
                  {(() => {
                    const t = words.get(n.id);
                    if (!t) return null;
                    const left = p.x;
                    const cx = left + (p.x + W - left) / 2;
                    // each line's baseline sits 0.35em below the middle of its line box
                    const top = p.y + (H - wordsHeight(t)) / 2;
                    const under = top + t.label.length * LABEL_LH + 3;
                    const label = t.label.map((line, i) => (
                      <tspan
                        key={`l${String(i)}`}
                        x={cx}
                        y={top + i * LABEL_LH + LABEL_LH / 2 + LABEL_PX * 0.35}
                      >
                        {line}
                      </tspan>
                    ));
                    const detail = t.detail.map((line, i) => (
                      <tspan
                        key={`d${String(i)}`}
                        x={cx}
                        y={under + i * DETAIL_LH + DETAIL_LH / 2 + DETAIL_PX * 0.35}
                      >
                        {line}
                      </tspan>
                    ));
                    return (
                      <>
                        <text textAnchor="middle" className="fill-fg text-[14px] font-semibold">
                          {label}
                        </text>
                        {detail.length > 0 && (
                          <text textAnchor="middle" className="fill-fg-muted text-[12px]">
                            {detail}
                          </text>
                        )}
                      </>
                    );
                  })()}
                </g>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="ui-sr-only">
        <p>Steps:</p>
        <ol>
          {nodes.map((n) => {
            const next = edges.filter((e) => e.from === n.id && label.has(e.to));
            return (
              <li key={n.id}>
                {n.label}
                {n.detail ? ` (${n.detail})` : ''}
                {next.length > 0
                  ? `, then ${next
                      .map((e) => `${label.get(e.to)}${e.label ? ` (${e.label})` : ''}`)
                      .join(' or ')}`
                  : ''}
              </li>
            );
          })}
        </ol>
      </div>
    </figure>
  );
}
