import {
  areaY,
  createChartScene,
  defineChart,
  dot as dotMark,
  lineY,
  type SceneNode,
  type SceneStyle,
} from '@tanstack/charts';
import { scaleLinear } from '@tanstack/charts/scales/linear';
import { type ReactNode, useId, useMemo } from 'react';
import { cn } from '../lib/cn';
import { PAINT, SVG_IMG, seriesColor } from './ChartFrame';
import { defaultFormat, monotoneX } from './scale';

/* Sparkline — a word-sized trend line for a tile or a table cell, in the
   look of @tanstack/charts' "Premium KPI sparklines" catalog case
   (122-premium-kpi-sparklines): guide-free, a monotone line over a soft
   gradient area, zero margin. One role="img" whose name gives the label and
   the figures a sighted reader takes from it (first, last, low, high), so it
   needs no data table.

   TanStack computes the scene (scales, curve, layout); this file paints it
   as a bare inline <svg>. The React adapter wraps its SVG in two <div>s,
   which may not sit inside a <p> or a table cell's phrasing content, and a
   sparkline has no interaction for the adapter's host to own. */
export interface SparklineProps {
  values: readonly number[];
  /** What the line shows, e.g. "Revenue, last 30 days". */
  label: string;
  width?: number;
  height?: number;
  format?: (n: number) => string;
  className?: string;
  /** Soft gradient fill under the line. Default true. */
  area?: boolean;
  /** A dot on the latest value. Default true. */
  dot?: boolean;
  /** 'accent' (default) is the first chart colour. 'auto' is green when the line ends
      higher than it began and red when lower; the label then says "up" or "down" too,
      so the direction never rests on colour. */
  tone?: 'accent' | 'auto';
}

const pathOf = (pts: readonly (readonly [number, number])[], close: boolean) =>
  pts.length ? `M${pts.map(([x, y]) => `${x},${y}`).join('L')}${close ? 'Z' : ''}` : '';

function paint(style: SceneStyle | undefined) {
  return {
    fill: style?.fill ?? 'none',
    fillOpacity: style?.fillOpacity,
    stroke: style?.stroke,
    strokeOpacity: style?.strokeOpacity,
    strokeWidth: style?.strokeWidth,
    strokeLinecap: style?.lineCap,
    strokeLinejoin:
      style?.lineJoin === 'arcs' || style?.lineJoin === 'miter-clip' ? undefined : style?.lineJoin,
    opacity: style?.opacity,
  };
}

/** The few scene node kinds a sparkline produces, as React SVG. */
function render(node: SceneNode): ReactNode {
  switch (node.kind) {
    case 'group':
      // focus layers are painted by TanStack's host on interaction; a sparkline has none
      if (node.focus) return null;
      return (
        <g
          key={node.key}
          transform={
            node.translateX || node.translateY
              ? `translate(${node.translateX ?? 0} ${node.translateY ?? 0})`
              : undefined
          }
        >
          {node.children.map(render)}
        </g>
      );
    case 'polyline':
      return (
        <path key={node.key} d={node.path ?? pathOf(node.points, false)} {...paint(node.style)} />
      );
    case 'area':
      return (
        <path key={node.key} d={node.path ?? pathOf(node.points, true)} {...paint(node.style)} />
      );
    case 'dot':
      return (
        <circle key={node.key} cx={node.x} cy={node.y} r={node.radius} {...paint(node.style)} />
      );
    default:
      return null;
  }
}

export function Sparkline({
  values,
  label,
  width = 120,
  height = 32,
  format = defaultFormat,
  className,
  area = true,
  dot = true,
  tone = 'accent',
}: SparklineProps) {
  const fillId = `ui-spark-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const delta =
    values.length > 1 ? (values[values.length - 1] as number) - (values[0] as number) : 0;
  const color =
    tone === 'auto' && delta !== 0 ? (delta > 0 ? PAINT.up : PAINT.down) : seriesColor(0);

  const nodes = useMemo(() => {
    if (!values.length) return [];
    const rows = values.map((v, i) => ({ i, v }));
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const pad = Math.max((hi - lo) * 0.12, Math.abs(hi) * 0.01, 0.01);
    const lastRow = rows[rows.length - 1];
    const definition = defineChart({
      guides: false,
      marks: [
        ...(area
          ? [
              areaY(rows, {
                id: 'area',
                x: 'i',
                y: 'v',
                y1: lo - pad,
                fill: `url(#${fillId})`,
                fillOpacity: 1,
                curve: monotoneX,
              }),
            ]
          : []),
        lineY(rows, {
          id: 'line',
          x: 'i',
          y: 'v',
          stroke: color,
          strokeWidth: 1.75,
          curve: monotoneX,
        }),
        ...(dot
          ? [dotMark(lastRow ? [lastRow] : [], { id: 'last', x: 'i', y: 'v', r: 2.5, fill: color })]
          : []),
      ],
      scales: {
        x: { scale: scaleLinear().domain([0, Math.max(1, values.length - 1)]), axis: false },
        y: { scale: scaleLinear().domain([lo - pad, hi + pad]), axis: false },
      },
      margin: { top: 3, right: 3, bottom: 3, left: 3 },
      focus: false,
      focusRing: false,
    });
    return createChartScene(definition, { width, height }).nodes;
  }, [values, width, height, fillId, color, area, dot]);

  const name = values.length
    ? `${label}: from ${format(values[0] as number)} to ${format(values[values.length - 1] as number)}, low ${format(Math.min(...values))}, high ${format(Math.max(...values))}${
        tone === 'auto' && delta !== 0 ? (delta > 0 ? ', up' : ', down') : ''
      }`
    : `${label}: no data`;

  return (
    <svg
      className={cn(
        'ui-sparkline inline-block overflow-visible align-middle motion-reduce:[&_*]:animate-none motion-reduce:[&_*]:transition-none forced-colors:[&_path]:[forced-color-adjust:none]',
        className,
      )}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      {...SVG_IMG}
      aria-label={name}
    >
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.28} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      {nodes.map(render)}
    </svg>
  );
}
