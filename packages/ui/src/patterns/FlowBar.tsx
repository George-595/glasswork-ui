import { type ReactNode, useRef } from 'react';
import { Button } from '../components/button';
import { useBottomInset } from '../lib/bottom-inset';
import { cn } from '../lib/cn';

/* FlowBar — the sticky action bar at the bottom of a flow screen: a neutral
   Cancel and ONE primary button at `xl`, above the device's safe area, in thumb reach.

   - `status` is the polite line above the buttons that says what is missing ("Choose a size to
     continue"); it is a live region, so a screen reader hears it change.
   - `primaryDisabled` + `status` together: the button says why it cannot be pressed yet.
   - `primaryLoading` keeps the button's width and shows the spinner ("Adding…" as its label).
   - It sticks to the bottom of the scrolling page (not fixed), so it never covers the last row,
     and from 768px it sits at the end of the flow's column.
   - It reports its height as `--ui-bottom-inset` (lib/bottom-inset.ts), so tabbing to a control
     in a long flow scrolls it clear of the bar (WCAG 2.4.11) and toasts rest above it. */
export interface FlowBarProps {
  primaryLabel: ReactNode;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  /** `danger` for a removal. */
  primaryVariant?: 'primary' | 'danger';
  cancelLabel?: ReactNode;
  /** Absent = no Cancel button. */
  onCancel?: () => void;
  cancelDisabled?: boolean;
  status?: ReactNode;
  className?: string;
}

export function FlowBar({
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
  primaryVariant = 'primary',
  cancelLabel = 'Cancel',
  onCancel,
  cancelDisabled = false,
  status,
  className,
}: FlowBarProps) {
  const bar = useRef<HTMLDivElement>(null);
  useBottomInset(bar);
  return (
    <div
      ref={bar}
      className={cn(
        'ui-flow-bar glass-chrome sticky bottom-0 z-20 -mx-4 mt-4 box-border flex flex-col gap-2 border-t border-solid border-border bg-bar px-4 pt-3',
        'pb-[calc(12px+env(safe-area-inset-bottom))] [box-shadow:var(--glass-rim)]',
        'md:mx-0 md:rounded-md md:border md:pb-3',
        className,
      )}
    >
      <p aria-live="polite" className="m-0 min-h-5 text-[14px] leading-[1.4] text-fg-muted">
        {status}
      </p>
      <div className="flex items-stretch gap-3">
        {onCancel && (
          <Button
            variant="neutral"
            size="xl"
            className="shrink-0"
            onClick={onCancel}
            disabled={cancelDisabled}
          >
            {cancelLabel}
          </Button>
        )}
        <Button
          variant={primaryVariant}
          size="xl"
          className="min-w-0 flex-1"
          onClick={onPrimary}
          disabled={primaryDisabled}
          loading={primaryLoading}
        >
          {primaryLabel}
        </Button>
      </div>
    </div>
  );
}
