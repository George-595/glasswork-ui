/* Adapted from Arc's radio-group and radio-cards (MIT, Elia Kuratli) and BoardUI's radio
   styling (MIT, Mertcan Dundar Esmergul); see THIRD_PARTY_NOTICES.md. Native radios, our roles. */
import { type ReactNode, useId } from 'react';
import { cn } from '../../lib/cn';

/* RadioGroup and RadioCards — one choice from a short list, every option visible.

   Both are native radios sharing a `name`, inside a <fieldset role="radiogroup">: the browser
   gives the roving focus (one tab stop on the chosen radio, then Arrow keys move and choose,
   wrapping), the form value and the screen-reader announcement ("2 of 3"). The group is named
   by its `legend` (visible, or `hideLegend` for assistive tech only); give it `description` for
   help that is read with it, and `error` for a problem (shown with an icon-free text line and
   `aria-invalid`).

   RadioGroup is the plain list of circles; RadioCards draws each option as a card (title,
   description, optional leading `icon`) for choices that need explaining. The chosen card has
   the kit's selected look: `bg-selected`, a brand border and a check circle, so it is not
   colour alone. Use SegmentedControl for 2–4 short labels in a row, NativeSelect for many. */
export interface RadioOption {
  value: string;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  /** RadioCards only: a leading picture. */
  icon?: ReactNode;
}

interface RadioBase {
  options: readonly RadioOption[];
  value: string | null;
  onValueChange: (value: string) => void;
  /** Names the group. Visible unless `hideLegend`. */
  legend: ReactNode;
  hideLegend?: boolean;
  description?: ReactNode;
  error?: ReactNode;
  name?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

const circle = cn(
  'ui-radio relative m-1 inline-grid size-[18px] shrink-0 cursor-pointer appearance-none place-content-center',
  // a 48px tap area around the 18px dot on a touch screen: an invisible ::before (the dot is the ::after)
  "pointer-coarse:before:absolute pointer-coarse:before:-inset-4 pointer-coarse:before:content-['']",
  'rounded-full border border-solid border-border-input bg-sunken',
  // the dot (craft-ok: a radio dot grows from its centre)
  "after:size-2 after:rounded-full after:bg-on-primary after:content-[''] after:scale-0 after:transition-[scale] after:duration-(--dur-fast) after:ease-(--ease-spring) motion-reduce:after:transition-none",
  'checked:after:scale-100 not-disabled:checked:border-primary not-disabled:checked:bg-primary',
  'not-disabled:not-checked:hover:border-fg-muted not-disabled:checked:hover:bg-primary-hover',
  'focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
  'aria-invalid:border-danger',
  'disabled:cursor-not-allowed disabled:border-disabled-border disabled:bg-disabled disabled:after:bg-disabled-fg',
);

function Group({
  legend,
  hideLegend,
  description,
  error,
  disabled,
  required,
  className,
  children,
}: Pick<
  RadioBase,
  'legend' | 'hideLegend' | 'description' | 'error' | 'disabled' | 'required' | 'className'
> & { children: ReactNode }) {
  const id = useId();
  const hasError = error !== undefined && error !== null && error !== false && error !== '';
  const describedBy = [description ? `${id}-d` : '', hasError ? `${id}-e` : '']
    .filter(Boolean)
    .join(' ');
  return (
    <fieldset
      // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: ARIA in HTML allows radiogroup on fieldset
      role="radiogroup"
      disabled={disabled}
      aria-required={required || undefined}
      aria-invalid={hasError || undefined}
      aria-describedby={describedBy || undefined}
      className={cn('ui-radio-group m-0 min-w-0 border-0 p-0', className)}
    >
      <legend
        className={cn(
          'mb-1.5 p-0 font-sans text-[12px] leading-[1.3] font-medium text-fg-muted',
          hideLegend && 'sr-only',
        )}
      >
        {legend}
      </legend>
      {description && (
        <p id={`${id}-d`} className="m-0 mb-1.5 text-[12px] text-fg-subtle">
          {description}
        </p>
      )}
      {children}
      <div aria-live="polite" id={`${id}-e`}>
        {hasError && <p className="m-0 mt-1.5 text-[12px] text-danger">{error}</p>}
      </div>
    </fieldset>
  );
}

export interface RadioGroupProps extends RadioBase {
  orientation?: 'vertical' | 'horizontal';
}

export function RadioGroup({
  options,
  value,
  onValueChange,
  name,
  orientation = 'vertical',
  ...group
}: RadioGroupProps) {
  const auto = useId();
  const groupName = name ?? auto;
  return (
    <Group {...group}>
      <div className={cn('flex gap-x-4', orientation === 'vertical' ? 'flex-col' : 'flex-wrap')}>
        {options.map((o) => (
          <label
            key={o.value}
            className="ui-radio-row inline-flex cursor-pointer items-start pointer-coarse:min-h-12 pointer-coarse:items-center gap-1.5 rounded-xs pe-2 text-[13px] leading-normal text-fg transition-colors duration-(--dur-fast) has-[:disabled]:cursor-not-allowed has-[:disabled]:text-disabled-fg motion-reduce:transition-none"
          >
            <input
              type="radio"
              name={groupName}
              value={o.value}
              checked={value === o.value}
              disabled={o.disabled}
              required={group.required}
              onChange={() => onValueChange(o.value)}
              className={circle}
            />
            <span className="pt-0.5">
              {o.label}
              {o.description && (
                <span className="block text-[12px] text-fg-muted">{o.description}</span>
              )}
            </span>
          </label>
        ))}
      </div>
    </Group>
  );
}

export interface RadioCardsProps extends RadioBase {
  /** Columns from a tablet up (1 on a phone). Default: one per option, to 3. */
  columns?: 1 | 2 | 3 | 4;
  /** Columns on a phone, below the tablet breakpoint. Default 1; 2 suits a long list of short
      labels (a dozen sizes). */
  phoneColumns?: 1 | 2;
}

const COLS = { 1: 'sm:grid-cols-1', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-3', 4: 'sm:grid-cols-4' };

export function RadioCards({
  options,
  value,
  onValueChange,
  name,
  columns,
  phoneColumns = 1,
  ...group
}: RadioCardsProps) {
  const auto = useId();
  const groupName = name ?? auto;
  const cols = columns ?? (Math.min(options.length, 3) as 1 | 2 | 3);
  return (
    <Group {...group}>
      <div
        className={cn('grid gap-2', phoneColumns === 2 ? 'grid-cols-2' : 'grid-cols-1', COLS[cols])}
      >
        {options.map((o) => {
          const checked = value === o.value;
          return (
            <label
              key={o.value}
              className={cn(
                'ui-radio-card relative flex cursor-pointer items-start gap-2.5 rounded-md border border-solid border-border-input bg-surface p-3',
                'transition-[border-color,background-color] duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
                'hover:bg-hover has-[:focus-visible]:[box-shadow:var(--ring)]',
                checked && 'border-brand bg-selected',
                'has-[:disabled]:cursor-not-allowed has-[:disabled]:border-disabled-border has-[:disabled]:bg-disabled has-[:disabled]:text-disabled-fg has-[:disabled]:hover:bg-disabled',
              )}
            >
              <input
                type="radio"
                name={groupName}
                value={o.value}
                checked={checked}
                disabled={o.disabled}
                required={group.required}
                onChange={() => onValueChange(o.value)}
                className={cn(circle, 'mt-0.5')}
              />
              {o.icon && <span className="mt-0.5 shrink-0 text-fg-muted">{o.icon}</span>}
              <span className="min-w-0">
                <span
                  className={cn(
                    'block text-[13px] leading-[1.3] text-fg',
                    checked && 'font-semibold',
                  )}
                >
                  {o.label}
                </span>
                {o.description && (
                  <span className="mt-0.5 block text-[12px] leading-[1.35] text-fg-muted">
                    {o.description}
                  </span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </Group>
  );
}
