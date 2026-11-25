import { type CSSProperties, useEffect, useId, useRef, useState } from 'react';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* Droplet controls — a slider and a switch whose thumb behaves like a drop of liquid.

   DropletSlider: the thumb stretches along the track the faster it moves and settles back with a
   wobble; while held or focused a teardrop above it shows the value. It is a native range input
   underneath (the whole track is its hit area, 48px tall on touch), so the keys, a screen reader's
   swipe gestures and form submission all work as they do on any slider.

   DropletSwitch: on a toggle the drop stretches across the track, lands, and sends a small ripple
   through the fill. A real button with role="switch" and aria-checked, named by its visible label.

   Both stop moving under prefers-reduced-motion and keep only the colour change. */
export interface DropletSliderProps {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: number;
  value?: number;
  onValueChange?: (value: number) => void;
  format?: (value: number) => string;
  name?: string;
  className?: string;
}

export function DropletSlider({
  label,
  min = 0,
  max = 100,
  step = 1,
  defaultValue,
  value,
  onValueChange,
  format = String,
  name,
  className,
}: DropletSliderProps) {
  const id = useId();
  const [inner, setInner] = useState(defaultValue ?? min);
  const current = value ?? inner;
  const [stretch, setStretch] = useState(1);
  const [lean, setLean] = useState(0);
  const last = useRef({ v: current, t: 0 });
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (settle.current && clearTimeout(settle.current)), []);
  const pct = ((current - min) / (max - min || 1)) * 100;

  const change = (v: number) => {
    const now = performance.now();
    const dt = Math.max(8, now - last.current.t);
    const speed = (Math.abs(v - last.current.v) / (max - min || 1)) * (1000 / dt); // track-widths per second
    last.current = { v, t: now };
    setStretch(1 + Math.min(0.7, speed * 0.35));
    setLean(Math.sign(v - current));
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      setStretch(1);
      setLean(0);
    }, 90);
    setInner(v);
    onValueChange?.(v);
  };

  return (
    <div
      className={cn('ui-droplet-slider flex w-full min-w-0 flex-col gap-1 font-sans', className)}
    >
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
        </label>
        <output htmlFor={id} className="text-sm text-fg-muted tabular-nums">
          {format(current)}
        </output>
      </div>
      <div
        className="ui-droplet-track group/drop relative h-10 pointer-coarse:h-12"
        style={{ '--drop': `${pct}%`, '--stretch': stretch, '--lean': lean } as CSSProperties}
      >
        <span className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-pill border border-solid border-border-input bg-sunken" />
        <span className="ui-droplet-fill absolute top-1/2 left-0 h-2 -translate-y-1/2 rounded-pill bg-brand" />
        <span
          className="ui-droplet-thumb absolute top-1/2 size-6 rounded-full bg-brand"
          aria-hidden="true"
        >
          <span className="ui-droplet-gloss" />
        </span>
        <span
          className="ui-droplet-tag pointer-events-none absolute bottom-full grid min-w-10 place-items-center rounded-[50%_50%_50%_6px] bg-fg px-2 py-1 text-xs font-semibold text-surface-solid tabular-nums"
          aria-hidden="true"
        >
          <span>{format(current)}</span>
        </span>
        <input
          id={id}
          name={name}
          type="range"
          min={min}
          max={max}
          step={step}
          value={current}
          aria-valuetext={format(current)}
          onChange={(e) => change(Number(e.target.value))}
          className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

export interface DropletSwitchProps {
  label: string;
  description?: string;
  checked?: boolean;
  defaultChecked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function DropletSwitch({
  label,
  description,
  checked,
  defaultChecked = false,
  onCheckedChange,
  disabled,
  className,
}: DropletSwitchProps) {
  const id = useId();
  const [inner, setInner] = useState(defaultChecked);
  const on = checked ?? inner;
  const [flips, setFlips] = useState(0);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={`${id}-l`}
      aria-describedby={description ? `${id}-d` : undefined}
      disabled={disabled}
      onClick={() => {
        setInner(!on);
        setFlips((f) => f + 1);
        playSound(on ? 'toggle-off' : 'toggle-on');
        onCheckedChange?.(!on);
      }}
      className={cn(
        'ui-droplet-switch group/sw flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent px-1 text-left font-sans outline-none pointer-coarse:min-h-12 focus-visible:[box-shadow:var(--ring)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span id={`${id}-l`} className="text-sm font-medium text-fg">
          {label}
        </span>
        {description && (
          <span id={`${id}-d`} className="text-[13px] text-fg-muted">
            {description}
          </span>
        )}
      </span>
      <span
        className="ui-droplet-sw relative h-8 w-14 shrink-0 overflow-hidden rounded-pill border border-solid border-border-input bg-sunken"
        data-on={on || undefined}
      >
        <span className="ui-droplet-sw-fill absolute inset-0 rounded-pill bg-brand" />
        {flips > 0 && <span key={`r${flips}`} className="ui-droplet-ripple" />}
        <span
          key={`d${flips}`}
          className={cn(
            'ui-droplet-sw-drop absolute top-1 size-6 rounded-pill bg-surface-solid',
            flips > 0 && 'ui-droplet-go',
          )}
        >
          <span className="ui-droplet-gloss" />
        </span>
      </span>
    </button>
  );
}
