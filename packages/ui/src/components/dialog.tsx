import { type ReactNode, useEffect, useId, useRef } from 'react';
import { useLiquidGlass } from '../glass/LiquidGlass';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { prefersTouch } from '../lib/touch';
import { playSound } from '../sound';
import { Button } from './button';
import { useMergedRef } from './useMergedRef';

/* Dialog — shadcn's dialog look on the native <dialog> element (Radix's is
   not needed). showModal() gives the focus trap, Esc to close and an inert
   page for free; we add the title/description wiring, a labelled close
   button, closing on a scrim click, and returning focus to the opener.
   On a touch screen showModal() must not focus the first field (it would raise the keyboard
   over the dialog's buttons): the title takes focus instead (a screen reader reads it) and
   the person taps the field they want. With a mouse or keyboard the browser's choice (the
   first control) stands.
   In the glass skin the panel is Liquid Glass over a blurred scrim.

   Controlled: the parent owns `open` and hears every close through onClose
   (Esc, the close button, a scrim click). */
export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  /** Action row, right-aligned under the body. */
  footer?: ReactNode;
  className?: string;
  /** Close on a click outside the panel. Default true. */
  closeOnScrimClick?: boolean;
  /** False while the dialog must stay open (a request in flight): Esc, the scrim and
      the close button do nothing. Default true. */
  dismissible?: boolean;
}

/** The action row under a dialog's body; PromptDialog's form uses it too. */
export const dialogFooterClasses = 'ui-dialog-footer mt-4 flex flex-wrap justify-end gap-2';

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  className,
  closeOnScrimClick = true,
  dismissible = true,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const glass = useLiquidGlass<HTMLDialogElement>({ fill: 'raised', band: 16, refraction: 40 });
  const setRef = useMergedRef<HTMLDialogElement>(ref, glass.ref);
  const opener = useRef<Element | null>(null);
  // whether the parent still thinks it is open: a close it asked for itself
  // (open -> false) must not call onClose a second time
  const wantOpen = useRef(open);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const titleId = useId();
  const descId = useId();

  // the open and close sounds: on a change of `open`, never on first mount
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open !== wasOpen.current) playSound(open ? 'open' : 'close');
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // set before close(): its close event is dispatched later, as a task
    wantOpen.current = open;
    if (open && !el.open) {
      opener.current = document.activeElement;
      const touch = prefersTouch();
      const heading = titleRef.current;
      // showModal() focuses the first descendant with `autofocus`, else the first control:
      // on a touch screen the title is the one with it, so a field never is
      if (touch && heading) {
        heading.tabIndex = -1;
        heading.setAttribute('autofocus', '');
      }
      el.showModal();
      if (touch && heading) {
        heading.removeAttribute('autofocus');
        // a browser that ignores autofocus here still put focus on the first field: move it
        if (document.activeElement !== heading) heading.focus({ preventScroll: true });
      }
    } else if (!open && el.open) {
      el.close();
    }
  }, [open]);

  // the native close event covers Esc and form[method=dialog]; tell the parent
  // and put focus back where it was
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handle = () => {
      const back = opener.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus();
      if (wantOpen.current) onClose();
    };
    el.addEventListener('close', handle);
    return () => el.removeEventListener('close', handle);
  }, [onClose]);

  // Esc fires `cancel` before `close`: cancelling it keeps a non-dismissible dialog open
  useEffect(() => {
    const el = ref.current;
    if (!el || dismissible) return;
    const handle = (e: Event) => e.preventDefault();
    el.addEventListener('cancel', handle);
    return () => el.removeEventListener('cancel', handle);
  }, [dismissible]);

  // a click on the <dialog> box outside its padding box is the scrim. A
  // pointer-only convenience: keyboard users have Esc and the Close button.
  useEffect(() => {
    const el = ref.current;
    if (!el || !closeOnScrimClick || !dismissible) return;
    const handle = (e: MouseEvent) => {
      if (e.target !== el) return;
      const r = el.getBoundingClientRect();
      const inside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) el.close();
    };
    el.addEventListener('click', handle);
    return () => el.removeEventListener('click', handle);
  }, [closeOnScrimClick, dismissible]);

  return (
    <dialog
      ref={setRef}
      data-lg={glass.props['data-lg']}
      style={glass.props.style}
      className={cn(
        glass.props.className,
        'ui-dialog m-auto box-border max-h-[calc(100dvh-32px)] w-[min(32rem,calc(100vw-32px))] p-6',
        'rounded-lg border border-solid border-border bg-overlay text-fg glass-chrome',
        '[box-shadow:var(--elev-3)]',
        'backdrop:bg-scrim',
        'motion-safe:open:animate-[ui-dialog-in_var(--dur-slow)_var(--ease-out)]',
        className,
      )}
      aria-labelledby={titleId}
      aria-describedby={description ? descId : undefined}
    >
      {glass.layers}
      <div className="ui-dialog-header mb-4 flex flex-col gap-1.5 pr-8">
        <h2
          ref={titleRef}
          id={titleId}
          className="ui-dialog-title m-0 outline-none font-sans text-[16px] leading-[1.3] font-semibold tracking-[-0.01em] text-fg"
        >
          {title}
        </h2>
        {description && (
          <p
            id={descId}
            className="ui-dialog-description m-0 text-[13px] leading-normal text-fg-subtle"
          >
            {description}
          </p>
        )}
      </div>
      {children}
      {footer && <div className={dialogFooterClasses}>{footer}</div>}
      <Button
        variant="ghost"
        size="icon"
        className="ui-dialog-close absolute top-3.5 right-3.5 pointer-coarse:top-2 pointer-coarse:right-2"
        aria-label="Close"
        disabled={!dismissible}
        onClick={() => ref.current?.close()}
      >
        <Icon name="x" size={15} />
      </Button>
    </dialog>
  );
}
