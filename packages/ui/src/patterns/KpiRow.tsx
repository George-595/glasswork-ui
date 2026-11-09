import { useRef } from 'react';
import { Button } from '../components/button';
import { ErrorState } from '../components/error-state';
import { KpiTile, type KpiTileProps, KpiTileSkeleton } from '../components/kpi-tile';
import { Grid, type GridCols } from '../components/layout/Grid';
import type { Responsive } from '../components/layout/responsive';
import { LoadingRegion } from '../components/loading-region';
import { useGenerate } from '../effects/generate/useGenerate';
import { cn } from '../lib/cn';
import type { LoadError } from './shared';

/* KpiRow — a row of key figures: one column on a phone, two from 640px, four from 1024px.
   Give the tiles as data; the row owns the grid and the states:
     loading  `skeletons` KpiTileSkeletons (default 4) in a LoadingRegion that announces
              "Loading <what>", the same size as the tiles so nothing jumps;
     error    an ErrorState (alert + Retry) in place of the tiles.
   When the figures arrive after a loading state, each tile is drawn in by generate(), one
   after another (src/effects/generate).
   Tile order is the array's. Each tile keeps all of KpiTile's own props (delta, trend, href…). */
export interface KpiRowItem extends KpiTileProps {
  /** A stable key; default the label. */
  id?: string;
}

export interface KpiRowProps {
  items?: readonly KpiRowItem[];
  loading?: boolean;
  /** How many skeleton tiles to draw while loading. Default 4. */
  skeletons?: number;
  error?: LoadError | null;
  /** How a failed load looks. `alert` (default) is the standard ErrorState. `quiet` is one muted
      line, "Couldn't load <what> · Retry", for a row that is secondary on its page. */
  errorStyle?: 'alert' | 'quiet';
  /** Names the group ("Key figures"). Also what the loading region says is loading. */
  label?: string;
  /** Columns per breakpoint. Default 1 / 2 / 4. */
  cols?: Responsive<GridCols>;
  className?: string;
}

const DEFAULT_COLS = { base: 1, sm: 2, lg: 4 } as const;

export function KpiRow({
  items = [],
  loading,
  skeletons = 4,
  error,
  errorStyle = 'alert',
  label = 'Key figures',
  cols = DEFAULT_COLS,
  className,
}: KpiRowProps) {
  const row = useRef<HTMLElement>(null);
  useGenerate(row, !loading && !error && items.length > 0, {
    each: true,
    duration: 2000,
    render: 'ascii',
  });
  if (error && errorStyle === 'quiet') {
    return (
      <p
        role="status"
        className={cn(
          'ui-kpi-row-quiet m-0 flex flex-wrap items-center gap-x-2 text-[13px] leading-[1.4] text-fg-muted',
          className,
        )}
      >
        <span>Couldn’t load {error.what}</span>
        {error.onRetry && (
          <Button variant="link" size="sm" onClick={error.onRetry}>
            Retry
          </Button>
        )}
      </p>
    );
  }
  if (error) {
    return (
      <ErrorState
        what={error.what}
        error={error.error}
        onRetry={error.onRetry}
        className={className}
      />
    );
  }
  if (loading) {
    return (
      <LoadingRegion label={label} className={className}>
        <Grid cols={cols} gap={4}>
          {Array.from({ length: skeletons }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: identical placeholders
            <KpiTileSkeleton key={i} />
          ))}
        </Grid>
      </LoadingRegion>
    );
  }
  return (
    <Grid
      ref={row}
      cols={cols}
      gap={4}
      role="group"
      aria-label={label}
      className={cn('ui-kpi-row', className)}
    >
      {items.map(({ id, ...tile }) => (
        <KpiTile key={id ?? tile.label} {...tile} />
      ))}
    </Grid>
  );
}
