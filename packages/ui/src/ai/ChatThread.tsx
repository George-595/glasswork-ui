import {
  forwardRef,
  type HTMLAttributes,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '../components/button';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* Adapted from Arc Library's chat-thread (MIT, Elia Kuratli); see THIRD_PARTY_NOTICES.md.
   ChatThread — the scrolling list of ChatMessages.
   - It is a `role="log"` (an implicit polite live region, additions only), so a new assistant
     message is announced without stealing focus; `busy` sets `aria-busy` while a reply streams
     so the half-written text is announced once, when it settles.
   - It is the scroll box and is focusable (tabIndex 0), so the keyboard can scroll it.
   - It sticks to the bottom: while the reader is within 48 px of the end, every new message or
     growth of the last one keeps the end in view. Once they scroll up it stays put, and a
     "Jump to latest" button appears. Scrolling is never smooth under reduced motion. */
export interface ChatThreadProps extends HTMLAttributes<HTMLDivElement> {
  /** Accessible name of the log. Default "Conversation". */
  label?: string;
  /** A reply is arriving. */
  busy?: boolean;
}

export interface ChatThreadHandle {
  scrollToBottom: () => void;
}

const STICK_DISTANCE = 48;

export const ChatThread = forwardRef<ChatThreadHandle, ChatThreadProps>(function ChatThread(
  { label = 'Conversation', busy = false, className, children, onScroll, ...props },
  ref,
) {
  const scroller = useRef<HTMLDivElement>(null);
  const stuck = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const toBottom = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (typeof el.scrollTo === 'function') {
      el.scrollTo({ top: el.scrollHeight, behavior: reduce ? 'auto' : 'smooth' });
    } else {
      el.scrollTop = el.scrollHeight;
    }
  }, []);

  useImperativeHandle(ref, () => ({ scrollToBottom: toBottom }), [toBottom]);

  // after every render of the thread (a new message, a longer reply), keep the end in view
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  });

  /* oxlint-disable jsx-a11y/no-noninteractive-tabindex -- a scrollable log must be reachable by keyboard */
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        {...props}
        ref={scroller}
        role="log"
        aria-label={label}
        aria-busy={busy || undefined}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          const near = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_DISTANCE;
          stuck.current = near;
          setAtBottom(near);
          onScroll?.(e);
        }}
        className={cn(
          'ui-chat-thread flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-1 py-3',
          'focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
          className,
        )}
      >
        {children}
      </div>
      {!atBottom && (
        <div className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <Button
            variant="neutral"
            size="sm"
            className="pointer-events-auto"
            onClick={() => {
              stuck.current = true;
              toBottom();
            }}
          >
            <Icon name="arrow-down" size={14} />
            Jump to latest
          </Button>
        </div>
      )}
    </div>
  );
  /* oxlint-enable jsx-a11y/no-noninteractive-tabindex */
});
