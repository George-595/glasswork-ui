import { type HTMLAttributes, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { cx } from '../lib/cx';
import { useReducedMotion } from './useReducedMotion';

/* RollingNumber — a figure that arrives like an odometer.

   Every digit of the formatted value is its own little reel: a column of 0–9 that rolls up
   and settles on its digit, brightening as it lands. The reels start from the digits of
   `from` (the figure is right-aligned, so the units reel of "0" and of "12,840" are the same
   reel). The units make one full turn on the way, the higher places go straight to their
   digit, and they settle one after another from left to right, so the eye reads the figure
   from its first digit as it lands. The whole shape of the figure is there from the start:
   separators, signs and units ("£", ",", ".", "%") are not reels, and they and any place
   `from` lacks (the "1" of 12,840 when counting up from 0) fade in at once, as zeros.

   Access first (ENGINEERING.md §5, "animated counters announce their final value only"):
   - A screen reader gets one text: the final figure, from the first render. The reels are
     aria-hidden.
   - Under prefers-reduced-motion, or with `animate={false}`, the figure is plain text at once.
   - It rolls once, the first time half of it is on screen; a new `to` later rolls on from the
     figure shown. Nothing runs in a loop: the motion is a CSS transition on each reel.
   - SSR and the first client render are the settled figure (the same markup), so hydration
     matches; the reels are wound back before the first paint of a client render.

   Tuning lives in effects.css (`.ui-roll`): the easing, the reel mask and the fades. */
export interface RollingNumberProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** The figure to land on. */
  to: number;
  /** Where the reels start. Default 0. */
  from?: number;
  /** Turns a number into the text shown (and read). Default: en-GB grouping. */
  format?: (value: number) => string;
  /** Milliseconds for the units reel; the others take a little less. Default 1400. */
  duration?: number;
  /** False shows the figure at once. Default true. */
  animate?: boolean;
}

const defaultFormat = new Intl.NumberFormat('en-GB').format;

/** Each reel is two turns of 0–9: room for one full turn and the way to its digit. */
const TURNS = 2;
/** Delay between neighbouring reels settling, left to right (ms). */
const CASCADE_MS = 90;
/** Delay between neighbouring places fading in at the start (ms). */
const ARRIVE_MS = 35;

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

type Phase = 'settled' | 'wound' | 'rolling';

interface Cell {
  /** A digit 0–9 for a reel, or the character itself for a separator/sign/unit. */
  char: string;
  reel: boolean;
  /** Where the reel stands before rolling, as a step on the 0..(10 * TURNS - 1) strip. */
  start: number;
  /** Where it settles. */
  end: number;
  /** The place had no digit in `from`: it fades in while it rolls. */
  arrives: boolean;
  /** Order of settling, 0 = leftmost reel. */
  order: number;
  /** Units reel = 0, tens = 1, ... (for the spin distance). */
  place: number;
}

const isDigit = (c: string) => c >= '0' && c <= '9';

/** Lay out the reels for a roll from `fromText` to `toText`, both already formatted. */
export function planReels(fromText: string, toText: string): Cell[] {
  const fromDigits = [...fromText].filter(isDigit).reverse(); // units first
  const chars = [...toText];
  const totalReels = chars.filter(isDigit).length;
  let placeFromRight = totalReels;
  let order = 0;
  return chars.map((char) => {
    if (!isDigit(char)) {
      return { char, reel: false, start: 0, end: 0, arrives: true, order, place: -1 };
    }
    placeFromRight -= 1;
    const target = Number(char);
    const startDigit = fromDigits[placeFromRight];
    const begin = startDigit === undefined ? 0 : Number(startDigit);
    // the units make one full turn on the way, like an odometer's fast wheel; the higher
    // places roll straight to their digit, so most of the figure is readable as it moves
    let end = placeFromRight === 0 ? 10 + target : target;
    // a higher place that already shows its digit stays put; anything else rolls forward
    if (end < begin || (end === begin && placeFromRight === 0)) end += 10;
    end = Math.min(end, 10 * TURNS - 1);
    const cell: Cell = {
      char,
      reel: true,
      start: begin,
      end,
      arrives: startDigit === undefined,
      order,
      place: placeFromRight,
    };
    order += 1;
    return cell;
  });
}

export function RollingNumber({
  to,
  from = 0,
  format = defaultFormat,
  duration = 1400,
  animate = true,
  className,
  ...props
}: RollingNumberProps) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const finalText = format(to);
  const moving = animate && !reduced;

  // the figure the reels start from: `from` the first time, then whatever was last shown
  const [origin, setOrigin] = useState(() => format(from));
  const [phase, setPhase] = useState<Phase>('settled');
  // with no IntersectionObserver (an old browser, a test DOM) the figure counts as seen at once
  const [seen, setSeen] = useState(() => typeof IntersectionObserver !== 'function');
  const shown = useRef(finalText);

  // wind back before the first paint (client renders only; the server shows the settled figure)
  useIsoLayoutEffect(() => {
    if (!moving) return;
    if (shown.current !== finalText && seen) {
      // a new figure after the first roll: roll on from the one on screen
      setOrigin(shown.current);
    }
    setPhase('wound');
    // finalText: a new figure re-arms the reels; seen only matters once it is true
  }, [moving, finalText]); // eslint-disable-line react-hooks/exhaustive-deps

  // roll the first time half the figure is on screen
  useEffect(() => {
    const el = ref.current;
    if (!moving || seen || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [moving, seen]);

  // wound and visible: let the wound frame paint, then release the reels
  useEffect(() => {
    if (!moving || phase !== 'wound' || !seen) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setPhase('rolling'));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [moving, phase, seen]);

  useEffect(() => {
    if (phase === 'rolling') shown.current = finalText;
  }, [phase, finalText]);

  if (!moving) {
    return (
      <span {...props} ref={ref} className={cx('ui-roll', className)}>
        {finalText}
      </span>
    );
  }

  const cells = planReels(origin, finalText);
  const reels = cells.filter((c) => c.reel).length;

  return (
    <span {...props} ref={ref} className={cx('ui-roll', className)} data-phase={phase}>
      <span className="ui-sr-only">{finalText}</span>
      <span className="ui-roll-figure" aria-hidden="true">
        {cells.map((cell, i) => {
          // settled: every reel on its end step; wound: on its start step
          const step = phase === 'wound' ? cell.start : cell.end;
          // places fade in left to right at the start, in step with the figure's shape
          const arrive = `${Math.min(cell.order, reels) * ARRIVE_MS}ms`;
          const key = `${i}-${cell.char}`;
          if (!cell.reel) {
            return (
              <span key={key} className="ui-roll-sep" style={{ transitionDelay: arrive }}>
                {cell.char}
              </span>
            );
          }
          // the units travel furthest and take the full duration; the others a little less
          const time = Math.round(duration * (cell.place === 0 ? 1 : 0.8));
          return (
            <span
              key={key}
              className="ui-roll-reel"
              data-arrives={cell.arrives || undefined}
              style={{ transitionDelay: arrive }}
            >
              <span
                className="ui-roll-strip"
                style={{
                  transform: `translateY(${(-step * 100) / (10 * TURNS)}%)`,
                  ['--roll-time' as string]: `${time}ms`,
                  ['--roll-wait' as string]: `${cell.order * CASCADE_MS}ms`,
                }}
              >
                {STRIP}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

/** One reel's face: 0–9, TURNS times. Built once; every reel shares the same children. */
const STRIP_CELLS = Array.from({ length: 10 * TURNS }, (_, i) => ({
  id: `turn${Math.floor(i / 10)}-digit${i % 10}`,
  digit: i % 10,
}));
const STRIP = STRIP_CELLS.map((cell) => (
  <span key={cell.id} className="ui-roll-digit">
    {cell.digit}
  </span>
));
