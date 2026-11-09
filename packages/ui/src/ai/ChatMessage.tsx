import { type HTMLAttributes, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Avatar } from '../components/avatar';
import { Button } from '../components/button';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { useHydrated } from '../lib/use-hydrated';
import { CopyGlyph } from './icons';

/* Adapted from Arc Library's chat-thread and BoardUI's agent-chat-message (both MIT); see
   THIRD_PARTY_NOTICES.md.
   ChatMessage — one turn in a conversation. `from` picks the look:
     user       the person: right-aligned, in a sunken bubble;
     assistant  the model: left-aligned with its avatar, no bubble (long replies read as text);
                `children` may also hold Thinking, ToolChip and ApprovalCard;
     system     a centred, muted note ("Conversation started", "Switched model").
   Text is plain, never markdown: a string child keeps its line breaks and runs of spaces.
   The article is named by its author and time (aria-labelledby), the timestamp is a real
   <time>, and the copy action is a ghost icon button that copies the text (a string child, or
   `copyText` when the content is rich) and says "Copied" in a polite status. Put messages in a
   ChatThread: its `log` role is what announces a new one. */
export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessageProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  from?: ChatRole;
  /** Author's display name. Default "You" / "Assistant". */
  name?: string;
  timestamp?: Date | string | number;
  children?: ReactNode;
  /** The text the copy button copies, when `children` is not a plain string. */
  copyText?: string;
  /** Show the copy action (default true when there is text to copy). */
  copyable?: boolean;
  /** Called after a successful copy. */
  onCopied?: (text: string) => void;
  /** The reply is still arriving. */
  streaming?: boolean;
}

/* The time is in the reader's own zone. A server cannot know it, so a server render (and the
   browser's hydration of it) writes UTC and the browser's own follows the moment it has hydrated. */
const TIME = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const TIME_UTC = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'UTC',
});

function toDate(value: Date | string | number): Date {
  return value instanceof Date ? value : new Date(value);
}

export function ChatMessage({
  from = 'assistant',
  name,
  timestamp,
  children,
  copyText,
  copyable,
  onCopied,
  streaming = false,
  className,
  ...props
}: ChatMessageProps) {
  const labelId = useId();
  const hydrated = useHydrated();
  const [copied, setCopied] = useState<'idle' | 'copied' | 'failed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const author = name ?? (from === 'user' ? 'You' : 'Assistant');
  const when = timestamp === undefined ? undefined : toDate(timestamp);
  const text = copyText ?? (typeof children === 'string' ? children : undefined);
  const showCopy = (copyable ?? true) && text !== undefined && text !== '' && from !== 'system';

  if (from === 'system') {
    return (
      <div
        role="note"
        {...(props as HTMLAttributes<HTMLDivElement>)}
        data-role="system"
        className={cn(
          'ui-chat-message mx-auto max-w-prose text-center font-sans text-[12.5px] leading-normal text-fg-muted',
          className,
        )}
      >
        {children}
      </div>
    );
  }

  const copy = async () => {
    if (text === undefined) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied('copied');
      onCopied?.(text);
    } catch {
      setCopied('failed');
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied('idle'), 2000);
  };

  const mine = from === 'user';
  return (
    <article
      {...props}
      aria-labelledby={labelId}
      aria-busy={streaming || undefined}
      data-role={from}
      className={cn(
        'ui-chat-message group/msg flex min-w-0 items-start gap-2.5',
        mine && 'flex-row-reverse',
        className,
      )}
    >
      <Avatar name={author} size="sm" aria-hidden="true" className="mt-0.5" />
      <div className={cn('flex min-w-0 max-w-[85%] flex-col gap-1', mine && 'items-end')}>
        <p
          id={labelId}
          className="m-0 flex items-baseline gap-2 font-sans text-[12px] leading-[1.3] text-fg-muted"
        >
          <span className="font-semibold text-fg">{author}</span>
          {when && !Number.isNaN(when.getTime()) && (
            <time dateTime={when.toISOString()}>{(hydrated ? TIME : TIME_UTC).format(when)}</time>
          )}
        </p>
        <div
          className={cn(
            'flex min-w-0 flex-col items-start gap-2 font-sans text-[14px] leading-normal text-fg',
            mine
              ? 'rounded-lg rounded-se-xs border border-solid border-border-subtle bg-sunken px-3 py-2'
              : 'py-0.5',
          )}
        >
          {typeof children === 'string' ? (
            <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{children}</span>
          ) : (
            children
          )}
        </div>
        {showCopy && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              aria-label={mine ? 'Copy your message' : 'Copy reply'}
              onClick={copy}
              className="px-1.5"
            >
              {copied === 'copied' ? <Icon name="check" size={14} /> : <CopyGlyph size={14} />}
            </Button>
            <span role="status" className="sr-only">
              {copied === 'copied' ? 'Copied' : copied === 'failed' ? 'Could not copy' : ''}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
