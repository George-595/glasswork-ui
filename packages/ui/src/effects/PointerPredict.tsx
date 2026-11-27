import { type ReactNode, useEffect, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { useReducedMotion } from './useReducedMotion';

/* PointerPredict — guesses which button the pointer is heading for, before it gets there.

   It reads the pointer's velocity over the last tenth of a second, casts a ray along it and
   picks the button the ray will hit (or the one nearest the ray, within a narrow cone). A
   thin line runs from the pointer to the predicted spot and a ring settles on the button, so
   the reader watches the page read their intent. Purely decorative: aria-hidden, no pointer
   events, and it never clicks, focuses or changes anything.

   Only a fine pointer that can hover (a mouse or trackpad) draws it: phones and tablets never
   see it, and under prefers-reduced-motion it is off. No React render per move: one listener,
   one animation loop that runs only while something moves, and the SVG is written directly.

   Motion: the velocity is smoothed before it is read, a new guess must hold for a few frames,
   and everything drawn rides on springs (the line's end, the ring's box, the fade), so the
   line glides between buttons instead of snapping, a first guess grows out of the pointer and
   its ring lands, and the whole thing fades as the pointer arrives. `onPredict` hears each new guess
   (null when it lets go), for a page that wants to warm something up.

   Candidates are the scope's `button` and `a[href]` elements, or `targets` (a selector), that
   are visible and enabled. */
export interface PointerPredictProps {
  children: ReactNode;
  /** Which elements may be predicted. Default `button:not(:disabled), a[href]`. */
  targets?: string;
  /** Hears each new guess; null when there is none. */
  onPredict?: (el: Element | null) => void;
  className?: string;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}
export interface Sample {
  t: number;
  x: number;
  y: number;
}

/** Slowest move that counts as heading somewhere, in px per ms. */
export const MIN_SPEED = 0.25;
/** Widest miss the ray may make, in radians (about 20 degrees). */
export const CONE = 0.35;
/** Furthest a target may be, in px. */
export const REACH = 900;
/** How much velocity history to read, in ms. */
export const WINDOW_MS = 100;

/** Velocity over the last WINDOW_MS of samples, in px per ms; null without enough to go on. */
export function velocity(samples: readonly Sample[]): { vx: number; vy: number } | null {
  const last = samples[samples.length - 1];
  if (!last) return null;
  const first = samples.find((s) => last.t - s.t <= WINDOW_MS) ?? last;
  const dt = last.t - first.t;
  if (dt < 16) return null;
  return { vx: (last.x - first.x) / dt, vy: (last.y - first.y) / dt };
}

/** Where a ray from (x, y) along (dx, dy) first meets the box, as a distance; null if never. */
export function rayHit(x: number, y: number, dx: number, dy: number, b: Box): number | null {
  let near = 0;
  let far = Number.POSITIVE_INFINITY;
  for (const [o, d, lo, hi] of [
    [x, dx, b.left, b.right],
    [y, dy, b.top, b.bottom],
  ] as const) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const a = (lo - o) / d;
    const c = (hi - o) / d;
    near = Math.max(near, Math.min(a, c));
    far = Math.min(far, Math.max(a, c));
  }
  return near <= far ? near : null;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** The best guess among `boxes` for a pointer at (x, y) moving at (vx, vy): its index and the
    spot the line should end at, or null. A box the ray hits wins over one it only passes near;
    among those, the nearest. A box the pointer is already inside is not a prediction. */
export function predict(
  x: number,
  y: number,
  vx: number,
  vy: number,
  boxes: readonly Box[],
): { index: number; x: number; y: number } | null {
  const speed = Math.hypot(vx, vy);
  if (speed < MIN_SPEED) return null;
  const dx = vx / speed;
  const dy = vy / speed;
  let best: { index: number; x: number; y: number; score: number } | null = null;
  boxes.forEach((b, index) => {
    if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) return;
    const hit = rayHit(x, y, dx, dy, b);
    let score: number;
    let ex: number;
    let ey: number;
    if (hit !== null) {
      if (hit > REACH) return;
      score = hit;
      ex = x + dx * hit;
      ey = y + dy * hit;
    } else {
      // a near miss: aim at the box's centre, if that lies inside the cone
      ex = (b.left + b.right) / 2;
      ey = (b.top + b.bottom) / 2;
      const tx = ex - x;
      const ty = ey - y;
      const dist = Math.hypot(tx, ty);
      if (dist > REACH || dist === 0) return;
      const angle = Math.acos(clamp((tx * dx + ty * dy) / dist, -1, 1));
      if (angle > CONE) return;
      // a near miss costs more than a hit at the same distance
      score = dist * (1.5 + angle / CONE);
    }
    if (!best || score < best.score) best = { index, x: ex, y: ey, score };
  });
  if (!best) return null;
  const { index, x: px, y: py } = best;
  return { index, x: px, y: py };
}

const DEFAULT_TARGETS = 'button:not(:disabled), a[href]';
const FINE = '(hover: hover) and (pointer: fine)';
/** Let go of a guess this long after the pointer stops, in ms. */
const LINGER_MS = 650;
/** A new guess must hold this many frames running before the line moves to it. */
const SWITCH_FRAMES = 3;
/** How much each frame's velocity moves the smoothed one (0 to 1). */
const VELOCITY_EASE = 0.35;
/** Padding of the ring around the button, in px. */
const PAD = 4;

/** One spring per number: semi-implicit Euler, scaled by the frame's length so a slow frame
    does not make it jump. `k` is stiffness per (16.7 ms)^2, `d` the velocity kept per frame. */
interface Spring {
  x: number;
  v: number;
}
const spring = (s: Spring, to: number, k: number, d: number, step: number) => {
  s.v = (s.v + (to - s.x) * k * step) * d ** step;
  s.x += s.v * step;
};
const springs = (...xs: number[]): Spring[] => xs.map((x) => ({ x, v: 0 }));

/** Where the ray from (x, y) along (dx, dy) aims inside the box: the hit, or failing that
    the box's point nearest the ray. */
function aimInto(x: number, y: number, dx: number, dy: number, b: Box) {
  const hit = rayHit(x, y, dx, dy, b);
  if (hit !== null) return { x: x + dx * hit, y: y + dy * hit };
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const along = Math.max(0, (cx - x) * dx + (cy - y) * dy);
  return { x: clamp(x + dx * along, b.left, b.right), y: clamp(y + dy * along, b.top, b.bottom) };
}

export function PointerPredict({
  children,
  targets = DEFAULT_TARGETS,
  onPredict,
  className,
}: PointerPredictProps) {
  const reduced = useReducedMotion();
  const [fine, setFine] = useState(false);
  const scope = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const group = useRef<SVGGElement>(null);
  const line = useRef<SVGLineElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const end = useRef<SVGCircleElement>(null);
  const halo = useRef<SVGCircleElement>(null);
  const ring = useRef<SVGRectElement>(null);
  const heard = useRef(onPredict);
  useEffect(() => {
    heard.current = onPredict;
  }, [onPredict]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mql = window.matchMedia(FINE);
    const set = () => setFine(mql.matches);
    set();
    mql.addEventListener('change', set);
    return () => mql.removeEventListener('change', set);
  }, []);

  const on = fine && !reduced;

  useEffect(() => {
    if (!on) return;
    const root = scope.current;
    if (!root) return;
    const samples: Sample[] = [];
    let pointer = { x: 0, y: 0 };
    let lastMove = 0;
    let frame = 0;
    let lastFrame = 0;
    // smoothed velocity and heading
    let sv = { vx: 0, vy: 0 };
    let heading = { dx: 1, dy: 0 };
    let current: Element | null = null;
    let pending: Element | null = null;
    let pendingFrames = 0;
    // what is drawn, each on a spring: the line's two ends, the ring, the fade, the ring's pop
    const [sx, sy, ex, ey] = springs(0, 0, 0, 0);
    const [rx, ry, rw, rh] = springs(0, 0, 0, 0);
    const [alpha, pop] = springs(0, 0);
    let dash = 0;

    const attr = (node: Element | null, attrs: Record<string, number | string>) => {
      if (!node) return;
      for (const [k, val] of Object.entries(attrs)) node.setAttribute(k, String(val));
    };

    const choose = (el: Element | null) => {
      if (el === current) return;
      const fresh = current === null;
      current = el;
      heard.current?.(el);
      if (!el || !sx || !sy || !ex || !ey || !rx || !ry || !rw || !rh || !pop) return;
      const b = el.getBoundingClientRect();
      if (fresh) {
        // a first guess grows out of the pointer, and its ring lands from a little larger
        ex.x = sx.x = pointer.x;
        ey.x = sy.x = pointer.y;
        rx.x = b.left - PAD;
        ry.x = b.top - PAD;
        rw.x = b.width + PAD * 2;
        rh.x = b.height + PAD * 2;
        for (const s of [ex, ey, rx, ry, rw, rh]) s.v = 0;
        pop.x = 1;
        pop.v = 0;
      } else {
        // a change of mind: the ring glides across with a small kick
        pop.v += 0.08;
      }
    };

    /* The buttons in view that a reader could actually press: visible, on screen, and not
       hidden under something else (a docked bar over the feed). Checked a few times a second,
       not every frame. */
    let found: Element[] = [];
    let foundAt = -1;
    const candidates = (): Element[] => {
      const t = performance.now();
      if (t - foundAt < 200) return found;
      foundAt = t;
      found = [...root.querySelectorAll(targets)].filter((el) => {
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0 || r.bottom <= 0 || r.top >= window.innerHeight) {
          return false;
        }
        const x = clamp(r.left + r.width / 2, 0, window.innerWidth - 1);
        const y = clamp(r.top + r.height / 2, 0, window.innerHeight - 1);
        const top = document.elementFromPoint(x, y);
        return top !== null && el.contains(top);
      });
      return found;
    };

    const tick = (t: number) => {
      frame = 0;
      const step = lastFrame ? Math.min(3, (t - lastFrame) / 16.7) : 1;
      lastFrame = t;
      if (!sx || !sy || !ex || !ey || !rx || !ry || !rw || !rh || !alpha || !pop) return;

      const v = velocity(samples);
      if (v) {
        const a = 1 - (1 - VELOCITY_EASE) ** step;
        sv = { vx: sv.vx + (v.vx - sv.vx) * a, vy: sv.vy + (v.vy - sv.vy) * a };
      }
      const speed = Math.hypot(sv.vx, sv.vy);
      if (speed > 0.05) heading = { dx: sv.vx / speed, dy: sv.vy / speed };
      const still = performance.now() - lastMove > LINGER_MS;

      // the guess: a new one must hold a few frames; slowing near the current one keeps it
      const els = candidates();
      const boxes = els.map((el) => el.getBoundingClientRect());
      if (still) {
        choose(null);
      } else {
        const guess = predict(pointer.x, pointer.y, sv.vx, sv.vy, boxes);
        const next = guess ? (els[guess.index] ?? null) : null;
        if (next && next !== current) {
          pendingFrames = pending === next ? pendingFrames + 1 : 1;
          pending = next;
          if (pendingFrames >= SWITCH_FRAMES || current === null) choose(next);
        } else if (next === current) {
          pending = null;
          pendingFrames = 0;
        } else if (!next && speed >= MIN_SPEED * 2) {
          // moving fast toward nothing: let go
          choose(null);
        }
        // the pointer reached the button: the guess came true, so let it settle and fade
        if (current) {
          const b = current.getBoundingClientRect();
          const inside =
            pointer.x >= b.left &&
            pointer.x <= b.right &&
            pointer.y >= b.top &&
            pointer.y <= b.bottom;
          if (inside) choose(null);
        }
      }

      // the springs: the line's start follows the pointer closely, its end and the ring glide
      spring(sx, pointer.x, 0.5, 0.45, step);
      spring(sy, pointer.y, 0.5, 0.45, step);
      if (current) {
        const b = current.getBoundingClientRect();
        const aim = aimInto(pointer.x, pointer.y, heading.dx, heading.dy, b);
        spring(ex, aim.x, 0.16, 0.7, step);
        spring(ey, aim.y, 0.16, 0.7, step);
        spring(rx, b.left - PAD, 0.14, 0.68, step);
        spring(ry, b.top - PAD, 0.14, 0.68, step);
        spring(rw, b.width + PAD * 2, 0.14, 0.68, step);
        spring(rh, b.height + PAD * 2, 0.14, 0.68, step);
      }
      spring(alpha, current ? 1 : 0, 0.12, 0.62, step);
      spring(pop, 0, 0.12, 0.6, step);
      dash = (dash - 0.25 * step) % 14;

      const o = clamp(alpha.x, 0, 1);
      const grow = 1 + pop.x * 0.12;
      const w = rw.x * grow;
      const h = rh.x * grow;
      attr(group.current, { opacity: o.toFixed(3) });
      attr(line.current, { x1: sx.x, y1: sy.x, x2: ex.x, y2: ey.x });
      attr(dot.current, { cx: sx.x, cy: sy.x });
      attr(end.current, { cx: ex.x, cy: ey.x });
      attr(halo.current, { cx: ex.x, cy: ey.x, r: 4 + 6 * o, opacity: (0.35 * o).toFixed(3) });
      attr(ring.current, {
        x: rx.x - (w - rw.x) / 2,
        y: ry.x - (h - rh.x) / 2,
        width: Math.max(0, w),
        height: Math.max(0, h),
        'stroke-dashoffset': dash.toFixed(2),
      });

      // keep animating while anything is still moving or showing
      const moving =
        o > 0.004 ||
        [sx, sy, ex, ey, rx, ry, rw, rh, pop].some((s) => Math.abs(s.v) > 0.01) ||
        !still;
      if (moving) frame = requestAnimationFrame(tick);
      else lastFrame = 0;
    };

    const wake = () => {
      if (!frame) frame = requestAnimationFrame(tick);
    };

    const move = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
      pointer = { x: e.clientX, y: e.clientY };
      lastMove = performance.now();
      samples.push({ t: e.timeStamp, x: e.clientX, y: e.clientY });
      while (samples.length > 2 && e.timeStamp - (samples[0]?.t ?? 0) > WINDOW_MS * 2) {
        samples.shift();
      }
      wake();
    };
    const away = () => {
      samples.length = 0;
      sv = { vx: 0, vy: 0 };
      choose(null);
      wake();
    };

    root.addEventListener('pointermove', move, { passive: true });
    root.addEventListener('pointerleave', away);
    root.addEventListener('pointerdown', away);
    return () => {
      root.removeEventListener('pointermove', move);
      root.removeEventListener('pointerleave', away);
      root.removeEventListener('pointerdown', away);
      cancelAnimationFrame(frame);
      if (current) heard.current?.(null);
    };
  }, [on, targets]);

  return (
    <div ref={scope} className={cn('contents', className)}>
      {children}
      {on && (
        <svg
          ref={svg}
          aria-hidden="true"
          focusable="false"
          className="pointer-events-none fixed inset-0 z-50 h-full w-full forced-colors:hidden print:hidden"
        >
          <g ref={group} opacity={0}>
            <rect
              ref={ring}
              rx={12}
              className="fill-primary/10 stroke-primary"
              strokeWidth={1.5}
              strokeDasharray="5 2"
            />
            <line ref={line} className="stroke-primary" strokeWidth={1.5} strokeLinecap="round" />
            <circle ref={halo} r={4} className="fill-primary" />
            <circle ref={dot} r={3} className="fill-primary" />
            <circle ref={end} r={3.5} className="fill-canvas stroke-primary" strokeWidth={1.5} />
          </g>
        </svg>
      )}
    </div>
  );
}
