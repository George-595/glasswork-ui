import { type HTMLAttributes, type ReactNode, useId, useState } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { TextShimmer } from './TextShimmer';

/* Adapted from BoardUI's agent-thinking (MIT, Mertcan Dundar Esmergul) and Arc Library's
   text-shimmer (MIT); see THIRD_PARTY_NOTICES.md.
   Thinking — the model's reasoning trace, folded away. The header is a disclosure button
   (aria-expanded, aria-controls) whose label shimmers while `active`; once the work ends it
   settles to plain text ("Thought for 4 s"). The trace is plain text with its line breaks
   kept, not markdown. Open it with a click, Enter or Space. Controlled with `open` +
   `onOpenChange`, or uncontrolled with `defaultOpen`.

   Announcing: the label is the only thing a screen reader needs while it works, and it sits
   inside the thread's `log`, so it is read once when it appears; the trace itself is hidden
   while closed and is not announced as it streams. */
export interface ThinkingProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Still reasoning: the label shimmers. */
  active?: boolean;
  /** The header text. Default "Thinking" while active, "Reasoning" after. */
  label?: string;
  /** Seconds the model thought for; shown after the label once it is done. */
  duration?: number;
  /** The reasoning text. */
  children?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function Thinking({
  active = false,
  label,
  duration,
  children,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  className,
  ...props
}: ThinkingProps) {
  const [inner, setInner] = useState(defaultOpen);
  const open = openProp ?? inner;
  const panelId = useId();
  const text = label ?? (active ? 'Thinking' : 'Reasoning');
  const seconds =
    !active && duration !== undefined ? ` for ${Math.max(0, Math.round(duration))} s` : '';
  const hasTrace = children !== undefined && children !== null && children !== '';

  const toggle = () => {
    const next = !open;
    if (openProp === undefined) setInner(next);
    onOpenChange?.(next);
  };

  return (
    <div {...props} data-active={active || undefined} className={cn('ui-thinking', className)}>
      {hasTrace ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          className={cn(
            'inline-flex min-h-6 cursor-pointer items-center gap-1.5 rounded-sm border-0 bg-transparent px-1 py-0.5 font-sans text-[13px] leading-[1.3] text-fg-muted',
            'hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
          )}
        >
          <Icon
            name="chevron-right"
            size={14}
            className={cn(
              'shrink-0 transition-transform duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
              open && 'rotate-90',
            )}
          />
          <TextShimmer active={active}>
            {text}
            {seconds}
          </TextShimmer>
        </button>
      ) : (
        <span className="inline-flex min-h-6 items-center gap-1.5 px-1 py-0.5 font-sans text-[13px] leading-[1.3]">
          <TextShimmer active={active}>
            {text}
            {seconds}
          </TextShimmer>
        </span>
      )}
      {hasTrace && (
        <div
          id={panelId}
          hidden={!open}
          className="mt-1 ms-2.5 whitespace-pre-wrap border-0 border-s-2 border-solid border-border ps-3 font-sans text-[13px] leading-normal text-fg-muted"
        >
          {children}
        </div>
      )}
    </div>
  );
}
