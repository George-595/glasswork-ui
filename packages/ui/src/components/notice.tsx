import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* Notice — an inline message about the thing next to it: a failed sign-in, a form-level
   problem, a heads-up. The tone is a soft wash of its role and the icon's colour; the words
   carry the meaning and the icon backs them up (never colour alone). No coloured edge bar: a
   stripe bent round a rounded corner reads as generated filler (George, 16 Nov 2026). Unlike ErrorState (a failed load with Retry) a
   Notice has no action of its own; put it above the form it speaks about.

   `danger` and `warning` are announced at once (role="alert") and `info` / `success` politely
   (role="status"); pass `role` to override. Give it `tabIndex={-1}` and a ref to move focus
   to it after a failed submit. */
export type NoticeTone = 'danger' | 'warning' | 'info' | 'success';

export interface NoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: NoticeTone;
  /** A short bold line above the body. */
  title?: ReactNode;
}

const TONE: Record<NoticeTone, string> = {
  danger: 'bg-danger-soft',
  warning: 'bg-warning-soft',
  info: 'bg-info-soft',
  success: 'bg-success-soft',
};
const ICON_TONE: Record<NoticeTone, string> = {
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
  success: 'text-success',
};

export const Notice = forwardRef<HTMLDivElement, NoticeProps>(function Notice(
  { tone = 'info', title, role, className, children, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      role={role ?? (tone === 'danger' || tone === 'warning' ? 'alert' : 'status')}
      data-tone={tone}
      {...props}
      className={cn(
        'ui-notice flex items-start gap-2 rounded-md border border-solid border-transparent p-3 text-fg [font:var(--t-small)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
        TONE[tone],
        className,
      )}
    >
      <Icon
        name={tone === 'success' ? 'check' : 'alert'}
        size={16}
        className={cn('mt-0.5 shrink-0', ICON_TONE[tone])}
      />
      <div className="flex min-w-0 flex-col gap-1">
        {title && <p className="m-0 font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
});
