import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import {
  type ChartCommonProps,
  ChartFigure,
  PatternDefs,
  patternFill,
  useSafeId,
} from './ChartFrame';
import { defaultFormat } from './scale';
import { squarify } from './squarify';
import { useMeasuredWidth } from './useMeasuredWidth';

/* Treemap — parts of a whole as areas, for when the sizes matter more than exact comparisons
   and there are too many parts for a donut. Adapted from Arc's treemap (MIT, (c) Elia Kuratli;
   see THIRD_PARTY_NOTICES.md): the squarified layout and the hide-what-does-not-fit labels.
   One level only (no drill-down).

   Access: tiles are told apart by a fill pattern as well as a colour (the bar patterns), every
   tile that has room carries its name on a solid chip (so the text contrast never depends on the
   fill), and a tile with no room is named by the readout line and the data table. The tiles are a
   list with one tab stop; arrows, Home and End move between them, and the readout line follows
   focus and pointer. The line is aria-hidden: each tile's own label already says it all. */
export interface TreemapProps extends ChartCommonProps {
  data: readonly { label: string; value: number }[];
  valueFormat?: (n: number) => string;
}

const GAP = 2;
const CHAR = 6.6; // px per character of the 12px label
const CHIP_PAD = 6;
const CHIP_H = 20;
const percent = new Intl.NumberFormat('en-GB', { style: 'percent', maximumFractionDigits: 1 });

/** The label that fits a tile `w` px wide, ellipsised; null when not even a short one does. */
export function fitLabel(label: string, w: number): string | null {
  const room = Math.floor((w - 2 * CHIP_PAD - 8) / CHAR);
  if (room < 3) return null;
  return label.length <= room ? label : `${label.slice(0, Math.max(1, room - 1)).trimEnd()}…`;
}

export function Treemap({
  data,
  title,
  description,
  height = 260,
  className,
  emptyMessage,
  valueFormat = defaultFormat,
}: TreemapProps) {
  const prefix = useSafeId('tm');
  const { width, ref } = useMeasuredWidth();
  const [active, setActive] = useState(0);
  const [hover, setHover] = useState<number | null>(null);
  const list = useRef<SVGGElement>(null);

  const items = useMemo(
    () =>
      data.flatMap((d, i) =>
        d.value > 0 ? [{ label: d.label, value: d.value, id: String(i) }] : [],
      ),
    [data],
  );
  const total = items.reduce((a, d) => a + d.value, 0);
  const rects = useMemo(
    () => squarify(items, { x: 0, y: 0, w: width, h: height }),
    [items, width, height],
  );
  const tiles = items.map((d, index) => ({ ...d, index, rect: rects.get(d.id) }));
  const tabbable = Math.min(active, tiles.length - 1);
  const current = tiles[hover ?? tabbable];

  const move = (to: number) => {
    const next = Math.max(0, Math.min(tiles.length - 1, to));
    setActive(next);
    list.current?.querySelector<SVGElement>(`[data-tile="${next}"]`)?.focus();
  };
  const onKey = (e: KeyboardEvent, i: number) => {
    const key = e.key;
    const to =
      key === 'ArrowRight' || key === 'ArrowDown'
        ? i + 1
        : key === 'ArrowLeft' || key === 'ArrowUp'
          ? i - 1
          : key === 'Home'
            ? 0
            : key === 'End'
              ? tiles.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    move(to);
  };

  const summary = `${title}: ${tiles
    .slice(0, 3)
    .map((t) => `${t.label} ${percent.format(t.value / total)}`)
    .join(', ')}${tiles.length > 3 ? ` and ${tiles.length - 3} more` : ''}`;

  return (
    <ChartFigure
      title={title}
      description={description}
      className={className}
      empty={tiles.length === 0}
      emptyMessage={emptyMessage}
      data={{
        headers: ['Part', 'Value', 'Share'],
        rows: data.map((d) => [
          d.label,
          valueFormat(d.value),
          percent.format(d.value / (total || 1)),
        ]),
      }}
    >
      <div className="ui-treemap flex min-w-0 flex-col gap-2">
        <PatternDefs prefix={prefix} />
        <div ref={ref} className="min-w-0" style={{ height }}>
          {/* biome-ignore lint/a11y/useSemanticElements: an SVG group is named by role, not a fieldset */}
          <svg
            width={width}
            height={height}
            viewBox={`0 0 ${width} ${height}`}
            aria-label={summary}
            role="group"
            className="block"
          >
            {/* biome-ignore lint/a11y/useSemanticElements: SVG has no list element */}
            {/* biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: a list of focusable tiles */}
            <g ref={list} role="list" aria-label={`${title}: parts`}>
              {tiles.map((t) => {
                const r = t.rect;
                if (!r || r.w <= 0 || r.h <= 0) return null;
                const x = r.x + GAP / 2;
                const y = r.y + GAP / 2;
                const w = Math.max(0, r.w - GAP);
                const h = Math.max(0, r.h - GAP);
                const text = h >= CHIP_H + 8 ? fitLabel(t.label, w) : null;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: SVG has no list element
                  // biome-ignore lint/a11y/noInteractiveElementToNoninteractiveRole: roving-focus tile of a read-only chart; a list item is the right semantic, focus lets a keyboard user read each tile
                  <g
                    key={t.id}
                    role="listitem"
                    tabIndex={t.index === tabbable ? 0 : -1}
                    data-tile={t.index}
                    aria-label={`${t.label}: ${valueFormat(t.value)}, ${percent.format(t.value / total)}`}
                    className="group/tile cursor-default outline-none"
                    onFocus={() => {
                      setActive(t.index);
                      setHover(null);
                    }}
                    onKeyDown={(e) => onKey(e, t.index)}
                    onPointerEnter={() => setHover(t.index)}
                    onPointerLeave={() => setHover(null)}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      rx={3}
                      fill={patternFill(prefix, t.index)}
                      className="stroke-transparent group-focus-visible/tile:stroke-focus group-focus-visible/tile:stroke-3 forced-colors:[forced-color-adjust:none]"
                    />
                    {text && (
                      // biome-ignore lint/a11y/noAriaHiddenOnFocusable: decoration inside the labelled tile; the tile's aria-label says it
                      <g aria-hidden="true">
                        <rect
                          x={x + 4}
                          y={y + 4}
                          width={Math.min(w - 8, text.length * CHAR + 2 * CHIP_PAD)}
                          height={CHIP_H}
                          rx={3}
                          className="fill-surface-solid"
                        />
                        <text
                          x={x + 4 + CHIP_PAD}
                          y={y + 4 + 14}
                          className="fill-fg text-xs font-medium"
                        >
                          {text}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        </div>
        <p
          aria-hidden="true"
          className="ui-treemap-readout m-0 min-h-5 text-[13px] text-fg-muted tabular-nums"
        >
          {current ? (
            <>
              <strong className="font-semibold text-fg">{current.label}</strong>{' '}
              {valueFormat(current.value)} · {percent.format(current.value / total)}
            </>
          ) : null}
        </p>
      </div>
    </ChartFigure>
  );
}
