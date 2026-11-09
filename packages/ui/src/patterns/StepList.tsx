import type { ReactNode } from 'react';
import { Button } from '../components/button';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* StepList — the decision checklist of a flow: one screen, a short list of
   questions in a fixed order, instead of a stack of modal dialogs.

   - Each row is `done` (one line: the title, the answer and a Change button), `current` (the
     control is open under the title; aria-current="step") or `todo` (muted, one line: what comes
     next). The state is a word and an icon, never colour alone.
   - `helper` is the polite live line under the list that names what is missing ("Choose a size
     to continue"): screen readers hear it change.
   - The rows come from the caller (the order is business logic, e.g. `scanInPlan`); this only
     draws them. */
export type StepStatus = 'done' | 'current' | 'todo';

export interface StepItem {
  id: string;
  title: string;
  status: StepStatus;
  /** A done row: the answer ("Double"). */
  summary?: ReactNode;
  /** A todo row: what it will ask, or an answer found already ("The Container · detected"). */
  hint?: ReactNode;
  /** The current row's control (size cards, a stepper, a place picker). */
  content?: ReactNode;
  /** A done row: re-open it. Absent = the answer cannot be changed here. */
  onChange?: () => void;
  /** Visible label of the change button. Default "Change". */
  changeLabel?: string;
}

export interface StepListProps {
  steps: readonly StepItem[];
  /** The live line under the list. */
  helper?: ReactNode;
  /** Names the list for assistive tech. Default "Steps". */
  label?: string;
  className?: string;
}

const STATUS_WORD: Record<StepStatus, string> = {
  done: 'Done',
  current: 'Now',
  todo: 'Next',
};

export function StepList({ steps, helper, label = 'Steps', className }: StepListProps) {
  return (
    <div className={cn('ui-step-list flex flex-col gap-3', className)}>
      <ol aria-label={label} className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((s, i) => (
          <li
            key={s.id}
            data-step={s.id}
            data-status={s.status}
            aria-current={s.status === 'current' ? 'step' : undefined}
            className={cn(
              'ui-step box-border rounded-md border border-solid px-3 py-3',
              s.status === 'current'
                ? 'border-border-strong bg-surface [box-shadow:var(--glass-rim)]'
                : 'border-border-subtle bg-transparent',
            )}
          >
            <div className="flex min-h-10 items-center gap-3">
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full border border-solid text-[13px] font-semibold',
                  s.status === 'done' && 'border-transparent bg-success-soft text-success',
                  s.status === 'current' && 'border-transparent bg-brand-soft text-brand',
                  s.status === 'todo' && 'border-border text-fg-subtle',
                )}
              >
                {s.status === 'done' ? <Icon name="check" size={14} /> : i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span
                  className={cn(
                    'text-[15px] leading-[1.3] font-semibold',
                    s.status === 'todo' ? 'text-fg-muted' : 'text-fg',
                  )}
                >
                  <span className="sr-only">{STATUS_WORD[s.status]}: </span>
                  {s.title}
                </span>
                {s.status === 'done' && s.summary !== undefined && (
                  <span className="truncate text-[14px] leading-[1.3] text-fg-muted">
                    {s.summary}
                  </span>
                )}
                {s.status === 'todo' && s.hint !== undefined && (
                  <span className="truncate text-[13px] leading-[1.3] text-fg-subtle">
                    {s.hint}
                  </span>
                )}
              </div>
              {s.status === 'done' && s.onChange && (
                <Button
                  variant="ghost"
                  size="md"
                  onClick={s.onChange}
                  aria-label={`${s.changeLabel ?? 'Change'} ${s.title.toLowerCase()}`}
                >
                  {s.changeLabel ?? 'Change'}
                </Button>
              )}
            </div>
            {s.status === 'current' && s.content !== undefined && (
              <div className="ui-step-content mt-3">{s.content}</div>
            )}
          </li>
        ))}
      </ol>
      {helper !== undefined && (
        <p
          aria-live="polite"
          className="ui-step-helper m-0 min-h-5 text-[14px] leading-[1.4] text-fg-muted"
        >
          {helper}
        </p>
      )}
    </div>
  );
}
