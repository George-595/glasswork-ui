/* Marker shapes per series — circle, square, triangle, diamond, cross — so
   lines differ by more than colour (WCAG 1.4.1). TanStack's built-in `dot`
   only draws circles, so this is a small custom mark (createMark) that draws
   the same shapes the legend shows. It is decorative: it adds no focus
   targets, the line under it owns the interaction points. */
import { cssVar } from '@apps/colors';
import { createMark, type SceneNode } from '@tanstack/charts';

export const MARKER_SIZE = 3.5;
/** circle, square, triangle, diamond, cross, down-triangle, plus, hexagon: one per series colour. */
export const MARKER_SHAPES = 8;

const n = (v: number) => Number(v.toFixed(2));

/** SVG path for marker shape `i` centred on (x, y). Shapes 4 (cross) and 6 (plus) are stroke-only. */
export function markerPath(i: number, x: number, y: number, s = MARKER_SIZE): string {
  switch (i % MARKER_SHAPES) {
    case 1:
      return `M${n(x - s)} ${n(y - s)}H${n(x + s)}V${n(y + s)}H${n(x - s)}Z`;
    case 2:
      return `M${n(x)} ${n(y - s - 1)}L${n(x + s + 1)} ${n(y + s)}L${n(x - s - 1)} ${n(y + s)}Z`;
    case 3:
      return `M${n(x)} ${n(y - s - 1)}L${n(x + s + 1)} ${n(y)}L${n(x)} ${n(y + s + 1)}L${n(x - s - 1)} ${n(y)}Z`;
    case 4:
      return `M${n(x - s)} ${n(y - s)}L${n(x + s)} ${n(y + s)}M${n(x + s)} ${n(y - s)}L${n(x - s)} ${n(y + s)}`;
    case 5:
      return `M${n(x - s - 1)} ${n(y - s)}L${n(x + s + 1)} ${n(y - s)}L${n(x)} ${n(y + s + 1)}Z`;
    case 6:
      return `M${n(x - s - 1)} ${n(y)}H${n(x + s + 1)}M${n(x)} ${n(y - s - 1)}V${n(y + s + 1)}`;
    case 7:
      return `M${n(x - s)} ${n(y - s - 1)}L${n(x + s)} ${n(y - s - 1)}L${n(x + s + 1)} ${n(y)}L${n(x + s)} ${n(y + s + 1)}L${n(x - s)} ${n(y + s + 1)}L${n(x - s - 1)} ${n(y)}Z`;
    default:
      return `M${n(x - s)} ${n(y)}A${s} ${s} 0 1 0 ${n(x + s)} ${n(y)}A${s} ${s} 0 1 0 ${n(x - s)} ${n(y)}Z`;
  }
}

/** True when shape `i` is drawn by its stroke (the cross and the plus) rather than its fill. */
export const strokedMarker = (i: number) => i % MARKER_SHAPES === 4 || i % MARKER_SHAPES === 6;

export interface MarkerRow {
  readonly x: string;
  readonly y: number;
}

/** A layer of shape-`shape` markers at each row, painted `color`, outlined in the surface colour. */
export function seriesMarkers(
  rows: readonly MarkerRow[],
  { id, shape, color }: { id: string; shape: number; color: string },
) {
  return createMark<MarkerRow, string, number>(() => ({
    id,
    channels: {
      x: { values: rows.map((r) => r.x) },
      y: { values: rows.map((r) => r.y) },
    },
    render: ({ scales }) => {
      const sx = scales.x;
      const sy = scales.y;
      if (!sx || !sy) return { nodes: [] };
      const children: SceneNode[] = [];
      for (const r of rows) {
        const x = sx.map(r.x);
        const y = sy.map(r.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        const path = markerPath(shape, x, y);
        children.push(
          strokedMarker(shape)
            ? {
                kind: 'polyline',
                key: `${id}:${r.x}`,
                points: [],
                path,
                style: { stroke: color, strokeWidth: 2, fill: 'none', lineCap: 'round' },
              }
            : {
                kind: 'area',
                key: `${id}:${r.x}`,
                points: [],
                path,
                style: { fill: color, stroke: cssVar('surface-solid'), strokeWidth: 1.5 },
              },
        );
      }
      return {
        nodes: [
          { kind: 'group', key: id, className: 'ui-chart-markers', ariaHidden: true, children },
        ],
      };
    },
  }));
}
