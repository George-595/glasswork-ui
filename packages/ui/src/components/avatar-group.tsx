import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { Avatar, type AvatarSize } from './avatar';

/* AvatarGroup — a row of overlapping avatars ("who is on this"). It is a list,
   so a screen reader hears how many people there are; people past `max` fold
   into a "+N" chip whose name says who they are not ("and 3 more"). Each
   avatar has a ring in the surface colour so the overlap stays legible. */
export interface AvatarGroupPerson {
  name: string;
  src?: string;
}

export interface AvatarGroupProps extends Omit<HTMLAttributes<HTMLUListElement>, 'children'> {
  people: readonly AvatarGroupPerson[];
  /** Avatars shown before the "+N" chip. Default 4. */
  max?: number;
  size?: AvatarSize;
  /** Names the list, e.g. "Reviewers". */
  label?: string;
}

const CHIP: Record<AvatarSize, string> = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-[11px]',
  md: 'size-10 text-[12px]',
  lg: 'size-14 text-[15px]',
};

export function AvatarGroup({
  people,
  max = 4,
  size = 'sm',
  label,
  className,
  ...props
}: AvatarGroupProps) {
  const shown = people.slice(0, Math.max(1, max));
  const rest = people.length - shown.length;
  const ring = 'rounded-full ring-2 ring-surface-solid';
  return (
    <ul
      {...props}
      aria-label={label}
      className={cn('ui-avatar-group m-0 flex list-none items-center p-0', className)}
    >
      {shown.map((p, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: two people can share a name; the row is positional
        <li key={`${p.name}-${i}`} className={cn('flex', i > 0 && '-ml-2', ring)}>
          <Avatar name={p.name} src={p.src} size={size} />
        </li>
      ))}
      {rest > 0 && (
        <li className={cn('-ml-2 flex', ring)}>
          <span
            role="img"
            aria-label={`and ${rest} more`}
            className={cn(
              'ui-avatar-more inline-flex items-center justify-center rounded-full border border-solid border-border-strong bg-sunken font-sans font-semibold text-fg-muted',
              CHIP[size],
            )}
          >
            <span aria-hidden="true">+{rest}</span>
          </span>
        </li>
      )}
    </ul>
  );
}
