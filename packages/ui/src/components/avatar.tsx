import { type HTMLAttributes, useState } from 'react';
import { cn } from '../lib/cn';

/* Avatar — a person or account as a round picture, falling back to initials.
   With `src` it shows the image (named by `name`, so the alt text is the
   person); without one, or when the image fails to load, it shows initials on
   a colour picked from the name, so the same person is always the same colour.

   Contrast: the fill is a ~16% wash of a chart token over the solid surface,
   and the initials are the text colour, so they stay far above 4.5:1 in every
   skin and mode whatever the wash is; the 1px ring in the full token colour
   (>= 3:1, WCAG 1.4.11) is what carries the colour. Initials are never the only
   identification: the accessible name is the full name. */
export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg';

export interface AvatarProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Full name; gives the initials, the colour and the accessible name. */
  name: string;
  src?: string;
  size?: AvatarSize;
}

/** Up to two initials: first and last word ("Ada Lovelace" -> "AL"). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1] ?? '') : '';
  return `${[...first][0] ?? ''}${[...last][0] ?? ''}`.toUpperCase();
}

/** A stable index 0..5 from the name (FNV-1a), into the six avatar hues. */
export function toneOf(name: string): number {
  let h = 0x811c9dc5;
  for (const ch of name.trim().toLowerCase()) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 6;
}

export const AVATAR_SIZE: Record<AvatarSize, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-[12px]',
  md: 'size-10 text-[14px]',
  lg: 'size-14 text-[19px]',
};

/** Fill and edge per hue: the roles avatar-N and avatar-N-edge. */
export const AVATAR_TONE = [
  'bg-avatar-1 border-avatar-1-edge',
  'bg-avatar-2 border-avatar-2-edge',
  'bg-avatar-3 border-avatar-3-edge',
  'bg-avatar-4 border-avatar-4-edge',
  'bg-avatar-5 border-avatar-5-edge',
  'bg-avatar-6 border-avatar-6-edge',
] as const;

export function Avatar({ name, src, size = 'md', className, ...props }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;
  return (
    // biome-ignore lint/a11y/useAriaPropsSupportedByRole: the role is 'img' exactly when aria-label is set
    <span
      {...props}
      role={showImage ? undefined : 'img'}
      aria-label={showImage ? undefined : name}
      data-size={size}
      className={cn(
        'ui-avatar relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full',
        'border border-solid font-sans font-semibold leading-none',
        AVATAR_SIZE[size],
        showImage ? 'border-border bg-sunken' : cn(AVATAR_TONE[toneOf(name)], 'text-fg'),
        className,
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt={name}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </span>
  );
}
