// biome-ignore-all lint/a11y/useSemanticElements: ARIA grid on divs: a <table> cannot hold a CSS-grid overlay of this shape
import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* CellGrid — a picture with a grid of toggle cells laid over it, for marking areas of an image:
   the parts of a camera still to watch or to ignore, the squares of a floor plan, a mask.

   - Cells are numbered row by row: `index = row * columns + column`, both from 0 (`cellIndex`).
     `value` is the set of cells that are on and `onChange` gets the next set (a new Set; the
     one passed in is never changed). The grid keeps no state of its own but the focused cell.
   - It is an ARIA grid (`role="grid"`, rows, gridcells) with one tab stop: Tab enters the cell that
     was last focused (the first, to begin with) and leaves from it. Arrow keys move one cell
     (and stop at the edge), Home and End go to the start and end of the row, Ctrl+Home and
     Ctrl+End to the first and last cell, Space and Enter toggle the focused cell, a click or tap
     toggles the cell pressed.
   - Every cell has a name: "Row 2, column 3, Driveway, on". The zone comes from `cellName`
     (the app knows what the cells mean; the kit does not), and the state is also `aria-selected`.
     State is never colour alone: an "on" cell has the selected fill, the brand border and a tick on
     a solid chip.
   - The picture is `src` + `alt` (an `alt` of "" says it is decoration), or `children` (any element
     that fills the box: a <video>, an <img> of a stream). `aspect` is its width over height and
     sets the box's shape.
   - On a touch screen (pointer: coarse) every cell is at least 48px: the box gets a minimum width
     that makes it so and scrolls sideways inside its own frame when the screen is narrower.
   - `disabled` dims the picture and the cells and draws their borders dashed (not colour alone), and stops toggling (focus still moves, so it can be read);
     `readOnly` shows the cells as they are and stops toggling without greying (`aria-readonly`).
   - No side effects, no sound, no timers: it renders what it is given. */
export const DEFAULT_CELL_GRID_COLUMNS = 12;
export const DEFAULT_CELL_GRID_ROWS = 8;

export interface CellGridCell {
  /** `row * columns + column`. */
  index: number;
  /** From 0, top to bottom. */
  row: number;
  /** From 0, left to right. */
  column: number;
}

interface CellGridBase {
  /** Names the grid ("Motion zones"). */
  label: string;
  /** The cells that are on, as `cellIndex` numbers. */
  value: ReadonlySet<number>;
  onChange: (next: ReadonlySet<number>) => void;
  /** Cells per row (a whole number of at least 1). Default 12. */
  columns?: number;
  /** Rows (a whole number of at least 1). Default 8. */
  rows?: number;
  /** The picture's width over its height. Default 16/9; anything not above 0 falls back to it. */
  aspect?: number;
  /** The zone or label of a cell, said in its name. Return undefined or '' for none. */
  cellName?: (cell: CellGridCell) => string | undefined;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
}

/** The picture is either `src` with `alt` (required; "" says it is decoration) or `children`. */
export type CellGridProps = CellGridBase &
  (
    | { src: string; alt: string; children?: never }
    | { src?: undefined; alt?: undefined; children?: ReactNode }
  );

/** The number of the cell at `row` and `column` (both from 0). */
export const cellIndex = (row: number, column: number, columns = DEFAULT_CELL_GRID_COLUMNS) =>
  row * columns + column;

const TOUCH = 48;
const whole = (n: number, fallback: number) =>
  Number.isFinite(n) ? Math.max(1, Math.floor(n)) : fallback;

export function CellGrid({
  label,
  value,
  onChange,
  src,
  alt,
  children,
  columns: columnsProp = DEFAULT_CELL_GRID_COLUMNS,
  rows: rowsProp = DEFAULT_CELL_GRID_ROWS,
  aspect: aspectProp = 16 / 9,
  cellName,
  disabled = false,
  readOnly = false,
  className,
}: CellGridProps) {
  const columns = whole(columnsProp, DEFAULT_CELL_GRID_COLUMNS);
  const rows = whole(rowsProp, DEFAULT_CELL_GRID_ROWS);
  const aspect = Number.isFinite(aspectProp) && aspectProp > 0 ? aspectProp : 16 / 9;
  const total = columns * rows;
  const root = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const here = Math.min(active, total - 1);
  const focusAfter = useRef(false);

  useEffect(() => {
    if (!focusAfter.current) return;
    focusAfter.current = false;
    root.current?.querySelector<HTMLElement>(`[data-index="${here}"]`)?.focus();
  }, [here]);

  const toggle = (index: number) => {
    if (disabled || readOnly) return;
    const next = new Set(value);
    if (!next.delete(index)) next.add(index);
    onChange(next);
  };
  const move = (to: number) => {
    const clamped = Math.max(0, Math.min(total - 1, to));
    if (clamped === here) return;
    focusAfter.current = true;
    setActive(clamped);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLElement>, index: number) => {
    if (e.altKey || e.metaKey) return;
    // Shift or Ctrl with an arrow is not ours (a screen reader's or the browser's)
    if ((e.shiftKey || e.ctrlKey) && e.key.startsWith('Arrow')) return;
    const row = Math.floor(index / columns);
    let to: number | null = null;
    if (e.key === 'ArrowRight') to = index + 1 < (row + 1) * columns ? index + 1 : index;
    else if (e.key === 'ArrowLeft') to = index > row * columns ? index - 1 : index;
    else if (e.key === 'ArrowDown') to = index + columns < total ? index + columns : index;
    else if (e.key === 'ArrowUp') to = index - columns >= 0 ? index - columns : index;
    else if (e.key === 'Home') to = e.ctrlKey ? 0 : row * columns;
    else if (e.key === 'End') to = e.ctrlKey ? total - 1 : (row + 1) * columns - 1;
    if (to !== null) {
      e.preventDefault();
      if (to === index) {
        focusAfter.current = false;
        return;
      }
      move(to);
      return;
    }
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!e.repeat) toggle(index);
    }
  };

  return (
    <div
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
      className={cn('ui-cell-grid max-w-full overflow-x-auto', className)}
    >
      <div
        ref={root}
        className="relative w-full overflow-hidden rounded-md bg-surface-solid pointer-coarse:min-w-(--cell-grid-min)"
        style={
          {
            aspectRatio: String(aspect),
            '--cell-grid-min': `${Math.ceil(Math.max(columns * TOUCH, rows * TOUCH * aspect))}px`,
          } as CSSProperties
        }
      >
        {src !== undefined ? (
          <img
            src={src}
            alt={alt ?? ''}
            draggable={false}
            className={cn(
              'absolute inset-0 block size-full select-none object-cover',
              disabled && 'opacity-60',
            )}
          />
        ) : (
          <div className={cn('absolute inset-0', disabled && 'opacity-60')}>{children}</div>
        )}
        <div
          role="grid"
          aria-label={label}
          aria-multiselectable="true"
          aria-readonly={readOnly || undefined}
          aria-disabled={disabled || undefined}
          className="absolute inset-0 flex flex-col"
        >
          {Array.from({ length: rows }, (_r, row) => (
            // biome-ignore lint/a11y/useFocusableInteractive: a row is not focusable in an ARIA grid; its cells are
            <div
              role="row"
              // biome-ignore lint/suspicious/noArrayIndexKey: rows are positions
              key={row}
              className="grid min-h-0 flex-1"
              style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: columns }, (_c, column) => {
                const index = row * columns + column;
                const on = value.has(index);
                const zone = cellName?.({ index, row, column });
                return (
                  <div
                    key={index}
                    role="gridcell"
                    data-index={index}
                    data-on={on || undefined}
                    tabIndex={index === here ? 0 : -1}
                    aria-selected={on}
                    aria-label={`Row ${row + 1}, column ${column + 1}${zone ? `, ${zone}` : ''}, ${on ? 'on' : 'off'}`}
                    onClick={() => {
                      setActive(index);
                      toggle(index);
                    }}
                    onFocus={() => setActive(index)}
                    onKeyDown={(e) => onKeyDown(e, index)}
                    className={cn(
                      'relative grid min-h-0 min-w-0 touch-manipulation place-items-center border border-solid outline-none',
                      'focus-visible:z-10 focus-visible:border-brand focus-visible:[box-shadow:var(--ring-inset)] forced-colors:focus-visible:[outline:2px_solid_Highlight]',
                      on ? 'border-brand bg-selected' : 'border-border-input bg-transparent',
                      disabled && 'border-dashed opacity-50',
                      disabled || readOnly ? 'cursor-default' : 'cursor-pointer',
                    )}
                  >
                    {on && (
                      <span
                        aria-hidden="true"
                        className="grid size-5 place-items-center rounded-full bg-surface-solid text-fg"
                      >
                        <Icon name="check" size={12} />
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
