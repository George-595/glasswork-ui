import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/* StateTimeline — when each thing was on and when it was off, over the same stretch of time:
   one row per thing, a strip of equal slots (on, off, or not there yet), and how much of the
   time it was off. Made for "which services slept in the last 24 hours", and fits any two-state
   history (online/offline, open/closed).

   Access (WCAG 1.1.1, 1.4.1, 1.4.11): each row is a list item whose name is its whole story
   ("Glasswork demo: asleep 89% of the time, awake 2 h 40 min"); the strip is decoration
   (aria-hidden). On is a solid fill and off an outlined, sunken one, so the two differ by more
   than hue, and the share is written beside every row. Consecutive slots are drawn as one run,
   so a day of ten-minute slots is a handful of elements. */
export interface StateTimelineRow {
  /** Stable key. */
  id: string;
  label: string;
  /** Under the label, smaller ("web · production"). */
  detail?: string;
  /** One entry per slot, oldest first: true on, false off, null not there (before it existed). */
  slots: readonly (boolean | null)[];
}

export interface StateTimelineProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  rows: readonly StateTimelineRow[];
  /** The time the first slot starts and the last one ends (ISO or ms). */
  from: string | number;
  to: string | number;
  /** Words for the two states. Default "awake" / "asleep". */
  words?: { on: string; off: string };
  /** What the share beside each row counts. Default "off". */
  share?: 'on' | 'off';
}

const clock = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' });

function runs(slots: readonly (boolean | null)[]) {
  const out: { state: boolean | null; from: number; n: number }[] = [];
  slots.forEach((s, i) => {
    const last = out[out.length - 1];
    if (last && last.state === s) last.n += 1;
    else out.push({ state: s, from: i, n: 1 });
  });
  return out;
}

function duration(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function StateTimeline({
  rows,
  from,
  to,
  words = { on: 'awake', off: 'asleep' },
  share = 'off',
  className,
  ...props
}: StateTimelineProps) {
  const start = typeof from === 'number' ? from : Date.parse(from);
  const end = typeof to === 'number' ? to : Date.parse(to);
  const span = Math.max(1, end - start);
  // four ticks under the strips: the start, two between and the end
  const ticks = [0, 1 / 3, 2 / 3, 1].map((f) => ({
    f,
    text: f === 1 ? 'now' : clock.format(new Date(start + f * span)),
  }));
  return (
    <div {...props} className={cn('ui-state-timeline flex flex-col gap-3', className)}>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {rows.map((row) => {
          const known = row.slots.filter((s) => s !== null);
          const on = known.filter(Boolean).length;
          const slotMs = row.slots.length ? span / row.slots.length : 0;
          const offShare = known.length
            ? Math.round(((known.length - on) / known.length) * 100)
            : 0;
          const shown = share === 'off' ? offShare : known.length ? 100 - offShare : 0;
          const shareWord = share === 'off' ? words.off : words.on;
          const story = known.length
            ? `${row.label}: ${shareWord} ${shown}% of the time, ${words.on} ${duration(on * slotMs)}`
            : `${row.label}: no record`;
          return (
            <li key={row.id} aria-label={story} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3" aria-hidden="true">
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-fg">{row.label}</span>
                  {row.detail && (
                    <span className="truncate text-[12px] text-fg-muted">{row.detail}</span>
                  )}
                </span>
                <span className="shrink-0 text-[13px] text-fg-muted">
                  {known.length ? `${shown}% ${shareWord}` : 'no record'}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="flex h-4 w-full overflow-hidden rounded-sm border border-solid border-border bg-surface"
              >
                {runs(row.slots).map((r) => (
                  <span
                    key={r.from}
                    className={cn(
                      'h-full',
                      r.state === true && 'bg-success-solid',
                      r.state === false && 'bg-sunken',
                    )}
                    style={{ width: `${(r.n / Math.max(1, row.slots.length)) * 100}%` }}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <div aria-hidden="true" className="flex justify-between text-[12px] text-fg-muted">
        {ticks.map((t) => (
          <span key={t.f}>{t.text}</span>
        ))}
      </div>
      <div aria-hidden="true" className="flex flex-wrap gap-4 text-[12px] text-fg-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-xs bg-success-solid" />
          {words.on.charAt(0).toUpperCase() + words.on.slice(1)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block size-3 rounded-xs border border-solid border-border bg-sunken" />
          {words.off.charAt(0).toUpperCase() + words.off.slice(1)}
        </span>
      </div>
    </div>
  );
}
