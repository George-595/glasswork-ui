import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useReducedMotion } from '../effects/useReducedMotion';
import { type ChartCommonProps, ChartFigure, PAINT, seriesColor } from './ChartFrame';
import { markerPath, strokedMarker } from './markers';
import { easeOut, HIDDEN, rovingIndex } from './motion';
import { useMeasuredWidth } from './useMeasuredWidth';

/* NetworkGraph — who is connected to whom: people and teams, services and their callers, notes
   and their links. Up to about sixty nodes.

   The layout is a force simulation (Fruchterman–Reingold, ours, no library): linked nodes pull
   together, all nodes push apart. It is worked out before the first paint, so the server and the
   first frame agree, and the nodes then drift from a ring into place. Drag a node and the graph
   follows on springs. Pointing at or focusing a node lights it and its neighbours, dims the rest,
   and sends a flow along its links.

   Access: groups differ by marker shape as well as colour, and a node's size is its number of
   links. The nodes are a list with one tab stop: arrows walk the list, Enter jumps to the node's
   first neighbour, and each node's name says its group and every neighbour. The table lists
   every node's links. */
export interface NetworkNode {
  id: string;
  label: string;
  /** Index into `groups`: decides colour and shape. */
  group?: number;
}
export interface NetworkLink {
  source: string;
  target: string;
}
export interface NetworkGraphProps extends ChartCommonProps {
  nodes: readonly NetworkNode[];
  links: readonly NetworkLink[];
  /** Group names, in order, for the key and the labels. */
  groups?: readonly string[];
}

type Pos = Record<string, { x: number; y: number }>;
const PAD = 28;
/* Room under the lowest node for its label, so a name is never cut off at the foot. */
const PAD_BOTTOM = PAD + 22;

/** A node's marker size, from its number of links. */
const markerSize = (degree: number) => 5 + Math.min(7, degree * 1.2);
/** The width of a node's label pill. */
const labelWidth = (label: string) => label.length * 6.6 + 12;
/** Where a label pill sits across: under its node, but never past either edge of the plane. */
const labelX = (x: number, w: number, width: number) =>
  Math.max(w / 2 + 2, Math.min(width - w / 2 - 2, x));

/* Push apart any two nodes whose marker-and-label footprints overlap, so no name sits on another
   name or on a dot (a phone is narrow and the names are long). Each footprint runs from the top of
   the marker to the foot of the label pill; a pinned node stays where it is. */
function separate(
  nodes: readonly NetworkNode[],
  pos: Pos,
  size: (id: string) => number,
  w: number,
  h: number,
  pinned?: string,
  passes = 40,
) {
  const box = nodes.map((nd) => {
    const s = size(nd.id);
    return { id: nd.id, hw: Math.max(s + 4, labelWidth(nd.label) / 2), top: s + 2, foot: s + 25 };
  });
  const clamp = (id: string, hw: number) => {
    const p = pos[id] as { x: number; y: number };
    const side = Math.min(w / 2, Math.max(PAD, hw + 2));
    p.x = Math.max(side, Math.min(w - side, p.x));
    p.y = Math.max(PAD, Math.min(h - PAD_BOTTOM, p.y));
  };
  for (let pass = 0; pass < passes; pass++) {
    let moved = false;
    for (let i = 0; i < box.length; i++) {
      const a = box[i] as (typeof box)[number];
      const pa = pos[a.id] as { x: number; y: number };
      for (let j = i + 1; j < box.length; j++) {
        const b = box[j] as (typeof box)[number];
        const pb = pos[b.id] as { x: number; y: number };
        const dx = pb.x - pa.x;
        // compare the boxes' centres: a box's centre sits (foot - top) / 2 below its node
        const dy = pb.y + (b.foot - b.top) / 2 - (pa.y + (a.foot - a.top) / 2);
        const ox = a.hw + b.hw + 6 - Math.abs(dx);
        const oy = (a.top + a.foot + b.top + b.foot) / 2 + 2 - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // move along the shorter overlap; split it, unless one side is pinned
        const wa = a.id === pinned ? 0 : b.id === pinned ? 1 : 0.5;
        const wb = 1 - wa;
        if (ox / Math.max(1, a.hw + b.hw) < oy / Math.max(1, a.foot + b.foot)) {
          const sx = dx === 0 ? (i % 2 ? 1 : -1) : Math.sign(dx);
          pa.x -= sx * ox * wa;
          pb.x += sx * ox * wb;
        } else {
          const sy = dy === 0 ? 1 : Math.sign(dy);
          pa.y -= sy * oy * wa;
          pb.y += sy * oy * wb;
        }
        clamp(a.id, a.hw);
        clamp(b.id, b.hw);
      }
    }
    if (!moved) break;
  }
}

/** Fruchterman–Reingold in a w × h box. `pinned` nodes keep their place. Deterministic. */
function relax(
  nodes: readonly NetworkNode[],
  links: readonly NetworkLink[],
  w: number,
  h: number,
  start: Pos,
  iterations: number,
  pinned?: string,
  heat = 1,
): Pos {
  const pos: Pos = {};
  for (const nd of nodes) pos[nd.id] = { ...(start[nd.id] ?? { x: w / 2, y: h / 2 }) };
  const k = Math.sqrt(((w - 2 * PAD) * (h - 2 * PAD)) / Math.max(1, nodes.length)) * 0.72;
  for (let it = 0; it < iterations; it++) {
    const t = (Math.min(w, h) / 9) * heat * (1 - it / iterations) + 0.5;
    const disp: Pos = {};
    for (const a of nodes) disp[a.id] = { x: 0, y: 0 };
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i] as NetworkNode;
      const pa = pos[a.id] as { x: number; y: number };
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j] as NetworkNode;
        const pb = pos[b.id] as { x: number; y: number };
        const dx = pa.x - pb.x || 0.01 * (i - j);
        const dy = pa.y - pb.y || 0.01;
        const d = Math.max(0.5, Math.hypot(dx, dy));
        const f = (k * k) / d;
        const da = disp[a.id] as { x: number; y: number };
        const db = disp[b.id] as { x: number; y: number };
        da.x += (dx / d) * f;
        da.y += (dy / d) * f;
        db.x -= (dx / d) * f;
        db.y -= (dy / d) * f;
      }
    }
    for (const l of links) {
      const pa = pos[l.source];
      const pb = pos[l.target];
      if (!pa || !pb) continue;
      const dx = pa.x - pb.x;
      const dy = pa.y - pb.y;
      const d = Math.max(0.5, Math.hypot(dx, dy));
      const f = (d * d) / k;
      const da = disp[l.source] as { x: number; y: number };
      const db = disp[l.target] as { x: number; y: number };
      da.x -= (dx / d) * f;
      da.y -= (dy / d) * f;
      db.x += (dx / d) * f;
      db.y += (dy / d) * f;
    }
    for (const nd of nodes) {
      if (nd.id === pinned) continue;
      const p = pos[nd.id] as { x: number; y: number };
      const dd = disp[nd.id] as { x: number; y: number };
      // a gentle pull to the middle keeps loose parts on screen
      dd.x += (w / 2 - p.x) * 0.02 * k;
      dd.y += (h / 2 - p.y) * 0.02 * k;
      const len = Math.max(0.01, Math.hypot(dd.x, dd.y));
      p.x = Math.max(PAD, Math.min(w - PAD, p.x + (dd.x / len) * Math.min(len, t)));
      p.y = Math.max(PAD, Math.min(h - PAD_BOTTOM, p.y + (dd.y / len) * Math.min(len, t)));
    }
  }
  const degree = new Map<string, number>();
  for (const l of links) {
    degree.set(l.source, (degree.get(l.source) ?? 0) + 1);
    degree.set(l.target, (degree.get(l.target) ?? 0) + 1);
  }
  separate(
    nodes,
    pos,
    (id) => markerSize(degree.get(id) ?? 0),
    w,
    h,
    pinned,
    iterations < 10 ? 6 : 60,
  );
  return pos;
}

function ringOf(nodes: readonly NetworkNode[], w: number, h: number): Pos {
  const pos: Pos = {};
  nodes.forEach((nd, i) => {
    const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
    pos[nd.id] = {
      x: w / 2 + Math.cos(a) * (w / 2 - PAD) * 0.8,
      y: h / 2 + Math.sin(a) * (h / 2 - PAD) * 0.8,
    };
  });
  return pos;
}

export function NetworkGraph({
  nodes,
  links,
  groups = [],
  title,
  description,
  height = 380,
  className,
  emptyMessage,
}: NetworkGraphProps) {
  const { width, ref } = useMeasuredWidth();
  const reduced = useReducedMotion();
  const ring = useMemo(() => ringOf(nodes, width, height), [nodes, width, height]);
  const settled = useMemo(
    () => relax(nodes, links, width, height, ring, 320),
    [nodes, links, width, height, ring],
  );
  const [pos, setPos] = useState<Pos>(settled);
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const drag = useRef<{ id: string; moved: boolean } | null>(null);
  const list = useRef<SVGGElement>(null);
  const svg = useRef<SVGSVGElement>(null);

  // drift from the ring into the settled layout (or jump, without motion)
  useEffect(() => {
    let raf = 0;
    let t0 = -1;
    const step = (now: number) => {
      if (t0 < 0) t0 = now;
      const t = reduced ? 1 : easeOut(Math.min(1, (now - t0) / 900));
      const next: Pos = {};
      for (const id of Object.keys(settled)) {
        const a = ring[id] ?? { x: 0, y: 0 };
        const b = settled[id] ?? a;
        next[id] = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      }
      setPos(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [settled, ring, reduced]);

  const neighbours = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const nd of nodes) m.set(nd.id, []);
    for (const l of links) {
      m.get(l.source)?.push(l.target);
      m.get(l.target)?.push(l.source);
    }
    return m;
  }, [nodes, links]);
  const byId = useMemo(() => new Map(nodes.map((nd) => [nd.id, nd])), [nodes]);
  const order = nodes.map((nd) => nd.id);
  const tabbable = Math.min(active, nodes.length - 1);
  const lit = hover ?? (focused ? (order[tabbable] ?? null) : null);
  const near = new Set(lit ? [lit, ...(neighbours.get(lit) ?? [])] : []);
  const litNode = lit ? byId.get(lit) : undefined;
  const groupName = (g?: number) => (g === undefined ? '' : (groups[g] ?? `Group ${g + 1}`));
  const nameOf = (id: string) => byId.get(id)?.label ?? id;

  const toLocal = useCallback((e: PointerEvent) => {
    const box = svg.current?.getBoundingClientRect();
    return box ? { x: e.clientX - box.left, y: e.clientY - box.top } : { x: 0, y: 0 };
  }, []);
  const onDown = (e: PointerEvent<SVGGElement>, id: string) => {
    if (e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id, moved: false };
    setHover(id);
  };
  const onMove = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d) return;
    d.moved = true;
    const p = toLocal(e);
    const x = Math.max(PAD, Math.min(width - PAD, p.x));
    const y = Math.max(PAD, Math.min(height - PAD_BOTTOM, p.y));
    setPos((prev) =>
      relax(
        nodes,
        links,
        width,
        height,
        { ...prev, [d.id]: { x, y } },
        reduced ? 1 : 3,
        d.id,
        0.25,
      ),
    );
  };
  const onUp = () => {
    drag.current = null;
  };

  const go = (to: number) => {
    setActive(to);
    list.current?.querySelector<SVGElement>(`[data-node="${to}"]`)?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number, id: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const first = neighbours.get(id)?.[0];
      if (first) {
        e.preventDefault();
        go(order.indexOf(first));
      }
      return;
    }
    const to = rovingIndex(e.key, i, nodes.length);
    if (to === null) return;
    e.preventDefault();
    go(to);
  };

  const degree = (id: string) => neighbours.get(id)?.length ?? 0;
  const busiest = [...nodes].sort((a, b) => degree(b.id) - degree(a.id))[0];
  const summary = `${title}: ${nodes.length} nodes and ${links.length} links${busiest ? `; ${busiest.label} has the most links (${degree(busiest.id)})` : ''}`;
  const labelAll = nodes.length <= 24;

  return (
    <ChartFigure
      title={title}
      description={description}
      className={className}
      empty={nodes.length === 0}
      emptyMessage={emptyMessage}
      data={{
        headers: ['Node', 'Group', 'Links', 'Linked to'],
        rows: nodes.map((nd) => [
          nd.label,
          groupName(nd.group),
          String(degree(nd.id)),
          (neighbours.get(nd.id) ?? []).map(nameOf).join(', '),
        ]),
      }}
      legend={
        groups.length > 0 ? (
          <ul className="ui-chart-legend m-0 flex list-none flex-wrap gap-x-4 gap-y-1.5 p-0 text-[13px] text-fg-muted">
            {groups.map((g, i) => (
              <li key={g} className="inline-flex items-center gap-1.5">
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path
                    d={markerPath(i, 7, 7, 4.5)}
                    fill={strokedMarker(i) ? 'none' : seriesColor(i)}
                    stroke={strokedMarker(i) ? seriesColor(i) : 'none'}
                    strokeWidth={2.5}
                  />
                </svg>
                {g}
              </li>
            ))}
          </ul>
        ) : undefined
      }
    >
      <div className="ui-network flex min-w-0 flex-col gap-2">
        <div
          ref={ref}
          className="ui-network-plane relative min-w-0 overflow-hidden rounded-lg border border-solid border-border-subtle bg-sunken"
          style={{ height }}
        >
          {/* biome-ignore lint/a11y/useSemanticElements: an SVG group is named by role, not a fieldset */}
          <svg
            ref={svg}
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-label={summary}
            role="group"
            className="block select-none"
          >
            <g {...HIDDEN}>
              {links.map((l) => {
                const a = pos[l.source];
                const b = pos[l.target];
                if (!a || !b) return null;
                const on = lit !== null && (l.source === lit || l.target === lit);
                const from = l.source === lit ? a : b;
                const to = l.source === lit ? b : a;
                return (
                  <g key={`${l.source}>${l.target}`}>
                    <line
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke={PAINT.axisLine}
                      strokeOpacity={lit === null ? 0.55 : on ? 0 : 0.12}
                      strokeWidth={1.25}
                      className="transition-[stroke-opacity] duration-(--dur-base)"
                    />
                    {on && (
                      <line
                        x1={from.x}
                        y1={from.y}
                        x2={to.x}
                        y2={to.y}
                        className="ui-wire-flow stroke-brand"
                        strokeWidth={2.25}
                        strokeDasharray="10 4"
                        strokeLinecap="round"
                      />
                    )}
                  </g>
                );
              })}
            </g>
            {/* biome-ignore lint/a11y/useSemanticElements: SVG has no list element */}
            {/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: a list of focusable nodes */}
            <g ref={list} role="list" aria-label={`${title}: nodes`}>
              {nodes.map((nd, i) => {
                const p = pos[nd.id];
                if (!p) return null;
                const g = nd.group ?? 0;
                const s = markerSize(degree(nd.id));
                const dim = lit !== null && !near.has(nd.id);
                const isLit = nd.id === lit;
                const showLabel = labelAll ? !dim : near.has(nd.id);
                const w = labelWidth(nd.label);
                const lx = labelX(p.x, w, width);
                const nbs = (neighbours.get(nd.id) ?? []).map(nameOf);
                return (
                  // biome-ignore lint/a11y/useSemanticElements: SVG has no list element
                  // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: roving-focus node; a list item is the right semantic
                  <g
                    key={nd.id}
                    role="listitem"
                    data-node={i}
                    tabIndex={i === tabbable ? 0 : -1}
                    aria-label={`${nd.label}${nd.group !== undefined ? `, ${groupName(nd.group)}` : ''}: ${nbs.length ? `linked to ${nbs.join(', ')}` : 'no links'}`}
                    className="group/node cursor-grab touch-none outline-none transition-opacity duration-(--dur-base) active:cursor-grabbing"
                    opacity={dim ? 0.22 : 1}
                    onFocus={() => {
                      setActive(i);
                      setFocused(true);
                    }}
                    onBlur={() => setFocused(false)}
                    onKeyDown={(e) => onKey(e, i, nd.id)}
                    onPointerEnter={() => !drag.current && setHover(nd.id)}
                    onPointerLeave={() => !drag.current && setHover(null)}
                    onPointerDown={(e) => onDown(e, nd.id)}
                    onPointerMove={onMove}
                    onPointerUp={onUp}
                    onPointerCancel={onUp}
                  >
                    <circle cx={p.x} cy={p.y} r={Math.max(22, s + 10)} fill="transparent" />
                    {isLit && (
                      <circle
                        cx={p.x}
                        cy={p.y}
                        r={s + 7}
                        fill={seriesColor(g)}
                        fillOpacity={0.2}
                        className="ui-node-halo"
                      />
                    )}
                    <path
                      d={markerPath(g, p.x, p.y, s)}
                      fill={strokedMarker(g) ? 'none' : seriesColor(g)}
                      stroke={strokedMarker(g) ? seriesColor(g) : PAINT.gap}
                      strokeWidth={strokedMarker(g) ? 3.5 : 2}
                      strokeLinecap="round"
                      className="group-focus-visible/node:stroke-focus group-focus-visible/node:[stroke-width:3]"
                    />
                    {showLabel && (
                      <g {...HIDDEN} className="pointer-events-none">
                        <rect
                          x={lx - w / 2}
                          y={p.y + s + 5}
                          width={w}
                          height={18}
                          rx={9}
                          className={isLit ? 'fill-fg' : 'fill-surface-solid'}
                          fillOpacity={isLit ? 1 : 0.92}
                        />
                        <text
                          x={lx}
                          y={p.y + s + 18}
                          textAnchor="middle"
                          className={
                            isLit
                              ? 'fill-surface-solid text-[11px] font-semibold'
                              : 'fill-fg text-[11px] font-medium'
                          }
                        >
                          {nd.label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <p {...HIDDEN} className="m-0 min-h-5 text-[13px] text-fg-muted tabular-nums">
          {litNode ? (
            <>
              <strong className="font-semibold text-fg">{litNode.label}</strong>
              {litNode.group !== undefined ? ` · ${groupName(litNode.group)}` : ''} ·{' '}
              {degree(litNode.id)} {degree(litNode.id) === 1 ? 'link' : 'links'}
              {degree(litNode.id)
                ? `: ${(neighbours.get(litNode.id) ?? []).map(nameOf).join(', ')}`
                : ''}
            </>
          ) : (
            'Point at a node to trace its links; drag one to rearrange'
          )}
        </p>
      </div>
    </ChartFigure>
  );
}
