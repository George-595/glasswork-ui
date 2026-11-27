import { type HTMLAttributes, useId, useState } from 'react';
import { Button } from '../components/button';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* Keypad — a PIN pad for a shared screen. One real <input type="password" inputmode="numeric"
   autocomplete="off"> holds the code, so a hardware keyboard, a password manager and screen
   readers all work, as with OtpField; the twelve keys (1 to 9, Clear, 0, Backspace) are
   type="button" and named by their digit, and the dots are a drawing of the length
   (aria-hidden). The digits are never announced and never in a live region: the input's
   description says only how many have been entered ("3 of 4 to 8 digits"). Enter, or the
   submit key, calls `onSubmit` with the code when its length is within bounds, and the pad
   clears itself; the app shows the result in `message` (a polite status, or an alert with `error`; two separate regions).
   The keys do not shuffle. Keys are 64px (md) or 80px (lg). A press plays the kit's tick. */
export interface KeypadProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSubmit' | 'children'> {
  /** Names the pad: 'Enter your code'. */
  label: string;
  /** How many digits a code may have. */
  length: { min: number; max: number };
  /** Called with the code; the pad clears itself. */
  onSubmit: (code: string) => void;
  /** Shown under the dots: 'Wrong code. 2 tries left.' */
  message?: string;
  /** The message is an error: announced as an alert, drawn in the danger role. */
  error?: boolean;
  disabled?: boolean;
  /** The submit key: 'Unlock'. Default 'Enter code'. */
  submitLabel?: string;
  size?: 'md' | 'lg';
}

const DIGITS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const;

export function Keypad({
  label,
  length,
  onSubmit,
  message,
  error,
  disabled,
  submitLabel = 'Enter code',
  size = 'md',
  className,
  ...props
}: KeypadProps) {
  const [code, setCode] = useState('');
  const labelId = useId();
  const descId = useId();
  const messageId = useId();
  const errorId = useId();
  const min = Math.max(1, length.min);
  const max = Math.max(min, length.max);
  const ready = code.length >= min && code.length <= max;

  const set = (next: string) => setCode(next.replace(/\D/g, '').slice(0, max));
  const press = (fn: () => void) => () => {
    if (disabled) return;
    playSound('tick');
    fn();
  };
  const submit = () => {
    if (disabled || !ready) return;
    const done = code;
    setCode('');
    onSubmit(done);
  };

  const key = cn(
    'font-sans text-[24px] font-semibold tabular-nums',
    size === 'lg' ? 'h-20 w-20' : 'h-16 w-16',
  );
  const keyProps = (extra: object = {}) => ({
    type: 'button' as const,
    variant: 'neutral' as const,
    className: key,
    'aria-disabled': disabled || undefined,
    // keep focus where it is (the input, for a hardware keyboard) instead of moving it to a key
    onMouseDown: (e: { preventDefault: () => void }) => e.preventDefault(),
    ...extra,
  });

  return (
    <div
      {...props}
      data-size={size}
      className={cn('ui-keypad inline-flex w-max flex-col items-center gap-4', className)}
    >
      <span id={labelId} className="font-sans text-[15px] font-medium text-fg">
        {label}
      </span>
      <div className="relative flex min-h-13 items-center justify-center gap-3 rounded-md border border-solid border-border-input bg-sunken px-4 py-3 focus-within:[box-shadow:var(--ring)] forced-colors:border-[CanvasText]">
        <span aria-hidden="true" className="flex items-center gap-3">
          {Array.from({ length: max }, (_, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: a fixed row of placeholders
              key={i}
              data-filled={i < code.length ? '' : undefined}
              className={cn(
                'size-3.5 rounded-full border-2 border-solid border-fg-muted',
                i < code.length ? 'bg-fg' : 'bg-transparent',
              )}
            />
          ))}
        </span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-labelledby={labelId}
          aria-describedby={`${descId} ${messageId} ${errorId}`}
          aria-invalid={error || undefined}
          aria-disabled={disabled || undefined}
          readOnly={disabled}
          value={code}
          onChange={(e) => set(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            submit();
          }}
          className="absolute inset-0 size-full cursor-default border-0 bg-transparent text-transparent caret-transparent outline-none"
        />
      </div>
      <span id={descId} className="sr-only">
        {`${code.length} of ${min} to ${max} digits`}
      </span>
      <div className="min-h-5 text-center font-sans text-[13px]">
        {/* two regions, each fixed from the start: a plain message is polite, an error is an alert */}
        <div id={messageId} role="status" aria-live="polite" className="text-fg-muted">
          {error ? '' : message}
        </div>
        <div id={errorId} role="alert" className="text-danger">
          {error ? message : ''}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {DIGITS.map((d) => (
          <Button key={d} {...keyProps({ onClick: press(() => set(code + d)) })}>
            {d}
          </Button>
        ))}
        <Button
          {...keyProps({ onClick: press(() => setCode('')), className: cn(key, 'text-[14px]') })}
        >
          Clear
        </Button>
        <Button {...keyProps({ onClick: press(() => set(`${code}0`)) })}>0</Button>
        <Button
          {...keyProps({
            onClick: press(() => setCode(code.slice(0, -1))),
            'aria-label': 'Backspace',
          })}
        >
          <Icon name="chevron-left" size={size === 'lg' ? 28 : 24} />
        </Button>
      </div>
      <Button
        type="button"
        variant="primary"
        size="xl"
        className="w-full"
        aria-disabled={disabled || !ready || undefined}
        onClick={submit}
      >
        {submitLabel}
      </Button>
    </div>
  );
}
