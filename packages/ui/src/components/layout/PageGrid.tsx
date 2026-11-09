import { createElement } from 'react';
import { cn } from '../../lib/cn';
import { GAP } from './classes';
import type { GridProps } from './Grid';
import { type Responsive, responsive, type Space } from './responsive';

/* PageGrid — the splits dashboards are made of. Children are the columns, in order; below
   the `stackBelow` breakpoint they stack, above it they share the width as the layout says:

     '1-1'  two equal columns         '2-1'  main and a half-width column
     '1-2'  the reverse               '3-1'  main and a quarter
     'sidebar'        main, then a 20rem aside      'sidebar-start'  a 16rem aside, then main

   Columns are minmax(0, …) and shrink, so a wide chart or table in one never pushes the
   other off the page.

   `stickyAside` (the sidebar layouts): once the columns sit side by side, the aside stays in
   view below the app's sticky top bar while the main column scrolls, instead of scrolling
   away and leaving an empty column (a section nav, a filter panel). */
export type PageGridLayout = '1-1' | '2-1' | '1-2' | '3-1' | 'sidebar' | 'sidebar-start';
export type PageGridBreakpoint = 'sm' | 'md' | 'lg' | 'xl';

export interface PageGridProps extends Omit<GridProps, 'cols' | 'minItemWidth'> {
  layout?: PageGridLayout;
  /** Stack the columns below this breakpoint. Default lg (1024px). */
  stackBelow?: PageGridBreakpoint;
  gap?: Responsive<Space>;
  /** Keep the aside of a sidebar layout in view while the main column scrolls. */
  stickyAside?: boolean;
}

const SPLIT: Record<PageGridBreakpoint, Record<PageGridLayout, string>> = {
  sm: {
    '1-1': 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
    '2-1': 'sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
    '1-2': 'sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]',
    '3-1': 'sm:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]',
    sidebar: 'sm:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]',
    'sidebar-start': 'sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]',
  },
  md: {
    '1-1': 'md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
    '2-1': 'md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
    '1-2': 'md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]',
    '3-1': 'md:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]',
    sidebar: 'md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]',
    'sidebar-start': 'md:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]',
  },
  lg: {
    '1-1': 'lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
    '2-1': 'lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
    '1-2': 'lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]',
    '3-1': 'lg:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]',
    sidebar: 'lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]',
    'sidebar-start': 'lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]',
  },
  xl: {
    '1-1': 'xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]',
    '2-1': 'xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]',
    '1-2': 'xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]',
    '3-1': 'xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)]',
    sidebar: 'xl:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]',
    'sidebar-start': 'xl:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]',
  },
};

// the aside is the first child in 'sidebar-start' and the last in 'sidebar'
const STICKY_START: Record<PageGridBreakpoint, string> = {
  sm: 'sm:*:first:sticky sm:*:first:top-20 sm:*:first:self-start',
  md: 'md:*:first:sticky md:*:first:top-20 md:*:first:self-start',
  lg: 'lg:*:first:sticky lg:*:first:top-20 lg:*:first:self-start',
  xl: 'xl:*:first:sticky xl:*:first:top-20 xl:*:first:self-start',
};
const STICKY_END: Record<PageGridBreakpoint, string> = {
  sm: 'sm:*:last:sticky sm:*:last:top-20 sm:*:last:self-start',
  md: 'md:*:last:sticky md:*:last:top-20 md:*:last:self-start',
  lg: 'lg:*:last:sticky lg:*:last:top-20 lg:*:last:self-start',
  xl: 'xl:*:last:sticky xl:*:last:top-20 xl:*:last:self-start',
};

const ITEMS = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
  stretch: 'items-stretch',
} as const;

export function PageGrid({
  layout = '2-1',
  stackBelow = 'lg',
  gap = 5,
  align,
  stickyAside = false,
  as = 'div',
  className,
  ...props
}: PageGridProps) {
  return createElement(as, {
    ...props,
    'data-layout': layout,
    className: cn(
      'ui-page-grid grid min-w-0 grid-cols-[minmax(0,1fr)] *:min-w-0',
      SPLIT[stackBelow][layout],
      responsive(gap, GAP),
      align && ITEMS[align],
      stickyAside && layout === 'sidebar-start' && STICKY_START[stackBelow],
      stickyAside && layout === 'sidebar' && STICKY_END[stackBelow],
      className,
    ),
  });
}
