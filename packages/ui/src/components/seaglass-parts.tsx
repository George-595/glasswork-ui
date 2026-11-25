import { type CSSProperties, type ReactNode, useId, useState } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';

/* Small sea glass parts drawn in SVG (no WebGL, so any number of them is free): the same
   frosted pebbles as the empty-state pictures, in the seaglass roles of @apps/colors. */

const FILL = [
  'fill-seaglass-0',
  'fill-seaglass-1',
  'fill-seaglass-2',
  'fill-seaglass-3',
  'fill-seaglass-4',
  'fill-seaglass-5',
  'fill-seaglass-6',
] as const;

/** One frosted pebble, decorative. `lit` false draws only its outline. */
export function Pebble({
  size = 28,
  tint = 5,
  lit = true,
  tilt = 0,
  className,
}: {
  size?: number;
  tint?: number;
  lit?: boolean;
  tilt?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 40 32"
      width={size}
      height={(size * 32) / 40}
      aria-hidden="true"
      focusable="false"
      className={cn('ui-pebble overflow-visible', className)}
    >
      <g transform={`rotate(${tilt} 20 16)`}>
        <ellipse
          cx="20"
          cy="16"
          rx="17"
          ry="12.5"
          className={cn(
            lit ? (FILL[tint % FILL.length] ?? FILL[0]) : 'fill-transparent',
            lit ? 'stroke-border-strong' : 'stroke-fg-subtle',
            'transition-[fill,stroke] duration-(--dur-fast) motion-reduce:transition-none',
          )}
          strokeWidth={lit ? 0.8 : 1.4}
          strokeOpacity={lit ? 0.5 : 1}
        />
        {lit && (
          <>
            <ellipse
              cx="18"
              cy="12"
              rx="12"
              ry="5.5"
              className="fill-seaglass-paper"
              fillOpacity={0.35}
            />
            <ellipse
              cx="12.5"
              cy="10"
              rx="2.8"
              ry="1.3"
              className="fill-seaglass-paper"
              fillOpacity={0.9}
            />
          </>
        )}
      </g>
    </svg>
  );
}

/* ---- SeaGlassRating -----------------------------------------------------------------------
   A 1-to-`max` rating drawn as pebbles. A real radio group (native inputs, one tab stop, arrow
   keys move, the name and "3 of 5" read out), so it works in a form with `name`. Hover lights
   the pebbles up to the pointer as a preview. `readOnly` draws the value as a picture with a
   text name ("Rated 4 of 5"). */
export interface SeaGlassRatingProps {
  label: string;
  value: number;
  onValueChange?: (value: number) => void;
  max?: number;
  /** The words for each value, e.g. ["Poor", "Fair", "Good", "Great", "Superb"]. */
  labels?: readonly string[];
  name?: string;
  readOnly?: boolean;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const RATING_PX = { sm: 22, md: 30, lg: 40 } as const;
const TILTS = [-14, 8, -4, 12, -10, 6, -8, 14, -6, 10];

export function SeaGlassRating({
  label,
  value,
  onValueChange,
  max = 5,
  labels,
  name,
  readOnly = false,
  disabled = false,
  size = 'md',
  className,
}: SeaGlassRatingProps) {
  const [hover, setHover] = useState<number | null>(null);
  const group = useId();
  const px = RATING_PX[size];
  const shown = hover ?? value;
  const word = (n: number) => labels?.[n - 1] ?? `${n} of ${max}`;
  const steps = Array.from({ length: max }, (_, i) => i + 1);

  if (readOnly)
    return (
      <span
        role="img"
        aria-label={`${label}: rated ${value} of ${max}`}
        className={cn('ui-rating inline-flex items-center gap-0.5', className)}
      >
        {steps.map((n) => (
          <Pebble key={n} size={px} tint={(n + 2) % 7} lit={n <= value} tilt={TILTS[n % 10]} />
        ))}
      </span>
    );

  return (
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the hover preview is a pointer extra; the radios are the control
    <fieldset
      className={cn('ui-rating m-0 inline-flex flex-col gap-1 border-0 p-0', className)}
      disabled={disabled}
      onMouseLeave={() => setHover(null)}
    >
      <legend className="mb-1 p-0 text-[13px] font-medium text-fg">{label}</legend>
      <div className="flex items-center gap-0.5">
        {steps.map((n) => (
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- the hover preview is a pointer extra; the radio inside is the control
          <label
            key={n}
            onMouseEnter={() => !disabled && setHover(n)}
            className={cn(
              'relative inline-grid cursor-pointer place-items-center rounded-full p-0.5 has-[:focus-visible]:[box-shadow:var(--ring)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50',
              'transition-transform duration-(--dur-fast) ease-(--ease-out) hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:hover:translate-y-0',
            )}
          >
            <input
              type="radio"
              className="sr-only"
              name={name ?? group}
              value={n}
              checked={value === n}
              onChange={() => onValueChange?.(n)}
              aria-label={word(n)}
            />
            <Pebble size={px} tint={(n + 2) % 7} lit={n <= shown} tilt={TILTS[n % 10]} />
          </label>
        ))}
        <span aria-hidden="true" className="ms-2 min-w-16 text-[13px] text-fg-muted tabular-nums">
          {shown > 0 ? word(shown) : ''}
        </span>
      </div>
    </fieldset>
  );
}

/* ---- SeaGlassDock --------------------------------------------------------------------------
   A floating row of app buttons, each on its own pebble, that swell as the pointer passes (the
   nearest most, its neighbours a little). A <nav> of real buttons or links: the current one has
   aria-current="page" and a dot under it; each is named by its label, which also shows as a
   tooltip-like caption on hover and focus. Under reduced motion nothing swells. */
export interface DockItem {
  id: string;
  label: string;
  icon: IconName | ReactNode;
  href?: string;
  onSelect?: () => void;
  current?: boolean;
}

export interface SeaGlassDockProps {
  items: readonly DockItem[];
  /** Names the nav. Default "Dock". */
  label?: string;
  className?: string;
}

export function SeaGlassDock({ items, label = 'Dock', className }: SeaGlassDockProps) {
  const [near, setNear] = useState<number | null>(null);
  return (
    <nav
      aria-label={label}
      className={cn(
        'ui-dock inline-flex rounded-2xl border border-solid border-border bg-overlay px-2 pt-2 pb-1.5 [box-shadow:var(--elev-2)] glass-chrome',
        className,
      )}
    >
      <ul className="m-0 flex list-none items-end gap-1.5 p-0">
        {items.map((it, i) => {
          const d = near === null ? 9 : Math.abs(near - i);
          const scale = d === 0 ? 1.35 : d === 1 ? 1.15 : 1;
          const inner = (
            <>
              <span
                className="relative grid size-12 origin-bottom scale-(--dock-scale) place-items-center transition-[scale] duration-(--dur-fast) ease-(--ease-out) motion-reduce:scale-100 motion-reduce:transition-none"
                style={{ '--dock-scale': scale } as CSSProperties}
              >
                <Pebble
                  size={48}
                  tint={(i * 2 + 1) % 7}
                  tilt={TILTS[i % 10]}
                  className="absolute inset-0 m-auto"
                />
                <span className="relative text-fg" aria-hidden="true">
                  {typeof it.icon === 'string' ? (
                    <Icon name={it.icon as IconName} size={20} />
                  ) : (
                    it.icon
                  )}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn('mt-1 size-1 rounded-full', it.current ? 'bg-fg' : 'bg-transparent')}
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute bottom-full mb-6 rounded-sm border border-solid border-border bg-overlay px-2 py-0.5 text-[12px] whitespace-nowrap text-fg opacity-0 [box-shadow:var(--elev-1)] transition-opacity duration-(--dur-fast) group-hover/dock:opacity-100 group-focus-visible/dock:opacity-100"
              >
                {it.label}
              </span>
            </>
          );
          const cls =
            'group/dock relative flex cursor-pointer flex-col items-center rounded-lg border-0 bg-transparent p-0 text-inherit no-underline focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]';
          return (
            <li key={it.id}>
              {it.href ? (
                <a
                  href={it.href}
                  aria-label={it.label}
                  aria-current={it.current ? 'page' : undefined}
                  className={cls}
                  onFocus={() => setNear(i)}
                  onBlur={() => setNear(null)}
                  onMouseEnter={() => setNear(i)}
                  onMouseLeave={() => setNear(null)}
                >
                  {inner}
                </a>
              ) : (
                <button
                  type="button"
                  aria-label={it.label}
                  aria-current={it.current ? 'page' : undefined}
                  className={cls}
                  onClick={it.onSelect}
                  onFocus={() => setNear(i)}
                  onBlur={() => setNear(null)}
                  onMouseEnter={() => setNear(i)}
                  onMouseLeave={() => setNear(null)}
                >
                  {inner}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
