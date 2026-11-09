import { useSyncExternalStore } from 'react';
import type { AgentContext } from '~/core/api';

/* The Ask panel's open state, as a tiny store any page can reach: the shell's Ask button opens
   it, and a page opens it about one thing with `askAbout({ kind, id, label })` (the
   transaction drawer's "Ask about this"). That thing travels with every message as the
   context's `selection` until the panel closes. */
export type AskSelection = NonNullable<AgentContext['selection']>;
export interface AskState {
  open: boolean;
  selection: AskSelection | null;
}

let state: AskState = { open: false, selection: null };
const listeners = new Set<() => void>();

function set(next: AskState) {
  state = next;
  for (const l of listeners) l();
}

/** Open the Ask panel, about one thing if given. */
export function askAbout(selection?: AskSelection): void {
  set({ open: true, selection: selection ?? null });
}

/** Open or close the panel. Closing forgets the selection. */
export function setAskOpen(open: boolean): void {
  set(open ? { ...state, open } : { open: false, selection: null });
}

/** Drop the selection and keep the panel open. */
export function clearAskSelection(): void {
  set({ ...state, selection: null });
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

export function useAsk(): AskState {
  return useSyncExternalStore(
    subscribe,
    () => state,
    () => state,
  );
}
