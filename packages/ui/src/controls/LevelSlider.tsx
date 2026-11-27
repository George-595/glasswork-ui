import {
  SliderControl,
  SliderIndicator,
  Slider as SliderRoot,
  SliderThumb,
  SliderTrack,
} from '@ui-sdk/react/slider';
import { type HTMLAttributes, useId } from 'react';
import { cn } from '../lib/cn';

/* LevelSlider — a thick fill bar you drag: brightness, position, volume, warmth. It is the
   kit's Slider primitive (Vercel's UI SDK slider), so the keys are the same: arrows step, Page Up and
   Page Down take ten steps, Home and End jump to the ends; the thumb is the `slider` with
   `aria-valuetext` from `formatValue` (a native range input inside the grip).

   The fill is `brand-soft` with a `brand` edge, on the sunken track; the value sits inside the
   bar on a solid chip (text over a fill needs one). `onValueChange` runs while dragging (the app
   throttles); `onValueCommit` on release and on every key press (a held key commits on each repeat; the app
   debounces if that matters). `ghost` marks a second value on the track,
   the confirmed one while a pending value is shown; the mark is decorative and `ghostLabel` is
   its text for screen readers. `orientation="vertical"` stands the bar up (a cover). The fill
   jumps; nothing eases. The thumb has a 48px target with a finger at every size. */
export interface LevelSliderProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange'> {
  label: string;
  value: number;
  /** While dragging. */
  onValueChange?: (value: number) => void;
  /** On release, and on every key press (a held key commits on each repeat). */
  onValueCommit?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  orientation?: 'horizontal' | 'vertical';
  /** Track thickness: 40, 56 or 72px. */
  size?: 'md' | 'lg' | 'xl';
  /** The value as words and in the bar: '70 %'. Default: the number. */
  formatValue?: (value: number) => string;
  /** End labels outside the track: { min: 'Warm', max: 'Cool' }. */
  ends?: { min: string; max: string };
  /** A second value marked on the track. */
  ghost?: number | null;
  /** Words for the ghost mark: 'Confirmed 40 %'. */
  ghostLabel?: string;
  disabled?: boolean;
  /** Keep the label for assistive tech only. */
  hideLabel?: boolean;
}

const THICK_H: Record<NonNullable<LevelSliderProps['size']>, string> = {
  md: 'h-10 pointer-coarse:h-12',
  lg: 'h-14',
  xl: 'h-18',
};
const THICK_W: Record<NonNullable<LevelSliderProps['size']>, string> = {
  md: 'w-10 pointer-coarse:w-12',
  lg: 'w-14',
  xl: 'w-18',
};
// the grip is a little shorter than the track it rides in
const GRIP_H: Record<NonNullable<LevelSliderProps['size']>, string> = {
  md: 'h-8 w-4 pointer-coarse:h-10',
  lg: 'h-12 w-4',
  xl: 'h-16 w-4',
};
const GRIP_V: Record<NonNullable<LevelSliderProps['size']>, string> = {
  md: 'w-8 h-4 pointer-coarse:w-10',
  lg: 'w-12 h-4',
  xl: 'w-16 h-4',
};

function endLabel(text: string) {
  return <span className="font-sans text-[12px] text-fg-muted">{text}</span>;
}

export function LevelSlider({
  label,
  value,
  onValueChange,
  onValueCommit,
  min = 0,
  max = 100,
  step = 1,
  orientation = 'horizontal',
  size = 'md',
  formatValue = String,
  ends,
  ghost,
  ghostLabel,
  disabled,
  hideLabel,
  className,
  ...props
}: LevelSliderProps) {
  const labelId = useId();
  const ghostId = useId();
  const vertical = orientation === 'vertical';
  const span = max - min || 1;
  const showGhost = ghost !== null && ghost !== undefined;
  const ghostPct = showGhost ? Math.min(100, Math.max(0, ((ghost - min) / span) * 100)) : 0;

  return (
    <div
      {...props}
      data-orientation={orientation}
      data-size={size}
      data-disabled={disabled || undefined}
      className={cn(
        'ui-level-slider flex gap-1.5',
        vertical ? 'h-48 flex-col items-center' : 'w-full flex-col',
        className,
      )}
    >
      <span
        id={labelId}
        className={cn('font-sans text-[13px] font-medium text-fg', hideLabel && 'sr-only')}
      >
        {label}
      </span>
      {vertical && ends && endLabel(ends.max)}
      <SliderRoot
        min={min}
        max={max}
        step={step}
        orientation={orientation}
        disabled={disabled}
        value={value}
        onValueChange={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          if (n !== undefined) onValueChange?.(n);
        }}
        onValueCommit={(v) => {
          const n = Array.isArray(v) ? v[0] : v;
          if (n !== undefined) onValueCommit?.(n);
        }}
        format={(v) => formatValue(v)}
        className={cn(
          'ui-level-slider-root flex',
          vertical
            ? cn('min-h-0 flex-1 justify-center', THICK_W[size])
            : cn('w-full', THICK_H[size]),
        )}
      >
        {/* the bar: the press area and the visible track; the rail inside it is inset by half the grip, so the grip
            stays on the bar at both ends, and the fill reaches back over that inset to the bar's edge */}
        <SliderControl
          className={cn(
            'relative flex grow touch-none select-none overflow-hidden rounded-pill border border-solid border-border-input bg-sunken [box-shadow:var(--elev-0)]',
            'data-disabled:border-disabled-border data-disabled:bg-disabled forced-colors:border-[CanvasText]',
          )}
        >
          <SliderTrack className={cn('relative grow', vertical ? 'my-2' : 'mx-2')}>
            <SliderIndicator
              className={cn(
                'border-solid border-brand bg-brand-soft data-disabled:border-disabled-border data-disabled:bg-disabled-fg',
                'before:absolute before:bg-brand-soft before:content-[""] data-disabled:before:bg-disabled-fg',
                vertical
                  ? 'border-t-2 before:inset-x-0 before:-bottom-2 before:h-2'
                  : 'border-r-2 before:inset-y-0 before:-left-2 before:w-2',
                'forced-colors:bg-[Highlight] forced-colors:before:bg-[Highlight]',
              )}
            />
            {showGhost && (
              <span
                aria-hidden="true"
                data-ghost=""
                style={vertical ? { bottom: `${ghostPct}%` } : { left: `${ghostPct}%` }}
                className={cn(
                  'pointer-events-none absolute bg-fg-muted',
                  vertical ? 'inset-x-0 h-0.5' : 'inset-y-0 w-0.5',
                )}
              />
            )}
            <span
              aria-hidden="true"
              data-chip=""
              className={cn(
                'pointer-events-none absolute rounded-pill bg-surface-solid px-2 py-0.5 font-sans text-[13px] font-semibold tabular-nums text-fg',
                vertical ? 'bottom-2 left-1/2 -translate-x-1/2' : 'top-1/2 left-0 -translate-y-1/2',
              )}
            >
              {formatValue(value)}
            </span>
            <SliderThumb
              aria-labelledby={labelId}
              aria-describedby={showGhost && ghostLabel ? ghostId : undefined}
              className={cn(
                'ui-level-slider-thumb box-border block cursor-grab rounded-pill border-2 border-solid border-brand bg-raised [box-shadow:var(--elev-2)]',
                'has-focus-visible:[box-shadow:var(--ring)] active:cursor-grabbing data-dragging:cursor-grabbing',
                'data-disabled:cursor-not-allowed data-disabled:border-disabled-border data-disabled:bg-disabled',
                // a 48px target at every size
                'after:absolute after:top-1/2 after:left-1/2 after:size-12 after:-translate-1/2 after:content-[""]',
                vertical ? GRIP_V[size] : GRIP_H[size],
                'forced-colors:border-[Highlight]',
              )}
            />
          </SliderTrack>
        </SliderControl>
      </SliderRoot>
      {showGhost && ghostLabel && (
        <span id={ghostId} className="sr-only">
          {ghostLabel}
        </span>
      )}
      {ends &&
        (vertical ? (
          endLabel(ends.min)
        ) : (
          <span className="flex justify-between">
            {endLabel(ends.min)}
            {endLabel(ends.max)}
          </span>
        ))}
    </div>
  );
}
