import { useMemo } from 'react';
import { cn } from '../lib/cn';
import { useSafeId } from './ChartFrame';
import { useMeasuredWidth } from './useMeasuredWidth';

/* FlowDiagram — boxes and arrows: a process, a pipeline, how things connect. Steps go in
   layers by their longest path from a start (a step with nothing pointing at it), left to
   right or top to bottom; a loop back is drawn but does not move a step. Starts are edged in
   the brand colour, everything else in the input border, and every arrow carries its label on
   a solid chip, so no text sits on a line.

   Size: each box is fixed (176 x 60), the diagram is as big as its layers. A left-to-right
   diagram that is wider than its box turns top-to-bottom instead, so it never needs a sideways
   scroll on a phone; a top-to-bottom one too wide for its box scales down.

   Access: the drawing is one image named by its title and step count; the steps and arrows are
   also an ordered list of "A, then B (label)" right under it, visually hidden, so a screen
   reader gets the same flow as text. */
export interface FlowNode {
  id: string;
  label: string;
  /** A second, smaller line in the box. */
  detail?: string;
}
export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}
export interface FlowDiagramProps {
  title: string;
  description?: string;
  nodes: readonly FlowNode[];
  edges: readonly FlowEdge[];
  /** Which way the flow runs. Default right; a too-narrow box turns it down. */
  direction?: 'right' | 'down';
  className?: string;
}

const W = 176;
const H = 60;
const GAP_LAYER = 72;
const GAP_ROW = 24;
const PAD = 8;
const CHAR = 6.8; // px per character, 13px label
const CHAR_SMALL = 6; // 11px detail

const clip = (text: string, room: number) =>
  text.length <= room ? text : `${text.slice(0, Math.max(1, room - 1)).trimEnd()}…`;

/** Layer of each node: its longest path from a start, ignoring edges that close a loop. */
export function layerNodes(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
): Map<string, number> {
  const ids = new Set(nodes.map((n) => n.id));
  const out = new Map<string, string[]>();
  for (const e of edges) {
    if (!ids.has(e.from) || !ids.has(e.to) || e.from === e.to) continue;
    out.set(e.from, [...(out.get(e.from) ?? []), e.to]);
  }
  // drop back edges (found by DFS from every node in order), leaving a DAG
  const state = new Map<string, 1 | 2>();
  const dag = new Map<string, string[]>();
  const visit = (id: string) => {
    state.set(id, 1);
    for (const to of out.get(id) ?? []) {
      if (state.get(to) === 1) continue; // closes a loop
      dag.set(id, [...(dag.get(id) ?? []), to]);
      if (!state.has(to)) visit(to);
    }
    state.set(id, 2);
  };
  const incoming = new Set(edges.map((e) => e.to));
  for (const n of nodes) if (!incoming.has(n.id) && !state.has(n.id)) visit(n.id);
  for (const n of nodes) if (!state.has(n.id)) visit(n.id);
  // longest path, in topological order
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const tos of dag.values()) for (const to of tos) indeg.set(to, (indeg.get(to) ?? 0) + 1);
  const layer = new Map(nodes.map((n) => [n.id, 0]));
  const queue = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  while (queue.length > 0) {
    const id = queue.shift() as string;
    for (const to of dag.get(id) ?? []) {
      layer.set(to, Math.max(layer.get(to) ?? 0, (layer.get(id) ?? 0) + 1));
      const d = (indeg.get(to) ?? 1) - 1;
      indeg.set(to, d);
      if (d === 0) queue.push(to);
    }
  }
  return layer;
}

export function FlowDiagram({
  title,
  description,
  nodes,
  edges,
  direction = 'right',
  className,
}: FlowDiagramProps) {
  const prefix = useSafeId('flow');
  const { width, ref } = useMeasuredWidth();
  const layers = useMemo(() => layerNodes(nodes, edges), [nodes, edges]);
  const byLayer = useMemo(() => {
    const groups: FlowNode[][] = [];
    for (const n of nodes) {
      const at = layers.get(n.id) ?? 0;
      groups[at] = [...(groups[at] ?? []), n];
    }
    return groups.filter(Boolean);
  }, [nodes, layers]);
  const longest = Math.max(1, ...byLayer.map((g) => g.length));
  const across = byLayer.length * W + (byLayer.length - 1) * GAP_LAYER + 2 * PAD;
  const dir = direction === 'right' && across > width ? 'down' : direction;

  const place = new Map<string, { x: number; y: number }>();
  byLayer.forEach((group, li) => {
    // centre each layer on the longest one
    const offset = ((longest - group.length) * ((dir === 'right' ? H : W) + GAP_ROW)) / 2;
    group.forEach((n, ri) => {
      const along = PAD + li * ((dir === 'right' ? W : H) + GAP_LAYER);
      const side = PAD + offset + ri * ((dir === 'right' ? H : W) + GAP_ROW);
      place.set(n.id, dir === 'right' ? { x: along, y: side } : { x: side, y: along });
    });
  });
  const sideCount = longest;
  const vw = dir === 'right' ? across : sideCount * W + (sideCount - 1) * GAP_ROW + 2 * PAD;
  const vh =
    dir === 'right'
      ? sideCount * H + (sideCount - 1) * GAP_ROW + 2 * PAD
      : byLayer.length * H + (byLayer.length - 1) * GAP_LAYER + 2 * PAD;
  const scale = Math.min(1, width / vw);
  const label = new Map(nodes.map((n) => [n.id, n.label]));
  const starts = new Set(nodes.filter((n) => (layers.get(n.id) ?? 0) === 0).map((n) => n.id));

  const lines = edges.flatMap((e, i) => {
    const a = place.get(e.from);
    const b = place.get(e.to);
    if (!a || !b || e.from === e.to) return [];
    const forward = (layers.get(e.to) ?? 0) > (layers.get(e.from) ?? 0);
    let d: string;
    let mid: { x: number; y: number };
    if (dir === 'right') {
      const [x1, y1] = forward ? [a.x + W, a.y + H / 2] : [a.x + W / 2, a.y + H];
      const [x2, y2] = forward ? [b.x, b.y + H / 2] : [b.x + W / 2, b.y + H];
      const bend = forward ? (x2 - x1) / 2 : GAP_ROW + 12;
      d = forward
        ? `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`
        : `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 + bend} ${x2},${y2}`;
      mid = { x: (x1 + x2) / 2, y: forward ? (y1 + y2) / 2 : Math.max(y1, y2) + bend * 0.75 };
    } else {
      const [x1, y1] = forward ? [a.x + W / 2, a.y + H] : [a.x + W, a.y + H / 2];
      const [x2, y2] = forward ? [b.x + W / 2, b.y] : [b.x + W, b.y + H / 2];
      const bend = forward ? (y2 - y1) / 2 : GAP_ROW + 12;
      d = forward
        ? `M${x1},${y1} C${x1},${y1 + bend} ${x2},${y2 - bend} ${x2},${y2}`
        : `M${x1},${y1} C${x1 + bend},${y1} ${x2 + bend},${y2} ${x2},${y2}`;
      mid = { x: forward ? (x1 + x2) / 2 : Math.max(x1, x2) + bend * 0.75, y: (y1 + y2) / 2 };
    }
    return [{ key: `${e.from}-${e.to}-${i}`, d, mid, text: e.label ? clip(e.label, 22) : null }];
  });

  return (
    <figure className={cn('ui-flow m-0 flex min-w-0 flex-col gap-2.5', className)}>
      <figcaption className="flex flex-col gap-0.5">
        <span className="text-sm/[1.3] font-semibold text-fg">{title}</span>
        {description && <span className="text-[13px] text-fg-subtle">{description}</span>}
      </figcaption>
      <div ref={ref} className="min-w-0">
        <svg
          role="img"
          aria-label={`${title}: a diagram of ${nodes.length} steps, listed below`}
          width={vw * scale}
          height={vh * scale}
          viewBox={`0 0 ${vw} ${vh}`}
          className="block max-w-full"
        >
          <defs>
            <marker
              id={`${prefix}-arrow`}
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="7"
              markerHeight="7"
              orient="auto-start-reverse"
            >
              <path d="M0,0 L10,5 L0,10 z" className="fill-fg-subtle" />
            </marker>
          </defs>
          {lines.map((l) => (
            <path
              key={l.key}
              d={l.d}
              fill="none"
              markerEnd={`url(#${prefix}-arrow)`}
              className="stroke-fg-subtle stroke-[1.5]"
            />
          ))}
          {lines.map(
            (l) =>
              l.text && (
                <g key={`${l.key}-label`}>
                  <rect
                    x={l.mid.x - (l.text.length * CHAR_SMALL) / 2 - 6}
                    y={l.mid.y - 10}
                    width={l.text.length * CHAR_SMALL + 12}
                    height={20}
                    rx={10}
                    className="fill-surface-solid stroke-border-subtle"
                  />
                  <text
                    x={l.mid.x}
                    y={l.mid.y + 4}
                    textAnchor="middle"
                    className="fill-fg-muted text-[11px]"
                  >
                    {l.text}
                  </text>
                </g>
              ),
          )}
          {nodes.map((n) => {
            const p = place.get(n.id);
            if (!p) return null;
            return (
              <g key={n.id}>
                <rect
                  x={p.x}
                  y={p.y}
                  width={W}
                  height={H}
                  rx={8}
                  className={cn(
                    'fill-surface-solid stroke-[1.5]',
                    starts.has(n.id) ? 'stroke-brand' : 'stroke-border-input',
                  )}
                />
                <text
                  x={p.x + W / 2}
                  y={p.y + (n.detail ? 25 : 35)}
                  textAnchor="middle"
                  className="fill-fg text-[13px] font-semibold"
                >
                  {clip(n.label, Math.floor((W - 16) / CHAR))}
                </text>
                {n.detail && (
                  <text
                    x={p.x + W / 2}
                    y={p.y + 43}
                    textAnchor="middle"
                    className="fill-fg-muted text-[11px]"
                  >
                    {clip(n.detail, Math.floor((W - 16) / CHAR_SMALL))}
                  </text>
                )}
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
