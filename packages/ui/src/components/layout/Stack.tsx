import { createElement, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { GAP } from './classes';
import {
  ALIGN,
  type Align,
  JUSTIFY,
  type Justify,
  type Responsive,
  responsive,
  type Space,
} from './responsive';

/* Stack — children one under another with an even gap. The page-level way to space things:
   use it instead of margins or `space-y-*`. Children can shrink (min-width 0), so a wide
   table or chart inside never widens the page. */
export type LayoutTag =
  | 'div'
  | 'section'
  | 'article'
  | 'aside'
  | 'header'
  | 'footer'
  | 'main'
  | 'nav'
  | 'ul'
  | 'ol'
  | 'form';

export interface StackProps extends HTMLAttributes<HTMLElement> {
  /** Space between children, from the spacing scale (1 = 4px … 8 = 64px). Default 4 (16px). */
  gap?: Responsive<Space>;
  /** Cross-axis alignment (horizontal). Default stretch. */
  align?: Align;
  justify?: Justify;
  as?: LayoutTag;
}

export function Stack({ gap = 4, align, justify, as = 'div', className, ...props }: StackProps) {
  return createElement(as, {
    ...props,
    className: cn(
      'ui-stack flex min-w-0 flex-col *:min-w-0',
      responsive(gap, GAP),
      align && ALIGN[align],
      justify && JUSTIFY[justify],
      className,
    ),
  });
}
