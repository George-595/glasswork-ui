import {
  HoverCardArrow,
  HoverCardContent,
  HoverCard as HoverCardRoot,
  HoverCardTrigger,
} from '@ui-sdk/react/hover-card';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

/* HoverCard — a preview of what a link points to (a person, a page, a commit), shown while
   the pointer rests on the link or keyboard focus stays on it, on Vercel's UI SDK hover card
   (@ui-sdk/react/hover-card). The link is still a link: it works without the card, so the
   card holds nothing a person must reach (that would be a Popover). Esc closes it; the
   pointer can cross the gap into the card.

   The look: a glass panel (a raised, blurred surface in the glass skin) that scales up from
   the link with a small arrow pointing at it, and a short fade. `delay` is how long the
   pointer rests first (default 450ms). */
export interface HoverCardProps {
  /** The link's text. */
  children: ReactNode;
  href: string;
  /** The preview. */
  content: ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delay?: number;
  defaultOpen?: boolean;
  className?: string;
  contentClassName?: string;
}

export function HoverCard({
  children,
  href,
  content,
  side = 'bottom',
  align = 'center',
  delay = 450,
  defaultOpen,
  className,
  contentClassName,
}: HoverCardProps) {
  return (
    <HoverCardRoot delay={delay} closeDelay={200} defaultOpen={defaultOpen}>
      <HoverCardTrigger
        href={href}
        className={cn(
          'ui-hover-card-trigger rounded-xs font-medium text-link underline decoration-1 underline-offset-[3px] hover:text-link-hover focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] data-open:decoration-2',
          className,
        )}
      >
        {children}
      </HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        sideOffset={10}
        className={cn(
          'ui-hover-card z-50 m-0 w-80 max-w-[calc(100vw-1rem)] origin-(--transform-origin) rounded-lg border border-solid border-border bg-overlay p-4 text-fg [box-shadow:var(--elev-3)] glass-chrome',
          'transition-[opacity,scale] duration-(--dur-base) ease-(--ease-out) data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0 motion-reduce:transition-none',
          contentClassName,
        )}
      >
        <HoverCardArrow className="ui-hover-card-arrow size-3 rotate-45 border border-solid border-border bg-overlay data-[side=bottom]:-top-1.5 data-[side=bottom]:border-e-0 data-[side=bottom]:border-b-0 data-[side=left]:-end-1.5 data-[side=left]:border-s-0 data-[side=left]:border-b-0 data-[side=right]:-start-1.5 data-[side=right]:border-e-0 data-[side=right]:border-t-0 data-[side=top]:-bottom-1.5 data-[side=top]:border-s-0 data-[side=top]:border-t-0" />
        {content}
      </HoverCardContent>
    </HoverCardRoot>
  );
}

/** A ready layout for a person: initials, name, role, a line about them and a few stats. */
export function ProfilePreview({
  name,
  job,
  initials,
  about,
  stats,
  tone = 1,
}: {
  name: string;
  /** What they do: "Design engineer". */
  job?: string;
  initials: string;
  about?: ReactNode;
  stats?: readonly { label: string; value: ReactNode }[];
  /** Which of the six avatar tints (1 to 6). */
  tone?: 1 | 2 | 3 | 4 | 5 | 6;
}) {
  const TINT = {
    1: 'bg-avatar-1 border-avatar-1-edge',
    2: 'bg-avatar-2 border-avatar-2-edge',
    3: 'bg-avatar-3 border-avatar-3-edge',
    4: 'bg-avatar-4 border-avatar-4-edge',
    5: 'bg-avatar-5 border-avatar-5-edge',
    6: 'bg-avatar-6 border-avatar-6-edge',
  } as const;
  return (
    <div className="ui-profile-preview flex flex-col gap-3 font-sans">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'inline-flex size-12 shrink-0 items-center justify-center rounded-full border-2 border-solid text-[15px] font-semibold text-fg',
            TINT[tone],
          )}
        >
          {initials}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[15px] font-semibold">{name}</span>
          {job && <span className="truncate text-[13px] text-fg-muted">{job}</span>}
        </div>
      </div>
      {about && <p className="m-0 text-[13px] leading-normal text-fg-muted">{about}</p>}
      {stats && stats.length > 0 && (
        <dl className="m-0 grid grid-cols-3 gap-2 border-0 border-t border-solid border-border-subtle pt-3">
          {stats.map((s) => (
            <div key={s.label} className="flex flex-col">
              <dt className="text-[11px] text-fg-muted">{s.label}</dt>
              <dd className="m-0 text-[15px] font-semibold tabular-nums">{s.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}
