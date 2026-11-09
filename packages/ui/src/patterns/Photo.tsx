import { type ReactNode, useState } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* Photo — a picture in a fixed-ratio frame, so a list never jumps while photos
   load and no page writes <img style>.

   - `ratio` fixes the frame (4:3 by default, square for list thumbnails, 16:9); `fit` is cover
     (fills, crops: thumbnails) or contain (the whole item, letterboxed: the detail view).
   - It loads lazily, shows the skeleton shimmer until the image is decoded, and an image icon
     if it fails or there is no picture at all (`src` null), with `alt` read out either way.
   - `corner` is a slot over the top-right corner: a select checkbox, an "AI suggestion" badge, a
     Retake button. The photograph under it can be any colour (a white mattress, a dark
     wardrobe), so no contrast can be promised against it: the slot sits on a solid chip
     (`surface-solid`, lifted), and whatever a page puts in it is measured on that. */
export type PhotoRatio = '4/3' | '1/1' | '16/9';

export interface PhotoProps {
  /** The picture's URL, or null when the item has none. */
  src: string | null;
  /** What the picture shows ("White double mattress"). Required: photos here carry meaning. */
  alt: string;
  ratio?: PhotoRatio;
  fit?: 'cover' | 'contain';
  /** Load straight away (the main photo of a screen) instead of lazily. */
  eager?: boolean;
  corner?: ReactNode;
  className?: string;
}

const RATIO: Record<PhotoRatio, string> = {
  '4/3': 'aspect-4/3',
  '1/1': 'aspect-square',
  '16/9': 'aspect-video',
};

export function Photo({
  src,
  alt,
  ratio = '4/3',
  fit = 'cover',
  eager = false,
  corner,
  className,
}: PhotoProps) {
  const [state, setState] = useState<'loading' | 'loaded' | 'failed'>('loading');
  // a new picture starts loading again
  const [shown, setShown] = useState(src);
  if (shown !== src) {
    setShown(src);
    setState('loading');
  }
  const failed = src === null || state === 'failed';
  return (
    <div
      className={cn(
        'ui-photo relative isolate w-full overflow-hidden rounded-md border border-solid border-border-subtle bg-sunken',
        RATIO[ratio],
        className,
      )}
      data-state={failed ? 'failed' : state}
    >
      {!failed && (
        <img
          src={src ?? undefined}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('failed')}
          className={cn(
            'absolute inset-0 size-full',
            fit === 'cover' ? 'object-cover' : 'object-contain',
            state === 'loaded' ? 'opacity-100' : 'opacity-0',
            'transition-opacity duration-[240ms] motion-reduce:transition-none',
          )}
        />
      )}
      {!failed && state === 'loading' && (
        <div
          aria-hidden="true"
          className={cn(
            'ui-skeleton absolute inset-0 overflow-hidden bg-hover',
            "after:absolute after:inset-0 after:content-[''] after:-translate-x-full",
            'after:bg-linear-90 after:from-transparent after:via-(--shine) after:to-transparent',
            'after:animate-[ui-skeleton-shimmer_1.6s_var(--ease-in-out)_infinite] motion-reduce:after:hidden',
          )}
        />
      )}
      {failed && (
        <div
          role="img"
          aria-label={alt}
          className="absolute inset-0 grid place-items-center text-fg-subtle"
        >
          <Icon name="image" size={28} />
        </div>
      )}
      {corner && (
        <div
          data-slot="corner"
          className="absolute top-2 right-2 z-10 rounded-md bg-surface-solid p-0.5 [box-shadow:var(--elev-2)]"
        >
          {corner}
        </div>
      )}
    </div>
  );
}
