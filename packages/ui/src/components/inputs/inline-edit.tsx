/* Adapted from Arc's inline-edit (MIT, Elia Kuratli); see THIRD_PARTY_NOTICES.md. */
import { type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { Input } from '../input';
import { Glyph } from './glyph';

/* InlineEdit — a value that is text until you click it. At rest it is a button showing the
   value (named "Edit <label>: <value>"); a click, Enter or Space swaps it for a text box that
   takes focus with the text selected. Enter saves, Esc cancels (the old value stays and focus
   returns to the button), and leaving the box saves, so a click elsewhere never loses a
   change. `validate` may refuse a value with a message, shown in an alert under the box; the
   box stays until the value is fixed or Esc is pressed. A polite line says "<label> saved" or
   "Edit cancelled". An empty value shows `placeholder`. */
export interface InlineEditProps {
  value: string;
  onValueChange: (value: string) => void;
  /** What is being edited ("Project name"): names both the button and the box. */
  label: string;
  placeholder?: string;
  /** Return a message to refuse the value, or null to accept it. */
  validate?: (value: string) => string | null;
  disabled?: boolean;
  className?: string;
}

export function InlineEdit({
  value,
  onValueChange,
  label,
  placeholder = 'Add a value',
  validate,
  disabled,
  className,
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [problem, setProblem] = useState('');
  const [said, setSaid] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);
  // set once a save or cancel has run, so the box's blur on its way out does not save again
  const finished = useRef(false);
  const errId = useId();

  useEffect(() => {
    if (editing) {
      input.current?.focus();
      input.current?.select();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      button.current?.focus();
    }
  }, [editing]);

  const begin = () => {
    if (disabled) return;
    finished.current = false;
    setDraft(value);
    setProblem('');
    setSaid('');
    setEditing(true);
  };
  const cancel = () => {
    finished.current = true;
    returnFocus.current = true;
    setProblem('');
    setEditing(false);
    setSaid('Edit cancelled');
  };
  const save = (refocus: boolean) => {
    const next = draft.trim();
    if (finished.current) return;
    if (next === value) {
      finished.current = true;
      returnFocus.current = refocus;
      setEditing(false);
      return;
    }
    const bad = validate?.(next);
    if (bad) {
      setProblem(bad);
      input.current?.focus();
      return;
    }
    finished.current = true;
    returnFocus.current = refocus;
    setEditing(false);
    onValueChange(next);
    setSaid(`${label} saved`);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      save(true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cancel();
    }
  };

  return (
    <div className={cn('ui-inline-edit inline-flex max-w-full flex-col gap-1', className)}>
      {editing ? (
        <Input
          ref={input}
          value={draft}
          aria-label={label}
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? errId : undefined}
          onChange={(e) => {
            setDraft(e.target.value);
            if (problem) setProblem('');
          }}
          onKeyDown={onKeyDown}
          onBlur={() => {
            // a refused value keeps the box; anything else saves
            if (problem) return;
            save(false);
          }}
        />
      ) : (
        <button
          ref={button}
          type="button"
          disabled={disabled}
          aria-label={`Edit ${label}: ${value || 'empty'}`}
          onClick={begin}
          className={cn(
            'group inline-flex min-h-8 max-w-full cursor-pointer items-center gap-1.5 rounded-sm border border-solid border-transparent bg-transparent px-2 py-1 text-start font-sans text-[13px] text-fg',
            'transition-[background-color,border-color] duration-(--dur-fast) hover:border-border hover:bg-hover motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
            'disabled:cursor-not-allowed disabled:text-disabled-fg disabled:hover:border-transparent disabled:hover:bg-transparent',
          )}
        >
          <span className={cn('truncate', !value && 'text-fg-subtle')}>{value || placeholder}</span>
          <Glyph
            name="pencil"
            size={13}
            className="shrink-0 text-fg-subtle group-hover:text-fg-muted group-focus-visible:text-fg-muted"
          />
        </button>
      )}
      <div id={errId} role="alert" className="text-[12px] text-danger empty:hidden">
        {problem}
      </div>
      <div role="status" className="sr-only">
        {said}
      </div>
    </div>
  );
}
