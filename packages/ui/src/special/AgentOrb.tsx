import type { CSSProperties } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* AgentOrb — the face of an assistant: a small living sphere that shows, at a glance, what the
   agent is doing. Idle it drifts slowly; listening it swells with the voice (`level`, 0 to 1,
   from a microphone meter) and sends out ripples; thinking a light runs round its rim and the
   colours churn faster; speaking it pulses; done it settles with a tick; on an error it shakes
   once and turns warm.

   Pure CSS on the theme's shader colours (no canvas, no WebGL), so it renders on the server,
   costs nothing idle, and every loop stops under prefers-reduced-motion, leaving a still orb
   whose state is also said in words.

   With `onPress` it is a real button (a push-to-talk): its name is `label`, and it is pressed
   while listening. Without, it is a status: the state is read out when it changes. */
export type AgentOrbState = 'idle' | 'listening' | 'thinking' | 'speaking' | 'done' | 'error';

export interface AgentOrbProps {
  state?: AgentOrbState;
  /** Voice level while listening, 0 to 1. */
  level?: number;
  size?: 'sm' | 'md' | 'lg';
  /** Names the agent: "Co-pilot". */
  label?: string;
  /** Show the state in words beside the orb. */
  caption?: boolean;
  onPress?: () => void;
  className?: string;
}

const WORDS: Record<AgentOrbState, string> = {
  idle: 'Ready',
  listening: 'Listening',
  thinking: 'Thinking',
  speaking: 'Speaking',
  done: 'Done',
  error: 'Something went wrong',
};

const SIZE = { sm: 'size-10', md: 'size-16', lg: 'size-28' } as const;

export function AgentOrb({
  state = 'idle',
  level = 0,
  size = 'md',
  label = 'Assistant',
  caption = false,
  onPress,
  className,
}: AgentOrbProps) {
  const orb = (
    <span
      className={cn('ui-orb relative inline-block shrink-0 rounded-full', SIZE[size])}
      data-state={state}
      style={{ '--orb-level': Math.max(0, Math.min(1, level)).toFixed(3) } as CSSProperties}
      aria-hidden="true"
    >
      <span className="ui-orb-ripple" />
      <span className="ui-orb-ripple ui-orb-ripple-2" />
      <span className="ui-orb-rim" />
      <span className="ui-orb-core">
        <span className="ui-orb-blob ui-orb-blob-a" />
        <span className="ui-orb-blob ui-orb-blob-b" />
        <span className="ui-orb-blob ui-orb-blob-c" />
        <span className="ui-orb-gloss" />
      </span>
      {state === 'done' && (
        <span className="ui-orb-mark text-on-primary">
          <Icon name="check" size={size === 'lg' ? 34 : size === 'md' ? 22 : 16} strokeWidth={3} />
        </span>
      )}
    </span>
  );
  const words = `${label}: ${WORDS[state]}`;
  const text = caption ? (
    <span className="flex min-w-0 flex-col">
      <span className="text-sm font-semibold text-fg">{label}</span>
      <span className="text-[13px] text-fg-muted">{WORDS[state]}</span>
    </span>
  ) : null;

  if (onPress) {
    return (
      <button
        type="button"
        aria-pressed={state === 'listening'}
        aria-label={caption ? undefined : words}
        onClick={onPress}
        className={cn(
          'ui-orb-button inline-flex cursor-pointer items-center gap-3 rounded-pill border-0 bg-transparent p-1 text-left outline-none focus-visible:[box-shadow:var(--ring)]',
          className,
        )}
      >
        {orb}
        {text}
        {caption && <span className="sr-only">{`, ${WORDS[state]}`}</span>}
      </button>
    );
  }
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      {orb}
      {text}
      <span role="status" className="sr-only">
        {caption ? '' : words}
      </span>
    </span>
  );
}
