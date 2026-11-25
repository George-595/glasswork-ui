import { type HTMLAttributes, type ReactNode, useId, useState } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { SpinnerGlyph } from './icons';

/* Adapted from BoardUI's agent-log (MIT, Mertcan Dundar Esmergul); see THIRD_PARTY_NOTICES.md.
   ToolChip — one tool call the agent made, as a compact chip: an icon for the state, the tool
   name and the state in words (running, done, failed), so colour is never the only signal.
   With `detail` the chip is a disclosure button (aria-expanded) that opens the input / output
   under it; without it the chip is plain, non-interactive text. Failed chips take the danger
   boundary. The spinner stops under prefers-reduced-motion and stays a ring.

   `args` are the arguments the agent passed, shown as name = value rows when the chip is
   opened (with `detail`, the result, under them); `durationMs` writes how long the call took
   after the status ("Done · 1.2 s"). ToolTimeline lays several calls out as the steps of a
   run: an ordered list on a rail, each step's time on its right and the total at the foot. */
export type ToolStatus = 'running' | 'done' | 'failed';

export interface ToolChipProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The tool's name, e.g. "search_orders". Shown in the mono face. */
  name: string;
  status?: ToolStatus;
  /** A short result after the status, e.g. "3 results". */
  summary?: string;
  /** The input / output, shown when the chip is opened. */
  detail?: ReactNode;
  /** The arguments the call was made with, shown as rows when the chip is opened. */
  args?: Readonly<Record<string, unknown>>;
  /** How long the call took, in ms (shown after the status). */
  durationMs?: number;
  defaultOpen?: boolean;
}

/** "840 ms", "1.2 s", "1 min 4 s". */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toLocaleString('en-GB', { maximumFractionDigits: 1 })} s`;
  const m = Math.floor(ms / 60_000);
  return `${m} min ${Math.round((ms % 60_000) / 1000)} s`;
}

const argText = (v: unknown) =>
  typeof v === 'string' ? JSON.stringify(v) : v === undefined ? 'undefined' : JSON.stringify(v);

function ArgRows({ args }: { args: Readonly<Record<string, unknown>> }) {
  const entries = Object.entries(args);
  if (entries.length === 0) return null;
  return (
    <dl className="ui-tool-args m-0 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
      {entries.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-fg-muted">{k}</dt>
          <dd className="m-0 text-fg [overflow-wrap:anywhere]">{argText(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

const STATUS_WORD: Record<ToolStatus, string> = {
  running: 'Running',
  done: 'Done',
  failed: 'Failed',
};

function StatusIcon({ status }: { status: ToolStatus }) {
  if (status === 'running') {
    return (
      <SpinnerGlyph
        size={14}
        className="shrink-0 text-fg-muted animate-spin motion-reduce:animate-none"
      />
    );
  }
  return status === 'done' ? (
    <Icon name="check" size={14} className="shrink-0 text-success" />
  ) : (
    <Icon name="alert" size={14} className="shrink-0 text-danger" />
  );
}

export function ToolChip({
  name,
  status = 'done',
  summary,
  detail,
  args,
  durationMs,
  defaultOpen = false,
  className,
  ...props
}: ToolChipProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const hasArgs = args !== undefined && Object.keys(args).length > 0;
  const expandable = (detail !== undefined && detail !== null) || hasArgs;
  const label = (
    <>
      <StatusIcon status={status} />
      <code className="font-mono text-[12.5px] text-fg">{name}</code>
      <span className="text-fg-muted">
        {STATUS_WORD[status]}
        {summary ? ` · ${summary}` : ''}
        {durationMs !== undefined ? ` · ${formatDuration(durationMs)}` : ''}
      </span>
      {expandable && (
        <Icon
          name="chevron-down"
          size={14}
          className={cn(
            'shrink-0 text-fg-subtle transition-transform duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
            open && 'rotate-180',
          )}
        />
      )}
    </>
  );
  const chip = cn(
    'inline-flex min-h-6 max-w-full items-center gap-1.5 rounded-pill border border-solid bg-sunken px-2.5 py-0.5 font-sans text-[12.5px] leading-[1.3]',
    status === 'failed' ? 'border-danger' : 'border-border-strong',
  );

  return (
    <div
      {...props}
      data-status={status}
      className={cn('ui-tool-chip inline-flex max-w-full flex-col items-start gap-1.5', className)}
    >
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            chip,
            'cursor-pointer hover:bg-hover focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
          )}
        >
          {label}
        </button>
      ) : (
        <span className={chip}>{label}</span>
      )}
      {expandable && (
        <div
          id={panelId}
          hidden={!open}
          className="w-full min-w-0 rounded-md border border-solid border-border-subtle bg-sunken p-2.5 font-mono text-[12.5px] leading-normal whitespace-pre-wrap text-fg [overflow-wrap:anywhere]"
        >
          {hasArgs && args && <ArgRows args={args} />}
          {hasArgs && detail !== undefined && detail !== null && (
            <hr className="my-2 border-0 border-t border-solid border-border-subtle" />
          )}
          {detail}
        </div>
      )}
    </div>
  );
}

export interface ToolTimelineProps extends Omit<HTMLAttributes<HTMLOListElement>, 'children'> {
  /** The calls, oldest first. */
  steps: readonly (ToolChipProps & { id: string })[];
  /** Names the list ("Steps the assistant took"). */
  label?: string;
}

export function ToolTimeline({
  steps,
  label = 'Steps the assistant took',
  className,
  ...props
}: ToolTimelineProps) {
  const total = steps.reduce((a, s) => a + (s.durationMs ?? 0), 0);
  const timed = steps.some((s) => s.durationMs !== undefined);
  return (
    <div className="ui-tool-timeline flex flex-col gap-1.5">
      <ol
        {...props}
        aria-label={label}
        className={cn('m-0 flex list-none flex-col p-0', className)}
      >
        {steps.map(({ id, durationMs, ...step }, i) => (
          <li key={id} className="relative grid grid-cols-[18px_1fr] gap-x-2.5 pb-2.5 last:pb-0">
            <span aria-hidden="true" className="relative flex justify-center">
              <span
                className={cn(
                  'z-[1] mt-[7px] size-2.5 rounded-full border-2 border-solid',
                  step.status === 'failed'
                    ? 'border-danger bg-danger-soft'
                    : step.status === 'running'
                      ? 'border-brand bg-surface-solid'
                      : 'border-success bg-success-soft',
                )}
              />
              {i < steps.length - 1 && (
                <span className="absolute top-[17px] bottom-[-7px] w-px bg-border-strong" />
              )}
            </span>
            <span className="flex min-w-0 flex-wrap items-start justify-between gap-x-3">
              <ToolChip {...step} />
              {durationMs !== undefined && (
                <span className="pt-0.5 font-mono text-[12px] text-fg-subtle tabular-nums">
                  {formatDuration(durationMs)}
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {timed && (
        <p className="m-0 ps-7 text-[12px] text-fg-muted">
          {steps.length} {steps.length === 1 ? 'step' : 'steps'} · {formatDuration(total)} in all
        </p>
      )}
    </div>
  );
}
