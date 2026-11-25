import type { HTMLAttributes } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { Button } from './button';
import { CopyButton } from './inputs/copy-button';

/* ErrorState is the 'error' half of a data query: what failed, in words, and
   a Retry. It is an alert, so the failure is announced when it appears.
   Moved here from base-app with the same text and behaviour. The kit must not
   import the app's ApiError, so `error` is `unknown` and is read structurally:
   `message`, `code` ('unauthenticated' / 'forbidden' get their own words),
   `status` (401 and 403 get no Retry) and, when the server sent one, `errorId`
   so a person can quote it.

   It is deliberately light: a calm surface with a small danger mark and the
   words, not a red block, because a failed panel is common and must not shout
   louder than the page. The server's message and the reference fold away
   under "Details", with a button that copies the reference for a support
   message. */
export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  /** What failed to load, e.g. "transactions". */
  what: string;
  error: unknown;
  onRetry?: () => void;
}

interface ErrorShape {
  message?: string;
  code?: string;
  status?: number;
  errorId?: string;
}

const str = (v: unknown) => (typeof v === 'string' && v ? v : undefined);

function shapeOf(error: unknown): ErrorShape {
  if (typeof error === 'string') return { message: error };
  if (typeof error !== 'object' || error === null) return {};
  const e = error as Record<string, unknown>;
  return {
    message: str(e.message),
    code: str(e.code),
    status: typeof e.status === 'number' ? e.status : undefined,
    errorId: str(e.errorId),
  };
}

export function ErrorState({ what, error, onRetry, className, ...props }: ErrorStateProps) {
  const e = shapeOf(error);
  const detail =
    e.code === 'unauthenticated'
      ? 'Your session has ended. Sign in again.'
      : e.code === 'forbidden'
        ? 'Your account is not allowed to see this.'
        : (e.message ?? 'Something went wrong.');
  const retry = onRetry && e.status !== 403 && e.status !== 401;
  const known = e.code === 'unauthenticated' || e.code === 'forbidden';
  return (
    <div
      {...props}
      role="alert"
      className={cn(
        'ui-error-state flex items-start gap-3 p-4',
        'rounded-md border border-solid border-border bg-surface text-[13px]',
        '[box-shadow:var(--elev-0)]',
        className,
      )}
    >
      <span
        aria-hidden="true"
        className="mt-px inline-grid size-7 shrink-0 place-items-center rounded-full bg-danger-soft text-danger"
      >
        <Icon name="alert" size={15} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <p className="ui-error-state-title m-0 font-semibold text-fg">Couldn’t load {what}.</p>
        <p className="ui-error-state-detail m-0 text-fg-muted">
          {known ? detail : 'Something went wrong on our side. Trying again usually works.'}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {retry && (
            <Button
              variant="neutral"
              size="sm"
              onClick={() => {
                // this button unmounts on retry: keep focus in the page, not on <body>
                document.getElementById('main')?.focus();
                onRetry();
              }}
            >
              <Icon name="rotate-ccw" size={13} />
              Retry
            </Button>
          )}
          {e.errorId && (
            <>
              <span className="ui-error-state-ref font-mono text-[12px] text-fg-muted">
                Reference: {e.errorId}
              </span>
              <CopyButton text={e.errorId} label="Copy reference" variant="ghost" size="sm" />
            </>
          )}
        </div>
        {!known && e.message && (
          <details className="ui-error-state-more group w-full">
            <summary className="inline-flex min-h-6 pointer-coarse:min-h-12 cursor-pointer items-center gap-1 rounded-xs text-[12.5px] text-fg-muted marker:content-none hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]">
              <Icon
                name="chevron-right"
                size={12}
                className="transition-transform duration-(--dur-fast) group-open:rotate-90 motion-reduce:transition-none"
              />
              Details
            </summary>
            <div className="mt-1 flex flex-col gap-1 rounded-sm bg-sunken px-2.5 py-2 font-mono text-[12px] text-fg-muted">
              {e.message && <span className="ui-error-state-message break-words">{e.message}</span>}
            </div>
          </details>
        )}
      </div>
    </div>
  );
}
