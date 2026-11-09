import type { HTMLAttributes, ReactNode } from 'react';
import { IconCircle } from '../components/icon-circle';
import { FillHeight } from '../components/layout/FillHeight';
import { Heading, type HeadingLevel } from '../components/typography/Heading';
import { Text } from '../components/typography/Text';
import type { IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { SeaGlass, type SeaGlassTint } from '../seaglass/SeaGlass';
import { SeaGlassStage } from '../seaglass/SeaGlassStage';

/* ActionTiles + ActionTile — a phone's home: a few big actions that share the screen between the
   top bar and the tab bar, so the one a person came for is under a thumb with no scrolling.

   ActionTiles is a FillHeight column (it measures the room left under it and the tiles split it
   equally), on one symmetric SeaGlassStage: the glass skin draws the tiles as frosted pebbles lit
   from straight above, so a tile and its shadow are the same on the left as on the right, and
   the enterprise skin, reduced transparency and a device that lags draw flat tinted cards (the
   kit degrades by itself). The stage draws no paper: the tiles sit on the page, so their
   left and right gutters are exactly the page's.

   ActionTile is one tile, centred on its own axis: a round tinted icon, a title, one line under
   it, then `children` (the actions) at the full width of the tile's content box. At least 220px
   tall, so a short screen scrolls rather than squeezing the buttons. */
export interface ActionTilesProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function ActionTiles({ children, className, ...props }: ActionTilesProps) {
  return (
    <FillHeight {...props} className={cn('ui-action-tiles', className)}>
      <SeaGlassStage paper={false} symmetric className="flex flex-1 flex-col gap-3">
        {children}
      </SeaGlassStage>
    </FillHeight>
  );
}

export interface ActionTileProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  icon: IconName;
  tint?: SeaGlassTint;
  title: ReactNode;
  /** One line under the title. */
  description?: ReactNode;
  /** The heading's level in the page's outline. Default 2. */
  level?: HeadingLevel;
  /** The actions, full width, under the text. */
  children?: ReactNode;
}

export function ActionTile({
  icon,
  tint = 'clear',
  title,
  description,
  level = 2,
  children,
  className,
  ...props
}: ActionTileProps) {
  return (
    <SeaGlass
      {...props}
      tint={tint}
      shape="card"
      pad="md"
      block
      className={cn(
        'ui-action-tile min-h-55 flex-1 flex-col justify-center gap-3 px-4 py-4 text-center',
        className,
      )}
    >
      <IconCircle icon={icon} tint={tint} size="lg" />
      <div className="flex min-w-0 flex-col items-center gap-0.5">
        <Heading level={level} size={2} className="text-center">
          {title}
        </Heading>
        {description && (
          <Text size="small" tone="muted" align="center">
            {description}
          </Text>
        )}
      </div>
      {children}
    </SeaGlass>
  );
}
