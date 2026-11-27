import { type HTMLAttributes, type MouseEvent, type ReactNode, useId } from 'react';
import { TextShimmer } from '../ai/TextShimmer';
import { buttonAttrs } from '../components/button';
import { IconCircle } from '../components/icon-circle';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { playSound } from '../sound';
import { StatusDot, type StatusTone } from './StatusDot';

/* ControlTile — the tile a dashboard is made of: one card that is a toggle, an opener or a
   readout, with an optional corner button.

   The main target is a <button aria-pressed> (toggle), an <a> or <button> (open), and sits
   over the whole tile through a stretched ::after, as KpiTile's link does. The corner button
   is a sibling above it, never nested, and is its own tab stop. The target is named
   "label, context" and described by the status and state words, which stay visible text.
   A pressed toggle uses the one selected look (`bg-selected`, `border-brand`) plus a heavier
   label and the status words. States are words, not only a colour or a spinner:
   - pending: `stateText` shimmers (still under reduced motion); the tile stays pressable, a
     newer press supersedes;
   - failed: `stateText` in the danger role with the alert glyph (the app decides when it
     ends);
   - unavailable: the target is aria-disabled (still focusable) and `stateText` is its
     description.
   A toggle plays toggle-on / toggle-off when pressed. The surface is the role fill and rim, with
   no backdrop filter (a tile scrolls). Sizes: sm 120, md 160 and lg 200px wide at least; the
   target is 48px with a finger and 64px tall at lg. */
export type ControlTileSize = 'sm' | 'md' | 'lg';
export type ControlTileState = 'idle' | 'pending' | 'failed' | 'unavailable';
export type ControlTileTone = 'neutral' | 'active' | 'success' | 'warning' | 'danger';
export type ControlTileAction =
  | { kind: 'toggle'; pressed: boolean; onPressedChange: (next: boolean) => void }
  | { kind: 'open'; href: string }
  | { kind: 'open'; onOpen: () => void }
  | { kind: 'none' };

export interface ControlTileProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'title' | 'children'> {
  label: string;
  /** A second line, also in the accessible name: 'Kitchen'. */
  context?: string;
  icon: IconName;
  /** The state line: 'On · 70 %'. Plain text, part of the target's description. */
  status: string;
  /** A meaning for the status mark; the status words always carry it too. */
  tone?: ControlTileTone;
  action: ControlTileAction;
  state?: ControlTileState;
  /** Words for the state: 'Switching on…', "Couldn't reach it". */
  stateText?: string;
  /** The corner button: a separate tab stop, never nested in the main target. */
  secondary?: { label: string; icon?: IconName; onClick?: () => void; href?: string };
  size?: ControlTileSize;
  /** An extra line under the status (a progress bar, a sparkline). */
  meta?: ReactNode;
}

const WIDTH: Record<ControlTileSize, string> = {
  sm: 'min-w-30',
  md: 'min-w-40',
  lg: 'min-w-50',
};
// the main target is 48px at every size, 64px at lg (the wall)
const TARGET_HEIGHT: Record<ControlTileSize, string> = {
  sm: 'min-h-12',
  md: 'min-h-12',
  lg: 'min-h-16',
};
const DEFAULT_STATE_TEXT: Record<ControlTileState, string> = {
  idle: '',
  pending: 'Working on it…',
  failed: "Couldn't do that",
  unavailable: 'Not available',
};
const DOT: Record<ControlTileTone, StatusTone> = {
  neutral: 'neutral',
  active: 'active',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
};
const STRETCH =
  'after:absolute after:inset-0 after:rounded-[inherit] after:content-[""] focus-visible:outline-none focus-visible:after:[box-shadow:var(--ring)]';

export function ControlTile({
  label,
  context,
  icon,
  status,
  tone = 'neutral',
  action,
  state = 'idle',
  stateText,
  secondary,
  size = 'md',
  meta,
  className,
  ...props
}: ControlTileProps) {
  const statusId = useId();
  const stateId = useId();
  const pressed = action.kind === 'toggle' && action.pressed;
  const unavailable = state === 'unavailable';
  const words = state === 'idle' ? '' : (stateText ?? DEFAULT_STATE_TEXT[state]);
  const hasState = words !== '';
  // announced politely when the tile moves to pending or failed (the region exists from the start)
  const announced = state === 'pending' || state === 'failed' ? words : '';
  const describedBy = [statusId, hasState ? stateId : null].filter(Boolean).join(' ');

  const name = (
    <span className="flex flex-col gap-0.5 text-start">
      <span
        className={cn(
          'text-[14px] leading-tight text-fg',
          pressed ? 'font-semibold' : 'font-medium',
        )}
      >
        {label}
      </span>
      {context && <span className="text-[12px] leading-tight text-fg-muted">{context}</span>}
    </span>
  );

  const targetClass = cn(
    'ui-control-tile-target block w-full cursor-pointer border-0 bg-transparent p-0 text-start font-sans no-underline',
    TARGET_HEIGHT[size],
    STRETCH,
    unavailable && 'cursor-not-allowed',
  );
  const accessibleName = context ? `${label}, ${context}` : label;
  const common = {
    'aria-label': accessibleName,
    'aria-describedby': describedBy,
    'aria-disabled': unavailable || undefined,
    className: targetClass,
  };

  let target: ReactNode;
  if (action.kind === 'toggle') {
    const { pressed: on, onPressedChange } = action;
    target = (
      <button
        {...common}
        type="button"
        aria-pressed={on}
        onClick={() => {
          if (unavailable) return;
          playSound(on ? 'toggle-off' : 'toggle-on');
          onPressedChange(!on);
        }}
      >
        {name}
      </button>
    );
  } else if (action.kind === 'open' && 'href' in action) {
    target = (
      <a
        {...common}
        href={action.href}
        onClick={(e: MouseEvent<HTMLAnchorElement>) => unavailable && e.preventDefault()}
      >
        {name}
      </a>
    );
  } else if (action.kind === 'open') {
    const { onOpen } = action;
    target = (
      <button {...common} type="button" onClick={() => !unavailable && onOpen()}>
        {name}
      </button>
    );
  } else {
    target = <div className="ui-control-tile-target min-h-12">{name}</div>;
  }

  const interactive = action.kind !== 'none';
  return (
    <div
      {...props}
      data-size={size}
      data-state={state}
      data-pressed={pressed || undefined}
      className={cn(
        'ui-control-tile relative flex flex-col gap-2 rounded-lg border border-solid p-3 text-fg',
        '[box-shadow:var(--elev-card)] forced-colors:border-[CanvasText]',
        'transition-[border-color,background-color] duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
        WIDTH[size],
        pressed
          ? 'border-brand bg-selected'
          : unavailable
            ? 'border-border-subtle bg-sunken'
            : 'border-border bg-surface',
        interactive && !unavailable && !pressed && 'hover:border-border-strong',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <IconCircle icon={icon} size="md" />
      </div>
      {target}
      <p id={statusId} className="m-0 font-sans text-[13px] leading-tight">
        <StatusDot tone={DOT[tone]} label={status} size="sm" />
      </p>
      {hasState && (
        <p
          id={stateId}
          data-state-text={state}
          className={cn(
            'm-0 flex items-center gap-1 font-sans text-[12px] leading-tight',
            state === 'failed' ? 'text-danger' : 'text-fg-muted',
          )}
        >
          {state === 'failed' && <Icon name="alert" size={13} />}
          {state === 'pending' ? <TextShimmer>{words}</TextShimmer> : words}
        </p>
      )}
      <span role="status" className="sr-only">
        {announced}
      </span>
      {meta && <div className="ui-control-tile-meta">{meta}</div>}
      {secondary &&
        (secondary.href ? (
          <a
            {...buttonAttrs('ghost', 'icon')}
            href={secondary.href}
            aria-label={secondary.label}
            onClick={secondary.onClick}
            className={cn(buttonAttrs('ghost', 'icon').className, 'absolute top-2 right-2 z-10')}
          >
            <Icon name={secondary.icon ?? 'more'} size={16} />
          </a>
        ) : (
          <button
            {...buttonAttrs('ghost', 'icon')}
            type="button"
            aria-label={secondary.label}
            onClick={secondary.onClick}
            className={cn(buttonAttrs('ghost', 'icon').className, 'absolute top-2 right-2 z-10')}
          >
            <Icon name={secondary.icon ?? 'more'} size={16} />
          </button>
        ))}
    </div>
  );
}
