/* Adapted from Arc's combobox / multi-select (MIT, Elia Kuratli) and BoardUI's select (MIT,
   Mertcan Dundar Esmergul): the typeahead filter and the keyboard model, rewritten on the
   WAI-ARIA 1.2 combobox pattern with our roles. See THIRD_PARTY_NOTICES.md. */
import {
  type ChangeEvent,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Icon } from '../../icons/Icon';
import { cn } from '../../lib/cn';

export interface ComboOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
}

/** The popup surface: the same material as Popover and Menu (glass picks it up from the tokens). */
export const listSurface =
  'ui-listbox absolute start-0 top-full z-50 mt-1 m-0 max-h-60 w-full min-w-40 list-none overflow-auto rounded-md border border-solid border-border bg-overlay p-1 text-fg [box-shadow:var(--elev-2)] glass-chrome forced-colors:border-[CanvasText]';

const optionBase =
  'ui-option flex cursor-pointer items-start gap-2 rounded-sm border border-solid border-transparent px-2 py-1.5 text-[13px] leading-[1.3] ' +
  'data-[active]:border-brand data-[active]:bg-hover aria-disabled:cursor-not-allowed aria-disabled:text-disabled-fg ' +
  'forced-colors:data-[active]:[outline:2px_solid_Highlight]';

/** Every typed word must be in the label (case-insensitive), like the command palette. */
export function filterOptions(options: readonly ComboOption[], query: string): ComboOption[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...options];
  return options.filter((o) => {
    const hay = `${o.label} ${o.description ?? ''}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

interface UseListboxOptions {
  options: readonly ComboOption[];
  multiple: boolean;
  /** Values currently chosen. */
  chosen: readonly string[];
  /** The text the field shows when the person is not typing (single: the chosen label). */
  restingText: string;
  onPick: (option: ComboOption) => void;
  /** Backspace in an empty multi field. */
  onBackspaceEmpty?: () => void;
  emptyMessage: string;
  label: string;
  disabled?: boolean;
}

/** The combobox + listbox wiring shared by Combobox and MultiSelect. The caller lays out the
    field (the input goes where it wants); this returns the props for the input and the popup. */
export function useListbox({
  options,
  multiple,
  chosen,
  restingText,
  onPick,
  onBackspaceEmpty,
  emptyMessage,
  label,
  disabled,
}: UseListboxOptions) {
  const baseId = useId();
  const listId = `${baseId}-list`;
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState(false);
  const [query, setQuery] = useState('');
  // the active option is remembered by value, so it survives a changed filter while it still
  // matches, and otherwise falls to the first enabled option
  const [activeValue, setActiveValue] = useState<string | null>(null);
  const list = useRef<HTMLDivElement>(null);

  const shown = useMemo(
    () => (typed ? filterOptions(options, query) : [...options]),
    [options, typed, query],
  );
  const firstEnabled = (from: number, dir: 1 | -1) => {
    for (let i = from; i >= 0 && i < shown.length; i += dir) if (!shown[i]?.disabled) return i;
    return -1;
  };
  const remembered = shown.findIndex((o) => o.value === activeValue && !o.disabled);
  const active = open ? (remembered >= 0 ? remembered : firstEnabled(0, 1)) : -1;
  const setActive = (i: number) => setActiveValue(shown[i]?.value ?? null);

  useEffect(() => {
    if (active < 0) return;
    list.current
      ?.querySelector<HTMLElement>(`#${CSS.escape(`${baseId}-opt-${active}`)}`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [active, baseId]);

  const close = () => {
    setActiveValue(null);
    setOpen(false);
    setTyped(false);
    setQuery('');
  };
  const pick = (o: ComboOption | undefined) => {
    if (!o || o.disabled) return;
    onPick(o);
    setTyped(false);
    setQuery('');
    if (!multiple) setOpen(false);
  };
  const move = (dir: 1 | -1) => {
    if (!open) {
      setOpen(true);
      return;
    }
    const step = (from: number) => {
      const n = shown.length;
      for (let k = 1; k <= n; k++) {
        const i = (((from + dir * k) % n) + n) % n;
        if (!shown[i]?.disabled) return i;
      }
      return -1;
    };
    setActive(step(active < 0 ? (dir === 1 ? -1 : 0) : active));
  };

  const inputProps = {
    role: 'combobox' as const,
    'aria-expanded': open,
    'aria-controls': listId,
    'aria-autocomplete': 'list' as const,
    'aria-haspopup': 'listbox' as const,
    'aria-activedescendant': open && active >= 0 ? `${baseId}-opt-${active}` : undefined,
    autoComplete: 'off',
    disabled,
    value: typed || multiple ? query : restingText,
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      setTyped(true);
      setQuery(e.target.value);
      setOpen(true);
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          move(1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          move(-1);
          break;
        case 'Enter':
          if (open) {
            e.preventDefault();
            pick(shown[active]);
          }
          break;
        case 'Escape':
          if (open) {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
          break;
        case 'Backspace':
          if (multiple && query === '') onBackspaceEmpty?.();
          break;
        case 'Home':
          if (open && !typed) {
            e.preventDefault();
            setActive(firstEnabled(0, 1));
          }
          break;
        case 'End':
          if (open && !typed) {
            e.preventDefault();
            setActive(firstEnabled(shown.length - 1, -1));
          }
          break;
        default:
      }
    },
  };

  /** Close when focus leaves the field and its popup. */
  const onBlurWithin = (e: FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) close();
  };

  const popup: ReactNode = (
    <>
      <div
        ref={list}
        id={listId}
        role="listbox"
        tabIndex={-1}
        aria-label={label}
        aria-multiselectable={multiple || undefined}
        hidden={!open || shown.length === 0}
        className={cn(listSurface, (!open || shown.length === 0) && 'hidden')}
        // keep focus in the input while the pointer works the list
        onMouseDown={(e) => e.preventDefault()}
      >
        {shown.map((o, i) => {
          const selected = chosen.includes(o.value);
          return (
            <div
              key={o.value}
              id={`${baseId}-opt-${i}`}
              role="option"
              // never tabbed to (the input keeps focus); the keys live on the combobox input
              tabIndex={-1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  pick(o);
                }
              }}
              aria-selected={selected}
              aria-disabled={o.disabled || undefined}
              data-active={i === active || undefined}
              className={cn(optionBase, selected && 'font-semibold')}
              onMouseMove={() => !o.disabled && i !== active && setActive(i)}
              onClick={() => pick(o)}
            >
              <span className="grid size-4 shrink-0 place-items-center pt-px" aria-hidden="true">
                {selected && <Icon name="check" size={14} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{o.label}</span>
                {o.description && (
                  <span className="block truncate text-[12px] font-normal text-fg-muted">
                    {o.description}
                  </span>
                )}
              </span>
            </div>
          );
        })}
      </div>
      {open && shown.length === 0 && (
        <div className={cn(listSurface, 'px-2 py-1.5 text-[13px] text-fg-muted')}>
          {emptyMessage}
        </div>
      )}
      <div role="status" className="sr-only">
        {open ? (shown.length === 0 ? emptyMessage : `${shown.length} options`) : ''}
      </div>
    </>
  );

  return {
    open,
    setOpen,
    close,
    query,
    setQuery,
    inputProps,
    onBlurWithin,
    popup,
    toggle: () => setOpen((o) => !o),
  };
}
