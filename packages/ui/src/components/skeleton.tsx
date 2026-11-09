import { cva } from 'class-variance-authority';
import type { CSSProperties, HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/* Skeleton — shadcn's loading placeholder. Decorative: every shape is
   aria-hidden with no role; the region that is loading carries aria-busy
   (the page sets it, not this). A shimmer sweeps across it, and stops under
   prefers-reduced-motion. In the glass skin it is the glass material: blur,
   a translucent fill and the specular rim. */
export type SkeletonRadius = 'sm' | 'md' | 'pill' | 'circle';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** CSS width; a number is px. Default 100%. */
  width?: string | number;
  /** CSS height; a number is px. Default 1rem. */
  height?: string | number;
  /** Corner shape. Default md. `circle` with equal width and height is an avatar. */
  radius?: SkeletonRadius;
}

export const skeletonVariants = cva(
  [
    'ui-skeleton relative block h-4 w-full shrink-0 overflow-hidden bg-hover',
    'glass:[box-shadow:var(--elev-0)]',
    // the shimmer: a soft band of the shine colour sweeping left to right
    "after:absolute after:inset-0 after:content-[''] after:-translate-x-full",
    'after:bg-linear-90 after:from-transparent after:via-(--shine) after:to-transparent',
    'after:animate-[ui-skeleton-shimmer_1.6s_var(--ease-in-out)_infinite] motion-reduce:after:hidden',
  ],
  {
    variants: {
      radius: {
        sm: 'rounded-sm',
        md: 'rounded-md',
        pill: 'rounded-pill',
        circle: 'rounded-full',
      },
    },
    defaultVariants: { radius: 'md' },
  },
);

export function Skeleton({
  className,
  width,
  height,
  radius = 'md',
  style,
  ...props
}: SkeletonProps) {
  const size: CSSProperties = { ...style };
  if (width !== undefined) size.width = width;
  if (height !== undefined) size.height = height;
  return (
    <div
      {...props}
      aria-hidden="true"
      data-radius={radius}
      className={cn(skeletonVariants({ radius }), className)}
      style={size}
    />
  );
}

export interface SkeletonTextProps extends HTMLAttributes<HTMLDivElement> {
  /** Number of lines. Default 3. The last one is shorter, like a paragraph's. */
  lines?: number;
}

/** A paragraph placeholder: lines at body text height, the last at 60%. */
export function SkeletonText({ lines = 3, className, ...props }: SkeletonTextProps) {
  const count = Math.max(1, Math.floor(lines));
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn('ui-skeleton-text flex flex-col gap-2', className)}
    >
      {Array.from({ length: count }, (_, i) => `line-${i + 1}`).map((id, i) => (
        <Skeleton
          key={id}
          radius="sm"
          height="0.75rem"
          width={count > 1 && i === count - 1 ? '60%' : '100%'}
        />
      ))}
    </div>
  );
}

export interface SkeletonTableProps extends HTMLAttributes<HTMLDivElement> {
  /** Body rows. Default 5. */
  rows?: number;
  /** Columns. Default 4. */
  columns?: number;
}

/* Widths per column, so the placeholder reads as a table, not a grid. */
const CELL_WIDTHS = ['70%', '85%', '55%', '40%', '65%', '75%'];

/** A DataTable placeholder: the same frame, a header row and `rows` body rows
    with DataTable's cell padding (9px 14px) and row height. */
export function SkeletonTable({
  rows = 5,
  columns = 4,
  className,
  style,
  ...props
}: SkeletonTableProps) {
  const rowCount = Math.max(0, Math.floor(rows));
  const colCount = Math.max(1, Math.floor(columns));
  const grid: CSSProperties = {
    ...style,
    gridTemplateColumns: `repeat(${colCount}, minmax(0, 1fr))`,
  };
  const cols = Array.from({ length: colCount }, (_, c) => `col-${c + 1}`);
  const cell =
    'flex items-center border-0 border-b border-solid border-border-subtle px-3.5 py-[9px]';
  return (
    <div
      {...props}
      aria-hidden="true"
      className={cn(
        'ui-skeleton-table grid overflow-hidden rounded-md border border-solid border-border bg-surface',
        '[box-shadow:var(--elev-0)]',
        className,
      )}
      style={grid}
    >
      {cols.map((id) => (
        <div key={`head-${id}`} className={cn(cell, 'h-[43px]')}>
          <Skeleton radius="sm" height={10} width="45%" />
        </div>
      ))}
      {Array.from({ length: rowCount }, (_, r) => `row-${r + 1}`).map((row, r) =>
        cols.map((id, c) => (
          <div
            key={`${row}-${id}`}
            className={cn(cell, 'h-[37px]', r === rowCount - 1 && 'border-b-0')}
          >
            <Skeleton
              radius="sm"
              height={12}
              width={CELL_WIDTHS[(r + c * 2) % CELL_WIDTHS.length]}
            />
          </div>
        )),
      )}
    </div>
  );
}
