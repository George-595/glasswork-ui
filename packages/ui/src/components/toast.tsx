import { Toast as ToastPrimitive } from 'radix-ui';
import { type ReactNode, useEffect, useState, useSyncExternalStore } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound, type SoundName } from '../sound';

/* Toaster + toast() — brief, non-blocking messages ("Saved", "Couldn't send").

   Mount <Toaster /> once near the root, then call toast() from anywhere, in or
   out of React: toast.success('Saved'), toast.error('Failed', { action }).

   Radix Toast supplies the behaviour: each toast is announced through a polite
   live region (errors through an assertive one, because they interrupt a task),
   the timer pauses while the pointer is over the stack or focus is inside it,
   a swipe dismisses, and F8 jumps to the stack. On top of that: at most three
   show at once (the oldest leaves when a fourth arrives), each variant has an
   icon AND a spoken/visible word, not colour alone (WCAG 1.4.1), an optional
   action button, and a Dismiss button. Errors stay until dismissed unless you
   give a duration, because a message that vanishes cannot be acted on
   (WCAG 2.2.1). The surface is the raised glass material.

   On a phone the stack rests above whatever bar is over the bottom of the screen (the tab
   bar, a flow's action bar, a pinned bulk or save bar: they report `--ui-bottom-inset`, see
   lib/bottom-inset.ts), so a toast never covers the buttons the person needs next, and its
   Dismiss button is a 48px target on a touch screen.

   toast.undo('Deleted "Q3 plan"', { onUndo }) is the undo toast (the idea is EasyUI's, MIT; none of
   its code): the thing is already done, and for `duration` (8 s) an Undo button can take it back.
   A thin bar drains as the time runs out (aria-hidden, gone under reduced motion) and stops with
   the timer while the pointer or focus is on the stack, so the time is never shorter than it
   looks (WCAG 2.2.1). Ctrl+Z / Cmd+Z also undoes the newest one, unless the focus is in a text
   field, where it belongs to the field. Undoing says "Undone" (`undone`, or false for nothing) so
   the result is heard, not just seen; `onExpire` runs once if the toast leaves any other way
   (timed out, dismissed, pushed out by a fourth toast), for work that waits for the window to
   close before it is final. */
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

interface ToastItem extends ToastOptions {
  id: string;
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
const settled = new Set<string>();

function emit(next: readonly ToastItem[]) {
  items = next;
  for (const l of listeners) l();
}

function remove(id: string) {
  settled.delete(id);
  emit(items.filter((t) => t.id !== id));
}

/** Close a toast (it animates out, then is removed). An undo toast that goes without being
    undone runs its onExpire, once. */
function dismiss(id?: string) {
  const ids = id ? [id] : items.map((t) => t.id);
  for (const t of items) {
    if (!ids.includes(t.id) || !t.undo || settled.has(t.id)) continue;
    settled.add(t.id);
    t.undo.onExpire?.();
  }
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
  emit([...items, { ...options, id, title, open: true, undo }]);
  // the stack shows three: the oldest open ones leave
  const open = items.filter((t) => t.open);
  for (const old of open.slice(0, Math.max(0, open.length - MAX_VISIBLE))) dismiss(old.id);
  return id;
}

/** Undo the undo toast `id` (its button, or Ctrl+Z / Cmd+Z). */
function runUndo(id: string) {
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

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
const snapshot = () => items;

const WORD: Record<ToastVariant, string | null> = {
  default: null,
  success: 'Success',
  error: 'Error',
  info: 'Note',
};

function VariantIcon({ variant }: { variant: ToastVariant }) {
  if (variant === 'success') return <Icon name="check" size={16} />;
  if (variant === 'error') return <Icon name="alert" size={16} />;
  if (variant === 'info')
    return (
      <span className="inline-flex size-4 items-center justify-center rounded-full border-[1.5px] border-solid border-current font-serif text-[10px] leading-none font-bold">
        i
      </span>
    );
  return null;
}

const ICON_TONE: Record<ToastVariant, string> = {
  default: 'text-fg-subtle',
  success: 'text-success',
  error: 'text-danger',
  info: 'text-info',
};

export interface ToasterProps {
  /** Name of the notifications region. Default "Notifications". */
  label?: string;
  className?: string;
}

/** A key press that belongs to a text field (its own undo), not to the page. */
function inTextField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (!(target instanceof HTMLInputElement)) return false;
  return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes(
    target.type,
  );
}

export function Toaster({ label = 'Notifications', className }: ToasterProps) {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  const undoable = list.filter((t) => t.open && t.undo && !settled.has(t.id));
  const newest = undoable[undoable.length - 1]?.id;

  // Ctrl+Z / Cmd+Z undoes the newest open undo toast
  useEffect(() => {
    if (!newest) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== 'z' || e.shiftKey || e.altKey || !(e.ctrlKey || e.metaKey))
        return;
      if (inTextField(e.target)) return;
      e.preventDefault();
      runUndo(newest);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [newest]);

  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {list.map((t) => (
        <ToastRow key={t.id} t={t} />
      ))}
      <ToastPrimitive.Viewport
        label={`${label} ({hotkey})`}
        className={cn(
          // above the bars at the bottom of the screen; with none, 1rem (or the safe area) clear of the edge
          'ui-toaster fixed right-4 bottom-[calc(var(--ui-bottom-inset,max(0px,env(safe-area-inset-bottom)_-_1rem))_+_1rem)] z-[100] m-0 flex w-[min(24rem,calc(100vw-2rem))] list-none flex-col gap-2 p-0 outline-none',
          className,
        )}
      />
    </ToastPrimitive.Provider>
  );
}

const ACTION =
  'mt-1 inline-flex min-h-6 pointer-coarse:min-h-12 w-fit cursor-pointer items-center rounded-sm border border-solid border-border-strong bg-transparent px-2.5 py-0.5 font-sans text-[12.5px] font-medium text-brand hover:border-primary hover:text-fg active:bg-hover focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]';

function ToastRow({ t }: { t: ToastItem }) {
  const variant = t.variant ?? 'default';
  const [paused, setPaused] = useState(false);
  const duration = t.duration ?? (variant === 'error' ? Number.POSITIVE_INFINITY : undefined);
  const countdown = t.undo && duration !== undefined && Number.isFinite(duration);
  return (
    <ToastPrimitive.Root
      open={t.open}
      onOpenChange={(open) => !open && dismiss(t.id)}
      onPause={() => setPaused(true)}
      onResume={() => setPaused(false)}
      type={variant === 'error' ? 'foreground' : 'background'}
      duration={duration}
      data-variant={variant}
      className={cn(
        'ui-toast relative m-0 flex list-none items-start gap-3 rounded-md border border-solid border-border bg-overlay p-3 pr-10 pointer-coarse:pr-14 text-fg glass-chrome',
        '[box-shadow:var(--elev-3)] forced-colors:border-[CanvasText]',
        'motion-safe:data-[state=open]:animate-[ui-toast-in_var(--dur-slow)_var(--ease-out)]',
        'motion-safe:data-[state=closed]:animate-[ui-toast-out_var(--dur-base)_var(--ease-in)]',
        'motion-safe:data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)',
        'motion-safe:data-[swipe=cancel]:translate-x-0 motion-safe:data-[swipe=cancel]:transition-transform motion-safe:data-[swipe=cancel]:duration-(--dur-base)',
        'motion-safe:data-[swipe=end]:animate-[ui-toast-swipe-out_var(--dur-fast)_var(--ease-out)]',
        'focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
      )}
    >
      <span className={cn('mt-0.5 shrink-0', ICON_TONE[variant])} aria-hidden="true">
        <VariantIcon variant={variant} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <ToastPrimitive.Title className="m-0 font-sans text-[13px] leading-[1.35] font-semibold text-fg">
          {WORD[variant] && <span className="ui-sr-only">{WORD[variant]}: </span>}
          {t.title}
        </ToastPrimitive.Title>
        {t.description && (
          <ToastPrimitive.Description className="m-0 text-[13px] leading-normal text-fg-muted">
            {t.description}
          </ToastPrimitive.Description>
        )}
        {t.action && (
          <ToastPrimitive.Action
            altText={t.action.label}
            onClick={t.action.onClick}
            className={ACTION}
          >
            {t.action.label}
          </ToastPrimitive.Action>
        )}
        {t.undo && (
          <ToastPrimitive.Action
            altText={`${t.undo.label}, or press Control Z`}
            onClick={(e) => {
              // Radix would close it as "dismissed"; the undo decides the outcome first
              e.preventDefault();
              runUndo(t.id);
            }}
            className={cn(ACTION, 'gap-1.5')}
          >
            <Icon name="undo" size={14} />
            {t.undo.label}
          </ToastPrimitive.Action>
        )}
      </div>
      <ToastPrimitive.Close
        aria-label="Dismiss notification"
        className="absolute top-2 right-2 pointer-coarse:top-1 pointer-coarse:right-1 inline-flex size-6 pointer-coarse:size-12 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-fg-subtle transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
      >
        <Icon name="x" size={14} />
      </ToastPrimitive.Close>
      {countdown && (
        <span
          aria-hidden="true"
          className="ui-toast-countdown absolute right-3 bottom-1 left-3 h-0.5 origin-left rounded-full bg-brand motion-reduce:hidden forced-colors:hidden"
          style={{
            animation: `ui-toast-countdown ${duration}ms linear forwards`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
      )}
    </ToastPrimitive.Root>
  );
}
