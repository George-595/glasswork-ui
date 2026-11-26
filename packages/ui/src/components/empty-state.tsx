import type { HTMLAttributes, ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';

/* EmptyState — what a list, table or panel shows when there is nothing in it
   yet: an icon, a title, one line of help and, usually, the action that fills
   it. It is content, not an alert, so it is announced by nobody; the title is
   a real heading (set `as` to fit the page outline). It sits on a dashed
   hairline, which reads in both skins and in forced colours; the icon is
   decorative because the title says it all.

   `art` swaps the plain icon circle for a small sea glass picture: three
   frosted pebbles in the sea glass tints with the icon resting on the front
   one, one arrangement per state (nothing yet, no results, all done, no
   access…). It is drawn in SVG from the seaglass roles, so it needs no GPU
   and no stage, and stays decorative. `secondaryAction` sits after the main
   action as a quieter way out ("Import instead", "Clear filters"). */
export type EmptyStateSize = 'sm' | 'md';
/** The sea glass picture per state. */
export type EmptyStateArt = 'empty' | 'search' | 'done' | 'locked' | 'offline' | 'inbox';

const ART_ICON: Record<EmptyStateArt, IconName> = {
  empty: 'plus',
  search: 'search',
  done: 'check',
  locked: 'shield',
  offline: 'wifi-off',
  inbox: 'mail',
};

/* Three pebbles per picture: [cx, cy, rx, ry, rotation, tint]. The last is the front one. */
type Pebble = readonly [number, number, number, number, number, number];
const ART_PEBBLES: Record<EmptyStateArt, readonly Pebble[]> = {
  empty: [
    [30, 50, 20, 14, -18, 3],
    [92, 46, 18, 13, 22, 1],
    [60, 44, 28, 22, 6, 5],
  ],
  search: [
    [28, 40, 16, 12, 30, 2],
    [94, 52, 21, 14, -12, 6],
    [60, 44, 27, 23, -8, 4],
  ],
  done: [
    [30, 52, 19, 13, 12, 6],
    [90, 42, 17, 12, -26, 3],
    [60, 44, 28, 22, -4, 5],
  ],
  locked: [
    [28, 48, 18, 13, -10, 3],
    [92, 48, 18, 14, 14, 2],
    [60, 42, 27, 23, 3, 0],
  ],
  offline: [
    [30, 44, 17, 12, 24, 0],
    [90, 52, 20, 13, -6, 6],
    [60, 44, 28, 22, 8, 3],
  ],
  inbox: [
    [30, 50, 20, 13, -6, 4],
    [92, 44, 17, 13, 20, 2],
    [60, 44, 28, 22, -6, 1],
  ],
};

const PEBBLE_FILL = [
  'fill-seaglass-0',
  'fill-seaglass-1',
  'fill-seaglass-2',
  'fill-seaglass-3',
  'fill-seaglass-4',
  'fill-seaglass-5',
  'fill-seaglass-6',
] as const;

/** A small sea glass still life: decorative SVG, roles only. */
export function SeaGlassArt({ art, size = 'md' }: { art: EmptyStateArt; size?: EmptyStateSize }) {
  const pebbles = ART_PEBBLES[art];
  const w = size === 'sm' ? 84 : 120;
  return (
    <span
      aria-hidden="true"
      className="ui-empty-state-art relative inline-grid place-items-center"
      style={{ width: w, height: (w * 80) / 120 }}
    >
      <svg
        viewBox="0 0 120 80"
        width={w}
        height={(w * 80) / 120}
        aria-hidden="true"
        focusable="false"
      >
        <ellipse cx="60" cy="72" rx="46" ry="5" className="fill-fg opacity-[.07]" />
        {pebbles.map(([cx, cy, rx, ry, rot, tint], i) => (
          <g key={`${cx}-${cy}`} transform={`rotate(${rot} ${cx} ${cy})`}>
            <ellipse
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              className={cn(PEBBLE_FILL[tint] ?? PEBBLE_FILL[0], 'stroke-border-strong')}
              strokeWidth={0.8}
              strokeOpacity={0.5}
              fillOpacity={i === pebbles.length - 1 ? 1 : 0.85}
            />
            {/* frost: a soft lighter top and a bright specular fleck */}
            <ellipse
              cx={cx - rx * 0.12}
              cy={cy - ry * 0.32}
              rx={rx * 0.72}
              ry={ry * 0.46}
              className="fill-seaglass-paper"
              fillOpacity={0.35}
            />
            <ellipse
              cx={cx - rx * 0.42}
              cy={cy - ry * 0.48}
              rx={rx * 0.16}
              ry={ry * 0.1}
              className="fill-seaglass-paper"
              fillOpacity={0.9}
            />
          </g>
        ))}
      </svg>
      <span className="absolute inset-x-0 top-[38%] flex -translate-y-1/2 justify-center text-fg">
        <Icon name={ART_ICON[art]} size={size === 'sm' ? 16 : 22} />
      </span>
    </span>
  );
}

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** An icon name, or your own decorative node. */
  icon?: IconName | ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** The next step, e.g. a Button. */
  action?: ReactNode;
  /** A quieter second way on, e.g. a link Button ("Import instead"). */
  secondaryAction?: ReactNode;
  /** A small sea glass picture for the state, instead of `icon`. */
  art?: EmptyStateArt;
  size?: EmptyStateSize;
  /** Heading level of the title. Default h3. */
  as?: 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  art,
  size = 'md',
  as: Heading = 'h3',
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      {...props}
      data-size={size}
      className={cn(
        'ui-empty-state flex flex-col items-center text-center',
        'rounded-lg border border-dashed border-border-strong bg-transparent',
        size === 'sm' ? 'gap-1.5 px-4 py-5' : 'gap-2 px-6 py-10',
        className,
      )}
    >
      {art && <SeaGlassArt art={art} size={size} />}
      {!art && icon && (
        <span
          className={cn(
            'ui-empty-state-icon inline-flex items-center justify-center rounded-full border border-solid border-border bg-sunken text-fg-subtle',
            size === 'sm' ? 'size-8' : 'size-11',
          )}
          aria-hidden="true"
        >
          {typeof icon === 'string' ? (
            <Icon name={icon as IconName} size={size === 'sm' ? 16 : 20} />
          ) : (
            icon
          )}
        </span>
      )}
      <Heading
        className={cn(
          'ui-empty-state-title m-0 font-sans font-semibold text-fg',
          size === 'sm' ? 'text-[13px] leading-[1.3]' : 'text-[15px] leading-[1.3]',
        )}
      >
        {title}
      </Heading>
      {description && (
        <p className="ui-empty-state-description m-0 max-w-[44ch] text-[13px] leading-normal text-fg-subtle">
          {description}
        </p>
      )}
      {(action || secondaryAction) && (
        <div className="ui-empty-state-action mt-2 flex max-w-full min-w-0 flex-wrap items-center justify-center gap-x-3 gap-y-2">
          {action}
          {secondaryAction && (
            <span className="ui-empty-state-secondary text-[13px] text-fg-muted">
              {secondaryAction}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
