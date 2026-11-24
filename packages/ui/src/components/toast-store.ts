import type { ReactNode } from 'react';
import { playSound, type SoundName } from '../sound';

/* The toast store: the queue behind toast() and the Toaster. No UI SDK and no JSX, so the whole of the kit's
   toast(...) calls cost a page a few hundred bytes. The UI SDK view (toast.tsx) is fetched by the Toaster facade
   (toaster.tsx) after hydration; a toast pushed before it arrives waits here. See toast.tsx for the behaviour. */
export type ToastVariant = 'default' | 'success' | 'error' | 'info';

export interface ToastOptions {
  variant?: ToastVariant;
  description?: ReactNode;
  /** Milliseconds before it leaves; Infinity keeps it. Default 5000 (errors: kept). */
  duration?: number;
  action?: { label: string; onClick: () => void };
}

export interface UndoToastOptions extends Omit<ToastOptions, 'variant' | 'action'> {
  /** Takes the thing back. Runs at most once. */
  onUndo: () => void;
  /** Runs once if the toast leaves without an undo. */
  onExpire?: () => void;
  /** The button's words. Default "Undo". */
  undoLabel?: string;
  /** Said after an undo; false says nothing. Default "Undone". */
  undone?: ReactNode | false;
}

interface UndoParts {
  onUndo: () => void;
  onExpire?: () => void;
  label: string;
  undone: ReactNode | false;
}

export interface ToastItem extends ToastOptions {
  id: string;
  /** When it was pushed (ms), for the store's own expiry. */
  at: number;
  title: ReactNode;
  open: boolean;
  undo?: UndoParts;
}

const MAX_VISIBLE = 3;
const EXIT_MS = 250;
const UNDO_MS = 8000;

let items: readonly ToastItem[] = [];
let counter = 0;
const listeners = new Set<() => void>();
/** Undo toasts whose outcome (undone or expired) has been decided, so neither runs twice. */
export const settled = new Set<string>();

function emit(next: readonly ToastItem[]) {
  items = next;
  for (const l of listeners) l();
}

/* The store's own expiry. The UI SDK times a toast while its view is mounted. When the view cannot be fetched nothing
   would, so an undo toast's onExpire would never run: the Toaster facade turns this on (selfTime) after a failed
   fetch, and off again when a view arrives, which then takes over the toasts still open. */
const DEFAULT_MS = 5000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let selfTimed = false;

function armExpiry(t: ToastItem) {
  if (!selfTimed || !t.open || timers.has(t.id)) return;
  const total = t.duration ?? (t.variant === 'error' ? Number.POSITIVE_INFINITY : DEFAULT_MS);
  if (!Number.isFinite(total)) return;
  timers.set(
    t.id,
    setTimeout(
      () => {
        timers.delete(t.id);
        dismiss(t.id);
      },
      Math.max(0, total - (Date.now() - t.at)),
    ),
  );
}

function clearExpiry(id: string) {
  clearTimeout(timers.get(id));
  timers.delete(id);
}

/** Facade only: the store times the open toasts itself (true) or leaves it to the mounted view (false). */
export function selfTime(on: boolean) {
  selfTimed = on;
  if (on) for (const t of items) armExpiry(t);
  else {
    for (const id of timers.keys()) clearExpiry(id);
  }
}

function remove(id: string) {
  clearExpiry(id);
  settled.delete(id);
  emit(items.filter((t) => t.id !== id));
}

/** Close a toast (it animates out, then is removed). An undo toast that goes without being
    undone runs its onExpire, once. */
export function dismiss(id?: string) {
  const ids = id ? [id] : items.map((t) => t.id);
  for (const t of items) {
    if (!ids.includes(t.id) || !t.undo || settled.has(t.id)) continue;
    settled.add(t.id);
    t.undo.onExpire?.();
  }
  for (const x of ids) clearExpiry(x);
  emit(items.map((t) => (ids.includes(t.id) ? { ...t, open: false } : t)));
  setTimeout(() => {
    for (const x of ids) remove(x);
  }, EXIT_MS);
}

const TOAST_SOUND: Record<ToastVariant, SoundName> = {
  default: 'notify',
  success: 'success',
  error: 'error',
  info: 'notify',
};

function push(title: ReactNode, options: ToastOptions = {}, undo?: UndoParts): string {
  playSound(TOAST_SOUND[options.variant ?? 'default']);
  counter += 1;
  const id = `toast-${counter}`;
  const item: ToastItem = { ...options, id, title, open: true, undo, at: Date.now() };
  emit([...items, item]);
  armExpiry(item);
  // the stack shows three: the oldest open ones leave
  const open = items.filter((t) => t.open);
  for (const old of open.slice(0, Math.max(0, open.length - MAX_VISIBLE))) dismiss(old.id);
  return id;
}

/** Undo the undo toast `id` (its button, or Ctrl+Z / Cmd+Z). */
export function runUndo(id: string) {
  const t = items.find((x) => x.id === id);
  if (!t?.undo || settled.has(id)) return;
  settled.add(id);
  t.undo.onUndo();
  dismiss(id);
  if (t.undo.undone !== false) push(t.undo.undone);
}

function pushUndo(
  title: ReactNode,
  { onUndo, onExpire, undoLabel = 'Undo', undone = 'Undone', ...options }: UndoToastOptions,
): string {
  return push(
    title,
    { duration: UNDO_MS, ...options },
    { onUndo, onExpire, label: undoLabel, undone },
  );
}

type Shorthand = (title: ReactNode, options?: Omit<ToastOptions, 'variant'>) => string;

export const toast = Object.assign(
  (title: ReactNode, options?: ToastOptions) => push(title, options),
  {
    success: ((title, options) => push(title, { ...options, variant: 'success' })) as Shorthand,
    error: ((title, options) => push(title, { ...options, variant: 'error' })) as Shorthand,
    info: ((title, options) => push(title, { ...options, variant: 'info' })) as Shorthand,
    undo: pushUndo,
    dismiss,
  },
);

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export const snapshot = (): readonly ToastItem[] => items;
