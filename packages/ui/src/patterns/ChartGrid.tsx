import type { HTMLAttributes } from 'react';
import {
  Grid,
  type GridCols,
  GridItem,
  type GridItemProps,
  type GridProps,
} from '../components/layout/Grid';
import type { Responsive } from '../components/layout/responsive';
import { cn } from '../lib/cn';

/* ChartGrid — the grid dashboards put ChartCards in: one column on a phone, a 12-track grid
   from 768px. Each child is a ChartGridItem that says how wide it is:

     wide        the full row
     half        half the row from 768px
     third       half the row from 768px, a third from 1024px
     two-thirds  the full row from 768px, two thirds from 1024px

   so a `two-thirds` and a `third` share a row on a desktop and stack on a phone. Items in a
   row stretch to the same height, and the card inside fills its item. */
export type ChartSpan = 'wide' | 'half' | 'third' | 'two-thirds';

export interface ChartGridProps extends Omit<GridProps, 'cols' | 'minItemWidth'> {
  cols?: Responsive<GridCols>;
}

export function ChartGrid({ gap = 5, className, cols, ...props }: ChartGridProps) {
  return (
    <Grid
      {...props}
      cols={cols ?? { base: 1, md: 12 }}
      gap={gap}
      className={cn('ui-chart-grid', className)}
    />
  );
}

const SPANS: Record<ChartSpan, GridItemProps['span']> = {
  wide: 'full',
  half: { base: 'full', md: 6 },
  third: { base: 'full', md: 6, lg: 4 },
  'two-thirds': { base: 'full', md: 'full', lg: 8 },
};

export interface ChartGridItemProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  span?: ChartSpan;
  children?: GridItemProps['children'];
}

export function ChartGridItem({ span = 'half', className, ...props }: ChartGridItemProps) {
  return (
    <GridItem
      {...props}
      span={SPANS[span]}
      data-span={span}
      className={cn('ui-chart-grid-item flex flex-col *:flex-1', className)}
    />
  );
}
