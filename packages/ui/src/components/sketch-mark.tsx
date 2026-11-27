import { useCallback, useEffect, useId, useState } from 'react';
import { useReducedMotion } from '../effects/useReducedMotion';
import { cn } from '../lib/cn';

/* SketchMark — a small hand-drawn logo mark, for a brand beside an app's name. The caller gives
   the strokes (path data in a 100 x 100 box) and, optionally, one filled accent shape. A pen
   draws the strokes in when the mark first shows, the accent pops in after, and then the line
   "boils": the paper grain under the pen changes a few times a second, the way hand-drawn
   animation redraws each frame. Hovering the mark draws it again. Strokes take the text colour
   (currentColor), the accent the brand role. Decorative: aria-hidden. Reduced motion gets the
   finished drawing, still. */
export interface SketchMarkStroke {
  /** Path data in a 100 x 100 box. */
  d: string;
  /** Stroke width in box units. Default 7. */
  width?: number;
  /** A lighter second pass of the pen: drawn thinner and fainter. */
  faint?: boolean;
}

export interface SketchMarkProps {
  strokes: readonly SketchMarkStroke[];
  /** One filled shape in the brand colour (path data in the same box), shown once drawn. */
  accent?: string;
  /** Rendered size in px. Default 20. */
  size?: number;
  className?: string;
}

const TAKES = 3;
const BOIL_MS = 190;
const DRAW_MS = 900;

export function SketchMark({ strokes, accent, size = 20, className }: SketchMarkProps) {
  const reduced = useReducedMotion();
  const filter = `sketch-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const [drawn, setDrawn] = useState(false);
  const [take, setTake] = useState(0);

  // The pen draws it in two frames after a blank has painted: once on mount, again on hover.
  const penDown = useCallback(
    () => window.requestAnimationFrame(() => window.requestAnimationFrame(() => setDrawn(true))),
    [],
  );
  const redraw = useCallback(() => {
    setDrawn(false);
    penDown();
  }, [penDown]);

  useEffect(() => {
    if (reduced) return;
    const id = penDown();
    return () => window.cancelAnimationFrame(id);
  }, [reduced, penDown]);

  useEffect(() => {
    if (reduced) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setTake((t) => (t + 1) % TAKES);
    }, BOIL_MS);
    return () => window.clearInterval(id);
  }, [reduced]);

  const still = reduced || drawn;
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn('ui-sketch-mark block shrink-0 overflow-visible', className)}
      onMouseEnter={reduced ? undefined : redraw}
    >
      <defs>
        <filter id={filter} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.09" numOctaves={2} seed={7 + take} />
          <feDisplacementMap in="SourceGraphic" scale={4} />
        </filter>
      </defs>
      <g
        filter={`url(#${filter})`}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {strokes.map((s, i) => (
          <path
            // biome-ignore lint/suspicious/noArrayIndexKey: the strokes are a fixed drawing
            key={i}
            d={s.d}
            pathLength={1}
            strokeWidth={s.width ?? 7}
            opacity={s.faint ? 0.55 : undefined}
            style={
              reduced
                ? undefined
                : {
                    strokeDasharray: 1,
                    strokeDashoffset: still ? 0 : 1,
                    transition: drawn
                      ? `stroke-dashoffset ${DRAW_MS}ms cubic-bezier(.6,0,.3,1) ${i * 180}ms`
                      : 'none',
                  }
            }
          />
        ))}
      </g>
      {accent ? (
        <path
          d={accent}
          className="fill-brand"
          style={
            reduced
              ? undefined
              : {
                  opacity: still ? 1 : 0,
                  transformBox: 'fill-box',
                  transformOrigin: 'center',
                  transform: still ? 'scale(1)' : 'scale(.4)',
                  transition: drawn
                    ? `opacity 250ms ease-out ${DRAW_MS}ms, transform 350ms cubic-bezier(.3,1.6,.5,1) ${DRAW_MS}ms`
                    : 'none',
                }
          }
        />
      ) : null}
    </svg>
  );
}
