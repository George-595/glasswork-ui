/* Adapted from BoardUI's notification-center (MIT, Mertcan Dundar Esmergul): the row anatomy
   (kind visual, title, description, timestamp, unread state) and the empty state. Rebuilt on our
   roles, with unread shown by more than colour. See THIRD_PARTY_NOTICES.md. */
import { type KeyboardEvent, type ReactNode, useId, useRef } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import {
  formatAbsoluteDateTime,
  formatRelativeTime,
  type TimeInput,
  toDate,
} from '../lib/relative-time';
import { useNow } from '../lib/use-now';

/* NotificationList / NotificationItem — a feed of notifications, props only.

   Each row is a `<li>` holding two buttons: the row itself (title, optional body clamped to two
   lines, relative time) which selects, and, while the item is unread, a "Mark as read" button.
   Unread is never colour alone: a dot, a bolder title and the words "Unread" for assistive tech.
   The `kind` visual is a tone (info, success, warning, danger, neutral) drawn as an icon and a
   soft wash; the icon is decorative because the title carries the meaning.

   Arrow keys: Up/Down move between the rows' select buttons, Home/End jump. (Tab still visits
   every control, so nothing depends on the arrows.) `group` splits the list under
   Today / Yesterday / Earlier headings. Empty: "You're all caught up". */
export type NotificationTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface NotificationEntry {
  id: string;
  title: string;
  body?: string | null;
  /** ISO string, number or Date. */
  createdAt: TimeInput;
  /** When it was read; null or absent means unread. */
  readAt?: TimeInput | null;
  tone?: NotificationTone;
  icon?: IconName;
  /** Whatever the page needs back in onSelect (a link, a kind). */
  [extra: string]: unknown;
}

export interface NotificationListProps<T extends NotificationEntry = NotificationEntry> {
  items: readonly T[];
  /** The reference time for "5 minutes ago". Defaults to the clock at render. */
  now?: TimeInput;
  group?: boolean;
  onSelect?: (item: T) => void;
  onMarkRead?: (id: string) => void;
  /** Shown when `items` is empty. */
  emptyTitle?: string;
  emptyDescription?: string;
  /** Items are being marked or re-fetched: rows stay, `aria-busy` is set. */
  busy?: boolean;
  /** The accessible name of the list. */
  label?: string;
  className?: string;
  /** For grouping with the wall clock in a fixed zone (tests); default is the local zone. */
  timeZone?: string;
}

const TONE_ICON: Record<NotificationTone, IconName> = {
  neutral: 'bell',
  info: 'info',
  success: 'check',
  warning: 'alert',
  danger: 'alert',
};
const TONE_WASH: Record<NotificationTone, string> = {
  neutral: 'bg-sunken text-fg-muted border-border',
  info: 'bg-info-soft text-info border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
};

export const isUnread = (item: Pick<NotificationEntry, 'readAt'>) => !item.readAt;

export type NotificationGroupName = 'Today' | 'Yesterday' | 'Earlier';

function dayKey(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Splits items (kept in their given order) into Today / Yesterday / Earlier by calendar day. */
export function groupNotifications<T extends Pick<NotificationEntry, 'createdAt'>>(
  items: readonly T[],
  now: TimeInput,
  timeZone?: string,
): Array<{ name: NotificationGroupName; items: T[] }> {
  const nowDate = toDate(now);
  const today = dayKey(nowDate, timeZone);
  const yesterday = dayKey(new Date(nowDate.getTime() - 86_400_000), timeZone);
  const buckets: Record<NotificationGroupName, T[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const item of items) {
    const key = dayKey(toDate(item.createdAt), timeZone);
    buckets[key === today ? 'Today' : key === yesterday ? 'Yesterday' : 'Earlier'].push(item);
  }
  return (['Today', 'Yesterday', 'Earlier'] as const)
    .filter((name) => buckets[name].length > 0)
    .map((name) => ({ name, items: buckets[name] }));
}

export interface NotificationItemProps<T extends NotificationEntry = NotificationEntry> {
  item: T;
  now: TimeInput;
  onSelect?: (item: T) => void;
  onMarkRead?: (id: string) => void;
}

export function NotificationItem<T extends NotificationEntry = NotificationEntry>({
  item,
  now,
  onSelect,
  onMarkRead,
}: NotificationItemProps<T>) {
  const unread = isUnread(item);
  const tone = item.tone ?? 'neutral';
  return (
    <li
      data-unread={unread || undefined}
      className={cn(
        'ui-notification group relative flex items-stretch gap-1 border-0 border-b border-solid border-border-subtle last:border-b-0',
        'border-l-[3px]',
        unread ? 'border-l-brand' : 'border-l-transparent',
      )}
    >
      <button
        type="button"
        data-notification-select=""
        onClick={() => onSelect?.(item)}
        className={cn(
          'flex min-h-11 min-w-0 flex-1 cursor-pointer items-start gap-3 border-0 bg-transparent p-3 text-left text-fg',
          'hover:bg-hover focus-visible:outline-none focus-visible:[box-shadow:var(--ring-inset)]',
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-solid',
            TONE_WASH[tone],
          )}
        >
          <Icon name={item.icon ?? TONE_ICON[tone]} size={16} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-start gap-2">
            {unread && (
              <>
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-brand forced-colors:bg-[Highlight]"
                />
                <span className="ui-sr-only">Unread: </span>
              </>
            )}
            <span className="min-w-0 break-words [font:var(--t-small)]">
              <span className={unread ? 'font-bold' : 'font-medium'}>{item.title}</span>
            </span>
          </span>
          {item.body && (
            <span className="line-clamp-2 break-words text-fg-muted [font:var(--t-small)]">
              {item.body}
            </span>
          )}
          <time
            dateTime={toDate(item.createdAt).toISOString()}
            title={formatAbsoluteDateTime(item.createdAt)}
            className="text-fg-muted [font:var(--t-small)]"
          >
            {formatRelativeTime(item.createdAt, now)}
          </time>
        </span>
      </button>
      {unread && onMarkRead && (
        <button
          type="button"
          onClick={() => onMarkRead(item.id)}
          aria-label={`Mark as read: ${item.title}`}
          title="Mark as read"
          className={cn(
            'my-auto mr-2 inline-flex size-8 pointer-coarse:size-12 shrink-0 cursor-pointer items-center justify-center rounded-sm border border-solid border-transparent bg-transparent text-fg-muted',
            'hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
          )}
        >
          <Icon name="check" size={16} />
        </button>
      )}
    </li>
  );
}

export function NotificationList<T extends NotificationEntry = NotificationEntry>({
  items,
  now,
  group = false,
  onSelect,
  onMarkRead,
  emptyTitle = "You're all caught up",
  emptyDescription = 'New notifications will appear here.',
  busy,
  label = 'Notifications',
  className,
  timeZone,
}: NotificationListProps<T>) {
  const root = useRef<HTMLDivElement | null>(null);
  const uid = useId();
  const clock = useNow(now);

  const move = (event: KeyboardEvent<HTMLDivElement>) => {
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!keys.includes(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const rows = Array.from(
      root.current?.querySelectorAll<HTMLElement>('[data-notification-select]') ?? [],
    );
    if (rows.length === 0) return;
    const here = rows.findIndex(
      (row) => row === event.target || row.parentElement?.contains(event.target as Node),
    );
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? rows.length - 1
          : event.key === 'ArrowDown'
            ? Math.min(rows.length - 1, here + 1)
            : Math.max(0, here <= 0 ? 0 : here - 1);
    event.preventDefault();
    rows[next]?.focus();
  };

  if (items.length === 0) {
    return (
      <div
        className={cn(
          'ui-notification-empty flex flex-col items-center gap-1 p-6 text-center',
          className,
        )}
      >
        <Icon name="bell" size={20} className="text-fg-muted" />
        <p className="m-0 text-fg [font:var(--t-body)]">
          <span className="font-semibold">{emptyTitle}</span>
        </p>
        <p className="m-0 text-fg-muted [font:var(--t-small)]">{emptyDescription}</p>
      </div>
    );
  }

  const renderRows = (rows: readonly T[], name?: string, labelId?: string): ReactNode => (
    <ul
      key={name ?? 'all'}
      aria-label={name ? undefined : label}
      aria-labelledby={labelId}
      className="m-0 list-none p-0"
    >
      {rows.map((item) => (
        <NotificationItem
          key={item.id}
          item={item}
          now={clock}
          onSelect={onSelect}
          onMarkRead={onMarkRead}
        />
      ))}
    </ul>
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: arrow keys are a shortcut on top of the buttons' own Tab order
    <div
      ref={root}
      role="presentation"
      onKeyDown={move}
      aria-busy={busy || undefined}
      className={cn('ui-notification-list flex flex-col', className)}
    >
      {group
        ? groupNotifications(items, clock, timeZone).map((g) => {
            const id = `${uid}-${g.name}`;
            return (
              <div key={g.name}>
                <p
                  id={id}
                  className="m-0 bg-sunken px-3 py-1.5 text-fg-muted uppercase tracking-[0.14em] [font:var(--t-label)]"
                >
                  {g.name}
                </p>
                {renderRows(g.items, g.name, id)}
              </div>
            );
          })
        : renderRows(items)}
    </div>
  );
}
