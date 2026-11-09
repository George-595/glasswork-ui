import { type KeyboardEvent, useMemo, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { type ChartCommonProps, ChartFigure } from './ChartFrame';
import { useMeasuredWidth } from './useMeasuredWidth';

/* ActivityHeatmap — a calendar of counts: one square per day, a column per week, five
   steps of one hue (the `heat-0..4` roles). Adapted from Arc's activity-heatmap (MIT,
   (c) Elia Kuratli; see THIRD_PARTY_NOTICES.md): the week-column layout, the quartile
   levels and the grid keyboard model. Use it for rhythm, streaks and quiet weeks; use a
   bar chart when the exact comparison is the point.

   Access (WCAG 1.4.1, 1.4.11, 2.1.1, 2.5.8):
   - it is a real ARIA grid: seven rows (the weekdays) of day cells, ONE tab stop (roving),
     and each cell's name is its whole story ("Mon 3 Aug 2026: 4 transactions");
   - arrows move a day (up/down) or a week (left/right), Home/End the row's first/last day,
     Ctrl+Home/Ctrl+End the first/last day of the range; the readout line under the grid
     follows focus and pointer (it is aria-hidden, the cell's name already says it);
   - the ramp is ordinal and each filled step is >= 3:1 on the page; an empty day is an
     outlined square. The data table (ChartCard's switch) holds every day with its count;
   - a cell is at least 24px square (the target-size minimum) and grows to fill the width, up to
     40px; the swatch is drawn smaller inside it;
   - all dates are read and written in UTC, so a day is the same day in every time zone. */
export interface ActivityDay {
  /** Calendar day, YYYY-MM-DD. */
  date: string;
  count: number;
}

export interface ActivityHeatmapProps extends ChartCommonProps {
  /** One entry per day with activity. Days missing inside the range count as zero. */
  days: readonly ActivityDay[];
  /** Nouns for the count. Default "event" / "events". */
  unit?: { one: string; other: string };
  /** Upper bounds of levels 1, 2 and 3; anything above is level 4. Default: quarters of the busiest day. */
  thresholds?: readonly [number, number, number];
  /** First row of the grid: 1 = Monday (default), 0 = Sunday. */
  weekStartsOn?: 0 | 1;
  /** Called with the date when a day is chosen (Enter, Space or a click). Makes the cells buttons-in-spirit. */
  onSelectDate?: (date: string) => void;
}

const DAY = 86_400_000;
const CELL = 24;
/* Cells grow to fill the card's width, up to this; below 24px the grid scrolls instead. */
const MAX_CELL = 40;
const LABEL_W = 34;
const fullDate = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const monthName = new Intl.DateTimeFormat('en-GB', { month: 'short', timeZone: 'UTC' });
const weekdayName = new Intl.DateTimeFormat('en-GB', { weekday: 'short', timeZone: 'UTC' });
const grouped = new Intl.NumberFormat('en-GB');

const parseDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const isoOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Level 0 (none) to 4 for a count. */
export function heatLevel(
  count: number,
  max: number,
  thresholds?: readonly [number, number, number],
): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  const [a, b, c] = thresholds ?? [max / 4, max / 2, (max * 3) / 4];
  return count <= a ? 1 : count <= b ? 2 : count <= c ? 3 : 4;
}

/* Literal classes (rule 21): Tailwind only emits what it can read whole. */
const LEVEL: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-heat-0 border-border',
  1: 'bg-heat-1 border-transparent',
  2: 'bg-heat-2 border-transparent',
  3: 'bg-heat-3 border-transparent',
  4: 'bg-heat-4 border-transparent',
};

interface Cell {
  date: string;
  ms: number;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  row: number;
  col: number;
}

export function ActivityHeatmap({
  days,
  title,
  description,
  className,
  emptyMessage,
  unit = { one: 'event', other: 'events' },
  thresholds,
  weekStartsOn = 1,
  onSelectDate,
}: ActivityHeatmapProps) {
  const grid = useRef<HTMLDivElement>(null);
  const { width: boxWidth, ref: boxRef } = useMeasuredWidth(0);
  const [active, setActive] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const model = useMemo(() => {
    if (days.length === 0) return null;
    const counts = new Map<string, number>();
    for (const d of days) counts.set(d.date, (counts.get(d.date) ?? 0) + Math.max(0, d.count));
    const stamps = days.map((d) => parseDay(d.date)).filter((n) => !Number.isNaN(n));
    if (stamps.length === 0) return null;
    const first = Math.min(...stamps);
    const last = Math.max(...stamps);
    const max = Math.max(...counts.values());
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    // weekday of the first day, as a row (0 = the week's first day)
    const rowOf = (ms: number) => (new Date(ms).getUTCDay() - weekStartsOn + 7) % 7;
    const startCol0 = first - rowOf(first) * DAY; // the first day of the first week
    const cells: Cell[] = [];
    for (let ms = first; ms <= last; ms += DAY) {
      const date = isoOf(ms);
      const count = counts.get(date) ?? 0;
      cells.push({
        date,
        ms,
        count,
        level: heatLevel(count, max, thresholds),
        row: rowOf(ms),
        col: Math.round((ms - rowOf(ms) * DAY - startCol0) / (7 * DAY)),
      });
    }
    const weeks = (cells[cells.length - 1]?.col ?? 0) + 1;
    const busiest = cells.reduce((a, c) => (c.count > a.count ? c : a), cells[0] as Cell);
    return { cells, weeks, max, total, busiest, first, last };
  }, [days, thresholds, weekStartsOn]);

  const noun = (n: number) => (n === 1 ? unit.one : unit.other);
  const nameOf = (c: Cell) =>
    `${fullDate.format(c.ms)}: ${grouped.format(c.count)} ${noun(c.count)}`;

  const rows = useMemo(() => {
    const out: Cell[][] = Array.from({ length: 7 }, () => []);
    for (const c of model?.cells ?? []) out[c.row]?.push(c);
    return out;
  }, [model]);

  const months = useMemo(() => {
    // a month label over the first column whose first day falls in a new month
    const top = new Map<number, Cell>();
    for (const c of model?.cells ?? []) if (!top.has(c.col)) top.set(c.col, c);
    const seen: { col: number; text: string }[] = [];
    let lastMonth = -1;
    for (const [col, c] of Array.from(top).toSorted((x, y) => x[0] - y[0])) {
      const m = new Date(c.ms).getUTCMonth();
      if (m !== lastMonth) {
        seen.push({ col, text: monthName.format(c.ms) });
        lastMonth = m;
      }
    }
    return seen;
  }, [model]);

  if (!model) {
    return (
      <ChartFigure
        title={title}
        description={description}
        className={className}
        empty
        emptyMessage={emptyMessage}
        data={{ headers: [], rows: [] }}
      />
    );
  }

  const byDate = new Map(model.cells.map((c) => [c.date, c]));
  const tabStop = active && byDate.has(active) ? active : (model.cells[0]?.date ?? '');
  const shown = byDate.get(hover ?? tabStop);

  const focusDate = (date: string | undefined) => {
    if (!date || !byDate.has(date)) return;
    setActive(date);
    grid.current?.querySelector<HTMLElement>(`[data-date="${date}"]`)?.focus();
  };
  const onKey = (e: KeyboardEvent, c: Cell) => {
    const shift = (days: number) => isoOf(c.ms + days * DAY);
    const rowCells = rows[c.row] ?? [];
    let to: string | undefined;
    switch (e.key) {
      case 'ArrowUp':
        to = shift(-1);
        break;
      case 'ArrowDown':
        to = shift(1);
        break;
      case 'ArrowLeft':
        to = shift(-7);
        break;
      case 'ArrowRight':
        to = shift(7);
        break;
      case 'Home':
        to = e.ctrlKey ? model.cells[0]?.date : rowCells[0]?.date;
        break;
      case 'End':
        to = e.ctrlKey
          ? model.cells[model.cells.length - 1]?.date
          : rowCells[rowCells.length - 1]?.date;
        break;
      case 'Enter':
      case ' ':
        if (onSelectDate) {
          e.preventDefault();
          onSelectDate(c.date);
        }
        return;
      default:
        return;
    }
    e.preventDefault();
    focusDate(to);
  };

  const cell =
    boxWidth > 0 && model.weeks > 0
      ? Math.min(MAX_CELL, Math.max(CELL, Math.floor((boxWidth - LABEL_W) / model.weeks)))
      : CELL;
  const swatch = Math.round(cell * 0.75);

  const labelRows: Record<number, string> = {};
  for (const r of [0, 2, 4]) {
    const sample = rows[r]?.[0];
    if (sample) labelRows[r] = weekdayName.format(sample.ms);
  }

  const summary = `${grouped.format(model.total)} ${noun(model.total)} from ${fullDate.format(model.first)} to ${fullDate.format(model.last)}; busiest day ${fullDate.format(model.busiest.ms)} with ${grouped.format(model.busiest.count)}.`;

  return (
    <ChartFigure
      title={title}
      description={description}
      className={className}
      data={{
        headers: ['Date', unit.other.charAt(0).toUpperCase() + unit.other.slice(1)],
        rows: model.cells.map((c) => [fullDate.format(c.ms), grouped.format(c.count)]),
      }}
      legend={
        <div className="ui-heatmap-key flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-fg-muted">
          <span className="inline-flex items-center gap-1.5" aria-hidden="true">
            Less
            {([0, 1, 2, 3, 4] as const).map((l) => (
              <span
                key={l}
                className={cn('size-3.5 rounded-[3px] border border-solid', LEVEL[l])}
              />
            ))}
            More
          </span>
        </div>
      }
    >
      <div className="ui-heatmap flex min-w-0 flex-col gap-2">
        <div ref={boxRef} className="ui-heatmap-scroll max-w-full overflow-x-auto pb-1">
          <div
            className="relative"
            style={{ width: LABEL_W + model.weeks * cell, minWidth: 'min-content' }}
          >
            <div aria-hidden="true" className="relative h-5 text-xs text-fg-subtle">
              {months.map((m) => (
                <span
                  key={`${m.col}-${m.text}`}
                  className="absolute top-0"
                  style={{ left: LABEL_W + m.col * cell }}
                >
                  {m.text}
                </span>
              ))}
            </div>
            {/* biome-ignore lint/a11y/useSemanticElements: a calendar of days is an ARIA grid, not a table */}
            <div
              ref={grid}
              role="grid"
              aria-label={`${title}. ${summary}`}
              aria-readonly="true"
              className="flex flex-col"
            >
              {rows.map((cells, r) => (
                // biome-ignore lint/a11y/useSemanticElements: rows of an ARIA grid
                // biome-ignore lint/a11y/useFocusableInteractive: a grid row is not itself a tab stop; its cells are
                <div
                  // biome-ignore lint/suspicious/noArrayIndexKey: seven fixed weekday rows
                  key={r}
                  role="row"
                  className="flex"
                  style={{ height: cell }}
                >
                  <span
                    aria-hidden="true"
                    className="shrink-0 pr-2 text-xs/6 text-fg-subtle"
                    style={{ width: LABEL_W }}
                  >
                    {labelRows[r]}
                  </span>
                  {cells.map((c, i) => (
                    // biome-ignore lint/a11y/useSemanticElements: a day cell of an ARIA grid
                    <div
                      key={c.date}
                      role="gridcell"
                      tabIndex={c.date === tabStop ? 0 : -1}
                      aria-label={nameOf(c)}
                      aria-selected={undefined}
                      data-date={c.date}
                      data-level={c.level}
                      className={cn(
                        'group/cell grid shrink-0 place-items-center rounded-[5px] outline-none',
                        'focus-visible:[box-shadow:var(--ring)]',
                        onSelectDate && 'cursor-pointer',
                      )}
                      style={{
                        width: cell,
                        height: cell,
                        marginLeft: i === 0 ? c.col * cell : 0,
                      }}
                      onFocus={() => {
                        setActive(c.date);
                        setHover(null);
                      }}
                      onKeyDown={(e) => onKey(e, c)}
                      onClick={() => onSelectDate?.(c.date)}
                      onPointerEnter={() => setHover(c.date)}
                      onPointerLeave={() => setHover(null)}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'rounded-[4px] border border-solid forced-colors:[forced-color-adjust:none]',
                          'transition-transform duration-(--dur-fast) ease-(--ease-out) group-hover/cell:scale-110 motion-reduce:transition-none motion-reduce:group-hover/cell:scale-100',
                          LEVEL[c.level],
                        )}
                        style={{ width: swatch, height: swatch }}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
        <p
          aria-hidden="true"
          className="ui-heatmap-readout m-0 min-h-5 text-[13px] text-fg-muted tabular-nums"
        >
          {shown ? (
            <>
              <strong className="font-semibold text-fg">{fullDate.format(shown.ms)}</strong>{' '}
              {grouped.format(shown.count)} {noun(shown.count)}
            </>
          ) : null}
        </p>
      </div>
    </ChartFigure>
  );
}
