import { type KeyboardEvent, useId, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* SwatchPicker — pick one of a few named colours. Colour is never alone: every swatch is named
   (its accessible name, and visibly on hover and focus under the row), and the chosen one has
   the selected border and a tick on a solid chip.

   A native radio group (`fieldset role="radiogroup"`, like ChoiceCard) of round swatches, 48px
   (md) or 56px (lg). The arrow keys move the choice (and the focus) with wrap-around, as native
   radios do; with no choice (`value` null) Tab enters the first swatch. The line under the row
   says the name of the swatch hovered or focused, else the chosen one, else "Custom" (a colour
   that matches none of them). The ten `swatch-N` roles of @apps/colors are the same in every skin and mode, so
   "Red" is the same red everywhere. Each is ringed by `border-input`, which is 3:1 on the page and on a card.
   The kit knows nothing of what is being coloured. */
export type SwatchRole =
  | 'swatch-1'
  | 'swatch-2'
  | 'swatch-3'
  | 'swatch-4'
  | 'swatch-5'
  | 'swatch-6'
  | 'swatch-7'
  | 'swatch-8'
  | 'swatch-9'
  | 'swatch-10';

export interface SwatchOption {
  value: string;
  label: string;
  role: SwatchRole;
}

export interface SwatchPickerProps {
  label: string;
  options: readonly SwatchOption[];
  /** The chosen option's value; null when none matches ('Custom'). */
  value: string | null;
  onValueChange: (value: string) => void;
  size?: 'md' | 'lg';
  className?: string;
}

// full class names, so Tailwind can see them
const FILL: Record<SwatchRole, string> = {
  'swatch-1': 'bg-swatch-1',
  'swatch-2': 'bg-swatch-2',
  'swatch-3': 'bg-swatch-3',
  'swatch-4': 'bg-swatch-4',
  'swatch-5': 'bg-swatch-5',
  'swatch-6': 'bg-swatch-6',
  'swatch-7': 'bg-swatch-7',
  'swatch-8': 'bg-swatch-8',
  'swatch-9': 'bg-swatch-9',
  'swatch-10': 'bg-swatch-10',
};

export function SwatchPicker({
  label,
  options,
  value,
  onValueChange,
  size = 'md',
  className,
}: SwatchPickerProps) {
  const name = useId();
  const root = useRef<HTMLFieldSetElement>(null);
  const [shown, setShown] = useState<string | null>(null);
  const chosen = options.find((o) => o.value === value);
  const caption = options.find((o) => o.value === shown)?.label ?? chosen?.label ?? 'Custom';

  const choose = (v: string) => {
    if (v === value) return;
    playSound('tick');
    onValueChange(v);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const step =
      e.key === 'ArrowRight' || e.key === 'ArrowDown'
        ? 1
        : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
          ? -1
          : 0;
    if (!step || options.length === 0 || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const from = options.findIndex((o) => o.value === value);
    const to =
      (from === -1 ? (step === 1 ? 0 : options.length - 1) : from + step + options.length) %
      options.length;
    const next = options[to];
    if (!next) return;
    root.current?.querySelectorAll<HTMLInputElement>('input[type="radio"]')[to]?.focus();
    choose(next.value);
  };

  return (
    <fieldset
      ref={root}
      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ARIA in HTML allows radiogroup on fieldset
      role="radiogroup"
      data-size={size}
      className={cn('ui-swatch-picker m-0 flex min-w-0 flex-col gap-2 border-0 p-0', className)}
    >
      <legend className="mb-2 p-0 text-[13px] font-medium text-fg">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const on = o.value === value;
          return (
            <label
              key={o.value}
              data-checked={on || undefined}
              data-role={o.role}
              className={cn(
                'ui-swatch relative grid shrink-0 cursor-pointer place-items-center rounded-full border-2 border-solid',
                'has-focus-visible:[box-shadow:var(--ring)] forced-colors:border-[CanvasText]',
                size === 'lg' ? 'size-14' : 'size-12',
                FILL[o.role],
                on ? 'border-brand' : 'border-border-input',
              )}
            >
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={on}
                onChange={() => choose(o.value)}
                onKeyDown={onKeyDown}
                onMouseEnter={() => setShown(o.value)}
                onMouseLeave={() => setShown(null)}
                onFocus={() => setShown(o.value)}
                onBlur={() => setShown(null)}
                className="absolute inset-0 m-0 size-full cursor-[inherit] opacity-0"
              />
              <span className="sr-only">{o.label}</span>
              {on && (
                <span
                  aria-hidden="true"
                  className="grid size-6 place-items-center rounded-full bg-surface-solid text-fg"
                >
                  <Icon name="check" size={14} />
                </span>
              )}
            </label>
          );
        })}
      </div>
      <span aria-hidden="true" data-slot="caption" className="min-h-5 text-[13px] text-fg-muted">
        {caption}
      </span>
    </fieldset>
  );
}
