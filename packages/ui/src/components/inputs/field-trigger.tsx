import { type ButtonHTMLAttributes, forwardRef, useId } from 'react';
import { Icon } from '../../icons/Icon';
import { cn } from '../../lib/cn';
import { fieldClasses } from '../input';
import { Glyph } from './glyph';

/* The look shared by the inputs that open a panel (DatePicker, DateRangePicker): a field-shaped
   button holding the value or a placeholder. It sits in a FormField like an Input (the label's
   htmlFor reaches the button). A native label names the button but not its value, so the shown
   value is also its description: "Start date, button, 12 Oct 2026". With `onClear` a separate
   "Clear" button sits at the right edge (a button cannot hold a button). */
export interface FieldTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'value'> {
  /** The text shown, or empty for the placeholder. */
  display: string;
  placeholder: string;
  /** Name of what would be cleared, for the Clear button: "Clear date". */
  clearLabel?: string;
  onClear?: () => void;
  /** `sm` is the 32px height of a toolbar's controls. Default `md` (36px, like Input). */
  size?: 'sm' | 'md';
  /** Size to the content instead of filling the container (a toolbar). */
  fit?: boolean;
}

export const FieldTrigger = forwardRef<HTMLButtonElement, FieldTriggerProps>(function FieldTrigger(
  {
    display,
    placeholder,
    clearLabel = 'Clear',
    onClear,
    size = 'md',
    fit,
    className,
    disabled,
    ...props
  },
  ref,
) {
  const valueId = useId();
  const described = [props['aria-describedby'], display ? valueId : undefined]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={cn('ui-field-trigger relative', fit ? 'w-fit max-w-full' : 'w-full')}>
      <button
        ref={ref}
        type="button"
        disabled={disabled}
        {...props}
        aria-describedby={described || undefined}
        className={cn(
          'ui-input',
          fieldClasses,
          'flex w-full cursor-pointer items-center justify-between gap-2 px-2.5 text-left',
          size === 'sm' ? 'min-h-8 py-1 text-[12.5px]' : 'py-[7px]',
          onClear && display && 'pe-9',
          className,
        )}
      >
        <span id={valueId} className={cn('truncate', !display && 'text-fg-subtle')}>
          {display || placeholder}
        </span>
        <Glyph name="calendar" size={15} className="shrink-0 text-fg-muted" />
      </button>
      {onClear && display && !disabled && (
        <button
          type="button"
          aria-label={clearLabel}
          onClick={onClear}
          className="absolute end-7 top-1/2 inline-grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-xs border-0 bg-transparent text-fg-muted transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] motion-reduce:transition-none"
        >
          <Icon name="x" size={13} />
        </button>
      )}
    </div>
  );
});
