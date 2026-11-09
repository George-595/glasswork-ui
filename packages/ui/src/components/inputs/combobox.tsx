// biome-ignore-all lint/a11y/noStaticElementInteractions: focusout bubbles to the presentational wrapper, which closes the list when focus leaves the field
import { forwardRef, type InputHTMLAttributes, useRef } from 'react';
import { Icon } from '../../icons/Icon';
import { cn } from '../../lib/cn';
import { Input } from '../input';
import { useMergedRef } from '../useMergedRef';
import { type ComboOption, useListbox } from './use-listbox';

/* Combobox — type to filter a list, pick one. The WAI-ARIA 1.2 combobox with list
   autocomplete: the text box is the combobox (`aria-expanded`, `aria-controls`,
   `aria-activedescendant`), the options are a listbox that focus never enters. Down opens and
   moves (wrapping), Up moves back, Enter picks the active option, Esc closes (the text goes
   back to the chosen label), Tab leaves. A polite line gives the number of matches or the
   empty message. The list sits in place under the field, so it also works inside a modal
   <dialog>. It is a field: wrap it in a FormField and the label, help and error reach the
   input. For a short fixed list prefer NativeSelect; use this when the list is long enough to
   need searching. */
export interface ComboboxProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'role'
  > {
  options: readonly ComboOption[];
  /** The chosen option's value, or null. */
  value: string | null;
  onValueChange: (value: string | null) => void;
  /** Name of the list for assistive tech. Default "Options". */
  listLabel?: string;
  emptyMessage?: string;
  /** Show a Clear button while something is chosen. */
  clearable?: boolean;
}

export const Combobox = forwardRef<HTMLInputElement, ComboboxProps>(function Combobox(
  {
    options,
    value,
    onValueChange,
    listLabel = 'Options',
    emptyMessage = 'No matches',
    clearable,
    disabled,
    className,
    ...rest
  },
  ref,
) {
  const input = useRef<HTMLInputElement>(null);
  const setRef = useMergedRef<HTMLInputElement>(input, ref);
  const selected = options.find((o) => o.value === value);
  const lb = useListbox({
    options,
    multiple: false,
    chosen: value === null ? [] : [value],
    restingText: selected?.label ?? '',
    onPick: (o) => onValueChange(o.value),
    emptyMessage,
    label: listLabel,
    disabled,
  });
  const end = clearable && selected ? 'pe-14' : 'pe-8';
  return (
    // focusout bubbles to this wrapper, which closes the list when focus leaves the field
    <div role="presentation" className="ui-combobox relative w-full" onBlur={lb.onBlurWithin}>
      <Input {...rest} {...lb.inputProps} ref={setRef} className={cn(end, className)} />
      {clearable && selected && !disabled && (
        <button
          type="button"
          aria-label="Clear selection"
          onClick={() => {
            onValueChange(null);
            input.current?.focus();
          }}
          className={cn(chipButton, 'end-8')}
        >
          <Icon name="x" size={13} />
        </button>
      )}
      <button
        type="button"
        tabIndex={-1}
        aria-label="Show options"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          lb.toggle();
          input.current?.focus();
        }}
        className={cn(chipButton, 'end-1')}
      >
        <Icon name="chevron-down" size={14} />
      </button>
      {lb.popup}
    </div>
  );
});

const chipButton =
  'absolute top-1/2 inline-grid size-6 -translate-y-1/2 cursor-pointer place-items-center rounded-xs border-0 bg-transparent text-fg-muted transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] disabled:cursor-not-allowed disabled:text-disabled-fg motion-reduce:transition-none';
