import { ToggleGroup as ToggleGroupRoot, Toggle as ToggleRoot } from '@ui-sdk/react/toggle';
import { cva } from 'class-variance-authority';
import { type ComponentPropsWithoutRef, forwardRef, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/* Toggle — a button that stays pressed: bold, italic, "show grid", a filter chip.
   The UI SDK toggle supplies `aria-pressed` and `data-pressed`, so assistive tech
   announces "pressed". The selected state is the kit's one selected look, shared with
   SegmentedControl, Tabs and checkable menu items: `bg-selected`, `text-fg` and a
   `border-brand` edge (never a different hue per component, and not colour alone: the
   edge and the weight change too).
   ToggleGroup is a row of Toggles, one choice (`type="single"`) or several
   (`type="multiple"`); with `single` the choice can be cleared, unlike
   SegmentedControl, which always has a choice. */
export type ToggleSize = 'sm' | 'md' | 'lg' | 'icon';
export type ToggleAppearance = 'ghost' | 'outline';

export const toggleVariants = cva(
  [
    'ui-toggle box-border inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center gap-1.5',
    'rounded-sm border border-solid font-sans font-medium whitespace-nowrap',
    'text-on-ghost transition-[background-color,color,border-color] duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
    'hover:bg-ghost-hover active:bg-ghost-active',
    'focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
    // selected: the one selected look
    'data-pressed:border-brand data-pressed:bg-selected data-pressed:font-semibold data-pressed:text-fg',
    'disabled:pointer-events-none disabled:border-disabled-border disabled:bg-disabled disabled:text-disabled-fg',
    'data-disabled:pointer-events-none data-disabled:border-disabled-border data-disabled:bg-disabled data-disabled:text-disabled-fg',
    '[&>svg]:pointer-events-none',
  ],
  {
    variants: {
      appearance: {
        ghost: 'border-transparent bg-transparent',
        outline: 'border-outline-border bg-transparent',
      },
      size: {
        sm: 'min-h-8 px-2.5 py-1 text-[12.5px] leading-[1.2] pointer-coarse:min-h-12',
        md: 'min-h-9 px-3.5 py-1.5 text-[13px] leading-[1.2] pointer-coarse:min-h-12',
        lg: 'min-h-10 rounded-md px-4 py-2 text-[14px] leading-[1.2] pointer-coarse:min-h-12',
        icon: 'size-9 p-0 text-[13px] leading-[1.2] pointer-coarse:size-12',
      },
    },
    defaultVariants: { appearance: 'outline', size: 'md' },
  },
);

export interface ToggleProps
  extends Omit<ComponentPropsWithoutRef<typeof ToggleRoot>, 'onPressedChange'> {
  appearance?: ToggleAppearance;
  size?: ToggleSize;
  onPressedChange?: (pressed: boolean) => void;
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(function Toggle(
  { className, appearance = 'outline', size = 'md', onPressedChange, ...props },
  ref,
) {
  return (
    <ToggleRoot
      ref={ref}
      className={cn(toggleVariants({ appearance, size }), className)}
      data-size={size}
      onPressedChange={onPressedChange && ((pressed: boolean) => onPressedChange(pressed))}
      {...props}
    />
  );
});

export interface ToggleGroupOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  /** Needed when `label` is not text (an icon alone). */
  'aria-label'?: string;
}

interface ToggleGroupBase {
  options: readonly ToggleGroupOption[];
  /** Names the group for assistive tech. */
  label: string;
  size?: ToggleSize;
  appearance?: ToggleAppearance;
  disabled?: boolean;
  /** Let the toggles wrap onto more rows when they do not fit (filter chips). Default false. */
  wrap?: boolean;
  className?: string;
}
export type ToggleGroupProps =
  | (ToggleGroupBase & {
      type: 'single';
      value?: string;
      defaultValue?: string;
      onValueChange?: (value: string) => void;
    })
  | (ToggleGroupBase & {
      type: 'multiple';
      value?: string[];
      defaultValue?: string[];
      onValueChange?: (value: string[]) => void;
    });

export function ToggleGroup(props: ToggleGroupProps) {
  const {
    options,
    label,
    size = 'md',
    appearance = 'outline',
    disabled,
    wrap = false,
    className,
  } = props;
  const single = props.type === 'single';
  const toArray = (v: string | string[] | undefined) =>
    v === undefined ? undefined : Array.isArray(v) ? v : v ? [v] : [];
  return (
    <ToggleGroupRoot
      aria-label={label}
      disabled={disabled}
      className={cn(
        'ui-toggle-group inline-flex items-center gap-1',
        wrap && 'flex-wrap',
        className,
      )}
      multiple={!single}
      value={toArray(props.value)}
      defaultValue={toArray(props.defaultValue)}
      onValueChange={(next: string[]) => {
        if (props.type === 'single') props.onValueChange?.(next[0] ?? '');
        else props.onValueChange?.(next);
      }}
    >
      {options.map((o) => (
        <ToggleRoot
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          aria-label={o['aria-label']}
          className={toggleVariants({ appearance, size })}
        >
          {o.label}
        </ToggleRoot>
      ))}
    </ToggleGroupRoot>
  );
}
