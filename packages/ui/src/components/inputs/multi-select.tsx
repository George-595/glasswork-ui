// biome-ignore-all lint/a11y/noStaticElementInteractions: presentational wrappers for focusout (close the list) and a pointer click on the empty field (focus the text box); the text box is the keyboard route
/* Adapted from Arc's multi-select and tag-input (MIT, Elia Kuratli); see THIRD_PARTY_NOTICES.md.
   Rewritten on our combobox hook, roles and Input material; no motion library. */
import {
  type ClipboardEvent,
  forwardRef,
  type InputHTMLAttributes,
  type KeyboardEvent,
  useRef,
  useState,
} from 'react';
import { Icon } from '../../icons/Icon';
import { cn } from '../../lib/cn';
import { useMergedRef } from '../useMergedRef';
import { shell } from './shell';
import { type ComboOption, useListbox } from './use-listbox';

/* MultiSelect and TagInput — chips in a field, each removable by keyboard.

   MultiSelect picks several from a list: the combobox of `Combobox` (typeahead, the listbox
   stays open between picks, a ticked option shows a check) with the chosen options as chips
   before the text box. TagInput takes free text: Enter or a comma adds a tag, a paste is split
   on commas and new lines, duplicates and (with `validate`) invalid tags are refused with the
   reason said in words.

   Both: every chip has a "Remove X" button (a real, focusable button), Backspace in the empty
   text box removes the last chip, and a polite line says what was added or removed, so
   nothing is conveyed by sight alone. The field shows one focus ring around the chips and the
   box (focus-within). They sit in a FormField: the id reaches the text box. */
const textBox =
  'min-w-24 flex-1 border-0 bg-transparent px-1 py-1 font-sans text-[13px] leading-[1.3] text-fg outline-none placeholder:text-fg-subtle disabled:cursor-not-allowed';

function Chip({
  label,
  onRemove,
  disabled,
}: {
  label: string;
  onRemove: () => void;
  disabled?: boolean;
}) {
  return (
    <span className="ui-chip inline-flex max-w-full items-center gap-0.5 rounded-xs border border-solid border-border bg-selected ps-2 pe-0.5 text-[12.5px] leading-[1.2] text-fg">
      <span className="truncate py-0.5">{label}</span>
      <button
        type="button"
        disabled={disabled}
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        className="inline-grid size-6 cursor-pointer place-items-center rounded-xs border-0 bg-transparent text-fg-muted transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] disabled:cursor-not-allowed disabled:text-disabled-fg motion-reduce:transition-none"
      >
        <Icon name="x" size={12} />
      </button>
    </span>
  );
}

export interface MultiSelectProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'role'
  > {
  options: readonly ComboOption[];
  /** The chosen values, in the order they were picked. */
  value: readonly string[];
  onValueChange: (value: string[]) => void;
  listLabel?: string;
  emptyMessage?: string;
}

export const MultiSelect = forwardRef<HTMLInputElement, MultiSelectProps>(function MultiSelect(
  {
    options,
    value,
    onValueChange,
    listLabel = 'Options',
    emptyMessage = 'No matches',
    disabled,
    className,
    placeholder,
    ...rest
  },
  ref,
) {
  const input = useRef<HTMLInputElement>(null);
  const setRef = useMergedRef<HTMLInputElement>(input, ref);
  const [said, setSaid] = useState('');
  const labelOf = (v: string) => options.find((o) => o.value === v)?.label ?? v;
  const remove = (v: string) => {
    onValueChange(value.filter((x) => x !== v));
    setSaid(`Removed ${labelOf(v)}`);
    input.current?.focus();
  };
  const lb = useListbox({
    options,
    multiple: true,
    chosen: value,
    restingText: '',
    onPick: (o) => {
      if (value.includes(o.value)) {
        onValueChange(value.filter((x) => x !== o.value));
        setSaid(`Removed ${o.label}`);
      } else {
        onValueChange([...value, o.value]);
        setSaid(`Added ${o.label}`);
      }
    },
    onBackspaceEmpty: () => {
      const last = value.at(-1);
      if (last !== undefined) remove(last);
    },
    emptyMessage,
    label: listLabel,
    disabled,
  });
  return (
    // focusout bubbles to this wrapper, which closes the list when focus leaves the field
    <div role="presentation" className={cn('relative w-full', className)} onBlur={lb.onBlurWithin}>
      {/* a pointer convenience: a click on the empty part of the field focuses the text box */}
      <div
        role="presentation"
        className={shell}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            input.current?.focus();
          }
        }}
      >
        {value.map((v) => (
          <Chip key={v} label={labelOf(v)} onRemove={() => remove(v)} disabled={disabled} />
        ))}
        <input
          {...rest}
          {...lb.inputProps}
          ref={setRef}
          className={textBox}
          placeholder={value.length === 0 ? placeholder : undefined}
          onFocus={(e) => {
            rest.onFocus?.(e);
            lb.setOpen(true);
          }}
        />
      </div>
      {lb.popup}
      <div role="status" className="sr-only">
        {said}
      </div>
    </div>
  );
});

export interface TagInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type'
  > {
  value: readonly string[];
  onValueChange: (tags: string[]) => void;
  /** Return a message to refuse a tag, or null to accept it. */
  validate?: (tag: string) => string | null;
  /** The most tags allowed. */
  max?: number;
}

export const TagInput = forwardRef<HTMLInputElement, TagInputProps>(function TagInput(
  { value, onValueChange, validate, max, disabled, className, placeholder, ...rest },
  ref,
) {
  const input = useRef<HTMLInputElement>(null);
  const setRef = useMergedRef<HTMLInputElement>(input, ref);
  const [text, setText] = useState('');
  const [said, setSaid] = useState('');
  const [problem, setProblem] = useState('');

  const add = (raw: string[]) => {
    const next = [...value];
    const notes: string[] = [];
    for (const part of raw) {
      const tag = part.trim();
      if (!tag) continue;
      const bad = validate?.(tag);
      if (next.some((t) => t.toLowerCase() === tag.toLowerCase()))
        notes.push(`${tag} is already added`);
      else if (max !== undefined && next.length >= max) notes.push(`No more than ${max} tags`);
      else if (bad) notes.push(bad);
      else next.push(tag);
    }
    if (next.length !== value.length) {
      onValueChange(next);
      setSaid(`Added ${next.slice(value.length).join(', ')}`);
    }
    setProblem(notes.join('. '));
    return notes.length === 0;
  };
  const remove = (tag: string) => {
    onValueChange(value.filter((t) => t !== tag));
    setSaid(`Removed ${tag}`);
    input.current?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (text.trim() && add([text])) setText('');
      return;
    }
    if (e.key === 'Backspace' && text === '') {
      const last = value.at(-1);
      if (last !== undefined) remove(last);
    }
  };
  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (!/[,\n]/.test(pasted)) return;
    e.preventDefault();
    add(pasted.split(/[,\n]/));
  };
  return (
    <div className={cn('relative w-full', className)}>
      {/* a pointer convenience: a click on the empty part of the field focuses the text box */}
      <div
        role="presentation"
        className={shell}
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            input.current?.focus();
          }
        }}
      >
        {value.map((t) => (
          <Chip key={t} label={t} onRemove={() => remove(t)} disabled={disabled} />
        ))}
        <input
          {...rest}
          ref={setRef}
          type="text"
          disabled={disabled}
          value={text}
          placeholder={value.length === 0 ? placeholder : undefined}
          className={textBox}
          onChange={(e) => {
            setText(e.target.value);
            if (problem) setProblem('');
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onBlur={(e) => {
            rest.onBlur?.(e);
            if (text.trim() && add([text])) setText('');
          }}
        />
      </div>
      <div role="status" className="sr-only">
        {said}
      </div>
      <div role="alert" className="min-h-0 text-[12px] text-danger empty:hidden">
        {problem}
      </div>
    </div>
  );
});
