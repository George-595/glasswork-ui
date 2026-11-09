import { type HTMLAttributes, type ReactNode, useId, useState } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { SpinnerGlyph } from './icons';

/* Adapted from BoardUI's agent-log (MIT, Mertcan Dundar Esmergul); see THIRD_PARTY_NOTICES.md.
   ToolChip — one tool call the agent made, as a compact chip: an icon for the state, the tool
   name and the state in words (running, done, failed), so colour is never the only signal.
   With `detail` the chip is a disclosure button (aria-expanded) that opens the input / output
   under it; without it the chip is plain, non-interactive text. Failed chips take the danger
   boundary. The spinner stops under prefers-reduced-motion and stays a ring. */
export type ToolStatus = 'running' | 'done' | 'failed';

export interface ToolChipProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** The tool's name, e.g. "search_orders". Shown in the mono face. */
  name: string;
  status?: ToolStatus;
  /** A short result after the status, e.g. "3 results". */
  summary?: string;
  /** The input / output, shown when the chip is opened. */
  detail?: ReactNode;
  defaultOpen?: boolean;
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
  defaultOpen = false,
  className,
  ...props
}: ToolChipProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const expandable = detail !== undefined && detail !== null;
  const label = (
    <>
      <StatusIcon status={status} />
      <code className="font-mono text-[12.5px] text-fg">{name}</code>
      <span className="text-fg-muted">
        {STATUS_WORD[status]}
        {summary ? ` · ${summary}` : ''}
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
          {detail}
        </div>
      )}
    </div>
  );
}
