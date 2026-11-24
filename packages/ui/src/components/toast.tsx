import {
  createToaster,
  ToastAction,
  ToastClose,
  ToastDescription,
  Toast as ToastPart,
  ToastRegion,
  ToastTitle,
} from '@ui-sdk/react/toast';
import { type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import {
  dismiss,
  runUndo,
  settled,
  snapshot,
  subscribe,
  type ToastItem,
  type ToastVariant,
} from './toast-store';

/* ToasterView — the UI SDK view of Toaster + toast() — brief, non-blocking messages ("Saved", "Couldn't send").

   Mount <Toaster /> once near the root, then call toast() from anywhere, in or
   out of React: toast.success('Saved'), toast.error('Failed', { action }).

   Vercel's UI SDK toast region supplies the behaviour: each toast is announced
   politely (errors assertively, because they interrupt a task), the timer
   pauses while the pointer is over the stack or focus is inside it, a swipe or
   Escape dismisses, and F8 jumps to the stack. The kit's store (toast-store.ts)
   stays the queue: this view mirrors it into an SDK toaster and hands every
   dismissal back to it. On top of that: at most three
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

export function ToasterView({ label = 'Notifications', className }: ToasterProps) {
  const list = useSyncExternalStore(subscribe, snapshot, snapshot);
  const undoable = list.filter((t) => t.open && t.undo && !settled.has(t.id));
  const newest = undoable[undoable.length - 1]?.id;
  const [sdk] = useState(() => createToaster<ReactNode>());
  const shown = useRef(new Set<string>());

  // mirror the store into the SDK toaster: new open toasts in, closed ones out
  useEffect(() => {
    for (const t of list) {
      const variant = t.variant ?? 'default';
      if (t.open && !shown.current.has(t.id)) {
        shown.current.add(t.id);
        sdk({
          id: t.id,
          title: t.title,
          description: t.description,
          type: variant,
          priority: variant === 'error' ? 'assertive' : 'polite',
          duration:
            t.duration ?? (variant === 'error' ? Number.POSITIVE_INFINITY : DEFAULT_DURATION),
          data: t,
          // the SDK timed it out, or a swipe, Escape or Dismiss closed it: the store decides what that means
          onDismiss: () => dismiss(t.id),
        });
      } else if (!t.open && shown.current.has(t.id)) {
        shown.current.delete(t.id);
        sdk.dismiss(t.id);
      }
    }
  }, [list, sdk]);
  useEffect(() => () => sdk.dismiss(), [sdk]);

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
    <ToastRegion
      toaster={sdk}
      aria-label={label}
      side="bottom"
      align="end"
      maxVisible={3}
      expanded
      shortcut="F8"
      className={cn(
        // above the bars at the bottom of the screen; with none, 1rem (or the safe area) clear of the edge
        'ui-toaster fixed inset-auto right-4 bottom-[calc(var(--ui-bottom-inset,max(0px,env(safe-area-inset-bottom)_-_1rem))_+_1rem)] z-[100] m-0 w-[min(24rem,calc(100vw-2rem))] border-0 bg-transparent p-0 outline-none [&>ol]:m-0 [&>ol]:flex [&>ol]:list-none [&>ol]:flex-col [&>ol]:gap-2 [&>ol]:p-0',
        className,
      )}
    >
      {(toast) => <ToastRow t={toast.data as ToastItem} />}
    </ToastRegion>
  );
}

const DEFAULT_DURATION = 5000;

const ACTION =
  'mt-1 inline-flex min-h-6 pointer-coarse:min-h-12 w-fit cursor-pointer items-center rounded-sm border border-solid border-border-strong bg-transparent px-2.5 py-0.5 font-sans text-[12.5px] font-medium text-brand hover:border-primary hover:text-fg active:bg-hover focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]';

function ToastRow({ t }: { t: ToastItem }) {
  const variant = t.variant ?? 'default';
  const duration = t.duration ?? (variant === 'error' ? Number.POSITIVE_INFINITY : undefined);
  const countdown = t.undo && duration !== undefined && Number.isFinite(duration);
  return (
    <ToastPart
      data-variant={variant}
      className={cn(
        'ui-toast relative m-0 flex list-none items-start gap-3 rounded-md border border-solid border-border bg-overlay p-3 pr-10 pointer-coarse:pr-14 text-fg glass-chrome select-none',
        '[box-shadow:var(--elev-3)] forced-colors:border-[CanvasText]',
        'motion-safe:animate-[ui-toast-in_var(--dur-slow)_var(--ease-out)]',
        'motion-safe:data-ending-style:animate-[ui-toast-out_var(--dur-base)_var(--ease-in)]',
        'motion-safe:data-swiping:translate-x-(--toast-swipe-x)',
        'motion-safe:data-swipe-direction:animate-[ui-toast-swipe-out_var(--dur-fast)_var(--ease-out)]',
        'focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
      )}
    >
      <span className={cn('mt-0.5 shrink-0', ICON_TONE[variant])} aria-hidden="true">
        <VariantIcon variant={variant} />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <ToastTitle className="m-0 font-sans text-[13px] leading-[1.35] font-semibold text-fg">
          {WORD[variant] && <span className="ui-sr-only">{WORD[variant]}: </span>}
          {t.title}
        </ToastTitle>
        {t.description && (
          <ToastDescription className="m-0 text-[13px] leading-normal text-fg-muted">
            {t.description}
          </ToastDescription>
        )}
        {t.action && (
          <ToastAction onAction={() => t.action?.onClick()} dismiss className={ACTION}>
            {t.action.label}
          </ToastAction>
        )}
        {t.undo && (
          <ToastAction
            // the undo decides the outcome first, then closes the toast itself
            onAction={() => runUndo(t.id)}
            dismiss={false}
            aria-keyshortcuts="Control+Z Meta+Z"
            className={cn(ACTION, 'gap-1.5')}
          >
            <Icon name="undo" size={14} />
            {t.undo.label}
          </ToastAction>
        )}
      </div>
      <ToastClose
        aria-label="Dismiss notification"
        className="absolute top-2 right-2 pointer-coarse:top-1 pointer-coarse:right-1 inline-flex size-6 pointer-coarse:size-12 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent p-0 text-fg-subtle transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
      >
        <Icon name="x" size={14} />
      </ToastClose>
      {countdown && (
        <span
          aria-hidden="true"
          // the bar stops with the timer while the pointer or focus is on the stack
          className="ui-toast-countdown absolute right-3 bottom-1 left-3 h-0.5 origin-left rounded-full bg-brand motion-reduce:hidden forced-colors:hidden in-[[data-slot=toast-region]:is(:hover,:focus-within)]:[animation-play-state:paused]"
          style={{ animation: `ui-toast-countdown ${duration}ms linear forwards` }}
        />
      )}
    </ToastPart>
  );
}
