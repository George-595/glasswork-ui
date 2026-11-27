import type { HTMLAttributes, ReactNode } from 'react';
import { Progress } from '../components/progress';
import { StatusDot } from '../controls/StatusDot';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { Photo, type PhotoRatio } from '../patterns/Photo';

/* MediaTile — a picture, or a playing stream, in a tile with a live state: a camera, a webcam, a
   slideshow frame. The app renders the player (a <video>, an <img> of an MJPEG stream) into
   `live`; the tile draws everything around it and never plays sound by itself.

   - It is a <figure>: the picture, then a <figcaption> with the title, the time the still was
     taken and the state in words (a polite status, so a change from "Connecting" to "Live" is
     heard). The state is always a word, never only colour or a dot.
   - `live` without a `live` element is `connecting`: "Live" is never said over an old still.
   - `still` shows the poster. `connecting` lays an indeterminate Progress over it. `live` shows
     `live` over the poster with a "Live" chip (a StatusDot, active, pulsing). `unavailable` and
     `off` dim the poster and say the state, then why (`stateText`: "Unavailable · Offline since 14:02"), on a solid chip. Text never sits on the
     picture itself: every chip is on `surface-solid` (ENGINEERING rule 69).
   - `poster.src` null draws Photo's placeholder with "No picture" and `poster.alt` for assistive tech.
   - `onOpen` makes the picture a button named "Open <title>". It is not drawn while live, so it
     never covers the player's own controls.
   - `action` is one primary action under the picture ('Watch live' / 'Stop') and `menu` the
     overflow slot beside it; both are the app's own buttons. */
export type MediaTileState = 'still' | 'connecting' | 'live' | 'unavailable' | 'off';

export interface MediaTileProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title: string;
  /** The still. null draws the placeholder: the icon and "No picture". */
  poster: { src: string | null; alt: string; takenAt?: string };
  state: MediaTileState;
  /** The live element (a <video>, an <img> of an MJPEG stream) the app renders; shown in `live`. */
  live?: ReactNode;
  stateText?: string;
  badges?: ReactNode;
  ratio?: PhotoRatio;
  action?: ReactNode;
  menu?: ReactNode;
  onOpen?: () => void;
  size?: 'md' | 'lg';
}

const STATE_WORD: Record<MediaTileState, string | null> = {
  still: null,
  connecting: 'Connecting',
  live: 'Live',
  unavailable: 'Unavailable',
  off: 'Off',
};

export function MediaTile({
  title,
  poster,
  state,
  live,
  stateText,
  badges,
  ratio = '16/9',
  action,
  menu,
  onOpen,
  size = 'md',
  className,
  ...props
}: MediaTileProps) {
  // "live" with nothing to show would say Live over an old still: it is still connecting
  const shown: MediaTileState = state === 'live' && live === undefined ? 'connecting' : state;
  const dimmed = shown === 'off' || shown === 'unavailable';
  // the state is always a word; the reason follows it
  const base = STATE_WORD[shown];
  const word = dimmed && stateText ? `${base} · ${stateText}` : base;
  return (
    <figure
      {...props}
      data-state={shown}
      data-size={size}
      className={cn(
        'ui-media-tile m-0 flex min-w-0 flex-col gap-2 rounded-lg border border-solid border-border bg-surface p-2',
        'forced-colors:border-[CanvasText]',
        className,
      )}
    >
      <div className="relative">
        <Photo
          src={poster.src}
          alt={poster.alt}
          ratio={ratio}
          corner={
            poster.takenAt ? (
              <span
                aria-hidden="true"
                className="block px-1.5 py-0.5 font-mono text-[12px] leading-none text-fg tabular-nums"
              >
                {poster.takenAt}
              </span>
            ) : undefined
          }
        />
        {poster.src === null && (
          <span
            data-slot="no-picture"
            className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 rounded-md bg-surface-solid px-2 py-1 text-[12px] font-medium text-fg-muted"
          >
            No picture
          </span>
        )}
        {dimmed && <div aria-hidden="true" className="absolute inset-0 rounded-md bg-scrim" />}
        {shown === 'live' && (
          <div
            data-slot="live"
            className="absolute inset-0 overflow-hidden rounded-md bg-sunken [&>*]:size-full [&>*]:object-cover"
          >
            {live}
          </div>
        )}
        {shown === 'connecting' && (
          <div
            data-slot="connecting"
            className="absolute inset-x-2 bottom-2 rounded-md bg-surface-solid p-2"
          >
            <Progress label="Connecting" size="sm" showValue={false} />
          </div>
        )}
        {dimmed && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-3">
            <span
              data-slot="state-chip"
              className="inline-flex max-w-full items-center gap-1.5 rounded-md bg-surface-solid px-2.5 py-1.5 text-[13px] font-medium text-fg"
            >
              <Icon name={shown === 'off' ? 'eye-off' : 'wifi-off'} size={16} />
              <span className="min-w-0 truncate">{word}</span>
            </span>
          </div>
        )}
        {onOpen && shown !== 'live' && (
          <button
            type="button"
            onClick={onOpen}
            aria-label={`Open ${title}`}
            className="absolute inset-0 z-[5] cursor-pointer rounded-md border-0 bg-transparent p-0 focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
          />
        )}
        {(shown === 'live' || badges) && (
          <div className="pointer-events-none absolute top-2 left-2 z-10 flex max-w-[70%] flex-wrap gap-1">
            {shown === 'live' && (
              <span className="rounded-md bg-surface-solid px-1.5 py-0.5 [box-shadow:var(--elev-2)]">
                <StatusDot tone="active" label="Live" pulse size="sm" />
              </span>
            )}
            {badges && (
              <span className="inline-flex flex-wrap gap-1 rounded-md bg-surface-solid p-0.5 [box-shadow:var(--elev-2)]">
                {badges}
              </span>
            )}
          </div>
        )}
      </div>
      <figcaption className="flex min-w-0 flex-col gap-0.5 px-1">
        <span
          className={cn(
            'truncate font-semibold text-fg',
            size === 'lg' ? 'text-[16px]' : 'text-[14px]',
          )}
        >
          {title}
        </span>
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 text-[13px] text-fg-muted">
          {poster.takenAt && shown !== 'live' && (
            <span className="font-mono tabular-nums">{poster.takenAt}</span>
          )}
          <span role="status" data-slot="state-word" className={cn(word === null && 'sr-only')}>
            {word}
          </span>
        </span>
      </figcaption>
      {(action || menu) && (
        <div className="flex items-center gap-2 px-1 pb-1">
          {action && <div className="min-w-0 flex-1">{action}</div>}
          {menu && <div className="shrink-0">{menu}</div>}
        </div>
      )}
    </figure>
  );
}
