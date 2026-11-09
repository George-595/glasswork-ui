import { type ChangeEvent, useId } from 'react';
import { buttonVariants } from '../components/button';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';

/* PhotoCapture — the two ways to give the app a photo.

   - **Take photo**: a real <label> over a hidden <input type="file" accept="image/*"
     capture="environment">, so the phone opens its back camera from the person's own tap (iOS
     Safari blocks a camera opened by a script after a navigation; legacy did that).
   - **Choose from gallery**: the same with NO `capture`, so the phone offers its library.
     Legacy tests T7 and T8 pin both: the gallery input never has `capture`.
   - The inputs stay in the tab order (visually hidden, not display:none) and the label shows
     their focus ring, so a keyboard works too. On a desktop "Take photo" opens a file picker.
   - `busy` ("Preparing photo…") disables both while the caller resizes the picture. They take
     the disabled role pair (never opacity, ENGINEERING §14 rule 24), and a polite status line
     that is always mounted says "Preparing photo…" so a screen reader hears it.
   - A file that is not an image, or bigger than `maxBytes`, is refused with `onReject` and
     never reaches `onFile`. The same file can be picked twice in a row. */
export interface PhotoCaptureProps {
  onFile: (file: File) => void;
  onReject?: (reason: 'not_an_image' | 'too_large', file: File) => void;
  busy?: boolean;
  /** Biggest file accepted, in bytes. Default 25 MB (a phone's full-size photo). */
  maxBytes?: number;
  cameraLabel?: string;
  galleryLabel?: string;
  busyLabel?: string;
  /** Lay the two buttons side by side (wide screens) instead of stacked. */
  inline?: boolean;
  /** How loud "Choose from gallery" is. `outline` (default) is a bordered button as big as the
      main one; `quiet` is a full-width text button, one step smaller (the way in that most people
      do not need, under the one that most do). Both are full width. */
  galleryStyle?: 'outline' | 'quiet';
  className?: string;
}

export function PhotoCapture({
  onFile,
  onReject,
  busy = false,
  maxBytes = 25 * 1024 * 1024,
  cameraLabel = 'Take photo',
  galleryLabel = 'Choose from gallery',
  busyLabel = 'Preparing photo…',
  inline = false,
  galleryStyle = 'outline',
  className,
}: PhotoCaptureProps) {
  const id = useId();

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    const file = input.files?.[0];
    // clear it, so choosing the same file again still fires a change
    input.value = '';
    if (!file) return;
    if (file.type !== '' && !file.type.startsWith('image/')) {
      onReject?.('not_an_image', file);
      return;
    }
    if (file.size > maxBytes) {
      onReject?.('too_large', file);
      return;
    }
    onFile(file);
  };

  const quiet = galleryStyle === 'quiet';
  const label = (variant: 'primary' | 'outline' | 'ghost') =>
    cn(
      buttonVariants({ variant, size: variant === 'ghost' ? 'lg' : 'xl' }),
      'ui-photo-capture-option w-full cursor-pointer gap-2',
      'has-[input:focus-visible]:[box-shadow:var(--ring)]',
      // disabled is a role pair, never opacity (the disabled input inside is what switches it on)
      'has-[input:disabled]:pointer-events-none has-[input:disabled]:cursor-not-allowed has-[input:disabled]:border-disabled-border has-[input:disabled]:bg-disabled has-[input:disabled]:text-disabled-fg',
    );

  return (
    <div
      className={cn(
        'ui-photo-capture grid w-full gap-3',
        quiet && 'gap-1',
        inline ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1',
        className,
      )}
      aria-busy={busy || undefined}
    >
      <p role="status" className="ui-sr-only">
        {busy ? busyLabel : ''}
      </p>
      <label className={label('primary')} htmlFor={`${id}-camera`} data-capture="camera">
        <Icon name="camera" size={20} />
        <span>{busy ? busyLabel : cameraLabel}</span>
        <input
          id={`${id}-camera`}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          disabled={busy}
          onChange={pick}
        />
      </label>
      <label
        className={label(quiet ? 'ghost' : 'outline')}
        htmlFor={`${id}-gallery`}
        data-capture="gallery"
      >
        {!quiet && <Icon name="image" size={20} />}
        <span>{galleryLabel}</span>
        <input
          id={`${id}-gallery`}
          type="file"
          accept="image/*"
          className="sr-only"
          disabled={busy}
          onChange={pick}
        />
      </label>
    </div>
  );
}
