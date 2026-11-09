import { type HTMLAttributes, lazy, type ReactNode, Suspense } from 'react';
import { PointerLight } from '../effects/PointerLight';
import { RollingNumber } from '../effects/RollingNumber';
import { LiquidGlass } from '../glass/LiquidGlass';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { Delta } from './delta';
import { Skeleton } from './skeleton';

/* The sparkline is the chart library (about 60 kB gzip). Most tiles have no trend, so it is its own
   file, fetched the first time a tile with one is drawn; until it arrives the tile holds the
   space it will take (the same size, so nothing jumps). */
const Sparkline = lazy(() => import('../charts/Sparkline').then((m) => ({ default: m.Sparkline })));
const SPARKLINE_WIDTH = 120;
const SPARKLINE_HEIGHT = 32;

/* KpiTile — one key figure: label, the number, how it moved, a trend line.
   It replaces the two KPI rows the app grew (a StatTile with a Delta and a
   Sparkline underneath; a Card with the same parts), so every KPI is the same
   tile.

   - value: a number (with `format`) rolls in through RollingNumber (an odometer: each digit
     spins up and settles), which announces only the final figure and shows it at once under
     reduced motion; or any ReactNode, shown as given.
   - change: `delta` is a ratio (0.042 = +4.2%); or give `previous` and the
     ratio is worked out from `value`. It is drawn by Delta: an arrow AND the
     words "up"/"down", never colour alone.
   - trend: a Sparkline (the kit's own), named "<label> trend".
   - href / onClick: the whole tile becomes the target. The label is the link
     (or button) and stretches over the tile, so there is one tab stop with a
     clear name and no interactive element nested in another; the figures stay
     outside it as plain text.
   - loading (or KpiTile.Skeleton): a skeleton of the same size, no layout shift.

   Glass: Liquid Glass surface plus PointerLight: a faint pool of light under the pointer, the
   rim catching it and one sheen on arrival (decorative; off under reduced motion). Enterprise:
   the calm card. */
export interface KpiTileProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label: string;
  value: number | ReactNode;
  /** Turns a numeric `value` into the text shown. Default: en-GB grouping, with as many decimals
      as `value` has (none for a whole number), so the count-up never shows "1.434" on its way to 2. */
  format?: (value: number) => string;
  /** The change as a ratio. Wins over `previous`. */
  delta?: number | null;
  /** The value one period ago; the change is (value - previous) / |previous|. */
  previous?: number;
  /** Text for the change, after the figure, e.g. "vs last month". */
  deltaLabel?: string;
  /** Format for the change. Passed to Delta. */
  formatDelta?: (ratio: number) => string;
  trend?: readonly number[];
  /** Format for the trend's numbers in its accessible name. */
  formatTrend?: (value: number) => string;
  footnote?: ReactNode;
  icon?: IconName | ReactNode;
  href?: string;
  onClick?: () => void;
  loading?: boolean;
  /** Roll a numeric `value` in from zero when the tile scrolls into view. Default true; false (or
      reduced motion) shows the figure at once. Either way a screen reader gets the final figure only. */
  countUp?: boolean;
}

/* The default: en-GB grouping at the decimals of the figure itself (Intl's own default keeps up
   to three decimals, so a whole number would grow fraction digits it does not have). */
function figureFormat(value: number): (n: number) => string {
  const [, fraction = ''] = String(value).split('.');
  const decimals = Math.min(fraction.length, 3);
  const nf = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (n) => nf.format(n);
}

function ratioOf(value: KpiTileProps['value'], previous: number | undefined): number | null {
  if (typeof value !== 'number' || previous === undefined || previous === 0) return null;
  return (value - previous) / Math.abs(previous);
}

const surface = cn(
  'ui-kpi relative m-0 block rounded-md border border-solid border-border bg-surface text-fg',
  '[box-shadow:var(--elev-card)]',
);

const labelClasses =
  'ui-kpi-label m-0 font-sans text-[10.5px] leading-[1.3] font-medium tracking-[0.1em] uppercase';

export function KpiTile({
  label,
  value,
  format: formatProp,
  delta,
  previous,
  deltaLabel,
  formatDelta,
  trend,
  formatTrend,
  footnote,
  icon,
  href,
  onClick,
  loading,
  countUp = true,
  className,
  ...props
}: KpiTileProps) {
  const format = formatProp ?? figureFormat(typeof value === 'number' ? value : 0);
  if (loading) return <KpiTileSkeleton label={label} className={className} {...props} />;

  const ratio = delta !== undefined ? delta : ratioOf(value, previous);
  const showDelta = delta !== undefined || previous !== undefined;
  const interactive = Boolean(href || onClick);
  // the stretched target: its ::after covers the whole tile
  const stretch =
    'after:absolute after:inset-0 after:content-[""] after:rounded-[inherit] focus-visible:outline-none focus-visible:after:[box-shadow:var(--ring)]';
  const labelText = (
    <>
      {icon && (
        <span className="ui-kpi-icon mr-1.5 inline-flex align-middle" aria-hidden="true">
          {typeof icon === 'string' ? <Icon name={icon as IconName} size={13} /> : icon}
        </span>
      )}
      {label}
    </>
  );

  return (
    <LiquidGlass
      {...props}
      // the label sits 13px in: keep the thinned rim band narrower than that
      band={8}
      data-interactive={interactive || undefined}
      className={cn(
        surface,
        interactive &&
          'transition-[border-color,box-shadow] duration-(--dur-base) ease-(--ease-out) hover:border-border-strong hover:[box-shadow:var(--elev-2)] motion-reduce:transition-none',
        className,
      )}
    >
      {/* h-full: in a grid row the tile is taller than its content, and the stretched link
          (positioned against the nearest wrapper) has to cover all of it, not just the content */}
      <PointerLight className="ui-kpi-fx h-full rounded-[inherit]">
        <div className="flex h-full flex-col gap-1.5 px-[13px] py-3">
          <p className={cn(labelClasses, 'text-fg-subtle')}>
            {href ? (
              <a
                href={href}
                className={cn(
                  stretch,
                  'text-fg-subtle no-underline hover:text-fg hover:underline',
                )}
              >
                {labelText}
              </a>
            ) : onClick ? (
              <button
                type="button"
                onClick={onClick}
                className={cn(
                  stretch,
                  'm-0 cursor-pointer border-0 bg-transparent p-0 text-left font-[inherit] tracking-[inherit] text-fg-subtle uppercase hover:text-fg',
                )}
              >
                {labelText}
              </button>
            ) : (
              labelText
            )}
          </p>
          <p className="ui-kpi-value m-0 font-mono text-[22px] leading-[1.2] font-semibold text-fg tabular-nums">
            {typeof value === 'number' ? (
              countUp ? (
                <RollingNumber to={value} format={format} />
              ) : (
                format(value)
              )
            ) : (
              value
            )}
          </p>
          {(showDelta || trend?.length) && (
            <div className="ui-kpi-foot flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
              {showDelta && (
                <span className="ui-kpi-change inline-flex items-baseline gap-1.5 text-[12.5px]">
                  <Delta ratio={ratio} format={formatDelta} />
                  {deltaLabel && <span className="text-fg-subtle">{deltaLabel}</span>}
                </span>
              )}
              {trend && trend.length > 0 && (
                <Suspense
                  fallback={
                    <span
                      aria-hidden="true"
                      className="ui-kpi-trend ml-auto inline-block"
                      style={{ width: SPARKLINE_WIDTH, height: SPARKLINE_HEIGHT }}
                    />
                  }
                >
                  <Sparkline
                    values={trend}
                    label={`${label} trend`}
                    format={formatTrend}
                    className="ui-kpi-trend ml-auto"
                  />
                </Suspense>
              )}
            </div>
          )}
          {footnote && (
            <p className="ui-kpi-footnote m-0 text-[12px] leading-normal text-fg-subtle">
              {footnote}
            </p>
          )}
        </div>
      </PointerLight>
    </LiquidGlass>
  );
}

export interface KpiTileSkeletonProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** What is loading; read as "Loading <label>". Omit inside a LoadingRegion. */
  label?: string;
}

/** The tile's loading shape: same padding and rows, so nothing jumps when the figures arrive. */
export function KpiTileSkeleton({ label, className, ...props }: KpiTileSkeletonProps) {
  return (
    <div
      {...props}
      aria-busy={label ? 'true' : undefined}
      className={cn(surface, 'ui-kpi-skeleton', className)}
    >
      {label && <span className="ui-sr-only">Loading {label}…</span>}
      <div className="flex flex-col gap-2 px-[13px] py-3" aria-hidden="true">
        <Skeleton radius="sm" height={10} width="40%" />
        <Skeleton radius="sm" height={22} width="62%" />
        <div className="flex items-end justify-between gap-3">
          <Skeleton radius="sm" height={12} width="28%" />
          <Skeleton radius="sm" height={32} width={120} />
        </div>
      </div>
    </div>
  );
}

KpiTile.Skeleton = KpiTileSkeleton;
