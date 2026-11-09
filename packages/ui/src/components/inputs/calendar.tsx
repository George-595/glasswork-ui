// biome-ignore-all lint/a11y/useSemanticElements: the APG date grid is built from role=grid/row/gridcell divs (a table cannot carry aria-selected on its cells)
// biome-ignore-all lint/a11y/useFocusableInteractive: the day button inside each gridcell is the focusable part (roving tabindex)
/* Adapted from Arc's calendar (MIT, Elia Kuratli) and BoardUI's date-picker (MIT, Mertcan
   Dundar Esmergul): the six-week grid, the keyboard model, the clamped month steps. Our own
   markup, roles and no motion library. See THIRD_PARTY_NOTICES.md. */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../../icons/Icon';
import { cn } from '../../lib/cn';
import {
  addDays,
  addMonths,
  clampDay,
  type DayRange,
  EMPTY_RANGE,
  formatDay,
  type IsoDate,
  monthGrid,
  monthOf,
  pickRange,
  startOfMonth,
  todayIso,
  weekdayNames,
} from './dates';

/* Calendar — one month on a grid, the APG date-grid pattern. The grid is a table with
   role="grid"; each day is a button in a gridcell, and only one day is in the tab order (a
   roving tabindex). Keys on a day: Left/Right a day, Up/Down a week, Home/End the start and
   end of the week, PageUp/PageDown a month (Shift: a year), Enter or Space picks. Days outside
   [min, max] are disabled and the arrow keys stop at them. The month title is a polite live
   region, so a month change is spoken.

   `mode="single"` picks one day (`value`); `mode="range"` picks two (`range`): the first click
   is the start, the second the end (a click before the start swaps them). A picked day wears
   the kit's selected look (`bg-selected`, a brand border, heavier weight: not colour alone);
   days between a range's ends carry the wash alone. Today has a stronger border and
   aria-current="date". Names and order come from Intl (default en-GB, Monday first). */
export interface CalendarBaseProps {
  /** Earliest pickable day, `YYYY-MM-DD`. */
  min?: IsoDate;
  /** Latest pickable day. */
  max?: IsoDate;
  /** BCP 47 locale for month and day names. Default en-GB. */
  locale?: string;
  /** First day of the week: 0 Sunday, 1 Monday (default). */
  weekStart?: number;
  /** Override "today" (tests, a server clock). */
  today?: IsoDate;
  /** Month shown first (any day in it). Defaults to the value, else today. */
  defaultMonth?: IsoDate;
  /** Names the grid for assistive tech (the month is added). */
  label?: string;
  className?: string;
}

export type CalendarProps = CalendarBaseProps &
  (
    | {
        mode?: 'single';
        value?: IsoDate | null;
        onValueChange?: (day: IsoDate) => void;
      }
    | {
        mode: 'range';
        range?: DayRange;
        onRangeChange?: (range: DayRange) => void;
      }
  );

const dayBase =
  'ui-calendar-day relative grid size-9 w-full min-w-6 cursor-pointer place-items-center rounded-sm border border-solid border-transparent bg-transparent text-[13px] tabular-nums text-fg ' +
  'transition-[background-color,border-color] duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none ' +
  'hover:bg-hover focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] ' +
  'disabled:cursor-not-allowed disabled:text-disabled-fg disabled:hover:bg-transparent';

export function Calendar(props: CalendarProps) {
  const {
    min,
    max,
    locale = 'en-GB',
    weekStart = 1,
    today: todayProp,
    defaultMonth,
    label = 'Calendar',
    className,
  } = props;
  const range = props.mode === 'range' ? (props.range ?? EMPTY_RANGE) : null;
  const value = props.mode === 'range' ? null : (props.value ?? null);

  const today = useMemo(() => todayProp ?? todayIso(), [todayProp]);
  const anchor = value ?? range?.from ?? defaultMonth ?? today;
  const [month, setMonth] = useState<IsoDate>(() => startOfMonth(clampDay(anchor, min, max)));
  const [focusDay, setFocusDay] = useState<IsoDate>(() => clampDay(anchor, min, max));
  const wantFocus = useRef(false);
  const grid = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // keep the tab stop on a day that is on screen
  const inView = monthOf(focusDay) === monthOf(month);
  const stop = inView ? focusDay : clampDay(month, min, max);

  useEffect(() => {
    if (!wantFocus.current) return;
    wantFocus.current = false;
    grid.current?.querySelector<HTMLButtonElement>(`button[data-day="${focusDay}"]`)?.focus();
  });

  const weeks = useMemo(() => monthGrid(month, weekStart), [month, weekStart]);
  const names = useMemo(() => weekdayNames(locale, weekStart), [locale, weekStart]);
  const title = formatDay(month, locale, { month: 'long', year: 'numeric' });
  const disabled = (d: IsoDate) => Boolean((min && d < min) || (max && d > max));

  const go = (d: IsoDate, focus: boolean) => {
    const next = clampDay(d, min, max);
    wantFocus.current = focus;
    setFocusDay(next);
    setMonth(startOfMonth(next));
  };
  const stepMonth = (n: number) => {
    const next = addMonths(month, n);
    setMonth(startOfMonth(next));
    setFocusDay(clampDay(addMonths(stop, n), min, max));
  };

  const pick = (d: IsoDate) => {
    if (disabled(d)) return;
    setFocusDay(d);
    if (props.mode === 'range') props.onRangeChange?.(pickRange(range ?? EMPTY_RANGE, d));
    else props.onValueChange?.(d);
    if (monthOf(d) !== monthOf(month)) setMonth(startOfMonth(d));
  };

  const onKey = (e: React.KeyboardEvent<HTMLButtonElement>, d: IsoDate) => {
    const lead = (new Date(`${d}T12:00:00`).getDay() - weekStart + 7) % 7;
    const next: Record<string, IsoDate> = {
      ArrowLeft: addDays(d, -1),
      ArrowRight: addDays(d, 1),
      ArrowUp: addDays(d, -7),
      ArrowDown: addDays(d, 7),
      Home: addDays(d, -lead),
      End: addDays(d, 6 - lead),
      PageUp: addMonths(d, e.shiftKey ? -12 : -1),
      PageDown: addMonths(d, e.shiftKey ? 12 : 1),
    };
    const target = next[e.key];
    if (!target) return;
    e.preventDefault();
    go(target, true);
  };

  const first = range?.from ?? null;
  const last = range?.to ?? null;
  const prevOff = Boolean(min && addDays(startOfMonth(month), -1) < min);
  const nextOff = Boolean(max && addMonths(startOfMonth(month), 1) > max);

  return (
    <div className={cn('ui-calendar w-[17.5rem] max-w-full text-fg', className)}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          className={navButton}
          aria-label="Previous month"
          disabled={prevOff}
          onClick={() => stepMonth(-1)}
        >
          <Icon name="chevron-left" size={16} />
        </button>
        <div id={titleId} aria-live="polite" className="text-[13px] font-semibold">
          {title}
        </div>
        <button
          type="button"
          className={navButton}
          aria-label="Next month"
          disabled={nextOff}
          onClick={() => stepMonth(1)}
        >
          <Icon name="chevron-right" size={16} />
        </button>
      </div>
      <div
        ref={grid}
        role="grid"
        aria-label={`${label}, ${title}`}
        className="flex flex-col gap-0.5"
      >
        <div role="row" className="grid grid-cols-7 gap-0.5">
          {names.map((n) => (
            <div
              key={n.long}
              role="columnheader"
              className="pb-1 text-center text-[11px] font-medium text-fg-muted"
            >
              <span aria-hidden="true">{n.short.slice(0, 2)}</span>
              <span className="sr-only">{n.long}</span>
            </div>
          ))}
        </div>
        <div role="rowgroup" className="flex flex-col gap-0.5">
          {weeks.map((week) => (
            <div key={week[0]} role="row" className="grid grid-cols-7 gap-0.5">
              {week.map((d) => {
                const outside = monthOf(d) !== monthOf(month);
                const isEnd = d === first || d === last;
                const between = Boolean(first && last && d > first && d < last);
                const selected = range ? isEnd || between : d === value;
                const isToday = d === today;
                const full = formatDay(d, locale, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                });
                return (
                  <div key={d} role="gridcell" aria-selected={selected} className="text-center">
                    <button
                      type="button"
                      data-day={d}
                      tabIndex={d === stop ? 0 : -1}
                      disabled={disabled(d)}
                      aria-label={
                        range && d === first
                          ? `${full}, range start`
                          : range && d === last
                            ? `${full}, range end`
                            : full
                      }
                      aria-current={isToday ? 'date' : undefined}
                      onClick={() => pick(d)}
                      onKeyDown={(e) => onKey(e, d)}
                      className={cn(
                        dayBase,
                        outside && 'text-fg-subtle',
                        isToday && 'border-border-strong font-semibold',
                        between && 'rounded-none bg-selected',
                        (range ? isEnd : selected) &&
                          'border-brand bg-selected font-semibold [box-shadow:var(--elev-inset)]',
                        'disabled:border-transparent',
                      )}
                    >
                      {Number(d.slice(8))}
                    </button>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const navButton = cn(
  'inline-grid size-8 cursor-pointer place-items-center rounded-sm border border-solid border-transparent bg-transparent text-fg-muted',
  'transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg motion-reduce:transition-none',
  'focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
  'disabled:cursor-not-allowed disabled:text-disabled-fg disabled:hover:bg-transparent',
);
