import {
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useId,
  useRef,
  useState,
} from 'react';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* WeekScheduler — a working week as a time grid, for booking and moving things in time.

   Pointer: drag an event to move it (to another time or another day), drag its bottom edge to
   change its length, and drag down an empty column to make a new event. Everything snaps to
   `snap` minutes (15 by default); while dragging, the event shows its new times live.

   Keyboard: each event is a button. Up/Down move it by one snap, Left/Right by a day,
   Shift+Up/Down shorten or lengthen it. Each change is said ("Design review, Tuesday 10:15 to
   11:00"), and the instructions are the event's description. Making an event by keyboard is
   the app's own form (onCreate with no times), since a grid is no place to type a title.

   The look: events are soft tinted blocks in the chart colours with a stronger edge on the
   leading side; overlapping events sit side by side; today's date is a brand pill and a "now"
   line with a dot crosses today's column. */
export interface ScheduleEvent {
  id: string;
  title: string;
  /** 0 = the first day shown. */
  day: number;
  /** Minutes after midnight. */
  start: number;
  end: number;
  tone?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  where?: string;
}

export interface WeekSchedulerProps {
  events: readonly ScheduleEvent[];
  onChange?: (events: ScheduleEvent[]) => void;
  /** Day names and dates, left to right: [{ name: 'Mon', date: 24 }]. */
  days: readonly { name: string; date: number }[];
  /** The index of today in `days`, for the highlight and the now line. */
  today?: number;
  /** Minutes after midnight for the now line. */
  now?: number;
  /** First and last hour shown. Default [8, 18]. */
  hours?: readonly [number, number];
  snap?: number;
  label: string;
  /** Called when a new event is drawn; return it (with a title) to add it. */
  onCreate?: (draft: Omit<ScheduleEvent, 'id' | 'title'>) => ScheduleEvent | null;
  className?: string;
}

const HOUR_PX = 56;
const TINT = {
  1: 'bg-chart-1',
  2: 'bg-chart-2',
  3: 'bg-chart-3',
  4: 'bg-chart-4',
  5: 'bg-chart-5',
  6: 'bg-chart-6',
  7: 'bg-chart-7',
  8: 'bg-chart-8',
} as const;

export const clockOf = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(Math.round(m % 60)).padStart(2, '0')}`;

/** Side-by-side lanes for overlapping events in one day. */
function lanes(events: readonly ScheduleEvent[]) {
  const out = new Map<string, { lane: number; of: number }>();
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end);
  let group: ScheduleEvent[] = [];
  let groupEnd = -1;
  const flush = () => {
    const ends: number[] = [];
    const placed = group.map((e) => {
      let lane = ends.findIndex((end) => end <= e.start);
      if (lane < 0) lane = ends.length;
      ends[lane] = e.end;
      return { e, lane };
    });
    for (const p of placed) out.set(p.e.id, { lane: p.lane, of: ends.length });
    group = [];
  };
  for (const e of sorted) {
    if (e.start >= groupEnd && group.length) flush();
    group.push(e);
    groupEnd = Math.max(groupEnd, e.end);
  }
  if (group.length) flush();
  return out;
}

type Drag =
  | { kind: 'move'; id: string; y0: number; x0: number; start: number; day: number; len: number }
  | { kind: 'size'; id: string; y0: number; end: number; start: number }
  | { kind: 'new'; day: number; from: number; to: number };

export function WeekScheduler({
  events,
  onChange,
  days,
  today,
  now,
  hours = [8, 18],
  snap = 15,
  label,
  onCreate,
  className,
}: WeekSchedulerProps) {
  const [list, setList] = useState<ScheduleEvent[]>(() => [...events]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const [said, setSaid] = useState('');
  const grid = useRef<HTMLDivElement>(null);
  const helpId = useId();
  const [h0, h1] = hours;
  const span = (h1 - h0) * 60;
  const px = HOUR_PX / 60;
  const clamp = (m: number) => Math.max(h0 * 60, Math.min(h1 * 60, m));
  const round = (m: number) => Math.round(m / snap) * snap;

  const commit = (next: ScheduleEvent[], e?: ScheduleEvent) => {
    setList(next);
    onChange?.(next);
    if (e) setSaid(`${e.title}, ${dayName(e.day)} ${clockOf(e.start)} to ${clockOf(e.end)}`);
  };
  const dayName = (d: number) => days[d]?.name ?? '';
  const update = (id: string, f: (e: ScheduleEvent) => ScheduleEvent) => {
    const old = list.find((e) => e.id === id);
    const changed = old ? f(old) : undefined;
    commit(
      list.map((e) => (e.id === id && changed ? changed : e)),
      changed,
    );
  };

  const colAt = (x: number) => {
    const g = grid.current;
    if (!g) return 0;
    const cols = g.querySelectorAll<HTMLElement>('[data-day]');
    for (const [i, c] of [...cols].entries()) {
      const r = c.getBoundingClientRect();
      if (x >= r.left && x <= r.right) return i;
    }
    return -1;
  };
  const minuteAt = (y: number, col: number) => {
    const c = grid.current?.querySelectorAll<HTMLElement>('[data-day]')[col];
    if (!c) return h0 * 60;
    return clamp(round(h0 * 60 + (y - c.getBoundingClientRect().top) / px));
  };

  // the event being dragged, at its new place, until it is dropped
  const [live, setLive] = useState<ScheduleEvent | null>(null);

  const startMove = (
    e: ReactPointerEvent<HTMLElement>,
    ev: ScheduleEvent,
    kind: 'move' | 'size',
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(
      kind === 'move'
        ? {
            kind,
            id: ev.id,
            y0: e.clientY,
            x0: e.clientX,
            start: ev.start,
            day: ev.day,
            len: ev.end - ev.start,
          }
        : { kind, id: ev.id, y0: e.clientY, end: ev.end, start: ev.start },
    );
    setLive(ev);
  };
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (!drag) return;
    if (drag.kind === 'new') {
      setDrag({ ...drag, to: minuteAt(e.clientY, drag.day) });
      return;
    }
    const ev = list.find((x) => x.id === drag.id);
    if (!ev) return;
    const dm = (e.clientY - drag.y0) / px;
    if (drag.kind === 'move') {
      const start = clamp(round(drag.start + dm));
      const s = Math.min(start, h1 * 60 - drag.len);
      const col = colAt(e.clientX);
      setLive({ ...ev, start: s, end: s + drag.len, day: col < 0 ? ev.day : col });
    } else {
      const end = Math.max(drag.start + snap, clamp(round(drag.end + dm)));
      setLive({ ...ev, end });
    }
  };
  const onUp = () => {
    if (!drag) return;
    if (drag.kind === 'new') {
      const a = Math.min(drag.from, drag.to);
      const b = Math.max(drag.from, drag.to);
      setDrag(null);
      if (b - a >= snap && onCreate) {
        const made = onCreate({ day: drag.day, start: a, end: b });
        if (made) {
          commit([...list, made], made);
          playSound('success');
        }
      }
      return;
    }
    if (live) {
      commit(
        list.map((x) => (x.id === live.id ? live : x)),
        live,
      );
      playSound('tick');
    }
    setDrag(null);
    setLive(null);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, ev: ScheduleEvent) => {
    const len = ev.end - ev.start;
    let f: ((x: ScheduleEvent) => ScheduleEvent) | null = null;
    if (e.shiftKey && e.key === 'ArrowDown') f = (x) => ({ ...x, end: clamp(x.end + snap) });
    else if (e.shiftKey && e.key === 'ArrowUp')
      f = (x) => ({ ...x, end: Math.max(x.start + snap, x.end - snap) });
    else if (e.key === 'ArrowDown')
      f = (x) => ({
        ...x,
        start: Math.min(h1 * 60 - len, x.start + snap),
        end: Math.min(h1 * 60, x.end + snap),
      });
    else if (e.key === 'ArrowUp')
      f = (x) => ({
        ...x,
        start: Math.max(h0 * 60, x.start - snap),
        end: Math.max(h0 * 60 + len, x.end - snap),
      });
    else if (e.key === 'ArrowLeft') f = (x) => ({ ...x, day: Math.max(0, x.day - 1) });
    else if (e.key === 'ArrowRight')
      f = (x) => ({ ...x, day: Math.min(days.length - 1, x.day + 1) });
    if (!f) return;
    e.preventDefault();
    update(ev.id, f);
    requestAnimationFrame(() =>
      grid.current?.querySelector<HTMLButtonElement>(`[data-event-id="${ev.id}"]`)?.focus(),
    );
  };

  const hourMarks = Array.from({ length: h1 - h0 + 1 }, (_, i) => h0 + i);
  const shownList = list.map((x) => (live && x.id === live.id ? live : x));

  return (
    <section
      aria-label={label}
      className={cn(
        'ui-week flex w-full min-w-0 flex-col overflow-hidden rounded-xl border border-solid border-border bg-surface font-sans [box-shadow:var(--elev-card)] glass-chrome',
        className,
      )}
    >
      <p id={helpId} className="sr-only">
        Arrow keys move the event by {snap} minutes or a day; Shift with Up or Down changes its
        length.
      </p>
      <p className="sr-only" aria-live="polite">
        {said}
      </p>
      <div className="overflow-x-auto">
        <div className="min-w-[40rem]">
          <div
            className="grid grid-cols-[3.5rem_repeat(var(--days),minmax(0,1fr))] border-0 border-b border-solid border-border-subtle"
            style={{ '--days': days.length } as never}
          >
            <span />
            {days.map((d, i) => (
              <div key={d.name} className="flex flex-col items-center gap-0.5 py-2">
                <span className="text-[11px] font-medium tracking-wider text-fg-muted uppercase">
                  {d.name}
                </span>
                <span
                  className={cn(
                    'inline-flex size-8 items-center justify-center rounded-full text-[15px] font-semibold tabular-nums',
                    i === today ? 'bg-brand text-on-primary' : 'text-fg',
                  )}
                >
                  {d.date}
                </span>
              </div>
            ))}
          </div>
          <div
            ref={grid}
            className="relative grid grid-cols-[3.5rem_repeat(var(--days),minmax(0,1fr))]"
            style={{ '--days': days.length, height: (span / 60) * HOUR_PX + 12 } as never}
            onPointerMove={onMove}
            onPointerUp={onUp}
            onPointerCancel={onUp}
          >
            <div className="relative">
              {hourMarks.map((h) => (
                <span
                  key={h}
                  className="absolute end-2 -translate-y-1/2 text-[11px] text-fg-subtle tabular-nums"
                  style={{ top: (h - h0) * HOUR_PX + 6 }}
                >
                  {String(h).padStart(2, '0')}:00
                </span>
              ))}
            </div>
            {days.map((d, di) => {
              const todays = shownList.filter((x) => x.day === di);
              const lane = lanes(todays);
              return (
                // oxlint-disable-next-line jsx-a11y/no-static-element-interactions -- drawing a new event is a pointer extra; the app's form makes one by keyboard
                <div
                  key={d.name}
                  data-day={di}
                  className={cn(
                    'relative mt-1.5 border-0 border-s border-solid border-border-subtle',
                    di === today && 'bg-brand-soft/40',
                  )}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || !onCreate || e.target !== e.currentTarget) return;
                    e.currentTarget.setPointerCapture(e.pointerId);
                    const m = minuteAt(e.clientY, di);
                    setDrag({ kind: 'new', day: di, from: m, to: m + snap });
                  }}
                >
                  {hourMarks.slice(0, -1).map((h) => (
                    <span
                      key={h}
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0 border-0 border-t border-solid border-border-subtle"
                      style={{ top: (h - h0) * HOUR_PX }}
                    />
                  ))}
                  {todays.map((ev) => {
                    const l = lane.get(ev.id) ?? { lane: 0, of: 1 };
                    const moving = live?.id === ev.id;
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        data-event-id={ev.id}
                        aria-describedby={helpId}
                        aria-label={`${ev.title}, ${d.name} ${clockOf(ev.start)} to ${clockOf(ev.end)}${ev.where ? `, ${ev.where}` : ''}`}
                        onPointerDown={(e) => startMove(e, ev, 'move')}
                        onKeyDown={(e) => onKey(e, ev)}
                        className={cn(
                          'ui-week-event group/ev absolute flex pointer-coarse:min-h-12 cursor-grab touch-none flex-col overflow-hidden rounded-md border-0 p-0 text-start outline-none focus-visible:z-20 focus-visible:[box-shadow:var(--ring)] active:cursor-grabbing',
                          moving
                            ? 'z-30 [box-shadow:var(--elev-3)]'
                            : 'z-10 transition-[top,height] duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none',
                        )}
                        style={{
                          top: (ev.start - h0 * 60) * px,
                          height: Math.max(20, (ev.end - ev.start) * px - 2),
                          insetInlineStart: `calc(${(l.lane / l.of) * 100}% + 2px)`,
                          width: `calc(${100 / l.of}% - 4px)`,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          className={cn('absolute inset-0 opacity-25', TINT[ev.tone ?? 1])}
                        />
                        <span
                          aria-hidden="true"
                          className={cn('absolute inset-y-0 start-0 w-[3px]', TINT[ev.tone ?? 1])}
                        />
                        <span className="relative flex min-w-0 flex-col px-2 py-1 ps-2.5">
                          <span className="truncate text-[12px] leading-tight font-semibold text-fg">
                            {ev.title}
                          </span>
                          <span className="truncate text-[11px] leading-tight text-fg-muted tabular-nums">
                            {clockOf(ev.start)}–{clockOf(ev.end)}
                          </span>
                        </span>
                        <span
                          aria-hidden="true"
                          onPointerDown={(e) => startMove(e, ev, 'size')}
                          className="absolute inset-x-0 bottom-0 flex h-2 cursor-ns-resize items-center justify-center opacity-0 group-hover/ev:opacity-100"
                        >
                          <span className="h-0.5 w-6 rounded-pill bg-fg-muted" />
                        </span>
                      </button>
                    );
                  })}
                  {drag?.kind === 'new' && drag.day === di && (
                    <span
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-x-0.5 z-20 flex flex-col rounded-md border-2 border-dashed border-brand bg-brand-soft px-2 py-1 text-[11px] font-semibold text-fg tabular-nums"
                      style={{
                        top: (Math.min(drag.from, drag.to) - h0 * 60) * px,
                        height: Math.max(16, Math.abs(drag.to - drag.from) * px),
                      }}
                    >
                      {clockOf(Math.min(drag.from, drag.to))}–
                      {clockOf(Math.max(drag.from, drag.to))}
                    </span>
                  )}
                  {di === today && now !== undefined && now >= h0 * 60 && now <= h1 * 60 && (
                    <span
                      aria-hidden="true"
                      className="ui-week-now pointer-events-none absolute -inset-x-px z-20 h-0.5 bg-danger"
                      style={{ top: (now - h0 * 60) * px }}
                    >
                      <span className="absolute -start-1.5 -top-[5px] size-3 rounded-full bg-danger" />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
