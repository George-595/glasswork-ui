import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';

/* ErrorState is the 'error' half of a data query: what failed, in words, and
   a Retry. It is an alert, so the failure is announced when it appears.
   Moved here from base-app with the same text and behaviour. The kit must not
   import the app's ApiError, so `error` is `unknown` and is read structurally:
   `message`, `code` ('unauthenticated' / 'forbidden' get their own words),
   `status` (401 and 403 get no Retry) and, when the server sent one, `errorId`
   so a person can quote it. */
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
  return (
    <div
      {...props}
      role="alert"
      className={cn(
        'ui-error-state flex flex-col items-start gap-2 p-4',
        'rounded-md border border-solid border-border-strong border-l-[3px] border-l-danger bg-surface',
        '[box-shadow:var(--elev-0)]',
        className,
      )}
    >
      <p className="ui-error-state-title m-0 font-semibold text-fg">Couldn’t load {what}.</p>
      <p className="ui-error-state-detail m-0 text-fg-muted">{detail}</p>
      {e.errorId && (
        <p className="ui-error-state-ref m-0 font-mono text-[12px] text-fg-subtle">
          Reference: {e.errorId}
        </p>
      )}
      {onRetry && e.status !== 403 && e.status !== 401 && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            // this button unmounts on retry: keep focus in the page, not on <body>
            document.getElementById('main')?.focus();
            onRetry();
          }}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
