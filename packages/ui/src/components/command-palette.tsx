import { Dialog as DialogPrimitive } from 'radix-ui';
import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useEffectEvent,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { Button, type ButtonProps } from './button';
import { Kbd } from './kbd';

/* CommandPalette — the ⌘K / Ctrl+K "go anywhere, do anything" box.

   The WAI-ARIA combobox + listbox pattern, inside a modal dialog (Radix
   Dialog, as Sheet is): the text input is the combobox, focus never leaves it,
   and the highlighted option is named by aria-activedescendant. Options sit in
   labelled groups (role="group"). Keys, on the input:
     ArrowDown / ArrowUp  move the highlight (wrapping)
     Home / End           first / last option
     Enter                run the highlighted command and close
     Esc                  close; focus goes back to whatever opened the palette
   The filter is a forgiving substring match: every word typed must appear in
   the command's label, its group or its keywords, in any order. A polite
   status line says how many commands match (or that none do), because the
   highlight alone is not announced.

   The palette is controlled (`open` / `onOpenChange`) and, unless `shortcut`
   is false, listens for ⌘K / Ctrl+K itself, also from inside a text field, as
   every command palette does. `recentKey` makes it remember the last few
   commands run (ids, in localStorage under that key, every access guarded) and
   show them first while the box is empty.

   Surface: the raised material, so it is the glass material in the glass
   skin (a blurred scrim behind it, solid under reduced transparency, through
   the tokens). The entrance is a fade and short rise that stops under
   prefers-reduced-motion. */
export interface CommandItem {
  /** Stable id; also what `recentKey` remembers. */
  id: string;
  label: string;
  /** The group heading it sits under. Default "Commands". */
  group?: string;
  /** Extra words that find it ("dark" for a theme switch). */
  keywords?: readonly string[];
  icon?: IconName;
  /** Keys shown on the right, one Kbd each (["g", "h"]). */
  shortcut?: readonly string[];
  onSelect: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: readonly CommandItem[];
  /** The dialog's name for assistive tech. Default "Command palette". */
  label?: string;
  /** The input's placeholder (it is also named by `label`). */
  placeholder?: string;
  /** Shown, and announced, when nothing matches. */
  emptyMessage?: string;
  /** localStorage key that remembers recent commands. Omit for no memory. */
  recentKey?: string;
  /** Open and close on ⌘K / Ctrl+K. Default true. */
  shortcut?: boolean;
  className?: string;
}

const DEFAULT_GROUP = 'Commands';
const RECENT_GROUP = 'Recent';
const RECENT_MAX = 4;

const normalise = (s: string) => s.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '');

/** The commands whose label, group or keywords contain every word of `query`, in their original order. */
export function filterCommands(commands: readonly CommandItem[], query: string): CommandItem[] {
  const words = normalise(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...commands];
  return commands.filter((c) => {
    const hay = normalise([c.label, c.group ?? DEFAULT_GROUP, ...(c.keywords ?? [])].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

/** True on Apple platforms, where the shortcut is spelt ⌘K rather than Ctrl K. False on the
    server: Node has a `navigator` too, but it describes the host, not the visitor. */
export function isMacLike(): boolean {
  if (typeof window === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '');
}

const noopSubscribe = () => () => {};

/** isMacLike() for rendering: false on the server and while hydrating (so the markup matches),
    the visitor's platform after that. */
export function useIsMacLike(): boolean {
  return useSyncExternalStore(noopSubscribe, isMacLike, () => false);
}

function readRecent(key: string): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeRecent(key: string, ids: readonly string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* storage unavailable: the memory lasts for this page only */
  }
}

interface Row {
  item: CommandItem;
  group: string;
}

export function CommandPalette({
  open,
  onOpenChange,
  commands,
  label = 'Command palette',
  placeholder = 'Type a command or search…',
  emptyMessage = 'No matching commands.',
  recentKey,
  shortcut = true,
  className,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const base = useId();
  const listId = `${base}-list`;
  const list = useRef<HTMLDivElement>(null);
  // Radix returns focus to a Trigger; this palette is opened from a shortcut or any
  // button, so it remembers what had focus when it opened and gives it back
  const opener = useRef<Element | null>(null);

  const toggle = useEffectEvent(() => onOpenChange(!open));
  useEffect(() => {
    if (!shortcut) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'k' || !(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey)
        return;
      e.preventDefault();
      toggle();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [shortcut]);

  // each opening starts clean, with the recent list read fresh. Done while rendering (React's
  // "adjust state when a prop changes"), not in an effect, so the first open frame is already right
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery('');
      setActive(0);
      setRecent(recentKey ? readRecent(recentKey) : []);
    }
  }

  const rows = useMemo<Row[]>(() => {
    if (query.trim() === '' && recent.length > 0) {
      const byId = new Map(commands.map((c) => [c.id, c]));
      const recents = recent
        .map((id) => byId.get(id))
        .filter((c): c is CommandItem => c !== undefined)
        .slice(0, RECENT_MAX);
      const rest = commands.filter((c) => !recents.includes(c));
      return [
        ...recents.map((item) => ({ item, group: RECENT_GROUP })),
        ...rest.map((item) => ({ item, group: item.group ?? DEFAULT_GROUP })),
      ];
    }
    return filterCommands(commands, query).map((item) => ({
      item,
      group: item.group ?? DEFAULT_GROUP,
    }));
  }, [commands, query, recent]);

  // groups in order of first appearance, each row keeping its flat index
  const groups = useMemo(() => {
    const out: { name: string; rows: { row: Row; index: number }[] }[] = [];
    rows.forEach((row, index) => {
      let g = out.find((x) => x.name === row.group);
      if (!g) {
        g = { name: row.group, rows: [] };
        out.push(g);
      }
      g.rows.push({ row, index });
    });
    return out;
  }, [rows]);

  const optionId = (i: number) => `${base}-opt-${i}`;
  const activeRow = rows[active];

  // keep the highlighted option in view as the arrow keys move it
  useEffect(() => {
    if (!open) return;
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  });

  const run = (row: Row | undefined) => {
    if (!row) return;
    if (recentKey) {
      writeRecent(
        recentKey,
        [row.item.id, ...readRecent(recentKey).filter((x) => x !== row.item.id)].slice(
          0,
          RECENT_MAX,
        ),
      );
    }
    onOpenChange(false);
    row.item.onSelect();
  };

  const onInputKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const n = rows.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (n === 0) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((a) => (a + step + n) % n);
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      if (n > 0) setActive(e.key === 'Home' ? 0 : n - 1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      run(activeRow);
    }
  };

  const hasRows = rows.length > 0;
  const status = hasRows
    ? `${rows.length} ${rows.length === 1 ? 'result' : 'results'}`
    : emptyMessage;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-palette-overlay fixed inset-0 z-50 bg-(--scrim) motion-safe:data-[state=closed]:animate-[ui-fade-out_0.15s_ease-out] motion-safe:data-[state=open]:animate-[ui-fade-in_0.15s_ease-out]" />
        <DialogPrimitive.Content
          onOpenAutoFocus={() => {
            opener.current = document.activeElement;
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const back = opener.current;
            if (back instanceof HTMLElement && back.isConnected) back.focus();
          }}
          className={cn(
            'ui-palette fixed inset-x-0 top-[12vh] z-50 mx-auto box-border flex max-h-[min(30rem,76vh)] w-[min(40rem,calc(100vw-32px))] flex-col overflow-hidden',
            'rounded-lg border border-solid border-border bg-raised text-fg glass-chrome',
            '[box-shadow:var(--glass-rim),var(--shadow-lg)] focus-visible:outline-none forced-colors:border-[CanvasText]',
            'motion-safe:data-[state=open]:animate-[ui-dialog-in_0.2s_cubic-bezier(0.22,1,0.36,1)]',
            className,
          )}
        >
          <DialogPrimitive.Title className="ui-sr-only">{label}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="ui-sr-only">
            Type to filter. Use the up and down arrow keys to choose a command and Enter to run it.
          </DialogPrimitive.Description>
          <div className="ui-palette-search flex items-center gap-2.5 border-0 border-b border-solid border-border px-4">
            <Icon name="search" size={16} className="text-fg-subtle" />
            <input
              role="combobox"
              aria-label={label}
              aria-autocomplete="list"
              aria-expanded={hasRows}
              aria-controls={hasRows ? listId : undefined}
              aria-activedescendant={hasRows ? optionId(active) : undefined}
              autoComplete="off"
              spellCheck={false}
              placeholder={placeholder}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKey}
              className="ui-palette-input box-border min-h-12 min-w-0 flex-1 border-0 bg-transparent py-3 font-sans text-[15px] text-fg outline-none placeholder:text-fg-subtle focus-visible:outline-none"
            />
          </div>
          <div className="ui-sr-only" role="status">
            {status}
          </div>
          {hasRows ? (
            <div
              ref={list}
              id={listId}
              role="listbox"
              aria-label={`${label} results`}
              className="ui-palette-list min-h-0 flex-1 overflow-y-auto p-2"
            >
              {groups.map((g) => {
                const headId = `${base}-g-${g.name.replace(/\W+/g, '-')}`;
                return (
                  // biome-ignore lint/a11y/useSemanticElements: a <fieldset> in a listbox is not valid; the APG grouped listbox uses role="group"
                  <div
                    key={g.name}
                    role="group"
                    aria-labelledby={headId}
                    className="ui-palette-group"
                  >
                    <div
                      id={headId}
                      className="px-2.5 pt-2 pb-1 font-sans text-[11px] leading-none font-semibold tracking-[0.12em] text-fg-subtle uppercase"
                    >
                      {g.name}
                    </div>
                    {g.rows.map(({ row, index }) => (
                      <div
                        key={`${g.name}-${row.item.id}`}
                        id={optionId(index)}
                        role="option"
                        // never tabbed to (the input keeps focus); makes the option a proper
                        // focusable widget and gives a stray focus the same keys
                        tabIndex={-1}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            run(row);
                          }
                        }}
                        aria-selected={index === active}
                        data-active={index === active || undefined}
                        // keep focus in the input when the pointer presses an option
                        onMouseDown={(e) => e.preventDefault()}
                        onPointerMove={() => index !== active && setActive(index)}
                        onClick={() => run(row)}
                        className={cn(
                          'ui-palette-option flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md border border-solid border-transparent px-2.5 py-1.5 font-sans text-[13.5px] text-fg-muted',
                          'aria-selected:border-brand aria-selected:bg-selected aria-selected:text-fg',
                          'forced-colors:aria-selected:[outline:2px_solid_Highlight]',
                        )}
                      >
                        {row.item.icon && <Icon name={row.item.icon} size={15} />}
                        <span className="min-w-0 flex-1 truncate">{row.item.label}</span>
                        {row.item.shortcut && (
                          <span className="inline-flex items-center gap-1" aria-hidden="true">
                            {row.item.shortcut.map((k) => (
                              <Kbd key={k}>{k}</Kbd>
                            ))}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <p
              aria-hidden="true"
              className="m-0 px-4 py-8 text-center font-sans text-[13.5px] text-fg-subtle"
            >
              {emptyMessage}
            </p>
          )}
          <div className="ui-palette-hints hidden items-center gap-4 border-0 border-t border-solid border-border px-4 py-2 font-sans text-[12px] text-fg-subtle sm:flex">
            <Hint keys={['↑', '↓']} text="to move" />
            <Hint keys={['↵']} text="to run" />
            <Hint keys={['Esc']} text="to close" />
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Hint({ keys, text }: { keys: readonly string[]; text: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {keys.map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
      {text}
    </span>
  );
}

/* CommandPaletteButton — the visible way in: "Search…" with the shortcut as
   Kbd chips (⌘ K on Apple platforms, Ctrl K elsewhere). Under 640px only the
   icon shows; the name stays. `variant="ghost" size="icon"` makes it a plain icon button like
   the bell's (a phone's top bar). */
export function CommandPaletteButton({ className, children, ...props }: ButtonProps) {
  const mac = useIsMacLike();
  return (
    <Button
      variant="outline"
      size="sm"
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      {...props}
      className={cn('ui-palette-button gap-2', className)}
    >
      <Icon name="search" size={props.size === 'icon' ? 18 : 14} />
      <span className="max-sm:sr-only">{children ?? 'Search…'}</span>
      <span className="inline-flex items-center gap-0.5 max-sm:hidden" aria-hidden="true">
        <Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </Button>
  );
}
