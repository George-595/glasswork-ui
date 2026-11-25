import { type KeyboardEvent, useRef, useState } from 'react';
import { Button } from '../components/button';
import { SegmentedControl } from '../components/segmented-control';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { heatLevel } from './ActivityHeatmap';
import { type ChartCommonProps, ChartFigure } from './ChartFrame';
import { HIDDEN, useEntrance } from './motion';
import { defaultFormat } from './scale';

/* GlassHeatmap — a table of numbers by two things (weekday by hour, region by month) as a city
   of glass blocks: the busier the cell, the taller and darker its block. Height and the heat
   ramp say the same thing twice, so neither colour nor depth alone carries it.

   The city rises from the back corner when it arrives, turns a quarter at a time with "Turn"
   (so a tall block never hides a short one for good), and flattens into a plain grid with row
   and column names for exact reading. Pointing at or focusing a block lifts it and names it.

   Access: the blocks are a list with one tab stop; arrows move by row and column whichever way
   the city faces, Home and End go to the ends of the row. Each block says its row, column and
   value. The data table holds the whole matrix. */
export interface GlassHeatmapProps extends Omit<ChartCommonProps, 'height'> {
  rows: readonly string[];
  columns: readonly string[];
  /** values[row][column]. */
  values: readonly (readonly number[])[];
  valueFormat?: (n: number) => string;
  /** What the numbers count: "visits". */
  noun?: string;
  /** What the rows are, for the data table's first column. Default "Row". */
  rowsLabel?: string;
  /** Start flat instead of in 3D. */
  defaultView?: '3d' | 'flat';
}

const TW = 34;
const TH = 17;
const TALL = 84;
const PADDING = 30;
const FILL = ['fill-heat-0', 'fill-heat-1', 'fill-heat-2', 'fill-heat-3', 'fill-heat-4'] as const;
const KEY = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'] as const;

export function GlassHeatmap({
  rows,
  columns,
  values,
  title,
  description,
  className,
  emptyMessage,
  valueFormat = defaultFormat,
  noun = '',
  defaultView = '3d',
  rowsLabel = 'Row',
}: GlassHeatmapProps) {
  const [view, setView] = useState<string>(defaultView);
  const [turn, setTurn] = useState(0);
  const rise = useEntrance(1100, view);
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState(false);
  const list = useRef<SVGGElement>(null);

  const R = rows.length;
  const C = columns.length;
  const at = (r: number, c: number) => values[r]?.[c] ?? 0;
  const cells = rows.flatMap((_, r) =>
    columns.map((_, c) => ({ r, c, v: at(r, c), k: r * C + c })),
  );
  const max = Math.max(0, ...cells.map((x) => x.v));
  const peak = cells.find((x) => x.v === max);
  const lit = hover ?? (focused ? active : null);
  const litCell = lit === null ? undefined : cells[lit];
  const say = (x: { r: number; c: number; v: number }) =>
    `${rows[x.r]} · ${columns[x.c]}: ${valueFormat(x.v)}${noun ? ` ${noun}` : ''}`;

  const onKey = (e: KeyboardEvent, k: number) => {
    const r = Math.floor(k / C);
    const c = k % C;
    const next =
      e.key === 'ArrowRight'
        ? [r, Math.min(C - 1, c + 1)]
        : e.key === 'ArrowLeft'
          ? [r, Math.max(0, c - 1)]
          : e.key === 'ArrowDown'
            ? [Math.min(R - 1, r + 1), c]
            : e.key === 'ArrowUp'
              ? [Math.max(0, r - 1), c]
              : e.key === 'Home'
                ? [r, 0]
                : e.key === 'End'
                  ? [r, C - 1]
                  : null;
    if (!next) return;
    e.preventDefault();
    const to = (next[0] ?? 0) * C + (next[1] ?? 0);
    setActive(to);
    list.current?.querySelector<SVGElement>(`[data-cell="${to}"]`)?.focus();
  };
  const itemProps = (x: { k: number; r: number; c: number; v: number }) => ({
    role: 'listitem' as const,
    'data-cell': x.k,
    tabIndex: x.k === active ? 0 : -1,
    'aria-label': say(x),
    onFocus: () => {
      setActive(x.k);
      setFocused(true);
    },
    onBlur: () => setFocused(false),
    onKeyDown: (e: KeyboardEvent) => onKey(e, x.k),
    onPointerEnter: () => setHover(x.k),
    onPointerLeave: () => setHover(null),
  });

  // the grid as the city faces now: (row, column) -> (i, j) on the ground
  const odd = turn % 2 === 1;
  const gc = odd ? R : C;
  const gr = odd ? C : R;
  const place = (r: number, c: number): [number, number] =>
    turn === 0
      ? [c, r]
      : turn === 1
        ? [R - 1 - r, c]
        : turn === 2
          ? [C - 1 - c, R - 1 - r]
          : [r, C - 1 - c];
  const iLabel = (i: number) =>
    turn === 0
      ? columns[i]
      : turn === 1
        ? rows[R - 1 - i]
        : turn === 2
          ? columns[C - 1 - i]
          : rows[i];
  const jLabel = (j: number) =>
    turn === 0
      ? rows[j]
      : turn === 1
        ? columns[j]
        : turn === 2
          ? rows[R - 1 - j]
          : columns[C - 1 - j];
  const width = (gc + gr) * (TW / 2) + PADDING * 2 + 40;
  const height = (gc + gr) * (TH / 2) + TALL + PADDING * 2;
  const ox = gr * (TW / 2) + PADDING + 20;
  const oy = TALL + PADDING;
  const iso = (u: number, v: number) => [ox + (u - v) * (TW / 2), oy + (u + v) * (TH / 2)] as const;
  const city = cells
    .map((x) => ({ ...x, ij: place(x.r, x.c) }))
    .sort((a, b) => a.ij[0] + a.ij[1] - (b.ij[0] + b.ij[1]) || a.ij[0] - b.ij[0]);
  const span = Math.max(1, gc + gr - 2);

  const summary = `${title}: ${R} rows by ${C} columns${peak ? `; the peak is ${say(peak)}` : ''}`;
  const FW = 30;
  const FH = 24;
  const LEFT = 64;
  const TOPROW = 22;

  return (
    <ChartFigure
      title={title}
      description={description}
      className={className}
      empty={cells.length === 0}
      emptyMessage={emptyMessage}
      data={{
        headers: [rowsLabel, ...columns],
        rows: rows.map((r, ri) => [r, ...columns.map((_, ci) => valueFormat(at(ri, ci)))]),
      }}
    >
      <div className="ui-glass-heatmap flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="View"
            size="sm"
            value={view}
            onValueChange={setView}
            options={[
              { value: '3d', label: 'City' },
              { value: 'flat', label: 'Grid' },
            ]}
          />
          {view === '3d' && (
            <Button size="sm" variant="outline" onClick={() => setTurn((t) => (t + 1) % 4)}>
              <Icon name="rotate-cw" size={14} />
              Turn
            </Button>
          )}
          <span
            className="ms-auto inline-flex items-center gap-1 text-xs text-fg-muted"
            aria-hidden="true"
          >
            Less
            {KEY.map((k) => (
              <i
                key={k}
                className={cn('size-3 rounded-[3px] border border-solid border-border', k)}
              />
            ))}
            More
          </span>
        </div>
        <div className="min-w-0 overflow-x-auto">
          {view === '3d' && (
            // biome-ignore lint/a11y/useSemanticElements: an SVG group is named by role, not a fieldset
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="mx-auto block h-auto max-h-[28rem] w-full min-w-80"
              aria-label={summary}
              role="group"
            >
              <path
                {...HIDDEN}
                d={`M${iso(0, 0).join(' ')}L${iso(gc, 0).join(' ')}L${iso(gc, gr).join(' ')}L${iso(0, gr).join(' ')}Z`}
                className="fill-sunken stroke-border-subtle"
                transform={`translate(0 ${TH * 0.6})`}
              />
              <g {...HIDDEN} className="text-[10px]">
                {Array.from({ length: gc }, (_, i) => {
                  const [x, y] = iso(i + 0.5, gr + 0.55);
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: edge labels by position on the ground
                    <text key={`i${i}`} x={x} y={y + 4} textAnchor="end" className="fill-fg-subtle">
                      {iLabel(i)}
                    </text>
                  );
                })}
                {Array.from({ length: gr }, (_, j) => {
                  const [x, y] = iso(gc + 0.55, j + 0.5);
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: edge labels by position on the ground
                    <text key={`j${j}`} x={x} y={y + 4} className="fill-fg-subtle">
                      {jLabel(j)}
                    </text>
                  );
                })}
              </g>
              {/* biome-ignore lint/a11y/useSemanticElements: SVG has no list element */}
              {/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: a list of focusable blocks */}
              <g ref={list} role="list" aria-label={`${title}: cells`}>
                {city.map((x) => {
                  const [i, j] = x.ij;
                  const [cx, cy] = iso(i, j);
                  const level = heatLevel(x.v, max);
                  const g = Math.max(0, Math.min(1, rise * 1.9 - ((i + j) / span) * 0.9));
                  const on = x.k === lit;
                  const h = (x.v > 0 ? 3 + (x.v / (max || 1)) * TALL : 1.5) * g + (on ? 10 : 0);
                  const top = `M${cx} ${cy - h}l${TW / 2} ${TH / 2}l${-TW / 2} ${TH / 2}l${-TW / 2} ${-TH / 2}Z`;
                  const left = `M${cx - TW / 2} ${cy - h + TH / 2}l${TW / 2} ${TH / 2}v${h}l${-TW / 2} ${-TH / 2}Z`;
                  const right = `M${cx + TW / 2} ${cy - h + TH / 2}l${-TW / 2} ${TH / 2}v${h}l${TW / 2} ${-TH / 2}Z`;
                  return (
                    <g
                      key={x.k}
                      {...itemProps(x)}
                      className="group/cell cursor-default outline-none forced-colors:[forced-color-adjust:none]"
                    >
                      <path d={left} className={FILL[level]} />
                      <path d={left} className="fill-fg" fillOpacity={0.12} />
                      <path d={right} className={FILL[level]} />
                      <path d={right} className="fill-fg" fillOpacity={0.28} />
                      <path
                        d={top}
                        className={cn(
                          FILL[level],
                          on ? 'stroke-focus' : 'stroke-border',
                          'group-focus-visible/cell:stroke-focus',
                        )}
                        strokeWidth={on ? 2 : 0.5}
                      />
                      {level > 0 && (
                        <path
                          d={`M${cx - TW / 2 + 1.5} ${cy - h + TH / 2}l${TW / 2 - 1.5} ${TH / 2 - 0.75}l${TW / 2 - 1.5} ${-TH / 2 + 0.75}`}
                          className="pointer-events-none stroke-seaglass-paper"
                          strokeOpacity={0.75}
                          strokeWidth={1}
                          fill="none"
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
          {view !== '3d' && (
            // biome-ignore lint/a11y/useSemanticElements: an SVG group is named by role, not a fieldset
            <svg
              viewBox={`0 0 ${LEFT + C * FW + 4} ${TOPROW + R * FH + 4}`}
              className="mx-auto block h-auto w-full max-w-3xl min-w-80"
              aria-label={summary}
              role="group"
            >
              <g {...HIDDEN} className="text-[10px]">
                {columns.map((c, ci) => (
                  <text
                    key={c}
                    x={LEFT + ci * FW + FW / 2}
                    y={TOPROW - 7}
                    textAnchor="middle"
                    className={litCell?.c === ci ? 'fill-fg font-semibold' : 'fill-fg-subtle'}
                  >
                    {c}
                  </text>
                ))}
                {rows.map((r, ri) => (
                  <text
                    key={r}
                    x={LEFT - 8}
                    y={TOPROW + ri * FH + FH / 2 + 4}
                    textAnchor="end"
                    className={litCell?.r === ri ? 'fill-fg font-semibold' : 'fill-fg-subtle'}
                  >
                    {r}
                  </text>
                ))}
              </g>
              {/* biome-ignore lint/a11y/useSemanticElements: SVG has no list element */}
              {/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: a list of focusable cells */}
              <g ref={list} role="list" aria-label={`${title}: cells`}>
                {cells.map((x) => {
                  const level = heatLevel(x.v, max);
                  const on = x.k === lit;
                  const g = Math.max(
                    0,
                    Math.min(1, rise * 1.8 - ((x.r + x.c) / Math.max(1, R + C - 2)) * 0.8),
                  );
                  return (
                    <g key={x.k} {...itemProps(x)} className="group/cell outline-none">
                      <rect
                        x={LEFT + x.c * FW + 1.5}
                        y={TOPROW + x.r * FH + 1.5}
                        width={FW - 3}
                        height={FH - 3}
                        rx={4}
                        opacity={0.25 + g * 0.75}
                        className={cn(
                          FILL[level],
                          level === 0 ? 'stroke-border' : 'stroke-transparent',
                          on && 'stroke-focus',
                          'group-focus-visible/cell:stroke-focus',
                        )}
                        strokeWidth={on ? 2 : 1}
                      />
                    </g>
                  );
                })}
              </g>
            </svg>
          )}
        </div>
        <p aria-hidden="true" className="m-0 min-h-5 text-[13px] text-fg-muted tabular-nums">
          {litCell ? (
            <>
              <strong className="font-semibold text-fg">
                {rows[litCell.r]} · {columns[litCell.c]}
              </strong>{' '}
              {valueFormat(litCell.v)} {noun}
              {litCell.v === max && max > 0 ? ' · the peak' : ''}
            </>
          ) : peak ? (
            <>
              Peak <strong className="font-semibold text-fg">{say(peak)}</strong>
            </>
          ) : null}
        </p>
      </div>
    </ChartFigure>
  );
}
