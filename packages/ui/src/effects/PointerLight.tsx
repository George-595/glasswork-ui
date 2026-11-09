import { type HTMLAttributes, type PointerEvent, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { useReducedMotion } from './useReducedMotion';

/* PointerLight — light that answers the pointer, for cards and tiles.

   Three layers, all decorative (aria-hidden, no pointer events), drawn over the content's
   background and under nothing interactive:
   - glow: a soft pool of the `spotlight` role under the pointer;
   - rim: the card's edge catches the `glare` role nearest the pointer, as if the light
     grazed it; the rest of the edge stays as it was;
   - sheen: one diagonal band of `glare` crosses the card when the pointer arrives. Once per
     arrival, never while it moves, never in a loop.

   How it stays cheap: no canvas, no loop. A pointer move writes two CSS custom properties,
   at most once per frame; the layers are gradients that follow them. Only a fine pointer
   (mouse, pen) lights it, so a phone never pays for it. Under prefers-reduced-motion it does
   nothing (data-motion="off"; effects.css also hides the layers), and in forced colours the
   layers are hidden too.

   `surface` gives it the card surface, the same recipe as Card's (ENGINEERING.md §14 rule 53:
   an effect that needs a surface says so with a prop). Colours are the `spotlight` and `glare` roles; pass another
   role with `glowColor` / `rimColor` (as `var(--role)`). */
export interface PointerLightProps extends HTMLAttributes<HTMLDivElement> {
  /** Paint the card surface (fill, border, radius, elevation). */
  surface?: boolean;
  /** The pool of light under the pointer. Default true. */
  glow?: boolean;
  /** The edge catching the light. Default true. */
  rim?: boolean;
  /** The band that crosses on arrival. Default true. */
  sheen?: boolean;
  /** Radius of the glow in px. Default 240. */
  radius?: number;
  /** Role for the glow, e.g. `var(--spotlight)`. */
  glowColor?: string;
  /** Role for the rim and the sheen, e.g. `var(--glare)`. */
  rimColor?: string;
}

/** Card's surface: fill, border, radius and elevation, from the roles. */
const SURFACE =
  'ui-card rounded-lg border border-solid border-border bg-surface text-fg [box-shadow:var(--elev-card)]';

export function PointerLight({
  surface = false,
  glow = true,
  rim = true,
  sheen = true,
  radius = 240,
  glowColor,
  rimColor,
  className,
  style,
  children,
  onPointerEnter,
  onPointerMove,
  onPointerLeave,
  ...props
}: PointerLightProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const at = useRef({ x: 0, y: 0 });
  // each arrival replays the sheen: a new key restarts its one-shot animation
  const [arrival, setArrival] = useState(0);
  const [lit, setLit] = useState(false);

  const fine = (e: PointerEvent) => e.pointerType === 'mouse' || e.pointerType === 'pen';

  const place = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    at.current = { x: e.clientX - box.left, y: e.clientY - box.top };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      el.style.setProperty('--pl-x', `${at.current.x}px`);
      el.style.setProperty('--pl-y', `${at.current.y}px`);
    });
  };

  const handlers = reduced
    ? { onPointerEnter, onPointerMove, onPointerLeave }
    : {
        onPointerEnter: (e: PointerEvent<HTMLDivElement>) => {
          onPointerEnter?.(e);
          if (!fine(e)) return;
          place(e);
          setLit(true);
          if (sheen) setArrival((n) => n + 1);
        },
        onPointerMove: (e: PointerEvent<HTMLDivElement>) => {
          onPointerMove?.(e);
          if (fine(e)) place(e);
        },
        onPointerLeave: (e: PointerEvent<HTMLDivElement>) => {
          onPointerLeave?.(e);
          setLit(false);
        },
      };

  return (
    <div
      {...props}
      {...handlers}
      ref={ref}
      data-motion={reduced ? 'off' : undefined}
      data-lit={lit || undefined}
      className={cn('ui-pl', surface && SURFACE, className)}
      style={{
        ...style,
        ['--pl-r' as string]: `${radius}px`,
        ...(glowColor ? { ['--pl-glow' as string]: glowColor } : null),
        ...(rimColor ? { ['--pl-rim' as string]: rimColor } : null),
      }}
    >
      {!reduced && glow && <span aria-hidden="true" className="ui-pl-glow" />}
      {!reduced && rim && <span aria-hidden="true" className="ui-pl-rim" />}
      {!reduced && sheen && arrival > 0 && (
        <span aria-hidden="true" className="ui-pl-sheen" key={arrival} />
      )}
      {children}
    </div>
  );
}
