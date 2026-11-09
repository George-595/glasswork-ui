import type { HTMLAttributes, ReactNode } from 'react';
import { LiquidGlass } from '../glass/LiquidGlass';
import { cn } from '../lib/cn';

/* StatTile — the metric tile (total equity, CAGR, drawdown …): micro-label,
   tabular mono figure, green/red for direction. Liquid Glass in the glass
   skin, like Card.

   Fixed on port (WCAG 1.4.1, use of colour): the direction is no longer told
   by colour alone. An arrow shows it to sighted users and a visually hidden
   word ("up"/"down", overridable) tells screen readers. */
export type Direction = 'up' | 'down' | 'neutral';

export interface StatTileProps extends HTMLAttributes<HTMLDivElement> {
  label: string;
  value: ReactNode;
  direction?: Direction;
  /** Screen-reader words for the direction. Default { up: 'up', down: 'down' }. */
  directionText?: { up: string; down: string };
}

const ARROW = { up: '▲', down: '▼' } as const;

export function StatTile({
  className,
  label,
  value,
  direction = 'neutral',
  directionText = { up: 'up', down: 'down' },
  ...props
}: StatTileProps) {
  return (
    <LiquidGlass
      // the label sits 10px in: keep the thinned rim band narrower than that
      band={8}
      className={cn(
        'ui-stat-tile m-0 flex flex-col gap-[3px] px-[13px] py-2.5',
        'rounded-md border border-solid border-border bg-surface',
        '[box-shadow:var(--elev-card)]',
        className,
      )}
      {...props}
    >
      <p className="ui-stat-label m-0 font-sans text-[10.5px] leading-[1.3] font-medium tracking-[0.1em] text-fg-subtle uppercase">
        {label}
      </p>
      <p
        className="ui-stat-value m-0 inline-flex items-baseline gap-1 font-mono text-[16px] leading-[1.3] font-semibold text-fg tabular-nums data-[direction=down]:text-down data-[direction=up]:text-up"
        data-direction={direction}
      >
        {direction !== 'neutral' && (
          <>
            <span className="ui-stat-arrow text-[0.75em]" aria-hidden="true">
              {ARROW[direction]}
            </span>
            <span className="ui-sr-only">{directionText[direction]}, </span>
          </>
        )}
        {value}
      </p>
    </LiquidGlass>
  );
}
