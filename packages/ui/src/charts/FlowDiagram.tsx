import { useMemo } from 'react';
import { cn } from '../lib/cn';
import { useSafeId } from './ChartFrame';
import { FLOW_H, FLOW_W, type FlowEdge, type FlowNode, layerNodes, layoutFlow } from './flowLayout';
import { useMeasuredWidth } from './useMeasuredWidth';

export { type FlowEdge, type FlowNode, layerNodes };

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
export interface FlowDiagramProps {
  title: string;
  description?: string;
  nodes: readonly FlowNode[];
  edges: readonly FlowEdge[];
  /** Which way the flow runs. Default right; a too-narrow box turns it down. */
  direction?: 'right' | 'down';
  className?: string;
}

const W = FLOW_W;
const H = FLOW_H;
const CHAR = 6.8; // px per character, 13px label
const CHAR_SMALL = 6; // 11px detail

const clip = (text: string, room: number) =>
  text.length <= room ? text : `${text.slice(0, Math.max(1, room - 1)).trimEnd()}…`;

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
  const {
    place,
    starts,
    vw,
    vh,
    scale,
    lines: laid,
  } = useMemo(() => layoutFlow(nodes, edges, direction, width), [nodes, edges, direction, width]);
  const label = new Map(nodes.map((n) => [n.id, n.label]));
  const lines = laid.map((l) => ({ ...l, text: l.label ? clip(l.label, 22) : null }));

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
