/* Adapted from Arc's number-field (MIT, Elia Kuratli); see THIRD_PARTY_NOTICES.md. The stepper
   buttons and the key model, rewritten on the ARIA spinbutton with Intl formatting. */
import {
  forwardRef,
  type InputHTMLAttributes,
  type ReactNode,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from '../../icons/Icon';
import { cn } from '../../lib/cn';
import { useMergedRef } from '../useMergedRef';
import { Glyph } from './glyph';
import { shell } from './shell';

/* NumberField — a number with a unit, steppers and the locale's own format.

   The text box is an ARIA spinbutton (`aria-valuenow` / `min` / `max` / `valuetext`): Up and
   Down add or take away `step`, PageUp and PageDown `largeStep`, Home and End jump to `min` and
   `max`. A native type=number would show 1234.5 in every locale and let the wheel change the
   value by accident; this shows "1,234.5" (en-GB) and parses what was typed, group separators
   and all. Typing updates the value as soon as the text is a number inside [min, max]; on
   blur or Enter the text is tidied (clamped, rounded to the step's decimals, re-formatted).
   The − and + buttons are for the pointer; they are outside the tab order because the keys on
   the text box do the same, and they go aria-disabled (not disabled) at a limit. Wrap it in a
   FormField for the label, help and error. */
export interface NumberFieldProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'min' | 'max' | 'step' | 'prefix' | 'size'
  > {
  value: number | null;
  onValueChange: (value: number | null) => void;
  min?: number;
  max?: number;
  step?: number;
  /** The PageUp / PageDown step. Default ten steps. */
  largeStep?: number;
  /** BCP 47 locale. Default en-GB. */
  locale?: string;
  /** Intl.NumberFormat options: a currency, a percent (the value is the fraction), decimals. */
  formatOptions?: Intl.NumberFormatOptions;
  /** A unit or symbol before the number ("£"); decorative, so put the unit in the label too. */
  prefix?: ReactNode;
  /** A unit after the number ("years"). */
  suffix?: ReactNode;
  /** Show the − and + buttons. Default true. */
  steppers?: boolean;
  /** Names for the stepper buttons. */
  decrementLabel?: string;
  incrementLabel?: string;
}

const decimalsOf = (n: number) => {
  const s = String(n);
  const e = /e-(\d+)$/.exec(s);
  if (e) return Number(e[1]);
  return s.includes('.') ? (s.split('.')[1]?.length ?? 0) : 0;
};

const round = (n: number, places: number) => Number(n.toFixed(Math.min(places, 20)));

export const NumberField = forwardRef<HTMLInputElement, NumberFieldProps>(function NumberField(
  {
    value,
    onValueChange,
    min,
    max,
    step = 1,
    largeStep,
    locale = 'en-GB',
    formatOptions,
    prefix,
    suffix,
    steppers = true,
    decrementLabel = 'Decrease',
    incrementLabel = 'Increase',
    disabled,
    readOnly,
    className,
    onBlur,
    ...rest
  },
  ref,
) {
  const input = useRef<HTMLInputElement>(null);
  const setRef = useMergedRef<HTMLInputElement>(input, ref);
  const [draft, setDraft] = useState<string | null>(null);

  const fmt = useMemo(() => new Intl.NumberFormat(locale, formatOptions), [locale, formatOptions]);
  const seps = useMemo(() => {
    const parts = new Intl.NumberFormat(locale).formatToParts(11111.1);
    return {
      group: parts.find((p) => p.type === 'group')?.value ?? ',',
      decimal: parts.find((p) => p.type === 'decimal')?.value ?? '.',
    };
  }, [locale]);
  const percent = formatOptions?.style === 'percent';
  const places = Math.max(decimalsOf(step), formatOptions?.maximumFractionDigits ?? 0);

  const parse = (text: string): number | null => {
    const cleaned = text
      .split(seps.group)
      .join('')
      .replace(seps.decimal, '.')
      .replace(/[^0-9.\-−]/g, '')
      .replace('−', '-');
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
    const n = Number(cleaned);
    if (!Number.isFinite(n)) return null;
    return percent ? n / 100 : n;
  };
  const inRange = (n: number) => (min === undefined || n >= min) && (max === undefined || n <= max);
  const clamp = (n: number) =>
    Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min ?? Number.NEGATIVE_INFINITY, n));

  const shown = draft ?? (value === null ? '' : fmt.format(value));
  const commit = (n: number | null) => {
    setDraft(null);
    onValueChange(n === null ? null : round(clamp(n), places + (percent ? 2 : 0)));
  };
  const stepBy = (direction: 1 | -1, size: number) => {
    if (disabled || readOnly) return;
    const base = value ?? (min !== undefined && direction === 1 ? min - size : 0);
    commit(base + direction * size);
  };

  const atMin = value !== null && min !== undefined && value <= min;
  const atMax = value !== null && max !== undefined && value >= max;
  const stepButton = (direction: 1 | -1) => {
    const off = disabled || readOnly || (direction === 1 ? atMax : atMin);
    return (
      <button
        type="button"
        tabIndex={-1}
        aria-label={direction === 1 ? incrementLabel : decrementLabel}
        aria-disabled={off || undefined}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (off) return;
          stepBy(direction, step);
          input.current?.focus();
        }}
        className={cn(
          'inline-grid size-7 pointer-coarse:size-12 shrink-0 cursor-pointer place-items-center rounded-xs border-0 bg-transparent text-fg-muted',
          'transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg motion-reduce:transition-none',
          'aria-disabled:cursor-not-allowed aria-disabled:text-disabled-fg aria-disabled:hover:bg-transparent',
        )}
      >
        {direction === 1 ? <Icon name="plus" size={14} /> : <Glyph name="minus" size={14} />}
      </button>
    );
  };

  return (
    <div className={cn(shell, 'ui-number-field flex-nowrap pointer-coarse:p-0', className)}>
      {steppers && stepButton(-1)}
      {prefix && (
        <span aria-hidden="true" className="text-[13px] text-fg-muted">
          {prefix}
        </span>
      )}
      <input
        {...rest}
        ref={setRef}
        type="text"
        role="spinbutton"
        inputMode={places > 0 || (min !== undefined && min < 0) ? 'decimal' : 'numeric'}
        autoComplete="off"
        disabled={disabled}
        readOnly={readOnly}
        value={shown}
        aria-valuenow={value ?? undefined}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuetext={value === null ? undefined : fmt.format(value)}
        className="min-w-0 flex-1 border-0 bg-transparent px-1 py-1 text-center font-sans text-[13px] pointer-coarse:text-[16px] leading-[1.3] tabular-nums text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed"
        onChange={(e) => {
          setDraft(e.target.value);
          const n = parse(e.target.value);
          if (e.target.value.trim() === '') onValueChange(null);
          else if (n !== null && inRange(n)) onValueChange(n);
        }}
        onBlur={(e) => {
          onBlur?.(e);
          if (draft === null) return;
          const n = parse(draft);
          if (n === null) {
            setDraft(null);
            if (draft.trim() === '') onValueChange(null);
          } else commit(n);
        }}
        onKeyDown={(e) => {
          const big = largeStep ?? step * 10;
          switch (e.key) {
            case 'ArrowUp':
              e.preventDefault();
              stepBy(1, step);
              break;
            case 'ArrowDown':
              e.preventDefault();
              stepBy(-1, step);
              break;
            case 'PageUp':
              e.preventDefault();
              stepBy(1, big);
              break;
            case 'PageDown':
              e.preventDefault();
              stepBy(-1, big);
              break;
            case 'Home':
              if (min !== undefined) {
                e.preventDefault();
                commit(min);
              }
              break;
            case 'End':
              if (max !== undefined) {
                e.preventDefault();
                commit(max);
              }
              break;
            case 'Enter': {
              const n = draft === null ? null : parse(draft);
              if (n !== null) commit(n);
              break;
            }
            default:
          }
        }}
      />
      {suffix && (
        <span aria-hidden="true" className="pe-1 text-[13px] text-fg-muted">
          {suffix}
        </span>
      )}
      {steppers && stepButton(1)}
    </div>
  );
});
