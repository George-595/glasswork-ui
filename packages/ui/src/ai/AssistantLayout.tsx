import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { Button } from '../components/button';
import { EmptyState } from '../components/empty-state';
import { cn } from '../lib/cn';
import { ChatThread, type ChatThreadHandle } from './ChatThread';

/* AssistantLayout — the shape of an assistant screen: a thread that fills the room and sticks
   to its bottom, with the composer docked under it. Above the composer sits an optional
   `notice` slot (a Notice about configuration or a failed send).

   Empty (`empty`): the thread holds an EmptyState with a title, a line of help and suggestion
   chips. A chip is an outline Button; choosing one calls `onSuggestion(text)` (usually it
   sends the text, or fills the composer). The thread (the `log` live region) is mounted in
   both states, so it exists before the first reply arrives and that reply is announced.

   Height: the viewport minus the page header (between 24 and 52 rem), so the thread scrolls and
   the composer stays in view; pass `className` (`h-full`, `h-96`) to size it to a box instead. */
export interface AssistantLayoutProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The messages (ChatMessage children). */
  children?: ReactNode;
  /** The docked Composer. */
  composer: ReactNode;
  /** A Notice or other line between the thread and the composer. */
  notice?: ReactNode;
  /** Show the empty state instead of the thread. */
  empty?: boolean;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  /** Starter prompts offered as chips in the empty state. */
  suggestions?: readonly string[];
  onSuggestion?: (text: string) => void;
  /** Accessible name of the thread log. */
  threadLabel?: string;
  /** A reply is arriving (marks the thread busy). */
  busy?: boolean;
  /** A side column (a ConversationList): beside the thread from the md breakpoint, above it
      below that. */
  aside?: ReactNode;
}

export const AssistantLayout = forwardRef<ChatThreadHandle, AssistantLayoutProps>(
  function AssistantLayout(
    {
      children,
      composer,
      notice,
      empty = false,
      emptyTitle = 'Ask the assistant anything',
      emptyDescription,
      suggestions,
      onSuggestion,
      threadLabel,
      busy,
      aside,
      className,
      ...props
    },
    ref,
  ) {
    const main = (
      <div
        {...props}
        className={cn(
          'ui-assistant-layout flex h-[clamp(24rem,calc(100dvh-15rem),52rem)] min-w-0 flex-col gap-3',
          className,
        )}
      >
        <ChatThread ref={ref} label={threadLabel} busy={busy}>
          {empty ? (
            <div className="flex min-h-0 flex-1 items-center justify-center">
              <EmptyState
                as="h2"
                icon="sparkles"
                title={emptyTitle}
                description={emptyDescription}
                className="w-full max-w-xl"
                action={
                  suggestions && suggestions.length > 0 ? (
                    <ul
                      aria-label="Suggestions"
                      className="m-0 flex list-none flex-wrap justify-center gap-2 p-0"
                    >
                      {suggestions.map((s) => (
                        <li key={s}>
                          <Button variant="outline" size="sm" onClick={() => onSuggestion?.(s)}>
                            {s}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  ) : undefined
                }
              />
            </div>
          ) : (
            children
          )}
        </ChatThread>
        {notice}
        <div className="shrink-0">{composer}</div>
      </div>
    );
    if (!aside) return main;
    return (
      <div className="ui-assistant-with-aside grid min-w-0 gap-4 md:grid-cols-[15rem_minmax(0,1fr)]">
        <div className="min-w-0 md:max-h-[clamp(24rem,calc(100dvh-15rem),52rem)] md:overflow-y-auto">
          {aside}
        </div>
        {main}
      </div>
    );
  },
);
