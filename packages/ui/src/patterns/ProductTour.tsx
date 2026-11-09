import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '../components/button';
import { useReducedMotion } from '../effects/useReducedMotion';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* ProductTour — a few steps that point at the parts of a screen the first time someone opens it
   ("This is where new stock goes", "Hand out from here"). The idea is EasyUI's product tour
   (github.com/Surajmaurya1/easyui, MIT); nothing of its code is used.

   Each step dims the page except a lit cut-out around its `target` (a CSS selector, or a function
   that returns the element), scrolls the target into view, and shows a card beside it: "Step 2 of
   4", the title, a line or two, then Skip tour, Back and Next (Done on the last). A step with no
   target, or whose target is not on the page, shows the card in the middle with no cut-out, so a
   missing element never strands the tour. On a phone the card docks at the bottom of the screen,
   above any bottom bar.

   It is a modal native <dialog> over the whole screen: the page behind is inert, focus stays in
   the card, Esc skips the tour, and focus goes back where it was when it ends. Each step moves
   focus to the card's title, so a screen reader reads the step as it arrives; the dialog is named
   by the title and described by the body. Left and Right arrows go back and on. The cut-out and
   the dots are drawing (aria-hidden): the words carry everything. The card glides between steps
   and the page scrolls smoothly, both off under reduced motion.

   The parent owns whether it is open and hears how it ended: onClose('done') after the last step,
   onClose('skipped') for Skip tour or Esc. Remembering that someone has seen it is the app's job
   (a setting or local storage), not the kit's. */
export interface TourStep {
  /** What to point at: a CSS selector or a function returning the element. None: a centred card. */
  target?: string | (() => Element | null);
  title: ReactNode;
  body?: ReactNode;
}

export interface ProductTourProps {
  steps: readonly TourStep[];
  open: boolean;
  onClose: (reason: 'done' | 'skipped') => void;
  /** The step shown first when it opens. Default 0. */
  startAt?: number;
  /** Hears every step change. */
  onStepChange?: (index: number) => void;
  className?: string;
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const PAD = 6;
const GAP = 12;
const EDGE = 16;
const PHONE = 640;

function find(target: TourStep['target']): Element | null {
  if (!target) return null;
  try {
    return typeof target === 'function' ? target() : document.querySelector(target);
  } catch {
    return null;
  }
}

/** Where the card goes: below the lit box if it fits, else above, else beside the screen's middle;
    always inside the screen. Pure, so it is tested without a browser. */
export function placeCard(
  hole: Box | null,
  card: { w: number; h: number },
  view: { w: number; h: number },
): { x: number; y: number } {
  const clampX = (x: number) => Math.max(EDGE, Math.min(view.w - card.w - EDGE, x));
  const clampY = (y: number) => Math.max(EDGE, Math.min(view.h - card.h - EDGE, y));
  if (!hole) return { x: clampX((view.w - card.w) / 2), y: clampY((view.h - card.h) / 2) };
  const x = clampX(hole.x + hole.w / 2 - card.w / 2);
  const below = hole.y + hole.h + GAP;
  if (below + card.h <= view.h - EDGE) return { x, y: below };
  const above = hole.y - GAP - card.h;
  if (above >= EDGE) return { x, y: above };
  return { x, y: clampY(view.h - card.h - EDGE) };
}

/** The dimmed screen with a rounded hole over the lit box (even-odd fill: no mask, no colour). */
export function scrimPath(view: { w: number; h: number }, hole: Box | null, r = 8): string {
  const screen = `M0,0H${view.w}V${view.h}H0Z`;
  if (!hole) return screen;
  const { x, y, w, h } = hole;
  const k = Math.min(r, w / 2, h / 2);
  return `${screen}M${x + k},${y}H${x + w - k}A${k},${k} 0 0 1 ${x + w},${y + k}V${y + h - k}A${k},${k} 0 0 1 ${x + w - k},${y + h}H${x + k}A${k},${k} 0 0 1 ${x},${y + h - k}V${y + k}A${k},${k} 0 0 1 ${x + k},${y}Z`;
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function ProductTour({
  steps,
  open,
  onClose,
  startAt = 0,
  onStepChange,
  className,
}: ProductTourProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<Element | null>(null);
  const ended = useRef<'done' | 'skipped'>('skipped');
  const reduced = useReducedMotion();
  const titleId = useId();
  const bodyId = useId();
  const [index, setIndex] = useState(startAt);
  const [hole, setHole] = useState<Box | null>(null);
  const [view, setView] = useState({ w: 0, h: 0 });
  const [size, setSize] = useState({ w: 352, h: 180 });

  const last = steps.length - 1;
  const at = Math.max(0, Math.min(last, index));
  const step = steps[at];

  const goTo = useCallback(
    (next: number) => {
      setIndex(next);
      onStepChange?.(next);
    },
    [onStepChange],
  );

  // open and close the native dialog; start from `startAt` each time. A layout effect, before the
  // step's, so the dialog is open (showModal focuses its first button) before the title takes focus
  useIsoLayoutEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) {
      opener.current = document.activeElement;
      ended.current = 'skipped';
      setIndex(startAt);
      el.showModal();
      playSound('open');
    } else if (!open && el.open) {
      el.close();
    }
  }, [open, startAt]);

  // the native close (Esc, or close() above): give focus back and tell the parent
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const handle = () => {
      playSound('close');
      const back = opener.current;
      if (back instanceof HTMLElement && back.isConnected) back.focus();
      if (open) onClose(ended.current);
    };
    el.addEventListener('close', handle);
    return () => el.removeEventListener('close', handle);
  }, [open, onClose]);

  // measure the target and the screen; again on resize and scroll, at most once a frame
  const measure = useCallback(() => {
    setView({ w: window.innerWidth, h: window.innerHeight });
    const el = find(step?.target);
    if (!el) return setHole(null);
    const r = el.getBoundingClientRect();
    setHole(
      r.width || r.height
        ? { x: r.left - PAD, y: r.top - PAD, w: r.width + 2 * PAD, h: r.height + 2 * PAD }
        : null,
    );
  }, [step]);

  useIsoLayoutEffect(() => {
    if (!open) return;
    const el = find(step?.target);
    el?.scrollIntoView?.({
      block: 'center',
      inline: 'nearest',
      behavior: reduced ? 'auto' : 'smooth',
    });
    measure();
    heading.current?.focus({ preventScroll: true });
    let frame = 0;
    const soon = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    window.addEventListener('resize', soon);
    window.addEventListener('scroll', soon, { capture: true, passive: true });
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', soon);
      window.removeEventListener('scroll', soon, { capture: true });
    };
  }, [open, at, measure, reduced, step]);

  // the card's own size, for placing it
  useIsoLayoutEffect(() => {
    const el = card.current;
    if (!el || !open) return;
    const read = () => setSize({ w: el.offsetWidth, h: el.offsetHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, at]);

  const finish = (reason: 'done' | 'skipped') => {
    ended.current = reason;
    dialog.current?.close();
  };
  const next = () => (at >= last ? finish('done') : goTo(at + 1));
  const back = () => at > 0 && goTo(at - 1);

  const phone = view.w > 0 && view.w < PHONE;
  const spot = placeCard(hole, size, view);

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      aria-describedby={step?.body ? bodyId : undefined}
      className={cn(
        'ui-tour fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden border-0 bg-transparent p-0 text-fg backdrop:bg-transparent',
        className,
      )}
      onKeyDown={(e) => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.key === 'ArrowRight') {
          e.preventDefault();
          next();
        } else if (e.key === 'ArrowLeft') {
          e.preventDefault();
          back();
        }
      }}
    >
      {open && step && (
        <>
          <svg
            aria-hidden="true"
            focusable="false"
            className="ui-tour-scrim absolute inset-0 size-full"
          >
            <path d={scrimPath(view, hole)} fillRule="evenodd" className="fill-scrim" />
            {hole && (
              <rect
                x={hole.x}
                y={hole.y}
                width={hole.w}
                height={hole.h}
                rx={8}
                fill="none"
                strokeWidth={2}
                className="stroke-focus"
              />
            )}
          </svg>
          <div
            ref={card}
            className={cn(
              'ui-tour-card absolute top-0 left-0 flex w-[min(22rem,calc(100vw-32px))] flex-col gap-3 rounded-lg border border-solid border-border bg-overlay p-5 text-fg glass-chrome [box-shadow:var(--elev-3)]',
              !reduced && 'transition-transform duration-(--dur-base) ease-(--ease-out)',
              phone &&
                'top-auto right-4 bottom-[calc(var(--ui-bottom-inset,max(0px,env(safe-area-inset-bottom)_-_1rem))_+_1rem)] left-4 w-auto',
            )}
            style={phone ? undefined : { transform: `translate(${spot.x}px, ${spot.y}px)` }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px]/[1.2] font-semibold tracking-[0.06em] text-fg-muted uppercase">
                Step {at + 1} of {steps.length}
              </span>
              <span aria-hidden="true" className="flex gap-1">
                {steps.map((_, i) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: one dot per step, in order
                    key={i}
                    className={cn(
                      'size-1.5 rounded-full',
                      i === at ? 'bg-brand' : 'bg-border-strong',
                    )}
                  />
                ))}
              </span>
            </div>
            <h2
              ref={heading}
              id={titleId}
              tabIndex={-1}
              className="m-0 font-sans text-[16px] leading-[1.3] font-semibold tracking-[-0.01em] text-fg outline-none"
            >
              {step.title}
            </h2>
            {step.body && (
              <div id={bodyId} className="text-[13px] leading-normal text-fg-muted">
                {step.body}
              </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => finish('skipped')}>
                Skip tour
              </Button>
              <span className="flex-1" />
              {at > 0 && (
                <Button variant="neutral" size="sm" onClick={back}>
                  Back
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={next}>
                {at >= last ? 'Done' : 'Next'}
              </Button>
            </div>
          </div>
        </>
      )}
    </dialog>
  );
}
