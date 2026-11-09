import { ToggleGroup } from 'radix-ui';
import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { cn } from '../lib/cn';
import { playSound } from '../sound';

/* SegmentedControl — one choice from a few, shown side by side (a range, a
   view, a unit). It is a radio group: Radix ToggleGroup (single) supplies the
   roving tabindex and the arrow keys, and we make selection follow focus, as
   native radios do, so an arrow key both moves and chooses. Every segment is
   named by its visible text; the group is named by `label`.

   A pill slides under the chosen segment (transform only, measured from the
   segment's box, so it follows any width). It is switched off under
   prefers-reduced-motion, and until it is measured the segment paints its own
   fill, so the server-rendered markup and the first paint are already right.
   Glass: the track is the glass material and the pill a lifted glass chip. */
export type SegmentedControlSize = 'sm' | 'md';

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
  /** Needed when `label` is not text (an icon alone). */
  'aria-label'?: string;
}

export interface SegmentedControlProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'defaultValue' | 'onChange' | 'dir'> {
  options: readonly SegmentedOption[];
  /** Names the group for assistive tech. Required: a radio group needs a name. */
  label: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  size?: SegmentedControlSize;
  disabled?: boolean;
  /** Stretch to the container, segments sharing the width equally. */
  fullWidth?: boolean;
}

export function SegmentedControl({
  options,
  label,
  value,
  defaultValue,
  onValueChange,
  size = 'md',
  disabled,
  fullWidth,
  className,
  style,
  ...props
}: SegmentedControlProps) {
  const [inner, setInner] = useState(defaultValue ?? options[0]?.value ?? '');
  const current = value ?? inner;
  const rootRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x: number; w: number } | null>(null);

  const choose = useCallback(
    (next: string) => {
      // a toggle group lets the chosen item be un-chosen; a radio group does not
      if (!next || next === current) return;
      setInner(next);
      playSound('tick');
      onValueChange?.(next);
    },
    [current, onValueChange],
  );

  // measure the chosen segment; re-measure when the group resizes (fonts, container)
  // biome-ignore lint/correctness/useExhaustiveDependencies: the DOM, not a value, is read; re-measure when the chosen segment or the options change
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const measure = () => {
      const on = root.querySelector<HTMLElement>('[data-state="on"]');
      if (!on) return setBox(null);
      setBox((prev) =>
        prev && prev.x === on.offsetLeft && prev.w === on.offsetWidth
          ? prev
          : { x: on.offsetLeft, w: on.offsetWidth },
      );
    };
    measure();
    if (typeof ResizeObserver !== 'function') return;
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    return () => ro.disconnect();
  }, [current, options]);

  const vars: CSSProperties = {
    ...style,
    ['--seg-x' as string]: `${box?.x ?? 0}px`,
    ['--seg-w' as string]: `${box?.w ?? 0}px`,
  };

  return (
    <ToggleGroup.Root
      {...props}
      ref={rootRef}
      type="single"
      role="radiogroup"
      aria-label={label}
      value={current}
      onValueChange={choose}
      disabled={disabled}
      loop
      data-size={size}
      data-ready={box ? '' : undefined}
      style={vars}
      className={cn(
        'ui-segmented group relative items-center gap-0.5 rounded-lg border border-solid border-border bg-sunken p-[3px]',
        '[box-shadow:var(--elev-0)] forced-colors:border-[CanvasText]',
        fullWidth ? 'flex w-full' : 'inline-flex max-w-full',
        className,
      )}
    >
      {box && (
        <span
          aria-hidden="true"
          className={cn(
            'ui-segmented-pill pointer-events-none absolute top-[3px] bottom-[3px] left-0 rounded-md border border-solid border-brand bg-selected',
            '[translate:var(--seg-x)_0] w-(--seg-w)',
            'transition-[translate,width] duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none',
            'forced-colors:[outline:2px_solid_Highlight]',
          )}
        />
      )}
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          disabled={o.disabled}
          aria-label={o['aria-label']}
          // selection follows focus, like native radios: an arrow key chooses
          onFocus={() => !o.disabled && choose(o.value)}
          className={cn(
            'ui-segmented-item relative z-[1] inline-flex min-w-6 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-solid border-transparent bg-transparent font-sans font-medium text-fg-muted',
            'transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-hover hover:text-fg motion-reduce:transition-none',
            'focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] disabled:pointer-events-none disabled:text-disabled-fg',
            'data-[state=on]:font-semibold data-[state=on]:text-fg',
            // before the pill is measured the chosen segment paints its own fill
            'data-[state=on]:border-brand data-[state=on]:bg-selected',
            'group-data-[ready]:data-[state=on]:border-transparent group-data-[ready]:data-[state=on]:bg-transparent',
            // a 48px target on a touch screen, a thin one with a mouse
            size === 'sm'
              ? 'min-h-6 px-2.5 py-0.5 text-[12px] pointer-coarse:min-h-12'
              : 'min-h-7 px-3 py-1 text-[13px] pointer-coarse:min-h-12',
            fullWidth && 'flex-1',
          )}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
