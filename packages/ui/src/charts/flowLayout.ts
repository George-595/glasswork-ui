/* The layout FlowDiagram and SketchFlow share: steps in layers by their longest path from a
   start, left to right (or top to bottom when that is too wide), every arrow a cubic curve
   from one box's edge to the next, and a point at its middle for the label. */

export interface FlowNode {
  id: string;
  label: string;
  /** A second, smaller line under the label. */
  detail?: string;
}
export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export const FLOW_W = 176;
export const FLOW_H = 60;
const GAP_LAYER = 72;
const GAP = 24;
const PAD = 8;

export interface FlowPoint {
  x: number;
  y: number;
}
export interface FlowLine {
  key: string;
  from: string;
  to: string;
  /** The curve as an SVG path. */
  d: string;
  /** Its four control points (start, two handles, end). */
  curve: readonly [FlowPoint, FlowPoint, FlowPoint, FlowPoint];
  mid: FlowPoint;
  label?: string;
}
export interface FlowLayout {
  dir: 'right' | 'down';
  /** Top-left corner of each box. */
  place: Map<string, FlowPoint>;
  layers: Map<string, number>;
  /** Steps nothing points at. */
  starts: Set<string>;
  lines: FlowLine[];
  /** The box size this layout used. */
  w: number;
  h: number;
  /** The drawing's own size (the viewBox) and the scale that fits it into `width`. */
  vw: number;
  vh: number;
  scale: number;
}

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

export function layoutFlow(
  nodes: readonly FlowNode[],
  edges: readonly FlowEdge[],
  direction: 'right' | 'down',
  width: number,
  box: { w?: number; h?: number; gapRow?: number } = {},
): FlowLayout {
  const W = box.w ?? FLOW_W;
  const H = box.h ?? FLOW_H;
  const GAP_ROW = box.gapRow ?? GAP;
  const layers = layerNodes(nodes, edges);
  const groups: FlowNode[][] = [];
  for (const n of nodes) {
    const at = layers.get(n.id) ?? 0;
    groups[at] = [...(groups[at] ?? []), n];
  }
  const byLayer = groups.filter(Boolean);
  const longest = Math.max(1, ...byLayer.map((g) => g.length));
  const across = byLayer.length * W + (byLayer.length - 1) * GAP_LAYER + 2 * PAD;
  const dir = direction === 'right' && across > width ? 'down' : direction;

  const place = new Map<string, FlowPoint>();
  byLayer.forEach((group, li) => {
    // centre each layer on the longest one
    const offset = ((longest - group.length) * ((dir === 'right' ? H : W) + GAP_ROW)) / 2;
    group.forEach((n, ri) => {
      const along = PAD + li * ((dir === 'right' ? W : H) + GAP_LAYER);
      const side = PAD + offset + ri * ((dir === 'right' ? H : W) + GAP_ROW);
      place.set(n.id, dir === 'right' ? { x: along, y: side } : { x: side, y: along });
    });
  });
  const vw = dir === 'right' ? across : longest * W + (longest - 1) * GAP_ROW + 2 * PAD;
  const vh =
    dir === 'right'
      ? longest * H + (longest - 1) * GAP_ROW + 2 * PAD
      : byLayer.length * H + (byLayer.length - 1) * GAP_LAYER + 2 * PAD;
  const scale = width > 0 ? Math.min(1, width / vw) : 1;
  const starts = new Set(nodes.filter((n) => (layers.get(n.id) ?? 0) === 0).map((n) => n.id));

  const lines = edges.flatMap((e, i): FlowLine[] => {
    const a = place.get(e.from);
    const b = place.get(e.to);
    if (!a || !b || e.from === e.to) return [];
    const forward = (layers.get(e.to) ?? 0) > (layers.get(e.from) ?? 0);
    let p0: FlowPoint;
    let p1: FlowPoint;
    let p2: FlowPoint;
    let p3: FlowPoint;
    let mid: FlowPoint;
    if (dir === 'right') {
      p0 = forward ? { x: a.x + W, y: a.y + H / 2 } : { x: a.x + W / 2, y: a.y + H };
      p3 = forward ? { x: b.x, y: b.y + H / 2 } : { x: b.x + W / 2, y: b.y + H };
      const bend = forward ? (p3.x - p0.x) / 2 : GAP_ROW + 12;
      p1 = forward ? { x: p0.x + bend, y: p0.y } : { x: p0.x, y: p0.y + bend };
      p2 = forward ? { x: p3.x - bend, y: p3.y } : { x: p3.x, y: p3.y + bend };
      mid = {
        x: (p0.x + p3.x) / 2,
        y: forward ? (p0.y + p3.y) / 2 : Math.max(p0.y, p3.y) + bend * 0.75,
      };
    } else {
      p0 = forward ? { x: a.x + W / 2, y: a.y + H } : { x: a.x + W, y: a.y + H / 2 };
      p3 = forward ? { x: b.x + W / 2, y: b.y } : { x: b.x + W, y: b.y + H / 2 };
      const bend = forward ? (p3.y - p0.y) / 2 : GAP_ROW + 12;
      p1 = forward ? { x: p0.x, y: p0.y + bend } : { x: p0.x + bend, y: p0.y };
      p2 = forward ? { x: p3.x, y: p3.y - bend } : { x: p3.x + bend, y: p3.y };
      mid = {
        x: forward ? (p0.x + p3.x) / 2 : Math.max(p0.x, p3.x) + bend * 0.75,
        y: (p0.y + p3.y) / 2,
      };
    }
    return [
      {
        key: `${e.from}-${e.to}-${i}`,
        from: e.from,
        to: e.to,
        d: `M${p0.x},${p0.y} C${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y}`,
        curve: [p0, p1, p2, p3],
        mid,
        label: e.label,
      },
    ];
  });

  return { dir, place, layers, starts, lines, w: W, h: H, vw, vh, scale };
}
