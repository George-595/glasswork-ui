import { TimeInput } from '@ui-sdk/react/time-input';
import { useId, useState } from 'react';
import { cn } from '../lib/cn';

/* TimeField — a time typed part by part (hours, minutes, and AM/PM on a 12-hour clock), on
   Vercel's UI SDK time input (@ui-sdk/react/time-input): each part is a spin button, Up/Down
   step it, typing fills it and moves on, Backspace empties it, and the visible label names the
   group. Beside it a small clock face shows the time: its hands sweep to each new value
   (instantly under reduced motion), so a wrong "07" for "19" is caught at a glance. `min` and
   `max` mark a time outside them as invalid (danger border and a message).

   TimeRange is a start and an end with the span between them drawn on a day ruler, and the
   length in words ("2 h 30 min"); an end before the start reads as running past midnight. */
export interface TimeFieldProps {
  label: string;
  value?: string | null;
  defaultValue?: string;
  onValueChange?: (value: string | null) => void;
  min?: string;
  max?: string;
  hourCycle?: 12 | 24;
  /** Show the clock face. Default true. */
  clock?: boolean;
  hint?: string;
  className?: string;
}

const toMin = (t?: string | null) => {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? (h ?? 0) * 60 + (m ?? 0) : null;
};

function Clock({ minutes }: { minutes: number | null }) {
  const m = minutes ?? 0;
  // degrees only grow, so a hand passing 12 keeps turning the short way
  const hour = ((m / 60) % 12) * 30;
  const minute = (m % 60) * 6;
  return (
    <svg viewBox="0 0 40 40" className="ui-clock size-11 shrink-0" aria-hidden="true">
      <circle cx="20" cy="20" r="18.5" className="fill-sunken stroke-border" strokeWidth={1} />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          // biome-ignore lint/suspicious/noArrayIndexKey: the twelve hour marks
          key={i}
          x1="20"
          y1="3.5"
          x2="20"
          y2={i % 3 === 0 ? 7 : 5.5}
          transform={`rotate(${i * 30} 20 20)`}
          className="stroke-fg-subtle"
          strokeWidth={i % 3 === 0 ? 1.4 : 0.8}
          strokeLinecap="round"
        />
      ))}
      <line
        x1="20"
        y1="20"
        x2="20"
        y2="10.5"
        className={cn('ui-clock-hand stroke-fg', minutes === null && 'opacity-30')}
        strokeWidth={2.2}
        strokeLinecap="round"
        style={{ rotate: `${hour}deg` }}
      />
      <line
        x1="20"
        y1="20"
        x2="20"
        y2="6.5"
        className={cn('ui-clock-hand stroke-brand', minutes === null && 'opacity-30')}
        strokeWidth={1.4}
        strokeLinecap="round"
        style={{ rotate: `${minute}deg` }}
      />
      <circle cx="20" cy="20" r="1.8" className="fill-brand" />
    </svg>
  );
}

const segments =
  'ui-time-input inline-flex min-h-9 items-center rounded-md border border-solid border-border-input bg-surface-solid px-2.5 font-mono text-[14px] text-fg tabular-nums transition-[border-color,box-shadow] duration-(--dur-fast) pointer-coarse:min-h-12 focus-within:border-brand focus-within:[box-shadow:var(--ring)] data-invalid:border-danger glass:bg-surface ' +
  '[&_[data-slot=time-input-segment]]:rounded-xs [&_[data-slot=time-input-segment]]:px-0.5 [&_[data-slot=time-input-segment]]:outline-none [&_[data-slot=time-input-segment]:focus]:bg-brand [&_[data-slot=time-input-segment]:focus]:text-on-primary [&_[data-slot=time-input-segment][data-empty]]:text-fg-muted [&_[data-slot=time-input-segment][data-type=literal]]:text-fg-muted pointer-coarse:[&_[data-slot=time-input-segment]:not([data-type=literal])]:inline-flex pointer-coarse:[&_[data-slot=time-input-segment]:not([data-type=literal])]:min-h-12 pointer-coarse:[&_[data-slot=time-input-segment]:not([data-type=literal])]:min-w-12 pointer-coarse:[&_[data-slot=time-input-segment]:not([data-type=literal])]:items-center pointer-coarse:[&_[data-slot=time-input-segment]:not([data-type=literal])]:justify-center';

export function TimeField({
  label,
  value,
  defaultValue,
  onValueChange,
  min,
  max,
  hourCycle,
  clock = true,
  hint,
  className,
}: TimeFieldProps) {
  const id = useId();
  const [inner, setInner] = useState<string | null>(defaultValue ?? null);
  const current = value === undefined ? inner : value;
  const m = toMin(current);
  const invalid =
    m !== null && ((min && m < (toMin(min) ?? 0)) || (max && m > (toMin(max) ?? 1440)));
  return (
    <div className={cn('ui-time-field flex flex-col gap-1.5 font-sans', className)}>
      <span id={`${id}-l`} className="text-[13px] font-medium text-fg">
        {label}
      </span>
      <div className="flex items-center gap-3">
        <TimeInput
          aria-labelledby={`${id}-l`}
          aria-describedby={hint || invalid ? `${id}-h` : undefined}
          value={value}
          defaultValue={defaultValue}
          min={min}
          max={max}
          hourCycle={hourCycle}
          onValueChange={(v) => {
            setInner(v);
            onValueChange?.(v);
          }}
          className={segments}
        />
        {clock && <Clock minutes={m} />}
      </div>
      {(hint || invalid) && (
        <span
          id={`${id}-h`}
          className={cn('text-[12px]', invalid ? 'text-danger' : 'text-fg-muted')}
        >
          {invalid ? `Choose a time between ${min ?? '00:00'} and ${max ?? '23:59'}.` : hint}
        </span>
      )}
    </div>
  );
}

const spanWords = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return [h ? `${h} h` : '', m ? `${m} min` : ''].filter(Boolean).join(' ') || '0 min';
};

export interface TimeRangeProps {
  label: string;
  defaultStart?: string;
  defaultEnd?: string;
  onChange?: (start: string | null, end: string | null) => void;
  hourCycle?: 12 | 24;
  className?: string;
}

export function TimeRange({
  label,
  defaultStart = '09:00',
  defaultEnd = '17:30',
  onChange,
  hourCycle,
  className,
}: TimeRangeProps) {
  const id = useId();
  const [start, setStart] = useState<string | null>(defaultStart);
  const [end, setEnd] = useState<string | null>(defaultEnd);
  const a = toMin(start);
  const b = toMin(end);
  const length = a !== null && b !== null ? (b - a + 1440) % 1440 : null;
  const overnight = a !== null && b !== null && b < a;
  return (
    <fieldset
      className={cn(
        'ui-time-range m-0 flex min-w-0 flex-col gap-2 border-0 p-0 font-sans',
        className,
      )}
    >
      <legend className="mb-1.5 p-0 text-[13px] font-medium text-fg">{label}</legend>
      <div className="flex flex-wrap items-center gap-2">
        <TimeInput
          aria-label="Starts"
          defaultValue={defaultStart}
          hourCycle={hourCycle}
          onValueChange={(v) => {
            setStart(v);
            onChange?.(v, end);
          }}
          className={segments}
        />
        <span aria-hidden="true" className="text-fg-muted">
          →
        </span>
        <TimeInput
          aria-label="Ends"
          defaultValue={defaultEnd}
          hourCycle={hourCycle}
          onValueChange={(v) => {
            setEnd(v);
            onChange?.(start, v);
          }}
          className={segments}
        />
        <output
          className="ms-1 rounded-pill bg-brand-soft px-2.5 py-0.5 text-[12px] font-semibold text-fg tabular-nums"
          aria-live="polite"
        >
          {length === null ? '—' : spanWords(length)}
          {overnight && ' (overnight)'}
        </output>
      </div>
      <div id={id} className="relative h-7" aria-hidden="true">
        <div className="absolute inset-x-0 top-2 h-3 overflow-hidden rounded-pill bg-sunken">
          {a !== null && b !== null && (
            <>
              <span
                className="ui-time-range-bar absolute inset-y-0 rounded-pill bg-brand"
                style={{
                  insetInlineStart: `${(a / 1440) * 100}%`,
                  width: `${((overnight ? 1440 - a : (length ?? 0)) / 1440) * 100}%`,
                }}
              />
              {overnight && (
                <span
                  className="ui-time-range-bar absolute inset-y-0 start-0 rounded-pill bg-brand"
                  style={{ width: `${(b / 1440) * 100}%` }}
                />
              )}
            </>
          )}
        </div>
        {[0, 6, 12, 18, 24].map((h) => (
          <span
            key={h}
            className="absolute top-5.5 -translate-x-1/2 text-[10px] text-fg-subtle tabular-nums first:translate-x-0 last:-translate-x-full"
            style={{ insetInlineStart: `${(h / 24) * 100}%` }}
          >
            {String(h).padStart(2, '0')}
          </span>
        ))}
      </div>
    </fieldset>
  );
}
