import { forwardRef, type InputHTMLAttributes, useState } from 'react';
import { cn } from '../lib/cn';
import { Button } from './button';
import { Input } from './input';

/* PasswordInput — an Input for a secret with a Show / Hide button beside it. The button is a
   real toggle (`aria-pressed`, its name changes to "Show password" / "Hide password"), keeps
   focus when pressed and the field keeps its value. Everything else is an Input's: give it a
   visible Label (or put it in a FormField), `autoComplete`, `onKeyDown` for a Caps Lock hint. */
export interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** The wrapper's classes; `className` goes on the input. */
  wrapperClassName?: string;
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, wrapperClassName, ...props }, ref) {
    const [shown, setShown] = useState(false);
    return (
      <div className={cn('ui-password flex min-w-0 items-center gap-2', wrapperClassName)}>
        <Input
          {...props}
          ref={ref}
          type={shown ? 'text' : 'password'}
          className={cn('min-w-0 flex-1', className)}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          aria-pressed={shown}
          aria-label={shown ? 'Hide password' : 'Show password'}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? 'Hide' : 'Show'}
        </Button>
      </div>
    );
  },
);
