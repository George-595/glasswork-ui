import { useEffect, useId, useRef, useState } from 'react';
import { Avatar } from '../components/avatar';
import { Button } from '../components/button';
import { Notice } from '../components/notice';
import { Progress } from '../components/progress';
import { cn } from '../lib/cn';

/* AvatarPicker — change a profile picture without leaving the form.

   Shows the current avatar (the kit Avatar: the image, or initials from `name`). "Change photo"
   opens the browser's file picker (png, jpeg or webp). A chosen file is checked in the browser
   first (type and size, `validateAvatarFile`): a refusal says why, in words, and nothing is
   sent. A file that passes is previewed in place of the avatar with "Save photo" and "Cancel",
   so nothing uploads until it is confirmed. While `uploading` the controls are inert, a
   Progress bar shows `progress` (0-100, or indeterminate without it), and `error` (the server's
   refusal) is an alert. "Remove" appears while there is a saved photo. Props only: the page
   does the upload. */
export const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

/** Why a file cannot be an avatar, or null when it can. */
export function validateAvatarFile(
  file: Pick<File, 'type' | 'size' | 'name'>,
  maxBytes = AVATAR_MAX_BYTES,
): string | null {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) {
    return `${file.name} is not a PNG, JPEG or WebP image.`;
  }
  if (file.size > maxBytes) {
    const mb = Math.round((maxBytes / (1024 * 1024)) * 10) / 10;
    return `${file.name} is too large. The limit is ${mb} MB.`;
  }
  if (file.size === 0) return `${file.name} is empty.`;
  return null;
}

export interface AvatarPickerProps {
  /** The person's name: the initials and the alt text. */
  name: string;
  /** The saved avatar's URL. */
  src?: string | null;
  /** Called with the confirmed file. */
  onSave?: (file: File) => void;
  onRemove?: () => void;
  uploading?: boolean;
  /** 0-100. Omit while `uploading` for an indeterminate bar. */
  progress?: number;
  /** The server's refusal or a network failure. */
  error?: string | null;
  maxBytes?: number;
  className?: string;
}

export function AvatarPicker({
  name,
  src,
  onSave,
  onRemove,
  uploading = false,
  progress,
  error,
  maxBytes = AVATAR_MAX_BYTES,
  className,
}: AvatarPickerProps) {
  const input = useRef<HTMLInputElement | null>(null);
  const uid = useId();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const [refocus, setRefocus] = useState(false);
  const change = useRef<HTMLButtonElement | null>(null);
  const [wasUploading, setWasUploading] = useState(uploading);

  const setPicked = (picked: File | null) => {
    setFile(picked);
    setPreview(
      picked && typeof URL.createObjectURL === 'function' ? URL.createObjectURL(picked) : null,
    );
  };
  // a preview URL is released when it is replaced or the picker goes away
  useEffect(() => {
    if (!preview) return;
    return () => URL.revokeObjectURL?.(preview);
  }, [preview]);
  // the Save / Cancel pair unmounts, so focus has to be put back on Change photo
  useEffect(() => {
    if (refocus && !file) change.current?.focus();
  }, [refocus, file]);

  // an upload that ends without an error is done: drop the preview and show the saved photo
  if (uploading !== wasUploading) {
    setWasUploading(uploading);
    if (!uploading && !error && file) {
      setFile(null);
      setPreview(null);
      setRefocus(true);
      setStatus('Photo saved.');
    }
  }

  const choose = (picked: File | undefined) => {
    if (!picked) return;
    const refusal = validateAvatarFile(picked, maxBytes);
    if (refusal) {
      setPicked(null);
      setProblem(refusal);
      setStatus('');
      return;
    }
    setProblem(null);
    setPicked(picked);
    setStatus(`Photo chosen: ${picked.name}. Save it to use it.`);
  };

  const cancel = () => {
    setRefocus(true);
    setPicked(null);
    setProblem(null);
    setStatus('Change cancelled.');
  };

  const shown = preview ?? src ?? undefined;
  const message = problem ?? error;

  return (
    <div className={cn('ui-avatar-picker flex flex-col gap-3', className)}>
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={name} src={shown} className="size-20 text-[26px]" />
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={input}
            id={`${uid}-file`}
            type="file"
            accept={AVATAR_TYPES.join(',')}
            className="ui-sr-only"
            tabIndex={-1}
            aria-hidden="true"
            disabled={uploading}
            onChange={(event) => {
              choose(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
          {file ? (
            <>
              <Button
                variant="primary"
                size="sm"
                loading={uploading}
                onClick={() => onSave?.(file)}
              >
                {uploading ? 'Saving…' : 'Save photo'}
              </Button>
              <Button variant="outline" size="sm" disabled={uploading} onClick={cancel}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              <Button
                ref={change}
                onFocus={() => setRefocus(false)}
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => input.current?.click()}
              >
                Change photo
              </Button>
              {src && onRemove && (
                <Button variant="ghost" size="sm" disabled={uploading} onClick={onRemove}>
                  Remove
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      <p className="m-0 text-fg-muted [font:var(--t-small)]">
        PNG, JPEG or WebP, up to {Math.round((maxBytes / (1024 * 1024)) * 10) / 10} MB.
      </p>
      {uploading && <Progress label="Uploading photo" value={progress} size="sm" />}
      {message && (
        <Notice tone="danger" role="alert">
          {message}
        </Notice>
      )}
      <span role="status" className="ui-sr-only">
        {status}
      </span>
    </div>
  );
}
