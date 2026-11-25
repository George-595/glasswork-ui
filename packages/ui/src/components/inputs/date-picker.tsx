/* Adapted from BoardUI's date-picker and Arc's date-picker / date-range-picker (MIT); see
   THIRD_PARTY_NOTICES.md. Built on our Popover primitive and Calendar, no date library. */
import { type ReactNode, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { PopoverContent, Popover as PopoverRoot, PopoverTrigger } from '../ui/popover';
import { Calendar, type CalendarBaseProps } from './calendar';
import {
  addMonths,
  type DayRange,
  DEFAULT_RANGE_PRESETS,
  EMPTY_RANGE,
  formatDay,
  type IsoDate,
  type RangePreset,
  todayIso,
} from './dates';
import { FieldTrigger } from './field-trigger';

/* DatePicker / DateRangePicker — a field-shaped button that opens a Popover holding the
   Calendar. Enter, Space or a click opens it with focus on the day that is the tab stop (the
   chosen day, else today); Esc closes and returns to the button. Picking a day closes it (a
   range closes on its second click). Values are `YYYY-MM-DD` strings (a range is
   `{ from, to }`), shown by Intl in the locale (default en-GB). Both sit in a FormField like
   an Input: the id, aria-describedby, aria-invalid and aria-required reach the button.

   Presets are quick picks shown as a row of chips above the calendar; the chip that matches
   the current value is pressed (aria-pressed), so you can see which range you are on.
   The range picker shows two months side by side on a wide screen (one on a phone), so a
   range across a month end is two clicks with no paging.
   `DateRangePicker` offers Last 7 / 30 / 90 days unless `presets` says otherwise; pass `false`
   to hide them. The panel sits in the browser's top layer, so it shows above a native <dialog> too. */
interface PickerCommon extends Pick<CalendarBaseProps, 'min' | 'max' | 'locale' | 'weekStart'> {
  /** Override "today" (tests, a server clock). */
  today?: IsoDate;
  placeholder?: string;
  disabled?: boolean;
  /** Show a Clear button while there is a value. */
  clearable?: boolean;
  /** The panel's accessible name. */
  panelLabel?: string;
  /** `sm` for a toolbar (32px). */
  size?: 'sm' | 'md';
  /** Size to the content instead of filling the container. */
  fit?: boolean;
  /** @deprecated Ignored: the panel always renders in place, in the top layer. */
  portal?: boolean;
  className?: string;
  id?: string;
  name?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'true' | 'false';
  'aria-required'?: boolean | 'true' | 'false';
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export interface DatePreset {
  label: string;
  /** The day it picks, given today. */
  day: (today: IsoDate) => IsoDate;
}

export interface DatePickerProps extends PickerCommon {
  value?: IsoDate | null;
  onValueChange?: (day: IsoDate | null) => void;
  presets?: readonly DatePreset[];
}

function tabStop(panel: HTMLElement | null) {
  return panel?.querySelector<HTMLElement>('button[data-day][tabindex="0"]');
}

const chip =
  'ui-date-chip inline-flex min-h-7 pointer-coarse:min-h-12 cursor-pointer items-center rounded-pill border border-solid border-border bg-transparent px-3 text-[12.5px] font-medium whitespace-nowrap text-fg-muted ' +
  'transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] motion-reduce:transition-none ' +
  'aria-pressed:border-brand aria-pressed:bg-selected aria-pressed:font-semibold aria-pressed:text-fg';

export function DatePicker({
  value = null,
  onValueChange,
  presets,
  placeholder = 'Select a date',
  clearable,
  panelLabel = 'Choose a date',
  portal: _portal,
  min,
  max,
  locale = 'en-GB',
  weekStart,
  today: todayProp,
  disabled,
  size,
  fit,
  className,
  ...aria
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const today = todayProp ?? todayIso();
  const choose = (day: IsoDate | null) => {
    onValueChange?.(day);
    setOpen(false);
  };
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <FieldTrigger
            {...aria}
            disabled={disabled}
            size={size}
            fit={fit}
            className={className}
            display={formatDay(value, locale)}
            placeholder={placeholder}
            clearLabel="Clear date"
            onClear={clearable ? () => onValueChange?.(null) : undefined}
          />
        }
      />
      <PopoverContent
        ref={panel}
        aria-label={panelLabel}
        className="ui-date-picker w-auto p-3"
        initialFocus={() => tabStop(panel.current)}
      >
        <div className="flex flex-col gap-3">
          {presets && presets.length > 0 && (
            <PresetRow label="Quick picks">
              {presets.map((p) => {
                const day = p.day(today);
                return (
                  <button
                    key={p.label}
                    type="button"
                    className={chip}
                    aria-pressed={value === day}
                    onClick={() => choose(day)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </PresetRow>
          )}
          <Calendar
            mode="single"
            value={value}
            onValueChange={choose}
            min={min}
            max={max}
            locale={locale}
            weekStart={weekStart}
            today={today}
            label={panelLabel}
          />
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}

function PresetRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of buttons, not a form fieldset
    <div role="group" aria-label={label} className="ui-date-presets flex flex-wrap gap-1.5">
      {children}
    </div>
  );
}

export interface DateRangePickerProps extends PickerCommon {
  value?: DayRange;
  onValueChange?: (range: DayRange) => void;
  /** Quick picks. Default Last 7 / 30 / 90 days; `false` hides them. */
  presets?: readonly RangePreset[] | false;
  /** Months side by side on a wide screen. Default 2 (a phone always shows one). */
  months?: 1 | 2;
}

export function DateRangePicker({
  value = EMPTY_RANGE,
  onValueChange,
  presets = DEFAULT_RANGE_PRESETS,
  months = 2,
  placeholder = 'Select a date range',
  clearable,
  panelLabel = 'Choose a date range',
  portal: _portal,
  min,
  max,
  locale = 'en-GB',
  weekStart,
  today: todayProp,
  disabled,
  size,
  fit,
  className,
  ...aria
}: DateRangePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayRange>(value);
  const panel = useRef<HTMLDivElement>(null);
  const today = todayProp ?? todayIso();

  const commit = (range: DayRange) => {
    onValueChange?.(range);
    setOpen(false);
  };
  const display =
    value.from && value.to
      ? `${formatDay(value.from, locale)} – ${formatDay(value.to, locale)}`
      : value.from
        ? `${formatDay(value.from, locale)} – …`
        : '';

  return (
    <PopoverRoot
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(value);
        setOpen(next);
      }}
    >
      <PopoverTrigger
        render={
          <FieldTrigger
            {...aria}
            disabled={disabled}
            size={size}
            fit={fit}
            className={cn(className)}
            display={display}
            placeholder={placeholder}
            clearLabel="Clear date range"
            onClear={clearable ? () => onValueChange?.(EMPTY_RANGE) : undefined}
          />
        }
      />
      <PopoverContent
        ref={panel}
        aria-label={panelLabel}
        className="ui-date-range-picker w-auto p-3"
        initialFocus={() => tabStop(panel.current)}
      >
        <div className="flex flex-col gap-3">
          {presets && presets.length > 0 && (
            <PresetRow label="Quick ranges">
              {presets.map((p) => {
                const r = p.range(today);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={chip}
                    aria-pressed={value.from === r.from && value.to === r.to}
                    onClick={() => commit(r)}
                  >
                    {p.label}
                  </button>
                );
              })}
            </PresetRow>
          )}
          <div className="flex flex-col gap-2">
            <div className="flex gap-4">
              {[0, 1].slice(0, months).map((n) => (
                <Calendar
                  key={n}
                  mode="range"
                  range={draft}
                  defaultMonth={
                    (draft.from ?? value.from)
                      ? addMonths((draft.from ?? value.from) as IsoDate, n)
                      : addMonths(today, n - (months - 1))
                  }
                  onRangeChange={(next) => {
                    setDraft(next);
                    if (next.from && next.to) commit(next);
                  }}
                  min={min}
                  max={max}
                  locale={locale}
                  weekStart={weekStart}
                  today={today}
                  label={panelLabel}
                  className={n === 1 ? 'max-md:hidden' : undefined}
                />
              ))}
            </div>
            <p role="status" className="m-0 min-h-4 text-[12px] text-fg-muted">
              {draft.from && !draft.to
                ? `Start ${formatDay(draft.from, locale)}. Pick the end day.`
                : ''}
            </p>
          </div>
        </div>
      </PopoverContent>
    </PopoverRoot>
  );
}
