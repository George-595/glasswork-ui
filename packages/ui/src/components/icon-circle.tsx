import type { HTMLAttributes } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import type { SeaGlassTint } from '../seaglass/SeaGlass';

/* IconCircle — an icon in a round, tinted disc: the mark at the head of a card ("Scan in", a
   step, an empty state). The disc is a sea-glass tint role (`seaglass-0..6`), so it reads in all
   four themes and text-coloured icons on it keep their contrast (the token gate measures `fg` on
   every tint). The icon is decorative: the heading beside it names the thing. */
export type IconCircleSize = 'md' | 'lg';

export interface IconCircleProps extends HTMLAttributes<HTMLSpanElement> {
  icon: IconName;
  tint?: SeaGlassTint;
  /** md 40px, lg 48px (default). */
  size?: IconCircleSize;
}

// written out so Tailwind sees every class
const FILL: Record<SeaGlassTint, string> = {
  clear: 'bg-seaglass-0',
  coral: 'bg-seaglass-1',
  orchid: 'bg-seaglass-2',
  periwinkle: 'bg-seaglass-3',
  aqua: 'bg-seaglass-4',
  seafoam: 'bg-seaglass-5',
  amber: 'bg-seaglass-6',
};
const BOX: Record<IconCircleSize, string> = { md: 'size-10', lg: 'size-12' };
const GLYPH: Record<IconCircleSize, number> = { md: 20, lg: 24 };

export function IconCircle({
  icon,
  tint = 'clear',
  size = 'lg',
  className,
  ...props
}: IconCircleProps) {
  return (
    <span
      {...props}
      aria-hidden="true"
      className={cn(
        'ui-icon-circle inline-flex shrink-0 items-center justify-center rounded-full border border-solid border-border-subtle text-fg',
        FILL[tint],
        BOX[size],
        className,
      )}
    >
      <Icon name={icon} size={GLYPH[size]} />
    </span>
  );
}
