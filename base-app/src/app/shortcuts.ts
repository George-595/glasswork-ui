import { useEffect, useEffectEvent, useRef } from 'react';
import { navigate } from '~/core/router';
import { ROUTES } from './routes';

/* The keyboard shortcuts that are not the command palette's own ⌘K / Ctrl+K (that one lives
   in the kit's CommandPalette). One table drives three things: the listener below, the
   shortcut help dialog (`?`), and the hints on the palette's "Go to" commands, so they cannot
   drift apart.

   - `g` then a letter within a second goes to a page: g h Home, g t Table, g g Graphs.
   - `[` collapses or expands the sidebar. `a` opens the Ask panel. `?` opens the help.
   None of them fire while the person is typing (an input, textarea, select or contenteditable),
   while a modifier key is held (so browser and OS shortcuts are untouched), or while a dialog
   is open. */
export const SEQUENCE_WINDOW_MS = 1000;

/** `g` + key → the route id it goes to. A route that does not exist (an app that removed a page) is skipped. */
export const GO_KEYS: Readonly<Record<string, string>> = { h: 'home', t: 'table', g: 'graphs' };

export function goShortcutFor(routeId: string): readonly string[] | undefined {
  const key = Object.keys(GO_KEYS).find((k) => GO_KEYS[k] === routeId);
  return key ? ['g', key] : undefined;
}

/** Whether keystrokes are going into something editable, where letters are text. */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return true;
  const ce = target.closest('[contenteditable]')?.getAttribute('contenteditable');
  return ce !== undefined && ce !== null && ce !== 'false';
}

/** True while a modal dialog (the native <dialog> or a Radix one) is open. */
function dialogOpen(): boolean {
  return document.querySelector('dialog[open], [role="dialog"][data-state="open"]') !== null;
}

export interface ShortcutHandlers {
  onToggleSidebar: () => void;
  onHelp: () => void;
  /** Open the Ask panel. Not wired on a page that has none (the Assistant page itself). */
  onAsk?: () => void;
}

export function useShortcuts({ onToggleSidebar, onHelp, onAsk }: ShortcutHandlers): void {
  const pending = useRef<number | null>(null);
  const toggle = useEffectEvent(onToggleSidebar);
  const help = useEffectEvent(onHelp);
  const ask = useEffectEvent(() => {
    if (!onAsk) return false;
    onAsk();
    return true;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (isTyping(e.target) || dialogOpen()) {
        pending.current = null;
        return;
      }
      const started = pending.current;
      pending.current = null;
      const inSequence = started !== null && Date.now() - started <= SEQUENCE_WINDOW_MS;

      if (inSequence) {
        const id = GO_KEYS[e.key];
        const route = ROUTES.find((r) => r.id === id);
        if (route) {
          e.preventDefault();
          navigate(route.path);
          return;
        }
      }
      if (e.key === 'g') {
        pending.current = Date.now();
      } else if (e.key === '[') {
        e.preventDefault();
        toggle();
      } else if (e.key === 'a') {
        if (ask()) e.preventDefault();
      } else if (e.key === '?') {
        e.preventDefault();
        help();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);
}
