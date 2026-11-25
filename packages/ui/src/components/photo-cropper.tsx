import { cropImage } from '@ui-sdk/react/image';
import {
  ImageCropper,
  ImageCropperFlip,
  ImageCropperGrid,
  ImageCropperHandle,
  ImageCropperImage,
  ImageCropperRotate,
  ImageCropperSelection,
  ImageCropperViewport,
  ImageCropperZoom,
} from '@ui-sdk/react/image-cropper';
import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { SegmentedControl } from './segmented-control';

/* PhotoCropper — choose the part of a photo to keep, on Vercel's UI SDK image cropper
   (@ui-sdk/react/image-cropper): drag the selection or its corners, or Tab to it and use the
   arrow keys (Shift for bigger steps); zoom, a quarter turn and a mirror flip are real buttons
   and a range input. The crop is in the image's own pixels.

   Around it: ratio presets (Free, 1:1, 4:5, 16:9) on a segmented control, a round mask for
   avatars, the rule-of-thirds grid that shows only while dragging, the outside of the crop
   dimmed and blurred, and a live result: each time a move ends the crop is cut with the SDK's
   cropImage and shown as the finished picture with its size in pixels. */
export interface PhotoCropperProps {
  src: string;
  /** Names the cropper: "Profile photo". */
  label: string;
  alt: string;
  /** Round selection (an avatar). */
  circle?: boolean;
  onCrop?: (file: File) => void;
  className?: string;
}

const RATIOS = [
  { value: 'free', label: 'Free', ratio: undefined },
  { value: '1', label: '1:1', ratio: 1 },
  { value: '0.8', label: '4:5', ratio: 0.8 },
  { value: '1.78', label: '16:9', ratio: 16 / 9 },
] as const;

const handle =
  'ui-crop-handle z-10 size-4 -translate-1/2 rounded-full border-2 border-solid border-on-primary bg-brand [box-shadow:var(--elev-2)] outline-none pointer-coarse:size-7 focus-visible:[box-shadow:var(--ring)]';

const tool =
  'inline-flex size-9 cursor-pointer items-center justify-center rounded-md border border-solid border-border bg-transparent text-fg-muted pointer-coarse:size-12 hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] disabled:opacity-50';

export function PhotoCropper({
  src,
  label,
  alt,
  circle = false,
  onCrop,
  className,
}: PhotoCropperProps) {
  const [ratio, setRatio] = useState<string>(circle ? '1' : 'free');
  const [result, setResult] = useState<{ url: string; w: number; h: number } | null>(null);
  const last = useRef<string | null>(null);
  useEffect(() => () => void (last.current && URL.revokeObjectURL(last.current)), []);
  const aspect = RATIOS.find((r) => r.value === ratio)?.ratio;

  return (
    <div className={cn('ui-photo-cropper flex w-full min-w-0 flex-col gap-3 font-sans', className)}>
      {!circle && (
        <SegmentedControl
          label="Shape of the crop"
          size="sm"
          value={ratio}
          onValueChange={setRatio}
          options={RATIOS.map((r) => ({ value: r.value, label: r.label }))}
        />
      )}
      <div className="flex flex-wrap items-start gap-4">
        <ImageCropper
          aria-label={label}
          src={src}
          aspectRatio={aspect}
          shape={circle ? 'circle' : 'rectangle'}
          maxZoom={4}
          onCropCommit={async (crop) => {
            try {
              const file = await cropImage(src, {
                ...crop,
                shape: circle ? 'circle' : undefined,
              } as never);
              if (last.current) URL.revokeObjectURL(last.current);
              const url = URL.createObjectURL(file);
              last.current = url;
              setResult({ url, w: Math.round(crop.width), h: Math.round(crop.height) });
              onCrop?.(file);
            } catch {
              /* the preview is a nicety; the crop itself stands */
            }
          }}
          className="group/crop flex min-w-0 flex-[1_1_18rem] flex-col gap-2"
        >
          <ImageCropperViewport className="relative aspect-(--image-cropper-aspect-ratio,4/3) max-h-96 w-full touch-none overflow-hidden rounded-lg border border-solid border-border bg-sunken">
            <ImageCropperImage alt={alt} className="block select-none" />
            <ImageCropperSelection className="ui-crop-selection outline-none data-[shape=circle]:rounded-full">
              <ImageCropperGrid className="ui-crop-grid" />
            </ImageCropperSelection>
            {(circle
              ? (['nw', 'ne', 'sw', 'se'] as const)
              : (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const)
            ).map((p) => (
              <ImageCropperHandle
                key={p}
                position={p}
                aria-label={`Resize from the ${p.toUpperCase()} corner`}
                className={handle}
              />
            ))}
          </ImageCropperViewport>
          <div className="flex items-center gap-2">
            <Icon name="zoom-out" size={15} className="text-fg-muted" />
            <ImageCropperZoom
              aria-label="Zoom"
              className="ui-crop-zoom h-6 min-w-0 flex-1 cursor-pointer accent-brand"
            />
            <Icon name="zoom-in" size={15} className="text-fg-muted" />
            <ImageCropperRotate aria-label="Turn a quarter clockwise" className={tool}>
              <Icon name="rotate-cw" size={15} />
            </ImageCropperRotate>
            <ImageCropperFlip aria-label="Mirror" className={tool}>
              <Icon name="flip" size={15} />
            </ImageCropperFlip>
          </div>
        </ImageCropper>
        <figure className="m-0 flex w-36 shrink-0 flex-col items-center gap-2">
          <div
            className={cn(
              'ui-crop-result flex aspect-square w-full items-center justify-center overflow-hidden border border-solid border-border bg-sunken [box-shadow:var(--elev-2)]',
              circle ? 'rounded-full' : 'rounded-lg',
            )}
          >
            {result ? (
              <img
                key={result.url}
                src={result.url}
                alt={`The crop of ${alt}`}
                className="ui-crop-result-img size-full object-contain"
              />
            ) : (
              <Icon name="crop" size={22} className="text-fg-subtle" />
            )}
          </div>
          <figcaption
            className="text-center text-[12px] text-fg-muted tabular-nums"
            aria-live="polite"
          >
            {result ? `${result.w} × ${result.h} px` : 'Move the crop to see the result'}
          </figcaption>
        </figure>
      </div>
    </div>
  );
}
