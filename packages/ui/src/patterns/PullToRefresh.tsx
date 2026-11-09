import {
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Button } from '../components/button';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* PullToRefresh — drag a list down from its top to fetch it again, as phone apps do. The idea is
   EasyUI's pull to refresh (github.com/Surajmaurya1/easyui, MIT); nothing of its code is used.

   How it feels: at the top of the page a finger that drags down pulls the content after it (at
   half speed, so it resists), a pill above it says "Pull to refresh" and its arrow turns; past
   `threshold` it says "Release to refresh", and letting go calls `onRefresh`. The content waits,
   held a little lower, with "Refreshing…" until the promise settles, then slides back. Only a
   touch that starts with the page scrolled to the top pulls: anywhere else the finger scrolls.
   While it is mounted the page's own overscroll is contained, so a phone browser's built-in pull
   to reload does not fire as well.

   Cost: the drag writes one transform on two elements (no React render per move, no animation
   loop), and the listeners are passive, so scrolling is never held up.

   Access: a drag is a gesture not everyone can make, and a keyboard cannot make it at all (WCAG
   2.5.1, 2.1.1), so there is a real Refresh button too. `button="always"` (default) shows it;
   `"focus"` keeps it out of sight until it is tabbed to, for a page that already shows its own
   refresh control; `false` leaves it out for the same reason. The pill is aria-hidden; a polite
   status line says "Refreshing…" and then "Updated" (or "Couldn't refresh"). Under reduced
   motion nothing slides and the arrow does not spin. */
export interface PullToRefreshProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Fetch again. While its promise is pending the content waits under "Refreshing…". */
  onRefresh: () => unknown;
  children: ReactNode;
  /** How far (px, after the resistance) to pull before letting go refreshes. Default 64. */
  threshold?: number;
  disabled?: boolean;
  /** The Refresh button: shown, shown only on keyboard focus, or left out. Default "always". */
  button?: 'always' | 'focus' | false;
  /** The button's words ("Refresh stock"). Default "Refresh". */
  label?: string;
  /** Said when it has finished. Default "Updated". */
  doneMessage?: string;
  /** Said when `onRefresh` rejects. Default "Couldn't refresh". */
  failedMessage?: string;
}

type Phase = 'idle' | 'pulling' | 'armed' | 'refreshing';

const RESIST = 0.5;
const HOLD = 52; // where the content waits while refreshing
const MAX_PULL = 128;

/** The pull after resistance for a finger that has moved `dy` px down, capped. */
export function pullDistance(dy: number): number {
  return dy <= 0 ? 0 : Math.min(MAX_PULL, dy * RESIST);
}

function scrollTopOf(el: HTMLElement | null): number {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (/(auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight)
      return node.scrollTop;
  }
  return window.scrollY || document.documentElement.scrollTop || 0;
}

export function PullToRefresh({
  onRefresh,
  children,
  threshold = 64,
  disabled,
  button = 'always',
  label = 'Refresh',
  doneMessage = 'Updated',
  failedMessage = "Couldn't refresh",
  className,
  ...props
}: PullToRefreshProps) {
  const root = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLSpanElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [message, setMessage] = useState('');
  const phaseRef = useRef<Phase>('idle');
  const go = useCallback((next: Phase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // one place that moves things: the content, the pill and the arrow's turn
  const place = useCallback(
    (d: number, animate: boolean) => {
      const c = content.current;
      const p = pill.current;
      const a = arrow.current;
      const t = animate ? 'transform var(--dur-base) var(--ease-out)' : 'none';
      if (c) {
        c.style.transition = t;
        c.style.transform = d > 0 ? `translateY(${d}px)` : '';
      }
      if (p) {
        p.style.transition = animate ? `${t}, opacity var(--dur-base) var(--ease-out)` : 'none';
        p.style.transform = `translateY(${d - 44}px)`;
        p.style.opacity = String(Math.min(1, d / threshold));
      }
      if (a) a.style.transform = `rotate(${Math.min(1, d / threshold) * 270}deg)`;
    },
    [threshold],
  );

  const refresh = useCallback(async () => {
    if (phaseRef.current === 'refreshing') return;
    go('refreshing');
    setMessage('Refreshing…');
    place(HOLD, true);
    try {
      await onRefresh();
      setMessage(doneMessage);
    } catch {
      setMessage(failedMessage);
    } finally {
      go('idle');
      place(0, true);
    }
  }, [doneMessage, failedMessage, go, onRefresh, place]);

  // the gesture: passive touch listeners on the root
  useEffect(() => {
    const el = root.current;
    if (!el || disabled) return;
    let startY: number | null = null;
    let d = 0;
    const onStart = (e: TouchEvent) => {
      if (phaseRef.current === 'refreshing' || e.touches.length !== 1) return;
      startY = scrollTopOf(el) <= 0 ? (e.touches[0]?.clientY ?? null) : null;
      d = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (startY === null) return;
      const y = e.touches[0]?.clientY ?? startY;
      d = pullDistance(y - startY);
      if (d <= 0 && phaseRef.current === 'idle') return;
      place(d, false);
      const next = d >= threshold ? 'armed' : 'pulling';
      if (phaseRef.current !== next) go(next);
    };
    const onEnd = () => {
      if (startY === null) return;
      startY = null;
      if (phaseRef.current === 'armed') void refresh();
      else {
        if (phaseRef.current === 'pulling') go('idle');
        place(0, true);
      }
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: true });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    // the browser's own pull-to-reload would fire too
    const html = document.documentElement;
    const before = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = 'contain';
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
      html.style.overscrollBehaviorY = before;
    };
  }, [disabled, go, place, refresh, threshold]);

  const pillText =
    phase === 'refreshing'
      ? 'Refreshing…'
      : phase === 'armed'
        ? 'Release to refresh'
        : 'Pull to refresh';

  return (
    <div
      {...props}
      ref={root}
      className={cn('ui-ptr relative flex min-w-0 flex-col', className)}
      data-phase={phase}
    >
      <span role="status" className="ui-sr-only">
        {message}
      </span>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] flex h-0 justify-center overflow-visible"
      >
        <div
          ref={pill}
          className="ui-ptr-pill flex h-9 items-center gap-2 rounded-full border border-solid border-border bg-raised px-3.5 text-[13px] font-medium text-fg-muted opacity-0 [box-shadow:var(--elev-2)] motion-reduce:!transition-none"
        >
          <span
            ref={arrow}
            className={cn(
              'inline-flex text-fg motion-reduce:!transform-none',
              phase === 'refreshing' && 'motion-safe:animate-spin',
            )}
          >
            <Icon name="rotate-ccw" size={16} />
          </span>
          {pillText}
        </div>
      </div>
      {button !== false && (
        <div
          className={cn(
            'ui-ptr-button flex justify-end',
            button === 'focus' &&
              'ui-sr-only focus-within:not-sr-only focus-within:static focus-within:flex',
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            aria-disabled={phase === 'refreshing' || disabled ? true : undefined}
            disabled={disabled}
          >
            <Icon name="rotate-ccw" size={14} />
            {label}
          </Button>
        </div>
      )}
      <div ref={content} className="ui-ptr-content min-w-0 motion-reduce:!transition-none">
        {children}
      </div>
    </div>
  );
}
