import { type HTMLAttributes, type ReactNode, useEffect, useId, useRef } from 'react';
import { Button } from '../components/button';
import { type DescriptionItem, DescriptionList } from '../components/description-list';
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
   NOT deny: an approval is decided by an explicit button. */
export type ApprovalDecision = 'approved' | 'denied';

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
}

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
  className,
  ...props
}: ApprovalCardProps) {
  const titleId = useId();
  const receipt = useRef<HTMLDivElement>(null);
  const hadFocus = useRef(false);

  // a decision made with a button moves focus to the receipt, so the keyboard user is not dropped
  const decide = (fn?: () => void) => () => {
    hadFocus.current = true;
    fn?.();
  };

  useEffect(() => {
    if (decision && hadFocus.current) receipt.current?.focus();
  }, [decision]);

  return (
    // biome-ignore lint/a11y/useSemanticElements: a card of buttons is a named group, not a form fieldset
    <div
      {...props}
      role="group"
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

      {decision ? (
        <div
          ref={receipt}
          role="status"
          tabIndex={-1}
          className="flex items-center gap-2 rounded-md bg-sunken px-3 py-2 font-sans text-[13px] focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
        >
          <Icon
            name={decision === 'approved' ? 'check' : 'x'}
            size={15}
            className={decision === 'approved' ? 'text-success' : 'text-fg-muted'}
          />
          <span className="font-semibold">{decision === 'approved' ? 'Approved' : 'Denied'}</span>
          {resolvedNote && <span className="text-fg-muted">{resolvedNote}</span>}
        </div>
      ) : (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="neutral" onClick={decide(onDeny)}>
            {denyLabel}
          </Button>
          <Button variant={destructive ? 'danger' : 'success'} onClick={decide(onApprove)}>
            {approveLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
