/* Adapted from BoardUI's date-picker and Arc's date-picker / date-range-picker (MIT); see
   THIRD_PARTY_NOTICES.md. Built on our Popover primitive and Calendar, no date library. */
import { type ReactNode, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { Button } from '../button';
import { PopoverContent, Popover as PopoverRoot, PopoverTrigger } from '../ui/popover';
import { useIsClient } from '../ui/use-is-client';
import { Calendar, type CalendarBaseProps } from './calendar';
import {
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

   Presets are quick picks in a column beside the calendar (stacked above it on a phone).
   `DateRangePicker` offers Last 7 / 30 / 90 days unless `presets` says otherwise; pass `false`
   to hide them. Inside a native <dialog> pass `portal={false}`, or the panel mounts behind it. */
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
  /** Render the panel in place (inside a modal dialog) instead of in a portal. */
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

function focusTabStop(panel: HTMLElement | null) {
  panel?.querySelector<HTMLElement>('button[data-day][tabindex="0"]')?.focus();
}

const presetButton = 'justify-start whitespace-nowrap font-normal text-fg-muted hover:text-fg';

export function DatePicker({
  value = null,
  onValueChange,
  presets,
  placeholder = 'Select a date',
  clearable,
  panelLabel = 'Choose a date',
  portal = true,
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
  const client = useIsClient();
  const panel = useRef<HTMLDivElement>(null);
  const today = todayProp ?? todayIso();
  const choose = (day: IsoDate | null) => {
    onValueChange?.(day);
    setOpen(false);
  };
  return (
    <PopoverRoot open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent
        ref={panel}
        portal={portal && client}
        aria-label={panelLabel}
        className="ui-date-picker w-auto p-3"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          focusTabStop(panel.current);
        }}
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          {presets && presets.length > 0 && (
            <PresetColumn label="Quick picks">
              {presets.map((p) => (
                <Button
                  key={p.label}
                  variant="ghost"
                  size="sm"
                  className={presetButton}
                  onClick={() => choose(p.day(today))}
                >
                  {p.label}
                </Button>
              ))}
            </PresetColumn>
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

function PresetColumn({ label, children }: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a labelled group of buttons, not a form fieldset
    <div
      role="group"
      aria-label={label}
      className="flex shrink-0 flex-row flex-wrap gap-1 sm:w-32 sm:flex-col sm:flex-nowrap"
    >
      {children}
    </div>
  );
}

export interface DateRangePickerProps extends PickerCommon {
  value?: DayRange;
  onValueChange?: (range: DayRange) => void;
  /** Quick picks. Default Last 7 / 30 / 90 days; `false` hides them. */
  presets?: readonly RangePreset[] | false;
}

export function DateRangePicker({
  value = EMPTY_RANGE,
  onValueChange,
  presets = DEFAULT_RANGE_PRESETS,
  placeholder = 'Select a date range',
  clearable,
  panelLabel = 'Choose a date range',
  portal = true,
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
  const client = useIsClient();
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
      <PopoverTrigger asChild>
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
      </PopoverTrigger>
      <PopoverContent
        ref={panel}
        portal={portal && client}
        aria-label={panelLabel}
        className="ui-date-range-picker w-auto p-3"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          focusTabStop(panel.current);
        }}
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          {presets && presets.length > 0 && (
            <PresetColumn label="Quick ranges">
              {presets.map((p) => (
                <Button
                  key={p.id}
                  variant="ghost"
                  size="sm"
                  className={presetButton}
                  onClick={() => commit(p.range(today))}
                >
                  {p.label}
                </Button>
              ))}
            </PresetColumn>
          )}
          <div className="flex flex-col gap-2">
            <Calendar
              mode="range"
              range={draft}
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
            />
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
