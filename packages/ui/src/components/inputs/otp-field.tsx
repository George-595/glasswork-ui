import { forwardRef, type InputHTMLAttributes, useRef } from 'react';
import { cn } from '../../lib/cn';
import { useMergedRef } from '../useMergedRef';

/* OtpField — a one-time code (the six digits a sign-in texts or emails), shown as one box per
   character. The idea is EasyUI's OTP input (github.com/Surajmaurya1/easyui, MIT); nothing of its
   code is used.

   It is ONE real text box, not six. The boxes are a drawing (aria-hidden) of what is in a
   transparent <input> laid over them, so everything a field does still works: the phone offers
   the code from the message (`autocomplete="one-time-code"`), a pasted "123 456" fills it, a
   password manager can fill it, Backspace and the arrow keys behave, and a screen reader meets a
   single field with one label that reads the code as it is typed. Six inputs that move focus
   between themselves break all of that.

   `mode` "numeric" (default) keeps digits and opens the number pad; "alphanumeric" keeps letters
   and digits and upper-cases them. Spaces and dashes in a paste are dropped. `onComplete` runs
   when the last character arrives. Wrap it in a FormField for the label, help and error; with an
   error the boxes take the danger boundary. Each box is 40px, 48px on a touch screen. */
export interface OtpFieldProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'maxLength' | 'size' | 'pattern'
  > {
  value: string;
  onValueChange: (value: string) => void;
  /** Characters in the code. Default 6. */
  length?: number;
  mode?: 'numeric' | 'alphanumeric';
  /** Runs with the code when its last character is entered. */
  onComplete?: (value: string) => void;
}

/** What may go in the field: digits (or letters and digits, upper-cased), at most `length`. */
export function cleanCode(raw: string, length: number, mode: OtpFieldProps['mode'] = 'numeric') {
  const kept = mode === 'numeric' ? raw.replace(/\D/g, '') : raw.replace(/[^a-z0-9]/gi, '');
  return (mode === 'numeric' ? kept : kept.toUpperCase()).slice(0, length);
}

export const OtpField = forwardRef<HTMLInputElement, OtpFieldProps>(function OtpField(
  {
    value,
    onValueChange,
    length = 6,
    mode = 'numeric',
    onComplete,
    className,
    disabled,
    onFocus,
    onSelect,
    ...props
  },
  forwarded,
) {
  const inner = useRef<HTMLInputElement>(null);
  const ref = useMergedRef(inner, forwarded);
  const code = cleanCode(value, length, mode);
  const active = Math.min(code.length, length - 1);
  // a long code is easier to read in two halves: 3 + 3, 4 + 4
  const split = length >= 6 && length % 2 === 0 ? length / 2 : -1;

  // the caret always sits at the end: Backspace takes the last character, typing adds one
  const toEnd = () => {
    const el = inner.current;
    if (el && (el.selectionStart !== el.value.length || el.selectionEnd !== el.value.length))
      el.setSelectionRange(el.value.length, el.value.length);
  };

  return (
    <div
      className={cn(
        'ui-otp group/otp relative inline-flex max-w-full items-center gap-1.5 sm:gap-2',
        className,
      )}
      data-disabled={disabled ? '' : undefined}
    >
      {Array.from({ length }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: one box per position, never reordered
        <span key={i} className="contents">
          {i === split && (
            <span aria-hidden="true" className="h-px w-2 shrink-0 bg-border-strong" />
          )}
          <span
            aria-hidden="true"
            data-active={i === active ? '' : undefined}
            data-filled={i < code.length ? '' : undefined}
            className={cn(
              'ui-otp-box relative grid size-10 shrink pointer-coarse:size-12 place-items-center rounded-sm border border-solid border-border-input bg-sunken font-mono text-lg font-semibold text-fg tabular-nums',
              'transition-[border-color] duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
              'group-hover/otp:border-fg-muted',
              'group-focus-within/otp:data-[active]:border-primary group-focus-within/otp:data-[active]:[box-shadow:var(--ring)]',
              'group-has-aria-invalid/otp:border-danger group-has-aria-invalid/otp:outline-1 group-has-aria-invalid/otp:-outline-offset-1 group-has-aria-invalid/otp:outline-danger',
              'group-data-[disabled]/otp:border-disabled-border group-data-[disabled]/otp:bg-disabled group-data-[disabled]/otp:text-disabled-fg',
              'forced-colors:border-[CanvasText]',
            )}
          >
            {code[i] ?? ''}
            {i === active && code.length < length && (
              <span className="ui-otp-caret pointer-events-none absolute h-5 w-px bg-fg opacity-0 group-focus-within/otp:opacity-100" />
            )}
          </span>
        </span>
      ))}
      <input
        {...props}
        ref={ref}
        type="text"
        inputMode={mode === 'numeric' ? 'numeric' : 'text'}
        autoComplete="one-time-code"
        autoCapitalize={mode === 'numeric' ? 'off' : 'characters'}
        autoCorrect="off"
        spellCheck={false}
        pattern={mode === 'numeric' ? `\\d{${length}}` : `[A-Za-z0-9]{${length}}`}
        maxLength={length}
        disabled={disabled}
        value={code}
        onChange={(e) => {
          const next = cleanCode(e.target.value, length, mode);
          onValueChange(next);
          if (next.length === length && next !== code) onComplete?.(next);
        }}
        onFocus={(e) => {
          toEnd();
          onFocus?.(e);
        }}
        onSelect={(e) => {
          toEnd();
          onSelect?.(e);
        }}
        className={cn(
          'ui-otp-input absolute inset-0 m-0 size-full cursor-text appearance-none rounded-sm border-0 bg-transparent p-0',
          'font-mono text-base text-transparent caret-transparent outline-none selection:bg-transparent',
          'disabled:cursor-not-allowed',
        )}
      />
    </div>
  );
});
