import { useEffect, useRef, useState } from 'react';
import { seedOf, sketchUnderline } from '../charts/sketch';
import { useReducedMotion } from '../effects/useReducedMotion';
import { cn } from '../lib/cn';

/* Scribble — a hand-drawn underline in the brand colour, put under a heading. A pen draws it
   in when it first shows, then it boils gently (three takes, redrawn a few times a second)
   while on screen. Decorative: aria-hidden. Reduced motion gets it drawn and still. */
export interface ScribbleProps {
  /** How wide, in px. Default 220. */
  width?: number;
  className?: string;
}

const TAKES = 3;
const H = 14;

export function Scribble({ width = 220, className }: ScribbleProps) {
  const reduced = useReducedMotion();
  const el = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState(false);
  const [take, setTake] = useState(0);
  const [on, setOn] = useState(false);

  useEffect(() => {
    const node = el.current;
    if (reduced || !node || typeof IntersectionObserver !== 'function') return;
    const io = new IntersectionObserver((entries) => {
      const seen = entries.some((e) => e.isIntersecting);
      setOn(seen);
      if (seen) setDrawn(true);
    });
    io.observe(node);
    return () => io.disconnect();
  }, [reduced]);

  useEffect(() => {
    if (reduced || !drawn || !on) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') setTake((t) => (t + 1) % TAKES);
    }, 190);
    return () => window.clearInterval(id);
  }, [reduced, drawn, on]);

  return (
    <svg
      ref={el}
      aria-hidden="true"
      width={width}
      height={H}
      viewBox={`0 0 ${width} ${H}`}
      className={cn('ui-scribble block max-w-full overflow-visible', className)}
    >
      <path
        d={sketchUnderline(width, H, seedOf('scribble', take))}
        pathLength={1}
        fill="none"
        strokeLinecap="round"
        className="stroke-brand stroke-[3]"
        style={
          reduced
            ? undefined
            : {
                strokeDasharray: 1,
                strokeDashoffset: drawn ? 0 : 1,
                transition: 'stroke-dashoffset 900ms cubic-bezier(.6,0,.3,1) 250ms',
              }
        }
      />
    </svg>
  );
}
