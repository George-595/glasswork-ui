import { type HTMLAttributes, useId } from 'react';
import { Button } from '../components/button';
import { Progress } from '../components/progress';
import { SegmentedControl } from '../components/segmented-control';
import { formatSeconds } from '../controls/Countdown';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { type StepItem, StepList } from '../patterns/StepList';
import { playSound } from '../sound';

/* StepPlayer — plays a timed script: a list of steps that happen at set offsets, with the
   controls of a small player. The app owns the clock (`positionMs`, `status`); this draws it and
   reports what the person pressed.

   - A Progress of position over duration with "0:40 / 2:00" beside it; Play/Pause is one button
     named for what it does now ("Play" or "Pause", the icon swaps with it), then Restart, then the speed (a SegmentedControl,
     "×1", "×10") when `onSpeedChange` is given.
   - The steps are a StepList: done, now and next are words and icons, never colour alone, each
     with its offset ("+0:40"). The current step is the last one whose offset has passed; before
     the first press (`idle`) none is current and every step reads "Next", and when `done` every
     step reads "Done".
   - The current step is announced politely when it changes ("Now: landing smoke alarm goes
     off"), by the StepList's live line, which is on the page from the start (empty before the
     first step, "Finished" at the end) so the first announcement is a change, not an insertion.
     Position ticks that do not change the step say nothing.
   - `disabled` turns every control off; `disabledReason` says why, in words under the controls. */
export interface PlayerStep {
  id: string;
  atMs: number;
  title: string;
  detail?: string;
}
export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'done';

export interface StepPlayerProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: string;
  description?: string;
  steps: readonly PlayerStep[];
  durationMs: number;
  status: PlayerStatus;
  /** Where the app's clock is, in ms from the start. */
  positionMs: number;
  speed: number;
  /** The speeds on offer. Default [1, 10]. */
  speeds?: readonly number[];
  onPlay: () => void;
  onPause: () => void;
  onRestart: () => void;
  onSpeedChange?: (speed: number) => void;
  disabled?: boolean;
  disabledReason?: string;
}

const clock = (ms: number) => formatSeconds(Math.max(0, ms) / 1000);
const offset = (ms: number) => `+${clock(ms)}`;

/** The index of the step in progress: the last whose offset has passed; -1 when none is. */
export function currentStepIndex(
  steps: readonly PlayerStep[],
  positionMs: number,
  status: PlayerStatus,
): number {
  if (status === 'idle') return -1;
  if (status === 'done') return steps.length;
  let at = -1;
  steps.forEach((s, i) => {
    if (s.atMs <= positionMs) at = i;
  });
  return at;
}

export function StepPlayer({
  title,
  description,
  steps,
  durationMs,
  status,
  positionMs,
  speed,
  speeds = [1, 10],
  onPlay,
  onPause,
  onRestart,
  onSpeedChange,
  disabled,
  disabledReason,
  className,
  ...props
}: StepPlayerProps) {
  const titleId = useId();
  const reasonId = useId();
  const playing = status === 'playing';
  const at = currentStepIndex(steps, positionMs, status);
  const current = steps[at];

  const items: StepItem[] = steps.map((s, i) => {
    const stepStatus = i < at ? 'done' : i === at ? 'current' : 'todo';
    const when = offset(s.atMs);
    return {
      id: s.id,
      title: s.title,
      status: stepStatus,
      summary: when,
      hint: s.detail ? `${when} · ${s.detail}` : when,
      content: (
        <span className="text-[14px] text-fg-muted">
          <span className="font-mono tabular-nums">{when}</span>
          {s.detail ? ` · ${s.detail}` : ''}
        </span>
      ),
    };
  });

  // the live line is always on the page, so the first "Now:" is a change to it, not a new element
  const helper = status === 'done' ? 'Finished' : current ? `Now: ${current.title}` : '';

  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add form semantics and a legend; the player is named by its title
    <div
      {...props}
      role="group"
      aria-labelledby={titleId}
      data-status={status}
      className={cn(
        'ui-step-player flex min-w-0 flex-col gap-4 rounded-lg border border-solid border-border bg-surface p-4',
        'forced-colors:border-[CanvasText]',
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <span id={titleId} className="text-[16px] leading-[1.3] font-semibold text-fg">
          {title}
        </span>
        {description && <span className="text-[14px] text-fg-muted">{description}</span>}
      </div>

      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <Progress
            label="Progress"
            value={Math.min(Math.max(positionMs, 0), durationMs)}
            max={durationMs}
            showValue={false}
          />
        </div>
        <span className="shrink-0 font-mono text-[13px] text-fg-muted tabular-nums">
          {clock(positionMs)} / {clock(durationMs)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="neutral"
          size="lg"
          disabled={disabled}
          aria-describedby={disabled && disabledReason ? reasonId : undefined}
          onClick={() => {
            playSound('tick');
            if (playing) onPause();
            else onPlay();
          }}
        >
          <Icon name={playing ? 'pause' : 'play'} size={16} />
          {playing ? 'Pause' : 'Play'}
        </Button>
        <Button variant="neutral" size="lg" disabled={disabled} onClick={onRestart}>
          <Icon name="rotate-ccw" size={16} />
          Restart
        </Button>
        {onSpeedChange && (
          <SegmentedControl
            label="Speed"
            size="md"
            className="pointer-coarse:[&_.ui-segmented-item]:min-w-12"
            disabled={disabled}
            value={String(speed)}
            onValueChange={(v) => onSpeedChange(Number(v))}
            options={speeds.map((s) => ({ value: String(s), label: `×${s}` }))}
          />
        )}
      </div>
      {disabled && disabledReason && (
        <p id={reasonId} className="m-0 text-[13px] text-fg-muted">
          {disabledReason}
        </p>
      )}

      <StepList label={`${title} steps`} steps={items} helper={helper} />
    </div>
  );
}
