import { cssVar, type Role } from '@apps/colors';
import {
  createContext,
  type HTMLAttributes,
  type Ref,
  type RefObject,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type Rgb, resolveCssColor } from '../effects/cssColor';
import { useLowPower } from '../effects/lowPower';
import { useWantsSolid } from '../effects/shaders/useShaderStage';
import { useReducedMotion } from '../effects/useReducedMotion';
import { useWebGlClaim } from '../effects/webglGuard';
import { cn } from '../lib/cn';
import { type Lighting, type PieceHandle, SeaGlassEngine } from './engine';
import { rememberedVerdict, rememberVerdict, type SeaGlassVerdict } from './perf';

/* SeaGlassStage — the paper that SeaGlass pieces lie on, and the one WebGL canvas that draws
   them as frosted, sunlit glass pebbles (adapted from Blueemi/sea-glass-demo, MIT).

     <SeaGlassStage>
       <SeaGlass tint="aqua" shape="pill">…</SeaGlass>
     </SeaGlassStage>

   The canvas sits behind the content (aria-hidden, no pointer events); the pieces are ordinary
   elements whose boxes it reads, so text, focus and screen readers never touch the canvas.

   What it shows, in order of precedence:
     flat   every piece paints its flat role fill (`seaglass-0..6`) with a soft shadow, and no
            GPU is used: reduced transparency or forced colours, no usable WebGL, a colour role
            that cannot be read, another stage holding the page's WebGL context, the stage off
            screen, or the lag monitor finding the device far too slow;
     still  one drawn frame, redrawn only when the layout changes: reduced motion, a low-power
            device (a phone: effects/lowPower.ts, which skips the 5 s lag probe because it
            would only make the first five seconds of a page the slowest), or the lag
            monitor finding the device too slow to animate (perf.ts);
     live   springs, hover lift, press, the pointer nudging the sun, a pulsing glow.
   `mode` forces one (the kit page's switch); reduced transparency and reduced motion still win.

   One WebGL context per page (ENGINEERING.md §5): the stage claims the shared guard while on
   screen, so the glass skin's AnimatedBackground waits on its static gradient meanwhile. */
export type SeaGlassMode = 'auto' | 'live' | 'still' | 'flat';
export type SeaGlassView = 'live' | 'still' | 'flat';
export type SeaGlassReason =
  | 'starting'
  | 'smooth'
  | 'lagged'
  | 'too-slow'
  | 'remembered'
  | 'low-power'
  | 'reduced-motion'
  | 'reduced-transparency'
  | 'no-webgl'
  | 'waiting'
  | 'forced';

export interface SeaGlassStageProps extends HTMLAttributes<HTMLElement> {
  /** The stage's element. Default 'div'. */
  as?: 'div' | 'main' | 'section';
  /** Draw the paper. Default true. False: the canvas is transparent and shadows are a veil,
      so the pieces can sit on any surface. */
  paper?: boolean;
  /** Default 'auto' (the lag monitor decides). */
  mode?: SeaGlassMode;
  /** 'panel': a rounded, padded frame of paper inside a page. 'bare' (default): no frame,
      for a layout that sizes the stage itself (AuthLayout, Composer). */
  variant?: 'panel' | 'bare';
  /** Light from straight above and plain (not wobbling) edges, so the pieces and their shadows
      are the same on the left as on the right: use it wherever a layout is centred (a phone's
      Home). Default false (a low sun in the upper left, which throws the shadows to the right). */
  symmetric?: boolean;
  /** What is showing and why, whenever it changes. */
  onViewChange?: (view: SeaGlassView, reason: SeaGlassReason) => void;
}

interface StageContext {
  register: (handle: PieceHandle) => () => void;
  /** The canvas is drawing the pieces (they paint nothing themselves). */
  painting: boolean;
  invalidate: () => void;
}

const SeaGlassContext = createContext<StageContext | null>(null);

export function useSeaGlassStage(): StageContext | null {
  return useContext(SeaGlassContext);
}

const LIGHT_ROLES: readonly Role[] = [
  'seaglass-paper',
  'seaglass-sun',
  'seaglass-sky',
  'seaglass-0',
  'seaglass-1',
  'seaglass-2',
  'seaglass-3',
  'seaglass-4',
  'seaglass-5',
  'seaglass-6',
];

const luminance = (c: Rgb) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** The roles as numbers for the shader, or null when one cannot be read (rule 31). */
function readLighting(host: Element): Lighting | null {
  const values: Rgb[] = [];
  for (const role of LIGHT_ROLES) {
    const rgb = resolveCssColor(cssVar(role), host);
    if (!rgb) return null;
    values.push(rgb);
  }
  const [paper, sun, sky, ...tints] = values;
  if (!paper || !sun || !sky) return null;
  return { paper, sun, sky, tints, dark: luminance(paper) < 0.2 };
}

function useOnScreen(ref: RefObject<HTMLElement | null>): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver(
      (entries) => {
        const last = entries[entries.length - 1];
        if (last) setOn(last.isIntersecting);
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref]);
  return on;
}

function byDocumentOrder(a: PieceHandle, b: PieceHandle): number {
  if (a.el === b.el) return 0;
  return (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 ? -1 : 1;
}

export function SeaGlassStage({
  as: Tag = 'div',
  paper = true,
  mode = 'auto',
  variant = 'bare',
  symmetric = false,
  onViewChange,
  className,
  children,
  ...props
}: SeaGlassStageProps) {
  const rootRef = useRef<HTMLElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<SeaGlassEngine | null>(null);
  const handles = useRef(new Set<PieceHandle>());
  const reduced = useReducedMotion();
  const solid = useWantsSolid();
  const lowPower = useLowPower();
  const onScreen = useOnScreen(rootRef);
  const [remembered] = useState(() => rememberedVerdict());
  const [verdict, setVerdict] = useState<SeaGlassVerdict | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [piecesVersion, setPiecesVersion] = useState(0);

  // what should show, and why
  let target: SeaGlassView;
  let reason: SeaGlassReason;
  if (solid) [target, reason] = ['flat', 'reduced-transparency'];
  else if (failed) [target, reason] = ['flat', 'no-webgl'];
  else if (mode !== 'auto') {
    target = mode === 'live' && reduced ? 'still' : mode;
    reason = mode === 'live' && reduced ? 'reduced-motion' : 'forced';
    // a slow device keeps the glass, drawn once and held still (it costs nothing after that
    // frame); only no WebGL or reduced transparency ever gets the flat panels
  } else if (verdict === 'flat') [target, reason] = ['still', 'too-slow'];
  else if (remembered === 'flat' && verdict === null) [target, reason] = ['still', 'remembered'];
  else if (reduced) [target, reason] = ['still', 'reduced-motion'];
  else if (verdict === 'still') [target, reason] = ['still', 'lagged'];
  else if (remembered === 'still' && verdict === null) [target, reason] = ['still', 'remembered'];
  else if (lowPower) [target, reason] = ['still', 'low-power'];
  else [target, reason] = ['live', verdict === 'live' ? 'smooth' : 'starting'];

  const owner = useWebGlClaim('stage', target !== 'flat' && onScreen);
  const drawing = owner && target !== 'flat';
  const painting = drawing && ready;
  const view: SeaGlassView = painting ? target : 'flat';
  const shownReason: SeaGlassReason = target !== 'flat' && !painting ? 'waiting' : reason;
  const auto = mode === 'auto';
  const engineMode: 'live' | 'still' = target === 'still' ? 'still' : 'live';
  const modeRef = useRef(engineMode);
  // before the engine effect below reads it
  useLayoutEffect(() => {
    modeRef.current = engineMode;
  }, [engineMode]);

  useEffect(() => {
    onViewChange?.(view, shownReason);
  }, [view, shownReason, onViewChange]);

  const ordered = useCallback(() => [...handles.current].sort(byDocumentOrder), []);

  const register = useCallback((handle: PieceHandle) => {
    handles.current.add(handle);
    setPiecesVersion((v) => v + 1);
    return () => {
      handles.current.delete(handle);
      setPiecesVersion((v) => v + 1);
    };
  }, []);

  const invalidate = useCallback(() => engineRef.current?.invalidate(), []);

  // the engine: a fresh canvas each time (a released context cannot be reused)
  useEffect(() => {
    const slot = slotRef.current;
    if (!drawing || !slot) return;
    const lighting = readLighting(slot);
    if (!lighting) {
      setFailed(true);
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.className = 'ui-seaglass-canvas absolute inset-0 size-full';
    slot.append(canvas);
    const engine = SeaGlassEngine.create(canvas, slot, {
      clear: !paper,
      mode: modeRef.current,
      intro: modeRef.current === 'live',
      symmetric,
      onReady: () => setReady(true),
      onLost: () => setFailed(true),
      onVerdict: auto
        ? (v) => {
            setVerdict(v);
            if (v !== 'live') rememberVerdict(v);
          }
        : undefined,
    });
    if (!engine) {
      canvas.remove();
      setFailed(true);
      return;
    }
    engineRef.current = engine;
    engine.setLighting(lighting);
    engine.setPieces(ordered());

    // a theme or skin switch: read the roles again
    const relight = () => {
      const next = readLighting(slot);
      if (next) engine.setLighting(next);
    };
    const mo = new MutationObserver(relight);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-skin', 'class', 'style'],
    });
    const scheme =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    scheme?.addEventListener('change', relight);

    return () => {
      mo.disconnect();
      scheme?.removeEventListener('change', relight);
      engine.destroy();
      canvas.remove();
      engineRef.current = null;
      setReady(false);
    };
  }, [drawing, paper, auto, symmetric, ordered]);

  useEffect(() => {
    engineRef.current?.setMode(engineMode);
  }, [engineMode]);

  // the set of pieces changed
  useEffect(() => {
    void piecesVersion;
    engineRef.current?.setPieces(ordered());
  }, [piecesVersion, ordered]);

  // a still frame follows the layout: any change inside the stage draws it again
  // biome-ignore lint/correctness/useExhaustiveDependencies: observe the current pieces again whenever the set changes
  useEffect(() => {
    const root = rootRef.current;
    if (!drawing || !root) return;
    let raf = 0;
    const later = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        engineRef.current?.invalidate();
      });
    };
    const mo = new MutationObserver(later);
    mo.observe(root, { childList: true, subtree: true, characterData: true, attributes: true });
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(later);
      for (const h of handles.current) ro.observe(h.el);
    }
    root.addEventListener('transitionend', later);
    return () => {
      cancelAnimationFrame(raf);
      mo.disconnect();
      ro?.disconnect();
      root.removeEventListener('transitionend', later);
    };
  }, [drawing, piecesVersion]);

  const value = useMemo(
    () => ({ register, painting, invalidate }),
    [register, painting, invalidate],
  );

  return (
    <SeaGlassContext.Provider value={value}>
      <Tag
        {...props}
        ref={rootRef as Ref<HTMLDivElement>}
        className={cn(
          'ui-seaglass relative isolate',
          paper && 'bg-seaglass-paper text-fg',
          variant === 'panel' &&
            'overflow-hidden rounded-[24px] border border-solid border-border-subtle p-5 sm:p-8',
          className,
        )}
        data-view={view}
        data-symmetric={symmetric || undefined}
      >
        <div
          ref={slotRef}
          aria-hidden="true"
          className="ui-seaglass-slot pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
        />
        {children}
      </Tag>
    </SeaGlassContext.Provider>
  );
}
