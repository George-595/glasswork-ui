import { type ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn';

/* Screensaver — a quiet layer over an always-on screen after a time without input: a clock, a
   status line, nothing that needs a press.

   - It shows after `idleMs` with no pointer, key, wheel or touch. Esc hides it. The first touch,
     click or key only wakes the screen: that event, and the rest of the same press, is swallowed
     before it reaches anything, so the tap that wakes the screen never presses what was under it.
     The press lasts as long as the finger, button or key is down (a held Space or a long press is
     still the wake-up); after the release a 600 ms window swallows the click the browser sends
     late, and ends at the first click or key-up. A hard cap of 5 s means a lost pointer-up can
     never block input for good. Focus goes back to what had it only once the press is over.
   - Shown, it is a full-screen `role="dialog" aria-modal` named "Screensaver", drawn over the
     `scrim` role (`dim="low"`) or the stronger `scrim-strong` (`dim="medium"`, the default); its
     content is `fg` on a solid chip so it stays readable over whatever is dimmed. The rest of the
     page is `inert` while it is up, focus moves to the layer and goes back when it hides.
   - `suspend` hides it and keeps it from running while true (an alert takes the screen back);
     when it turns false the idle time starts again. `active={false}` never shows it.
   - `shift` moves the content a few pixels every minute so nothing burns in: a jump between a
     few fixed places, also under reduced motion (a position change is not an animation).
   - The idle timer, the shift timer and every listener are cleared on unmount. */
export interface ScreensaverProps {
  /** Milliseconds without input before it shows. */
  idleMs: number;
  /** False never shows it. Default true. */
  active?: boolean;
  /** What it shows: a clock, a status line. */
  children: ReactNode;
  /** True hides it and holds it off (an alert takes the screen back). */
  suspend?: boolean;
  onShow?: () => void;
  onHide?: () => void;
  /** Move the content a few px every minute so nothing burns in. */
  shift?: boolean;
  dim?: 'low' | 'medium';
}

// input that means "someone is here" while it is not shown (passive: never delays a scroll)
const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const;
// the events that start a press: while shown the first one wakes the screen
const WAKING: ReadonlySet<string> = new Set(['pointerdown', 'mousedown', 'touchstart', 'keydown']);
// the rest of a press, swallowed with it so nothing under the layer sees any of it
const FOLLOW: ReadonlySet<string> = new Set([
  'pointerup',
  'pointercancel',
  'mouseup',
  'touchend',
  'touchcancel',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'keyup',
  'keypress',
]);
// what the late compatibility events of a touch press look like after the release
const AFTER_RELEASE: ReadonlySet<string> = new Set([...FOLLOW, 'mousedown', 'touchstart']);
const SWALLOWED = [...new Set([...WAKING, ...FOLLOW])];
const WINDOW_MS = 600;
const CAP_MS = 5000;

const swallow = (e: Event) => {
  e.stopImmediatePropagation();
  if (e.cancelable) e.preventDefault();
};

interface Controller {
  show: () => void;
  hide: () => void;
  /** Hide without waking: it was switched off (suspend, active=false). */
  forceHide: () => void;
  /** Put focus back, once the press that woke the screen is over. */
  deferFocus: (el: HTMLElement | null) => void;
  destroy: () => void;
}

/* The swallow of the waking press lives here, outside the idle effect, so a prop change
   (suspend flipping because an alert arrived) in the middle of a press cannot drop it. */
function createController(deps: {
  shownRef: { current: boolean };
  setShown: (shown: boolean) => void;
  callbacks: { current: { onShow?: () => void; onHide?: () => void } };
  arm: () => void;
}): Controller {
  const { shownRef, setShown, callbacks } = deps;
  let phase: 'idle' | 'down' | 'window' = 'idle';
  const held = new Set<string>();
  let windowTimer: ReturnType<typeof setTimeout> | undefined;
  let capTimer: ReturnType<typeof setTimeout> | undefined;
  let attached = false;
  let focusAfter: HTMLElement | null = null;

  const restoreFocus = () => {
    const el = focusAfter;
    focusAfter = null;
    if (el?.isConnected) el.focus({ preventScroll: true });
  };
  const sync = () => {
    const want = shownRef.current || phase !== 'idle';
    if (want === attached) return;
    attached = want;
    for (const t of SWALLOWED) {
      if (want) document.addEventListener(t, onEvent, { capture: true, passive: false });
      else document.removeEventListener(t, onEvent, { capture: true });
    }
  };
  const end = () => {
    clearTimeout(windowTimer);
    clearTimeout(capTimer);
    held.clear();
    phase = 'idle';
    sync();
    restoreFocus();
  };
  const hide = () => {
    if (!shownRef.current) return;
    shownRef.current = false;
    setShown(false);
    callbacks.current.onHide?.();
  };
  const track = (e: Event, wake: boolean) => {
    const t = e.type;
    if (t === 'pointerdown') held.add(`p${(e as PointerEvent).pointerId}`);
    else if (t === 'keydown') held.add(`k${(e as KeyboardEvent).key}`);
    else if (wake && t === 'mousedown') held.add('mouse');
    else if (wake && t === 'touchstart') held.add('touch');
  };
  const release = (e: Event) => {
    const t = e.type;
    if (t === 'pointerup' || t === 'pointercancel')
      held.delete(`p${(e as PointerEvent).pointerId}`);
    else if (t === 'mouseup') held.delete('mouse');
    else if (t === 'touchend' || t === 'touchcancel') held.delete('touch');
    else if (t === 'keyup') held.delete(`k${(e as KeyboardEvent).key}`);
    else return;
    if (held.size > 0) return;
    // the last finger, button or key is up: a key has nothing more to send, a pointer has its click
    if (t === 'keyup') end();
    else {
      phase = 'window';
      clearTimeout(windowTimer);
      windowTimer = setTimeout(end, WINDOW_MS);
    }
  };

  function onEvent(e: Event) {
    const t = e.type;
    if (shownRef.current) {
      if (t === 'click') {
        // a click with no press before it (voice control, a switch, a screen reader)
        swallow(e);
        hide();
        end();
        deps.arm();
      } else if (WAKING.has(t)) {
        swallow(e);
        hide();
        phase = 'down';
        track(e, true);
        clearTimeout(capTimer);
        capTimer = setTimeout(end, CAP_MS);
        sync();
        deps.arm();
      } else if (FOLLOW.has(t)) swallow(e);
      return;
    }
    if (phase === 'down') {
      if (WAKING.has(t) || FOLLOW.has(t)) {
        swallow(e);
        track(e, false);
        release(e);
      }
    } else if (phase === 'window') {
      if (t === 'pointerdown' || t === 'keydown')
        end(); // a new press, its own
      else if (AFTER_RELEASE.has(t)) {
        swallow(e);
        if (t === 'click') end();
      }
    }
  }

  return {
    show() {
      if (shownRef.current) return;
      shownRef.current = true;
      setShown(true);
      callbacks.current.onShow?.();
      sync();
    },
    hide() {
      hide();
    },
    forceHide() {
      hide();
      sync();
    },
    deferFocus(el) {
      focusAfter = el;
      if (phase === 'idle') restoreFocus();
    },
    destroy() {
      clearTimeout(windowTimer);
      clearTimeout(capTimer);
      phase = 'idle';
      held.clear();
      attached = true;
      shownRef.current = false;
      sync();
    },
  };
}

const SHIFT_MS = 60_000;
// where the content sits, in px from the centre; stepped through once a minute
const SHIFTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [10, -6],
  [-8, 8],
  [6, 12],
  [-12, -8],
];

export function Screensaver({
  idleMs,
  active = true,
  children,
  suspend = false,
  onShow,
  onHide,
  shift = false,
  dim = 'medium',
}: ScreensaverProps) {
  const [shown, setShown] = useState(false);
  const [step, setStep] = useState(0);
  const layer = useRef<HTMLDivElement>(null);
  const shownRef = useRef(false);
  const armRef = useRef<(() => void) | null>(null);
  const callbacks = useRef({ onShow, onHide });
  const ctl = useRef<Controller | null>(null);
  const enabled = active && !suspend;
  // switched off means gone this very render, not a commit later
  const visible = shown && enabled;
  // the latest callbacks, for the listeners below (set after each render, read when an event comes)
  useEffect(() => {
    callbacks.current = { onShow, onHide };
  });

  // the press swallower: mounted once, independent of every prop
  useEffect(() => {
    const c = createController({
      shownRef,
      setShown,
      callbacks,
      arm: () => armRef.current?.(),
    });
    ctl.current = c;
    return () => {
      c.destroy();
      ctl.current = null;
    };
  }, []);

  // the idle clock and the passive activity listeners
  useEffect(() => {
    if (!enabled) {
      ctl.current?.forceHide();
      return;
    }
    let idle: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(idle);
      idle = setTimeout(() => ctl.current?.show(), idleMs);
    };
    armRef.current = arm;
    const onActivity = (e: Event) => {
      if (shownRef.current) {
        // a wheel wakes the layer but is not swallowed (it may scroll the page behind)
        if (e.type === 'wheel') {
          ctl.current?.hide();
          arm();
        }
        return;
      }
      arm();
    };
    for (const t of ACTIVITY)
      document.addEventListener(t, onActivity, { capture: true, passive: true });
    arm();
    return () => {
      clearTimeout(idle);
      armRef.current = null;
      for (const t of ACTIVITY) document.removeEventListener(t, onActivity, { capture: true });
    };
  }, [enabled, idleMs]);

  // while shown: the page behind is inert, focus is on the layer, and it moves a little each minute
  useEffect(() => {
    if (!visible) return;
    const node = layer.current;
    // read the focus before inert can take it away
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const marked: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (el === node || el.contains(node) || el.hasAttribute('inert')) continue;
      el.setAttribute('inert', '');
      marked.push(el);
    }
    node?.focus({ preventScroll: true });
    return () => {
      for (const el of marked) el.removeAttribute('inert');
      if (ctl.current) ctl.current.deferFocus(before);
      else if (before?.isConnected) before.focus({ preventScroll: true });
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !shift) return;
    const timer = setInterval(() => setStep((s) => (s + 1) % SHIFTS.length), SHIFT_MS);
    return () => clearInterval(timer);
  }, [visible, shift]);

  if (!visible || typeof document === 'undefined') return null;
  const [dx, dy] = SHIFTS[shift ? step : 0] ?? [0, 0];
  return createPortal(
    <div
      ref={layer}
      role="dialog"
      aria-modal="true"
      aria-label="Screensaver"
      tabIndex={-1}
      data-dim={dim}
      className={cn(
        'ui-screensaver fixed inset-0 z-100 grid place-items-center outline-none',
        dim === 'low' ? 'bg-scrim' : 'bg-scrim-strong',
      )}
    >
      <div
        data-slot="content"
        style={{ transform: `translate(${dx}px, ${dy}px)` }}
        className="max-w-[90vw] rounded-xl border border-solid border-border bg-surface-solid px-8 py-6 text-center text-fg forced-colors:border-[CanvasText]"
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
