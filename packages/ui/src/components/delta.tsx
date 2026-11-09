import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/* Delta — a change as a ratio: ▲ +4.2% / ▼ −3.1% / —. The arrow is hidden
   from screen readers, which hear "up" or "down" instead (WCAG 1.4.1: never
   colour alone). Moved here from base-app; the kit has no number formatter of
   its own, so `format` turns the ratio into the text shown (default: en-GB,
   one decimal, an explicit sign and a true minus). */
export interface DeltaProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** The change as a ratio (0.042 = +4.2%); null for "no data". */
  ratio: number | null;
  format?: (ratio: number) => string;
}

const percent = new Intl.NumberFormat('en-GB', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
  signDisplay: 'exceptZero',
});

/** +4.2% / −3.1%, with U+2212 for the minus sign. */
export function formatDelta(ratio: number): string {
  return percent.format(ratio).replace('-', '−');
}

const base =
  'ui-delta font-mono tabular-nums whitespace-nowrap data-[direction=up]:text-up data-[direction=down]:text-down data-[direction=flat]:text-fg-subtle';

export function Delta({ ratio, format = formatDelta, className, ...props }: DeltaProps) {
  // Round to the 0.1% the label shows, so −0.0004 doesn't read "down −0.0%".
  if (ratio === null || Math.round(ratio * 1000) === 0) {
    return (
      <span {...props} className={cn(base, className)} data-direction="flat">
        <span aria-hidden="true">—</span>
        <span className="ui-sr-only">no change</span>
      </span>
    );
  }
  const up = ratio > 0;
  return (
    <span {...props} className={cn(base, className)} data-direction={up ? 'up' : 'down'}>
      <span aria-hidden="true">{up ? '▲' : '▼'} </span>
      <span className="ui-sr-only">{up ? 'up' : 'down'} </span>
      {format(ratio)}
    </span>
  );
}
