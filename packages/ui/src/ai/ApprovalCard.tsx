import { type HTMLAttributes, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { Button } from '../components/button';
import { type DescriptionItem, DescriptionList } from '../components/description-list';
import { Kbd } from '../components/kbd';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* Adapted from tool-ui's approval-card (MIT, AgentbaseAI Inc.); see THIRD_PARTY_NOTICES.md.
   ApprovalCard — the agent asks before it acts: a one-line summary of what it wants to do,
   optional description and a list of the exact details (the command, the account, the
   amount), then Approve and Deny.

   Button levels (ENGINEERING §5): Approve is `success` (confirms a positive, final step), or
   `danger` when `destructive` (the action removes or overwrites something). Deny is
   `neutral`, the everyday button, never a loud one. Neither is `primary`: the page's one
   main action is not the agent's.

   Resolved: once `decision` is set the buttons are replaced by a receipt, a `role="status"`
   line with an icon and the words "Approved" / "Denied" (plus `resolvedNote`). If focus was on
   a button it moves to the receipt, so a keyboard user is not dropped on the page. Esc does
   NOT deny: an approval is decided by an explicit button.

   Preview: `changes` lists what will change as before → after rows (the old value struck
   through and labelled "was", the new one labelled "becomes", so the change is in words as
   well as style); `preview` takes any node instead (a diff, a draft email).

   Keys: while focus is anywhere in the card, Y approves and N denies (aria-keyshortcuts on
   the buttons, and the keys are printed on them). They are plain letters, so they are only
   live inside the card, never page-wide.

   Expiry: with `expiresAt` (a time in ms) the card counts down ("Expires in 0:42", a bar that
   drains; the words are updated each second for sight only, the bar is aria-hidden) and when
   it runs out calls `onExpire`; set `decision="expired"` and the receipt says so. */
export type ApprovalDecision = 'approved' | 'denied' | 'expired';

export interface ApprovalChange {
  label: string;
  before?: ReactNode;
  after: ReactNode;
}

export interface ApprovalCardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** What the agent wants to do, one line: "Delete 3 draft invoices". */
  title: ReactNode;
  description?: ReactNode;
  /** The exact specifics, as term/detail pairs. */
  details?: readonly DescriptionItem[];
  /** Approve is a `danger` button (the action removes or overwrites something). */
  destructive?: boolean;
  approveLabel?: string;
  denyLabel?: string;
  /** Set when decided: the buttons give way to a receipt. */
  decision?: ApprovalDecision;
  /** Shown after the decision word, e.g. "by Ada, 14:02". */
  resolvedNote?: ReactNode;
  onApprove?: () => void;
  onDeny?: () => void;
  /** What will change, as before → after rows. */
  changes?: readonly ApprovalChange[];
  /** Any preview of the result (a diff, a draft), under the details. */
  preview?: ReactNode;
  /** Y approves and N denies while focus is in the card. Default true. */
  shortcuts?: boolean;
  /** When the request lapses (epoch ms). Shows a countdown. */
  expiresAt?: number;
  /** Called once when `expiresAt` passes undecided. */
  onExpire?: () => void;
}

function useCountdown(until: number | undefined, live: boolean, start: number) {
  const [now, setNow] = useState(start);
  useEffect(() => {
    if (until === undefined || !live) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until, live]);
  return until === undefined ? null : Math.max(0, until - now);
}

const clock = (ms: number) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function ApprovalCard({
  title,
  description,
  details,
  destructive = false,
  approveLabel = 'Approve',
  denyLabel = 'Deny',
  decision,
  resolvedNote,
  onApprove,
  onDeny,
  changes,
  preview,
  shortcuts = false,
  expiresAt,
  onExpire,
  className,
  ...props
}: ApprovalCardProps) {
  const titleId = useId();
  const receipt = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);
  // one clock reading for the countdown's first value and its full span, so the bar starts at
  // exactly 100% (two readings put it a hair over, and the server and client disagreed)
  const [start] = useState(() => Date.now());
  const left = useCountdown(expiresAt, !decision, start);
  const span = expiresAt === undefined ? 0 : expiresAt - start;
  const expired = useRef(false);
  useEffect(() => {
    if (left === 0 && !decision && !expired.current) {
      expired.current = true;
      onExpire?.();
    }
  }, [left, decision, onExpire]);

  // a decision made with a button moves focus to the receipt, so the keyboard user is not dropped
  const decide = (fn?: () => void) => () => {
    hadFocus.current = true;
    fn?.();
  };

  // Y and N are shortcuts for the two buttons inside (which stay the real controls), heard
  // while focus is anywhere in the card
  const card = useRef<HTMLDivElement>(null);
  const keys = useRef<(e: globalThis.KeyboardEvent) => void>(() => {});
  useEffect(() => {
    keys.current = (e) => {
      if (!shortcuts || decision || e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
      const key = e.key.toLowerCase();
      if (key === 'y') {
        e.preventDefault();
        decide(onApprove)();
      } else if (key === 'n') {
        e.preventDefault();
        decide(onDeny)();
      }
    };
  });

  useEffect(() => {
    const el = card.current;
    if (!el) return;
    const on = (e: globalThis.KeyboardEvent) => keys.current(e);
    el.addEventListener('keydown', on);
    return () => el.removeEventListener('keydown', on);
  }, []);

  useEffect(() => {
    if (decision && hadFocus.current) receipt.current?.focus();
  }, [decision]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: a card of buttons is a named group, not a form fieldset
    <div
      {...props}
      role="group"
      ref={card}
      aria-labelledby={titleId}
      data-decision={decision}
      className={cn(
        'ui-approval-card flex w-full max-w-md min-w-0 flex-col gap-3 rounded-lg border border-solid bg-surface p-4 text-fg [box-shadow:var(--elev-card)]',
        destructive && !decision ? 'border-danger' : 'border-border-strong',
        className,
      )}
    >
      <div className="flex items-start gap-2.5">
        <span
          aria-hidden="true"
          className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-solid border-border bg-sunken text-fg-muted"
        >
          <Icon name={destructive ? 'alert' : 'shield'} size={15} />
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <p id={titleId} className="m-0 font-sans text-[14px] leading-[1.35] font-semibold">
            {title}
          </p>
          {description && (
            <p className="m-0 font-sans text-[13px] leading-normal text-fg-muted">{description}</p>
          )}
        </div>
      </div>

      {details && details.length > 0 && <DescriptionList items={details} />}

      {changes && changes.length > 0 && (
        <ul className="ui-approval-changes m-0 flex list-none flex-col gap-1.5 rounded-md border border-solid border-border-subtle bg-sunken p-2.5 font-sans text-[13px]">
          {changes.map((c) => (
            <li key={c.label} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="font-medium text-fg">{c.label}</span>
              {c.before !== undefined && (
                <span className="text-fg-muted">
                  <span className="ui-sr-only">was </span>
                  <del className="decoration-danger decoration-2">{c.before}</del>
                </span>
              )}
              {c.before !== undefined && (
                <Icon name="chevron-right" size={12} className="self-center text-fg-subtle" />
              )}
              <span className="text-fg">
                <span className="ui-sr-only">becomes </span>
                <ins className="rounded-xs bg-success-soft px-1 no-underline">{c.after}</ins>
              </span>
            </li>
          ))}
        </ul>
      )}

      {preview && <div className="ui-approval-preview min-w-0">{preview}</div>}

      {!decision && left !== null && (
        <div className="ui-approval-expiry flex flex-col gap-1">
          <span className="font-sans text-[12px] text-fg-muted tabular-nums">
            {left > 0 ? `Expires in ${clock(left)}` : 'Expired'}
          </span>
          <span aria-hidden="true" className="h-1 overflow-hidden rounded-pill bg-sunken">
            <span
              className={cn(
                'block h-full rounded-pill transition-[width] duration-1000 ease-linear motion-reduce:transition-none',
                left < 15_000 ? 'bg-warning' : 'bg-brand',
              )}
              style={{ width: `${span > 0 ? Math.min(100, (left / span) * 100) : 0}%` }}
            />
          </span>
        </div>
      )}

      {decision ? (
        <div
          ref={receipt}
          role="status"
          tabIndex={-1}
          className="flex items-center gap-2 rounded-md bg-sunken px-3 py-2 font-sans text-[13px] focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
        >
          <Icon
            name={decision === 'approved' ? 'check' : decision === 'expired' ? 'clock' : 'x'}
            size={15}
            className={decision === 'approved' ? 'text-success' : 'text-fg-muted'}
          />
          <span className="font-semibold">
            {decision === 'approved' ? 'Approved' : decision === 'expired' ? 'Expired' : 'Denied'}
          </span>
          {resolvedNote && <span className="text-fg-muted">{resolvedNote}</span>}
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            variant="neutral"
            onClick={decide(onDeny)}
            disabled={left === 0}
            aria-keyshortcuts={shortcuts ? 'N' : undefined}
          >
            {denyLabel}
            {shortcuts && <Kbd aria-hidden="true">N</Kbd>}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'success'}
            onClick={decide(onApprove)}
            disabled={left === 0}
            aria-keyshortcuts={shortcuts ? 'Y' : undefined}
          >
            {approveLabel}
            {shortcuts && <Kbd aria-hidden="true">Y</Kbd>}
          </Button>
        </div>
      )}
    </div>
  );
}
