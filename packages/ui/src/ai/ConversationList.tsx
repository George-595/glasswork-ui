import type { ReactNode } from 'react';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* ConversationList — saved chats beside an assistant: a "New chat" button and the chats,
   newest first. Choosing one calls `onSelect(id)`; the open one is marked `aria-current`. A chat
   waiting on an approval carries a "Waiting" badge. With `onDelete`, each chat has a delete
   button named after it (the caller confirms, if it wants to).

   It is a `nav` named by `label`; each chat is a full-width ghost button, so the whole row is
   the target and Tab moves chat by chat. Times read "14:05" today and "3 Oct" before. */
export interface ConversationItem {
  id: string;
  title: string;
  /** ISO time of the last message. */
  updatedAt: string;
  /** Waiting for the person to approve something. */
  pending?: boolean;
}
export interface ConversationListProps {
  items: readonly ConversationItem[];
  activeId?: string | null;
  onSelect: (id: string) => void;
  onNew?: () => void;
  onDelete?: (item: ConversationItem) => void;
  /** The nav's accessible name. */
  label?: string;
  /** Shown when there are no chats. */
  empty?: ReactNode;
  /** For tests and stories: what "now" is. */
  now?: Date;
  className?: string;
}

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });

export function whenLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toDateString() === now.toDateString() ? time.format(d) : day.format(d);
}

export function ConversationList({
  items,
  activeId,
  onSelect,
  onNew,
  onDelete,
  label = 'Saved chats',
  empty = 'No saved chats yet.',
  now,
  className,
}: ConversationListProps) {
  return (
    <nav
      aria-label={label}
      className={cn('ui-conversation-list flex min-w-0 flex-col gap-2', className)}
    >
      {onNew && (
        <Button variant="outline" size="sm" onClick={onNew} className="justify-start">
          <Icon name="plus" size={16} />
          New chat
        </Button>
      )}
      {items.length === 0 ? (
        <p className="m-0 px-2 py-1 text-[13px] text-fg-muted">{empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
          {items.map((c) => {
            const active = c.id === activeId;
            return (
              <li key={c.id} className="group/chat flex min-w-0 items-center gap-1">
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onSelect(c.id)}
                  className={cn(
                    'flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-fg outline-none',
                    'hover:bg-ghost-hover focus-visible:ring-2 focus-visible:ring-focus',
                    active && 'bg-selected font-medium',
                  )}
                >
                  <span className="min-w-0 flex-1 truncate">{c.title}</span>
                  {c.pending && <Badge variant="warning">Waiting</Badge>}
                  <span className="shrink-0 text-xs text-fg-muted tabular-nums">
                    {whenLabel(c.updatedAt, now)}
                  </span>
                </button>
                {onDelete && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete chat: ${c.title}`}
                    onClick={() => onDelete(c)}
                  >
                    <Icon name="trash" size={16} />
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
