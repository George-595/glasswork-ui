import {
  type ButtonHTMLAttributes,
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from '../icons/Icon';
import { useInsetVar } from '../lib/bottom-inset';
import { cn } from '../lib/cn';

/* The floating stack — one managed place for everything that floats over a page: back to top,
   the page's main action (a "+" button), a "jump to now" pill. Apps used to fix each of these
   to a corner on their own, and they piled on top of each other (a see-through Back to top over
   the + button). Here they are one column in the bottom-right corner:

   - Items never overlap: they are flex children of one column, first `order` at the bottom
     (nearest the thumb), then upwards. The main action is order 0, Back to top 10.
   - The column sits above every bar at the bottom of the screen (the phone's tab bar, a save
     or bulk bar: `--ui-bottom-inset`), and clear of the safe area on both axes.
   - It reports its own height as `--ui-float-inset`: toasts stack above it rather than over
     it, and the shell's <main> pads its end by it so the last row can scroll out from under it.
   - The column itself lets clicks through; only the buttons take them.
   - Inside <AppShell> it is part of the page column, so it goes inert with the rest of the page
     while the phone's navigation drawer is open.

   <AppShell> renders the stack (its `floating` prop, plus Back to top unless `backToTop` is
   false). Anywhere below it a page adds its own item with <Floating>, which portals into the
   stack and leaves when the page unmounts. An app without the shell renders <FloatingStack>
   itself, once. */

interface Host {
  el: HTMLElement | null;
  setEl: (el: HTMLElement | null) => void;
}
const HostContext = createContext<Host | undefined>(undefined);

/** Makes a floating stack reachable from everything inside it: <AppShell> wraps the whole page
    in one, so a <Floating> deep in a page finds the stack rendered beside <main>. */
export function FloatingRoot({ children }: { children: ReactNode }) {
  const [el, setEl] = useState<HTMLElement | null>(null);
  const value = useMemo(() => ({ el, setEl }), [el]);
  return <HostContext.Provider value={value}>{children}</HostContext.Provider>;
}

export interface FloatingStackProps {
  /** Items rendered in the stack directly (each a <Floating>, <Fab> or <BackToTop>). */
  children?: ReactNode;
  className?: string;
}

/** The stack itself. Render it once: <AppShell> does; an app without the shell renders it
    near its root. */
export function FloatingStack(props: FloatingStackProps) {
  const outer = useContext(HostContext);
  if (!outer)
    return (
      <FloatingRoot>
        <StackElement {...props} />
      </FloatingRoot>
    );
  return <StackElement {...props} />;
}

function StackElement({ children, className }: FloatingStackProps) {
  const ref = useRef<HTMLDivElement>(null);
  const setEl = useContext(HostContext)?.setEl;
  useEffect(() => {
    setEl?.(ref.current);
    return () => setEl?.(null);
  }, [setEl]);
  useInsetVar(ref, '--ui-float-inset');
  return (
    <div
      ref={ref}
      data-slot="floating-stack"
      className={cn(
        'ui-floating-stack pointer-events-none fixed z-40 flex flex-col-reverse items-center gap-3 md:items-end pt-3 empty:hidden',
        'right-[max(1rem,env(safe-area-inset-right))]',
        'bottom-[calc(var(--ui-bottom-inset,env(safe-area-inset-bottom,0px))_+_1rem)]',
        // nothing visible inside (every item hidden): take no room, report no height
        'has-[>*]:not-has-[>:not([hidden])]:hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface FloatingProps {
  /** Lower sits lower (nearer the thumb). The main action is 0, Back to top 10. Default 0. */
  order?: number;
  /** Hide it without unmounting it (the stack closes up). */
  hidden?: boolean;
  children: ReactNode;
}

/** An item in the nearest floating stack. Outside any stack it renders a stack of its own. */
export function Floating({ order = 0, hidden, children }: FloatingProps) {
  const host = useContext(HostContext);
  const item = (
    <div
      className="ui-floating-item pointer-events-auto flex justify-center md:justify-end"
      style={{ order }}
      hidden={hidden}
    >
      {children}
    </div>
  );
  // no stack above it: bring one
  if (host === undefined) return <FloatingStack>{item}</FloatingStack>;
  // the stack is mounting; the portal follows on the next render
  if (host.el === null) return null;
  return createPortal(item, host.el);
}

/* Shared look of every floating button: solid (never see-through over cards), raised, a 48px
   round target on a phone; from 768px a labelled pill when `extended`. */
const FLOAT_BUTTON =
  'ui-float-button inline-flex min-h-12 min-w-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-solid font-sans text-[14px] font-semibold [box-shadow:var(--elev-3)] focus-visible:outline-none focus-visible:[box-shadow:var(--ring),var(--elev-3)] motion-safe:transition-[background-color,translate,opacity] motion-safe:duration-(--dur-base) motion-safe:active:translate-y-px';

export interface FabProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The action's name ("Add car"): the button's accessible name, and its text when extended. */
  label: string;
  icon?: IconName;
  /** Show the label beside the icon from 768px (a phone always shows the icon alone). */
  extended?: boolean;
  /** primary (default): the page's one main action. secondary: a quieter one. */
  tone?: 'primary' | 'secondary';
  /** Its place in the stack (default 0, the bottom). */
  order?: number;
}

/** The page's main action, floating in the stack: a round "+" on a phone. */
export function Fab({
  label,
  icon = 'plus',
  extended = true,
  tone = 'primary',
  order = 0,
  className,
  type = 'button',
  ...props
}: FabProps) {
  return (
    <Floating order={order}>
      <button
        {...props}
        type={type}
        aria-label={label}
        className={cn(
          FLOAT_BUTTON,
          'min-h-14 min-w-14',
          tone === 'primary'
            ? 'border-transparent bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active'
            : 'border-border-strong bg-raised text-fg hover:bg-hover',
          extended && 'md:px-5',
          className,
        )}
      >
        <Icon name={icon} size={22} />
        {extended && (
          <span aria-hidden="true" className="max-md:hidden">
            {label}
          </span>
        )}
      </button>
    </Floating>
  );
}

export interface BackToTopProps {
  /** How far down (px) the page must be scrolled before it shows. Default 600. */
  threshold?: number;
  /** Default "Back to top". */
  label?: string;
  /** Its place in the stack (default 10: above the main action). */
  order?: number;
  /** Scroll this element instead of finding the page's scroller. */
  scroller?: HTMLElement | null;
}

function prefersReducedMotion() {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/* The page's scroller: the window, or (in an app that scrolls a column instead, as a home-screen
   app does to keep its bars still) the element holding <main id="main">. Found from the scroll
   events themselves, so it needs no setting. */
function isPageScroller(el: EventTarget | null): el is HTMLElement {
  if (!(el instanceof HTMLElement)) return false;
  const main = document.getElementById('main');
  return main !== null && (el === main || el.contains(main));
}

/** Back to top: appears once the page is scrolled past `threshold`, scrolls to the top and puts
    focus on <main id="main"> (so a keyboard carries on from the top too). Solid, never
    see-through; a round arrow on a phone, a labelled pill from 768px. Works whether the window
    scrolls or a column round <main> does. */
export function BackToTop({
  threshold = 600,
  label = 'Back to top',
  order = 10,
  scroller,
}: BackToTopProps) {
  const [shown, setShown] = useState(false);
  const found = useRef<HTMLElement | null>(null);
  useEffect(() => {
    let frame = 0;
    const top = () => {
      const el = scroller ?? found.current;
      return el ? el.scrollTop : window.scrollY;
    };
    const check = () => {
      frame = 0;
      setShown(top() > threshold);
    };
    const onScroll = (e: Event) => {
      if (!scroller && isPageScroller(e.target)) found.current = e.target;
      if (!frame) frame = requestAnimationFrame(check);
    };
    check();
    // capture on the window: scroll events do not bubble, so this hears the page and any column
    const target: HTMLElement | Window = scroller ?? window;
    target.addEventListener('scroll', onScroll, { passive: true, capture: !scroller });
    return () => {
      target.removeEventListener('scroll', onScroll, { capture: !scroller });
      if (frame) cancelAnimationFrame(frame);
    };
  }, [scroller, threshold]);

  const go = () => {
    const behavior: ScrollBehavior = prefersReducedMotion() ? 'auto' : 'smooth';
    const el = scroller ?? found.current;
    if (el && el.scrollTop > 0) el.scrollTo({ top: 0, behavior });
    else window.scrollTo({ top: 0, behavior });
    document.getElementById('main')?.focus({ preventScroll: true });
  };

  return (
    <Floating order={order} hidden={!shown}>
      <button
        type="button"
        onClick={go}
        aria-label={label}
        className={cn(
          FLOAT_BUTTON,
          'ui-back-to-top border-border-strong bg-raised text-fg hover:bg-hover md:px-4',
          'motion-safe:starting:translate-y-2 motion-safe:starting:opacity-0',
        )}
      >
        <Icon name="arrow-up" size={18} />
        <span aria-hidden="true" className="max-md:hidden">
          {label}
        </span>
      </button>
    </Floating>
  );
}
