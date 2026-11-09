/* Adapted from Arc's hold-to-confirm (MIT, Elia Kuratli); see THIRD_PARTY_NOTICES.md. The
   hold-and-fill idea, rebuilt without a motion library: a CSS transition on our tokens, a
   timer for the commit, and a two-press keyboard alternative. */
import { useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../../icons/Icon';
import { cn } from '../../lib/cn';
import { Button, type ButtonLevel } from '../button';
import { Glyph } from './glyph';

/* HoldToConfirm — a button that commits only after it is held, for an action that is hard to
   undo and whose consequence is already on screen. (Prefer ConfirmDialog when people need to
   read what will happen first.) A stray tap does nothing.

   Ways to confirm, each a full alternative to the others (WCAG 2.1.1, 2.5.1):
   - pointer: press and hold for `duration` (default 1.2 s); a fill grows across the button
     while it is held and drains if you let go;
   - keyboard: hold Space or Enter for the same time, or press it twice within four seconds
     (the first press arms it and the label says "Press again to confirm");
   - assistive tech that activates a button without key or pointer events (`click` with no
     pointer): the same two presses.
   Under reduced motion the fill does not animate; the label still changes to "Keep holding…"
   so the hold is never silent. The hold is also announced from a polite status line. The
   button is `danger` by default, `onConfirm` fires once, and the button then shows
   `confirmedLabel` until `confirmed` is set back to false. */
export interface HoldToConfirmProps {
  /** The action: "Hold to delete user". */
  label: string;
  /** Shown while held. */
  holdingLabel?: string;
  /** Shown once confirmed. */
  confirmedLabel?: string;
  onConfirm: () => void;
  /** Hold time in ms. */
  duration?: number;
  variant?: ButtonLevel;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  /** Controls the done state; omit to let the button keep its own. */
  confirmed?: boolean;
  className?: string;
}

const ARM_MS = 4000;

/* The fill is the level's own pressed role, so text keeps its contrast and the skin follows. */
const FILL: Record<ButtonLevel, string> = {
  primary: 'bg-primary-active',
  secondary: 'bg-secondary-active',
  neutral: 'bg-neutral-active',
  outline: 'bg-outline-active',
  ghost: 'bg-ghost-active',
  link: 'bg-ghost-active',
  danger: 'bg-danger-solid-active',
  success: 'bg-success-solid-active',
};

export function HoldToConfirm({
  label,
  holdingLabel = 'Keep holding…',
  confirmedLabel = 'Done',
  onConfirm,
  duration = 1200,
  variant = 'danger',
  size = 'md',
  disabled,
  confirmed,
  className,
}: HoldToConfirmProps) {
  const [own, setOwn] = useState(false);
  const done = confirmed ?? own;
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const hintId = useId();
  const hold = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const arm = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const source = useRef<'pointer' | 'key' | null>(null);
  const keyUpAt = useRef(0);
  const seconds = (duration / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 });

  useEffect(
    () => () => {
      clearTimeout(hold.current);
      clearTimeout(arm.current);
    },
    [],
  );

  const finish = () => {
    clearTimeout(hold.current);
    clearTimeout(arm.current);
    source.current = null;
    setHolding(false);
    setArmed(false);
    setOwn(true);
    onConfirm();
  };
  const begin = (from: 'pointer' | 'key') => {
    if (done || disabled || source.current) return;
    source.current = from;
    setHolding(true);
    hold.current = setTimeout(finish, duration);
  };
  // letting go early: a keyboard tap arms (or, when armed, confirms); a pointer tap does nothing
  const release = (tap: boolean) => {
    if (!source.current) return;
    const from = source.current;
    clearTimeout(hold.current);
    source.current = null;
    setHolding(false);
    if (tap && from === 'key') tapped();
  };
  const tapped = () => {
    if (done || disabled) return;
    if (armed) {
      finish();
      return;
    }
    setArmed(true);
    clearTimeout(arm.current);
    arm.current = setTimeout(() => setArmed(false), ARM_MS);
  };

  const text = done
    ? confirmedLabel
    : holding
      ? holdingLabel
      : armed
        ? 'Press again to confirm'
        : label;
  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={cn(
          'ui-hold-to-confirm relative overflow-hidden select-none touch-none',
          className,
        )}
        disabled={disabled}
        aria-disabled={done || undefined}
        aria-describedby={done ? undefined : hintId}
        data-state={done ? 'done' : holding ? 'holding' : armed ? 'armed' : 'idle'}
        onPointerDown={(e) => {
          if (e.button > 0) return;
          begin('pointer');
        }}
        onPointerUp={() => release(false)}
        onPointerCancel={() => release(false)}
        onPointerLeave={() => release(false)}
        onBlur={() => release(false)}
        onContextMenu={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key !== ' ' && e.key !== 'Enter') return;
          e.preventDefault();
          if (!e.repeat) begin('key');
        }}
        onKeyUp={(e) => {
          if (e.key !== ' ' && e.key !== 'Enter') return;
          e.preventDefault();
          keyUpAt.current = Date.now();
          release(true);
        }}
        // a click with no pointer or key behind it: a screen reader activating the button
        onClick={(e) => {
          // a browser may still click after the key was handled above
          if (e.detail === 0 && !source.current && Date.now() - keyUpAt.current > 150) tapped();
        }}
      >
        <span
          aria-hidden="true"
          data-fill
          className="pointer-events-none absolute inset-0 motion-reduce:hidden"
        >
          <span
            className={cn(
              'block h-full w-full origin-left ease-linear motion-safe:transition-transform',
              FILL[variant],
            )}
            style={{
              transform: holding || done ? 'scaleX(1)' : 'scaleX(0)',
              transitionDuration: holding ? `${duration}ms` : done ? '0ms' : '180ms',
            }}
          />
        </span>
        <span className="relative inline-flex items-center gap-1.5">
          {done ? <Icon name="check" size={14} /> : <Glyph name="trash" size={14} />}
          {text}
        </span>
      </Button>
      <span id={hintId} className="sr-only">
        {`Press and hold for ${seconds} seconds to confirm. With a keyboard, hold Space or Enter, or press it twice.`}
      </span>
      <span role="status" className="sr-only">
        {done ? confirmedLabel : holding ? holdingLabel : armed ? 'Press again to confirm' : ''}
      </span>
    </>
  );
}
