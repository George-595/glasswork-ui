import { Dialog as DialogPrimitive } from 'radix-ui';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { prefersTouch } from '../lib/touch';
import { playSound } from '../sound';
import { Button } from './button';

/* Sheet — a panel that slides in from an edge, for detail drawers and forms
   that should not leave the page. Radix Dialog underneath, so it is a real
   modal: focus is trapped inside, Esc and the Close button dismiss it, the
   page behind is hidden from assistive tech, and focus returns to whatever
   opened it. The title and the description are both required, because a
   dialog without a name or a purpose is unusable by ear; pass `hideDescription`
   to keep the description for screen readers only.

   On a touch screen nothing inside takes focus when it opens: the sheet itself does. A
   field that grabs focus raises the keyboard, and the keyboard covers the footer's buttons
   (the Take out button of a scan-out sheet); the person taps the field they want. With a
   mouse or keyboard the first control is focused, as Radix does.

   It slides on a transform only and the slide stops under
   prefers-reduced-motion. Glass: the panel is the raised glass material (the one
   backdrop blur, glass-chrome) over a scrim that only dims, so an open sheet costs one
   blur pass rather than two full-screen ones. Solid under reduced transparency, and on a
   low-power device (glass.css: <html data-power="low">). */
export type SheetSide = 'right' | 'left' | 'bottom';

export interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description: ReactNode;
  /** Keep the description for screen readers only. */
  hideDescription?: boolean;
  side?: SheetSide;
  children?: ReactNode;
  /** Action row under the body. */
  footer?: ReactNode;
  /** `end` (default) right-aligns the footer's buttons; `stretch` makes each fill an equal share
      of the row, full width for one (a phone sheet's thumb-reach actions). */
  footerLayout?: 'end' | 'stretch';
  /** Keep the footer in view at the bottom of the sheet while the body scrolls. */
  stickyFooter?: boolean;
  /** Where focus goes on close when what opened the sheet is gone (the row it was opened from
      was removed): a heading or status line near it, never <body>. */
  fallbackFocus?: () => HTMLElement | null | undefined;
  className?: string;
}

const SIDE: Record<SheetSide, string> = {
  right: 'inset-y-0 right-0 h-full w-[min(26rem,100vw)] border-l',
  left: 'inset-y-0 left-0 h-full w-[min(26rem,100vw)] border-r',
  bottom: 'inset-x-0 bottom-0 max-h-[85vh] w-full rounded-t-lg border-t',
};

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  hideDescription,
  side = 'right',
  children,
  footer,
  footerLayout = 'end',
  stickyFooter = false,
  fallbackFocus,
  className,
}: SheetProps) {
  // Radix returns focus to a Trigger; a Sheet is opened from anywhere, so it
  // remembers whatever had focus when it opened and gives it back on close
  const opener = useRef<Element | null>(null);
  // the panel mounts a render after `open` (Radix's Portal): the ref is for the focus handler,
  // which runs as it mounts; the state is what the footer effect waits for
  const content = useRef<HTMLDivElement | null>(null);
  const [panel, setPanel] = useState<HTMLDivElement | null>(null);
  const setContent = useCallback((el: HTMLDivElement | null) => {
    content.current = el;
    setPanel(el);
  }, []);
  // the open and close sounds: on a change of `open`, never on first mount
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open !== wasOpen.current) playSound(open ? 'open' : 'close');
    wasOpen.current = open;
  }, [open]);
  // a sticky footer covers the bottom of the scroll box: keep a focused control clear of it
  useEffect(() => {
    const el = panel;
    const bar = el?.querySelector<HTMLElement>('.ui-sheet-footer');
    if (!el || !bar || !stickyFooter) return;
    const measure = () => el.style.setProperty('--ui-sheet-footer-h', `${bar.offsetHeight}px`);
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, [panel, stickyFooter]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-sheet-overlay fixed inset-0 z-50 bg-scrim motion-safe:data-[state=closed]:animate-[ui-fade-out_var(--dur-base)_var(--ease-in)] motion-safe:data-[state=open]:animate-[ui-fade-in_var(--dur-base)_var(--ease-out)]" />
        <DialogPrimitive.Content
          ref={setContent}
          data-side={side}
          onOpenAutoFocus={(e) => {
            opener.current = document.activeElement;
            if (prefersTouch()) {
              // no keyboard: the sheet takes focus (named by its title), not its first field
              e.preventDefault();
              content.current?.focus({ preventScroll: true });
            }
          }}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            const back = opener.current;
            if (back instanceof HTMLElement && back.isConnected) back.focus();
            else fallbackFocus?.()?.focus({ preventScroll: false });
          }}
          className={cn(
            'ui-sheet fixed z-50 box-border flex flex-col gap-4 overflow-y-auto border-solid border-border bg-overlay p-6 text-fg glass-chrome',
            '[box-shadow:var(--elev-3)] focus-visible:outline-none',
            'scroll-pb-[calc(var(--ui-sheet-footer-h,0px)+8px)]',
            'motion-safe:data-[state=closed]:animate-(--ui-sheet-out) motion-safe:data-[state=open]:animate-(--ui-sheet-in)',
            SIDE[side],
            className,
          )}
          style={{
            ['--ui-sheet-in' as string]: `ui-sheet-in-${side} var(--dur-slow) var(--ease-out)`,
            ['--ui-sheet-out' as string]: `ui-sheet-out-${side} var(--dur-base) var(--ease-in)`,
          }}
        >
          <div className="ui-sheet-header flex flex-col gap-1.5 pr-8">
            <DialogPrimitive.Title className="ui-sheet-title m-0 font-sans text-[16px] leading-[1.3] font-semibold tracking-[-0.01em] text-fg">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Description
              className={cn(
                'ui-sheet-description m-0 text-[13px] leading-normal text-fg-subtle',
                hideDescription && 'ui-sr-only',
              )}
            >
              {description}
            </DialogPrimitive.Description>
          </div>
          <div className="ui-sheet-body min-h-0 flex-1">{children}</div>
          {footer && (
            <div
              className={cn(
                'ui-sheet-footer flex gap-2',
                footerLayout === 'stretch' ? '[&>*]:min-w-0 [&>*]:flex-1' : 'justify-end',
                stickyFooter &&
                  'sticky bottom-0 z-10 -mx-6 border-t border-solid border-border bg-overlay px-6 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]',
              )}
            >
              {footer}
            </div>
          )}
          <DialogPrimitive.Close asChild>
            <Button
              variant="ghost"
              size="icon"
              className="ui-sheet-close absolute top-3.5 right-3.5 pointer-coarse:top-2 pointer-coarse:right-2"
              aria-label="Close"
            >
              <Icon name="x" size={15} />
            </Button>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
