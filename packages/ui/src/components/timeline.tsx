import type { HTMLAttributes, ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* Timeline — a vertical run of events joined by a line, each with a status dot: the history of
   an order, a deploy, a ticket. Adapted from Arc's timeline (MIT, (c) Elia Kuratli; see
   THIRD_PARTY_NOTICES.md): the dotted spine and status marks.

   Not FeedList: a feed is a list of rows to open (an avatar, a link, a trailing badge); a
   timeline is ONE thing's sequence, where order and outcome are the point. So the spine and the
   dot carry the status.

   A real <ol> (order matters, a screen reader says "list, 4 items"). The dot is never colour
   alone: each tone has its own glyph (tick, cross, alert, dot) and a visually hidden word
   ("Completed", "Failed", …) is read before the title. Give the time as a <time> in `time`. */
export type TimelineTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface TimelineProps extends HTMLAttributes<HTMLOListElement> {
  children?: ReactNode;
}

export function Timeline({ className, ...props }: TimelineProps) {
  return <ol {...props} className={cn('ui-timeline m-0 flex list-none flex-col p-0', className)} />;
}

export interface TimelineItemProps extends Omit<HTMLAttributes<HTMLLIElement>, 'title'> {
  title: ReactNode;
  /** When: usually a <time dateTime=…>. Shown beside the title. */
  time?: ReactNode;
  /** A line of context under the title. */
  meta?: ReactNode;
  tone?: TimelineTone;
  /** The status as words for a screen reader. Default by tone ("Completed", "Failed" …). */
  status?: string;
}

const DOT: Record<TimelineTone, string> = {
  neutral: 'border-border-strong bg-sunken text-fg-subtle',
  info: 'border-brand bg-brand-soft text-brand',
  success: 'border-success bg-success-soft text-success',
  warning: 'border-warning bg-warning-soft text-warning',
  danger: 'border-danger bg-danger-soft text-danger',
};
const WORD: Record<TimelineTone, string | null> = {
  neutral: null,
  info: 'Info',
  success: 'Completed',
  warning: 'Needs attention',
  danger: 'Failed',
};

function Glyph({ tone }: { tone: TimelineTone }) {
  if (tone === 'success') return <Icon name="check" size={13} />;
  if (tone === 'danger') return <Icon name="x" size={13} />;
  if (tone === 'warning') return <Icon name="alert" size={13} />;
  return <span className="size-1.5 rounded-full bg-current" />;
}

export function TimelineItem({
  title,
  time,
  meta,
  tone = 'neutral',
  status,
  className,
  ...props
}: TimelineItemProps) {
  const word = status ?? WORD[tone];
  return (
    <li
      {...props}
      data-tone={tone}
      className={cn(
        'ui-timeline-item group/item relative flex min-w-0 gap-3 pb-5 last:pb-0',
        // the spine: from under this dot to the next one
        'after:absolute after:top-7 after:bottom-1 after:left-3 after:w-px after:-translate-x-1/2 after:bg-border after:content-[""] last:after:hidden',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'ui-timeline-dot relative z-[1] inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-solid forced-colors:border-[CanvasText]',
          DOT[tone],
        )}
      >
        <Glyph tone={tone} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 pt-0.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="[font:var(--t-small)] font-medium text-fg [overflow-wrap:anywhere]">
            {word && <span className="ui-sr-only">{word}: </span>}
            {title}
          </span>
          {time && (
            <span className="shrink-0 [font:var(--t-small)] text-fg-subtle tabular-nums">
              {time}
            </span>
          )}
        </div>
        {meta && <span className="[font:var(--t-small)] text-fg-muted">{meta}</span>}
      </div>
    </li>
  );
}
