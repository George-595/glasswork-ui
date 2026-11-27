import { type HTMLAttributes, type KeyboardEvent, useEffect, useId, useRef } from 'react';
import { Button } from '../components/button';
import { stepValue } from '../components/inputs/number-field';
import { Text } from '../components/typography/Text';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* ValueStepper — a large setpoint: − figure +, for a target figure someone nudges up or down.

   The figure is an ARIA spinbutton (`aria-valuenow`, `min`, `max`, `valuetext` from `format`):
   Up / Right add a step, Down / Left take one away, Page Up / Page Down ten steps, Home / End
   jump to the limits. The two buttons (named "Lower" and "Raise") go aria-disabled, not
   disabled, at a limit so they do not drop out of the tab order mid-press. Every press calls
   `onValueChange`; `onValueCommit` follows once `commitDelayMs` passes with no press (so a run
   of presses sends one request), and on blur. The sum is float-safe (`stepValue` from
   NumberField). A press plays the kit's tick. */
export interface ValueStepperProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'children'> {
  label: string;
  value: number;
  /** Every press. */
  onValueChange: (value: number) => void;
  /** After `commitDelayMs` with no press, and on blur. */
  onValueCommit?: (value: number) => void;
  min: number;
  max: number;
  step: number;
  /** Default 800. */
  commitDelayMs?: number;
  /** The figure and its spoken value: '19.5 °C'. Default: the number. */
  format?: (value: number) => string;
  size?: 'md' | 'lg';
  disabled?: boolean;
  /** Words under the figure: 'Heating to 19.5 °C…'. */
  status?: string;
  /** Names of the two buttons. Defaults 'Lower' and 'Raise'. */
  lowerLabel?: string;
  raiseLabel?: string;
}

export function ValueStepper({
  label,
  value,
  onValueChange,
  onValueCommit,
  min,
  max,
  step,
  commitDelayMs = 800,
  format = String,
  size = 'md',
  disabled,
  status,
  lowerLabel = 'Lower',
  raiseLabel = 'Raise',
  className,
  ...props
}: ValueStepperProps) {
  const labelId = useId();
  const statusId = useId();
  const latest = useRef(value);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commitRef = useRef(onValueCommit);
  useEffect(() => {
    commitRef.current = onValueCommit;
  });

  // leaving with a press still waiting commits it rather than losing it
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      if (dirty.current) {
        dirty.current = false;
        commitRef.current?.(latest.current);
      }
    },
    [],
  );

  const flush = () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    dirty.current = false;
    commitRef.current?.(latest.current);
  };
  const apply = (next: number) => {
    if (disabled || next === (dirty.current ? latest.current : value)) return;
    latest.current = next;
    dirty.current = true;
    playSound('tick');
    onValueChange(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(flush, commitDelayMs);
  };
  const by = (direction: 1 | -1, count = 1) =>
    apply(stepValue(dirty.current ? latest.current : value, direction, step * count, { min, max }));

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    switch (e.key) {
      case 'ArrowUp':
      case 'ArrowRight':
        by(1);
        break;
      case 'ArrowDown':
      case 'ArrowLeft':
        by(-1);
        break;
      case 'PageUp':
        by(1, 10);
        break;
      case 'PageDown':
        by(-1, 10);
        break;
      case 'Home':
        apply(min);
        break;
      case 'End':
        apply(max);
        break;
      default:
        return;
    }
    e.preventDefault();
  };

  const atMin = value <= min;
  const atMax = value >= max;
  const button = (direction: 1 | -1) => {
    const off = disabled || (direction === 1 ? atMax : atMin);
    return (
      <Button
        type="button"
        variant="neutral"
        tabIndex={-1}
        aria-label={direction === 1 ? raiseLabel : lowerLabel}
        aria-disabled={off || undefined}
        className={cn('shrink-0 rounded-full p-0', size === 'lg' ? 'size-16' : 'size-12')}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (!off) by(direction);
        }}
      >
        <Icon name={direction === 1 ? 'plus' : 'minus'} size={size === 'lg' ? 28 : 20} />
      </Button>
    );
  };

  return (
    <div
      {...props}
      data-size={size}
      className={cn('ui-value-stepper inline-flex flex-col items-center gap-1', className)}
    >
      <span id={labelId} className="font-sans text-[13px] font-medium text-fg-muted">
        {label}
      </span>
      <div className="flex items-center gap-4">
        {button(-1)}
        <Text
          as="div"
          size="display"
          role="spinbutton"
          tabIndex={0}
          aria-labelledby={labelId}
          aria-describedby={status ? statusId : undefined}
          aria-valuenow={value}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuetext={format(value)}
          aria-disabled={disabled || undefined}
          onKeyDown={onKeyDown}
          onBlur={flush}
          className={cn(
            'min-w-24 rounded-sm text-center outline-none focus-visible:[box-shadow:var(--ring)]',
            size === 'lg' && 'text-[40px]',
          )}
        >
          {format(value)}
        </Text>
        {button(1)}
      </div>
      <span
        id={statusId}
        role="status"
        className="min-h-5 text-center font-sans text-[13px] text-fg-muted"
      >
        {status}
      </span>
    </div>
  );
}
