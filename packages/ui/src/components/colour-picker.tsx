import {
  ColorPicker,
  ColorPickerArea,
  ColorPickerAreaThumb,
  ColorPickerEyeDropper,
  ColorPickerInput,
  ColorPickerSlider,
  ColorPickerSliderThumb,
  ColorPickerSwatch,
  ColorPickerSwatches,
  ColorPickerSwatchItem,
} from '@ui-sdk/react/color-picker';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* ColourPicker — choose a colour by eye, by number or from a palette, on Vercel's UI SDK colour
   picker (@ui-sdk/react/color-picker): a saturation/brightness area (a 2D slider screen
   readers hear as both channels), hue and opacity sliders, a text box that reads any CSS colour
   (hex, rgb(), hsl(), oklch(), a name) on Enter, the browser's eye dropper where there is one,
   and preset swatches.

   The presets are the app's own palette: pass role names (`chart-1`, `brand`…) and the picker
   reads what each resolves to in the current skin and mode, so it never holds a colour of its
   own. The starting value is a role too (`defaultRole`).

   What makes it the kit's: a live contrast check. Under the picker the chosen colour is shown
   as a chip with text on it, beside the WCAG contrast ratio against the page surface and
   whether it passes AA for text (4.5:1) and for large text and UI parts (3:1): the question a
   person picking a brand colour should ask. */
export interface ColourPickerProps {
  label: string;
  /** A role the picker starts on, read from the theme. Default 'brand'. */
  defaultRole?: string;
  /** Roles shown as swatches. */
  presets?: readonly string[];
  onValueChange?: (value: string) => void;
  /** Show the opacity slider. Default true. */
  alpha?: boolean;
  className?: string;
}

/** A role's colour as the browser computes it, read through a probe and a 1px canvas. */
function rgbOf(css: string, probe: HTMLElement | null): [number, number, number, number] | null {
  if (typeof document === 'undefined') return null;
  let value = css;
  if (probe && css.startsWith('var(')) {
    probe.style.color = css;
    value = getComputedStyle(probe).color;
  }
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const d = ctx.getImageData(0, 0, 1, 1).data;
  return [d[0] ?? 0, d[1] ?? 0, d[2] ?? 0, (d[3] ?? 255) / 255];
}

const lum = ([r, g, b]: readonly number[]) => {
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r ?? 0) + 0.7152 * ch(g ?? 0) + 0.0722 * ch(b ?? 0);
};

export const contrastRatio = (a: readonly number[], b: readonly number[]) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const toHex = ([r, g, b]: readonly number[]) =>
  `#${[r, g, b]
    .map((v) =>
      Math.round(v ?? 0)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

const thumb =
  'block size-5 rounded-full border-2 border-solid border-on-primary bg-(--color-picker-color) [box-shadow:0_0_0_1px_var(--border-strong),var(--elev-2)] outline-none transition-[scale] duration-(--dur-fast) focus-visible:scale-110 focus-visible:[box-shadow:var(--ring)] data-dragging:scale-125 motion-reduce:transition-none';

const PRESETS = [
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'chart-6',
  'chart-7',
  'chart-8',
];

export function ColourPicker({
  label,
  defaultRole = 'brand',
  presets = PRESETS,
  onValueChange,
  alpha = true,
  className,
}: ColourPickerProps) {
  const probe = useRef<HTMLSpanElement>(null);
  const [value, setValue] = useState<string | null>(null);
  const [swatches, setSwatches] = useState<{ role: string; value: string }[]>([]);
  const [surface, setSurface] = useState<[number, number, number, number] | null>(null);

  // read the roles once the theme is on the page (and again if the mode flips); keyed on the
  // names, so a fresh array of the same roles does not read again
  const presetKey = presets.join(',');
  useEffect(() => {
    const roles = presetKey.split(',').filter(Boolean);
    const read = () => {
      const p = probe.current;
      const start = rgbOf(`var(--${defaultRole})`, p);
      setValue((v) => v ?? (start ? toHex(start) : null));
      setSwatches(
        roles.flatMap((role) => {
          const c = rgbOf(`var(--${role})`, p);
          return c ? [{ role, value: toHex(c) }] : [];
        }),
      );
      setSurface(rgbOf('var(--surface-solid)', p));
    };
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-skin', 'class'],
    });
    return () => mo.disconnect();
  }, [defaultRole, presetKey]);

  const picked = value ? rgbOf(value, null) : null;
  const ratio = picked && surface ? contrastRatio(picked, surface) : null;
  const onPick = picked ? (lum(picked) > 0.18 ? 'text-fg' : 'text-on-primary') : 'text-fg';

  return (
    <div
      className={cn(
        'ui-colour-picker flex w-full max-w-xs min-w-0 flex-col gap-3 rounded-xl border border-solid border-border bg-surface p-3 font-sans [box-shadow:var(--elev-card)] glass-chrome',
        className,
      )}
    >
      <span ref={probe} aria-hidden="true" className="hidden" />
      {value === null ? (
        <div
          className="aspect-[4/3] w-full animate-pulse rounded-lg bg-sunken"
          aria-hidden="true"
        />
      ) : (
        <ColorPicker
          aria-label={label}
          defaultValue={value}
          onValueChange={(v) => {
            setValue(v);
            onValueChange?.(v);
          }}
          className="flex flex-col gap-3"
        >
          <ColorPickerArea className="relative aspect-[4/3] w-full touch-none rounded-lg [background:var(--color-area-background)] inset-ring inset-ring-border">
            <ColorPickerAreaThumb
              aria-label={`${label}: saturation and brightness`}
              className={cn(
                thumb,
                'absolute -translate-1/2 start-[calc(var(--area-x)*100%)] top-[calc((1-var(--area-y))*100%)] rtl:translate-x-1/2',
              )}
            />
          </ColorPickerArea>
          <div className="flex items-center gap-3">
            <ColorPickerSwatch className="size-9 shrink-0 rounded-full bg-(--color-picker-color) inset-ring inset-ring-border-strong" />
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <ColorPickerSlider
                channel="hue"
                className="relative h-3 touch-none rounded-pill [background:var(--color-slider-background)]"
              >
                <ColorPickerSliderThumb
                  aria-label="Hue"
                  className={cn(
                    thumb,
                    'absolute top-1/2 -translate-1/2 start-(--color-slider-thumb-position) rtl:translate-x-1/2',
                  )}
                />
              </ColorPickerSlider>
              {alpha && (
                <ColorPickerSlider
                  channel="alpha"
                  className="ui-alpha-track relative h-3 touch-none rounded-pill"
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-0 rounded-pill [background:var(--color-slider-background)]"
                  />
                  <ColorPickerSliderThumb
                    aria-label="Opacity"
                    className={cn(
                      thumb,
                      'absolute top-1/2 -translate-1/2 start-(--color-slider-thumb-position) rtl:translate-x-1/2',
                    )}
                  />
                </ColorPickerSlider>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ColorPickerInput
              aria-label={`${label} as text`}
              className="min-h-9 min-w-0 flex-1 rounded-md border border-solid border-border-input bg-surface-solid px-2.5 font-mono text-[13px] text-fg outline-none pointer-coarse:min-h-12 focus:border-brand focus:[box-shadow:var(--ring)] glass:bg-surface"
            />
            <ColorPickerEyeDropper
              aria-label="Pick a colour from the screen"
              className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-solid border-border bg-transparent text-fg-muted pointer-coarse:size-12 hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] disabled:hidden"
            >
              <Icon name="pipette" size={15} />
            </ColorPickerEyeDropper>
          </div>
          {swatches.length > 0 && (
            <ColorPickerSwatches
              aria-label="Palette"
              className="m-0 flex list-none flex-wrap gap-1.5 p-0"
            >
              {swatches.map((s) => (
                <ColorPickerSwatchItem
                  key={s.role}
                  value={s.value}
                  aria-label={s.role.replace('-', ' ')}
                  className="size-7 cursor-pointer rounded-md border-0 bg-(--color-picker-color) outline-none inset-ring inset-ring-border-strong transition-[scale] duration-(--dur-fast) pointer-coarse:size-12 hover:scale-110 focus-visible:[box-shadow:var(--ring)] data-selected:ring-2 data-selected:ring-fg data-selected:ring-offset-2 data-selected:ring-offset-surface motion-reduce:transition-none"
                />
              ))}
            </ColorPickerSwatches>
          )}
        </ColorPicker>
      )}
      {ratio !== null && picked && (
        <div className="flex items-center gap-2.5 border-0 border-t border-solid border-border-subtle pt-3">
          <span
            className={cn(
              'inline-flex h-9 min-w-14 items-center justify-center rounded-md px-2 text-[15px] font-semibold',
              onPick,
            )}
            style={{ backgroundColor: value ?? undefined }}
            aria-hidden="true"
          >
            Aa
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[13px] font-semibold text-fg tabular-nums">
              {ratio.toFixed(2)}:1 on the surface
            </span>
            <span className="flex gap-1.5 text-[11px]">
              <Verdict ok={ratio >= 4.5} label="AA text" />
              <Verdict ok={ratio >= 3} label="AA large & UI" />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function Verdict({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-pill px-1.5 font-medium',
        ok ? 'bg-success-soft text-fg' : 'bg-danger-soft text-fg',
      )}
    >
      <Icon name={ok ? 'check' : 'x'} size={10} strokeWidth={3} />
      {label}
      <span className="sr-only">{ok ? ' passes' : ' fails'}</span>
    </span>
  );
}
