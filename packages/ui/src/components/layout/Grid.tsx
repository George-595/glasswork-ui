import { type CSSProperties, createElement, type HTMLAttributes, type Ref } from 'react';
import { cn } from '../../lib/cn';
import { COLS, GAP, ROW_SPAN, SPAN } from './classes';
import { type Responsive, responsive, type Space } from './responsive';
import type { LayoutTag } from './Stack';

/* Grid — equal tracks. `cols` is a number or one per breakpoint ({ base: 1, md: 2, xl: 4 });
   or give `minItemWidth` (px) and as many columns as fit are used, each at least that wide.
   Tracks are minmax(0, 1fr) and children can shrink, so wide content never widens the page. */
export type GridCols = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface GridProps extends HTMLAttributes<HTMLElement> {
  cols?: Responsive<GridCols>;
  /** Auto-fit: as many columns as fit, each at least this many px wide. Wins over `cols`. */
  minItemWidth?: number;
  gap?: Responsive<Space>;
  /** How items sit in their row. Default stretch. */
  align?: 'start' | 'center' | 'end' | 'stretch';
  as?: LayoutTag;
  ref?: Ref<HTMLElement>;
}

const ALIGN_ITEMS = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
} as const;

export function Grid({
  cols = 1,
  minItemWidth,
  gap = 4,
  align,
  as = 'div',
  className,
  style,
  ...props
}: GridProps) {
  const fit: CSSProperties | undefined = minItemWidth
    ? { gridTemplateColumns: `repeat(auto-fit, minmax(min(100%, ${minItemWidth}px), 1fr))` }
    : undefined;
  return createElement(as, {
    ...props,
    style: fit ? { ...fit, ...style } : style,
    className: cn(
      'ui-grid grid min-w-0 *:min-w-0',
      !fit && responsive(cols, COLS),
      responsive(gap, GAP),
      align && ALIGN_ITEMS[align],
      className,
    ),
  });
}

export interface GridItemProps extends HTMLAttributes<HTMLElement> {
  /** Columns to cover (1–12), or `full`; one per breakpoint if you like. */
  span?: Responsive<GridCols | 'full'>;
  rowSpan?: Responsive<1 | 2 | 3 | 4 | 5 | 6 | 'full'>;
  as?: LayoutTag;
}

/** A grid child that spans several tracks. Any element works as a grid child; use this
    only when it needs to cover more than one. */
export function GridItem({ span, rowSpan, as = 'div', className, ...props }: GridItemProps) {
  return createElement(as, {
    ...props,
    className: cn(
      'ui-grid-item min-w-0',
      responsive(span, SPAN),
      responsive(rowSpan, ROW_SPAN),
      className,
    ),
  });
}
