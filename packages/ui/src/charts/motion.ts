import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../effects/useReducedMotion';

/* Motion for the hand-drawn charts: an entrance (0 to 1 once, after mount) and a tween (a list
   of numbers easing to new values), both on requestAnimationFrame. Under prefers-reduced-motion,
   on the server and during hydration they jump straight to the end, so the static chart is
   always what is rendered first and what a reader who opted out sees. */
export const easeOut = (t: number) => 1 - (1 - t) ** 3;

/** 0 to 1 over `ms` after mount (and again when `replay` changes). 1 at once without motion. */
export function useEntrance(ms = 700, replay: unknown = 0) {
  const reduced = useReducedMotion();
  const [p, setP] = useState(1);
  // biome-ignore lint/correctness/useExhaustiveDependencies: `replay` restarts the entrance on purpose
  useEffect(() => {
    if (reduced) return;
    let raf = 0;
    let start = -1;
    const step = (now: number) => {
      if (start < 0) start = now;
      const t = Math.min(1, (now - start) / ms);
      setP(easeOut(t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [ms, reduced, replay]);
  return reduced ? 1 : p;
}

/** `target` eased over `ms` whenever it changes; the values as they are now. */
export function useTweened(target: readonly number[], ms = 420): readonly number[] {
  const reduced = useReducedMotion();
  const [value, setValue] = useState<readonly number[]>(target);
  const current = useRef<readonly number[]>(target);
  const key = target.join(',');
  useEffect(() => {
    const to = key.split(',').map(Number);
    const from = current.current;
    const jump = reduced || from.length !== to.length;
    let raf = 0;
    let start = -1;
    const step = (now: number) => {
      if (start < 0) start = now;
      const t = jump ? 1 : easeOut(Math.min(1, (now - start) / ms));
      const next = to.map((v, i) => (from[i] ?? v) + (v - (from[i] ?? v)) * t);
      current.current = next;
      setValue(next);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [key, ms, reduced]);
  return value;
}

/** aria-hidden for decoration inside a drawing whose list items take focus. Spread, not written
    inline: the linter takes every layer beside a focusable item for a focusable one. */
export const HIDDEN = { 'aria-hidden': true } as const;

/** Keys that move a roving focus through a flat list: the index to go to, or null. */
export function rovingIndex(key: string, i: number, count: number): number | null {
  if (count === 0) return null;
  if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(count - 1, i + 1);
  if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(0, i - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return null;
}
