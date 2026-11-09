import { createElement, type HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import { TEXT_TONE, type TextTone } from './tones';

/* Heading — a real <h1>–<h4> in the kit's type scale. `level` is the document outline (one
   h1 per page; Page and Section set the rest); `size` is how big it looks and defaults to
   the level's own, so a card title can be an h3 that looks like an h4. */
export type HeadingLevel = 1 | 2 | 3 | 4;
export type HeadingSize = 'display' | 1 | 2 | 3 | 4;

export interface HeadingProps extends HTMLAttributes<HTMLHeadingElement> {
  level?: HeadingLevel;
  size?: HeadingSize;
  tone?: TextTone;
}

export const HEADING_SIZE: Record<HeadingSize, string> = {
  display: '[font:var(--t-display)] tracking-[-0.02em]',
  1: '[font:var(--t-h1)] tracking-[-0.015em]',
  2: '[font:var(--t-h2)] tracking-[-0.01em]',
  3: '[font:var(--t-h3)] tracking-[-0.005em]',
  4: 'text-[15px] leading-[1.3] font-semibold',
};

export function Heading({ level = 2, size, tone = 'default', className, ...props }: HeadingProps) {
  return createElement(`h${level}`, {
    ...props,
    'data-size': size ?? level,
    className: cn(
      'ui-heading m-0 font-sans text-balance',
      HEADING_SIZE[size ?? level],
      TEXT_TONE[tone],
      className,
    ),
  });
}
