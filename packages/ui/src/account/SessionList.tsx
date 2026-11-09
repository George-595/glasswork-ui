import { useState } from 'react';
import { Badge } from '../components/badge';
import { Button } from '../components/button';
import { ConfirmDialog } from '../components/confirm-dialog';
import { ErrorState } from '../components/error-state';
import { Skeleton } from '../components/skeleton';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { formatAbsoluteDateTime, formatRelativeTime, type TimeInput } from '../lib/relative-time';
import { useNow } from '../lib/use-now';
import { describeUserAgent } from './user-agent';

/* SessionList — the places an account is signed in, one row each.

   A row: the device as "Chrome on macOS" (describeUserAgent), the IP, "Last active 5 minutes
   ago" and, for the current session, a "This device" badge (a word, not just a colour) and no
   Sign out button: signing out here is the app's own Sign out. Every other row has "Sign out",
   named after its device and IP so a list of identical labels stays distinguishable, and,
   when there are others, "Sign out all other sessions". Both ask first in the kit's
   ConfirmDialog (destructive; a rejected promise stays open and says why). Props only: the
   page owns the data and the requests. */
export interface SessionEntry {
  id: string;
  userAgent?: string | null;
  ip?: string | null;
  lastSeenAt: TimeInput;
  createdAt?: TimeInput;
  /** The session this browser is using. */
  current?: boolean;
}

export interface SessionListProps {
  sessions: readonly SessionEntry[];
  now?: TimeInput;
  /** Sign one session out. May be async; a rejection is shown in the dialog. */
  onRevoke?: (id: string) => void | Promise<void>;
  /** Sign out every session except the current one. */
  onRevokeOthers?: () => void | Promise<void>;
  loading?: boolean;
  error?: unknown;
  onRetry?: () => void;
  className?: string;
}

export function SessionList({
  sessions,
  now,
  onRevoke,
  onRevokeOthers,
  loading,
  error,
  onRetry,
  className,
}: SessionListProps) {
  const [target, setTarget] = useState<SessionEntry | 'others' | null>(null);
  const clock = useNow(now);
  const others = sessions.filter((s) => !s.current);

  if (loading) {
    return (
      <div role="status" aria-busy="true" className={cn('flex flex-col gap-3', className)}>
        <span className="ui-sr-only">Loading sessions…</span>
        {[0, 1].map((n) => (
          <Skeleton key={n} height={56} />
        ))}
      </div>
    );
  }
  if (error) return <ErrorState what="sessions" error={error} onRetry={onRetry} />;

  const rowName = (s: SessionEntry) => {
    const label = describeUserAgent(s.userAgent).label;
    return s.ip ? `${label}, ${s.ip}` : label;
  };

  return (
    <div className={cn('ui-session-list flex flex-col gap-3', className)}>
      <ul aria-label="Signed-in sessions" className="m-0 flex list-none flex-col gap-2 p-0">
        {sessions.map((s) => {
          const agent = describeUserAgent(s.userAgent);
          return (
            <li
              key={s.id}
              data-current={s.current || undefined}
              className="ui-session flex flex-wrap items-center gap-3 rounded-md border border-solid border-border bg-surface p-3"
            >
              <span
                aria-hidden="true"
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-solid border-border bg-sunken text-fg-muted"
              >
                <Icon name="monitor" size={18} />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-fg [font:var(--t-body)]">
                    <span className="font-semibold">{agent.label}</span>
                  </span>
                  {s.current && <Badge variant="brand">This device</Badge>}
                </div>
                <p className="m-0 text-fg-muted [font:var(--t-small)]">
                  {s.ip ? `${s.ip} · ` : ''}
                  {s.current ? 'Active now' : 'Last active '}
                  {!s.current && (
                    <time
                      dateTime={new Date(s.lastSeenAt).toISOString()}
                      title={formatAbsoluteDateTime(s.lastSeenAt)}
                    >
                      {formatRelativeTime(s.lastSeenAt, clock)}
                    </time>
                  )}
                </p>
              </div>
              {!s.current && onRevoke && (
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={`Sign out ${rowName(s)}`}
                  onClick={() => setTarget(s)}
                >
                  Sign out
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      {onRevokeOthers && others.length > 0 && (
        <div>
          <Button variant="danger" size="sm" onClick={() => setTarget('others')}>
            Sign out all other sessions
          </Button>
        </div>
      )}
      <ConfirmDialog
        open={target !== null}
        onClose={() => setTarget(null)}
        destructive
        title={target === 'others' ? 'Sign out all other sessions?' : 'Sign out this session?'}
        description={
          target === 'others'
            ? `${others.length} other ${others.length === 1 ? 'session' : 'sessions'} will be signed out. This device stays signed in.`
            : target
              ? `${rowName(target)} will be signed out and will need to sign in again.`
              : undefined
        }
        confirmLabel="Sign out"
        pendingLabel="Signing out…"
        onConfirm={async () => {
          if (target === 'others') await onRevokeOthers?.();
          else if (target) await onRevoke?.(target.id);
        }}
      />
    </div>
  );
}
