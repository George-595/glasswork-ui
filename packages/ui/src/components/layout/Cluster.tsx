import { createElement } from 'react';
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
import type { StackProps } from './Stack';

/* Cluster — children side by side, wrapping onto the next line when they run out of room:
   a row of buttons, badges, filters, a title with its actions. */
export interface ClusterProps extends Omit<StackProps, 'justify' | 'align' | 'gap'> {
  gap?: Responsive<Space>;
  /** Main-axis distribution. Default start. */
  justify?: Justify;
  /** Cross-axis alignment. Default center. */
  align?: Align;
  /** Keep to one line instead of wrapping. */
  nowrap?: boolean;
}

export function Cluster({
  gap = 3,
  justify = 'start',
  align = 'center',
  nowrap,
  as = 'div',
  className,
  ...props
}: ClusterProps) {
  return createElement(as, {
    ...props,
    className: cn(
      'ui-cluster flex min-w-0 *:min-w-0',
      nowrap ? 'flex-nowrap' : 'flex-wrap',
      responsive(gap, GAP),
      ALIGN[align],
      JUSTIFY[justify],
      className,
    ),
  });
}
