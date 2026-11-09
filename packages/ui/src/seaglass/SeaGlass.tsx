import {
  type ButtonHTMLAttributes,
  forwardRef,
  type HTMLAttributes,
  type Ref,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useMergedRef } from '../components/useMergedRef';
import { cn } from '../lib/cn';
import type { PieceState } from './engine';
import { useSeaGlassStage } from './SeaGlassStage';

/* SeaGlass — one piece of sea glass on a SeaGlassStage. It is an ordinary element (a div, or a
   real button when it acts); the stage's canvas draws the frosted pebble under it. A piece
   inside another piece rests on it (a selected tab on its bar, a button on its card).

   Text on a piece is `fg` or `fg-muted`: the gate measures both on every tint. Without a
   painting stage (no GPU, the lag fallback's flat mode, reduced transparency, or no stage at
   all) the piece paints its own flat fill: the tint's role, a soft shadow and a hairline. */
export type SeaGlassTint =
  | 'clear'
  | 'coral'
  | 'orchid'
  | 'periwinkle'
  | 'aqua'
  | 'seafoam'
  | 'amber';
export type SeaGlassShape = 'pill' | 'tile' | 'card' | 'circle' | 'square';
export type SeaGlassPad = 'none' | 'sm' | 'md' | 'lg';
export type SeaGlassThickness = 'thin' | 'regular' | 'thick';

const TINT_INDEX: Record<SeaGlassTint, number> = {
  clear: 0,
  coral: 1,
  orchid: 2,
  periwinkle: 3,
  aqua: 4,
  seafoam: 5,
  amber: 6,
};

// written out so Tailwind sees every class
const FILL: Record<SeaGlassTint, string> = {
  clear: 'bg-seaglass-0',
  coral: 'bg-seaglass-1',
  orchid: 'bg-seaglass-2',
  periwinkle: 'bg-seaglass-3',
  aqua: 'bg-seaglass-4',
  seafoam: 'bg-seaglass-5',
  amber: 'bg-seaglass-6',
};

const SHAPE: Record<SeaGlassShape, string> = {
  pill: 'rounded-full',
  tile: 'rounded-[20px]',
  card: 'rounded-[28px]',
  circle: 'aspect-square rounded-full justify-center',
  square: 'aspect-square rounded-[20px] justify-center',
};

const JUSTIFY = { start: 'justify-start', center: 'justify-center', between: 'justify-between' };

const PAD: Record<SeaGlassPad, string> = {
  none: '',
  sm: 'px-3 py-1.5',
  md: 'px-4 py-2.5',
  lg: 'p-6',
};

const CIRCLE: Record<SeaGlassPad, string> = {
  none: '',
  sm: 'size-10',
  md: 'size-12',
  lg: 'size-16',
};

const HEIGHT: Record<SeaGlassThickness, number> = { thin: 0.32, regular: 0.8, thick: 0.95 };

const FALLBACK_STATE: PieceState = {
  tint: 0,
  nested: false,
  height: HEIGHT.regular,
  rest: 0.4,
  wobble: 3.2,
  density: 1,
  frost: 0.9,
  pulse: false,
  glow: 0,
};

interface CommonProps {
  /** The glass colour. Default 'clear'. */
  tint?: SeaGlassTint;
  /** Default 'tile' (pill for a bar, card for a panel, circle or square for an icon button). */
  shape?: SeaGlassShape;
  /** Inner padding. Default 'md'. */
  pad?: SeaGlassPad;
  /** How tall the pebble rises. Default 'regular' ('thin' when it rests on another piece). */
  thickness?: SeaGlassThickness;
  /** A pulsing glow, for work in progress (a thinking composer). */
  pulse?: boolean;
  /** A steady glow, for a piece that is on. */
  lit?: boolean;
  /** No glass: the element keeps its shape and padding but draws nothing (an unselected tab
      in a bar, beside the selected one that is glass). */
  bare?: boolean;
  /** Take the free space in a row (flex: 1). */
  grow?: boolean;
  /** Fill the width of its container. */
  block?: boolean;
  /** How the contents sit along the row. Default 'start' ('center' for circle and square). */
  justify?: keyof typeof JUSTIFY;
}

export type SeaGlassProps = CommonProps &
  (
    | ({ as?: 'div' | 'span' | 'li' } & HTMLAttributes<HTMLElement>)
    | ({ as: 'button' } & ButtonHTMLAttributes<HTMLButtonElement>)
  );

export const SeaGlass = forwardRef<HTMLElement, SeaGlassProps>(function SeaGlass(
  {
    as: Tag = 'div',
    tint = 'clear',
    shape = 'tile',
    pad = 'md',
    thickness,
    pulse = false,
    lit = false,
    bare = false,
    grow = false,
    block = false,
    justify,
    className,
    children,
    ...props
  },
  ref,
) {
  const stage = useSeaGlassStage();
  const el = useRef<HTMLElement>(null);
  const merged = useMergedRef(el, ref);
  const [isNested, setNested] = useState(false);
  const state = useRef<PieceState | null>(null);

  // the props the engine reads every frame
  const next: PieceState = {
    tint: TINT_INDEX[tint],
    nested: isNested,
    height: HEIGHT[thickness ?? (isNested ? 'thin' : 'regular')],
    rest: isNested ? 0.8 : 0.4,
    wobble: isNested ? 0.9 : shape === 'circle' ? 2.4 : shape === 'card' ? 4.4 : 3.2,
    density: isNested ? 0.75 : 1,
    frost: isNested ? 1.05 : 0.9,
    pulse,
    glow: lit ? 0.14 : 0,
  };
  useLayoutEffect(() => {
    state.current = next;
  });

  const register = stage?.register;
  useLayoutEffect(() => {
    const node = el.current;
    if (!node || !register || bare) return;
    const inside = node.parentElement?.closest('[data-seaglass]') != null;
    setNested(inside);
    return register({
      el: node,
      read: () => state.current ?? { ...FALLBACK_STATE, nested: inside },
    });
  }, [register, bare]);

  const invalidate = stage?.invalidate;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the engine reads the props from state each frame; a prop change asks a still frame to redraw
  useEffect(() => {
    invalidate?.();
  }, [invalidate, tint, shape, pad, thickness, pulse, lit, bare]);

  const painting = stage?.painting ?? false;
  const Element = Tag as 'div';
  return (
    <Element
      {...(props as HTMLAttributes<HTMLDivElement>)}
      ref={merged as Ref<HTMLDivElement>}
      data-seaglass={bare ? undefined : tint}
      className={cn(
        'ui-seaglass-piece relative flex min-w-0 items-center gap-2 text-fg',
        'transition-[background-color,box-shadow,border-color] duration-300 ease-out',
        'border border-solid',
        SHAPE[shape],
        shape === 'circle' || shape === 'square' ? CIRCLE[pad] : PAD[pad],
        justify && JUSTIFY[justify],
        grow && 'flex-1',
        block && 'w-full',
        Tag === 'button' && 'text-start',
        painting || bare
          ? 'border-transparent bg-transparent'
          : cn(FILL[tint], 'border-border-subtle [box-shadow:var(--elev-1)]'),
        Tag === 'button' &&
          'cursor-pointer font-[inherit] focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] disabled:cursor-not-allowed',
        className,
      )}
    >
      {children}
    </Element>
  );
});
