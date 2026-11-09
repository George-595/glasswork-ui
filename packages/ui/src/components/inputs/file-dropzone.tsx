// biome-ignore-all lint/a11y/noStaticElementInteractions: the presentational wrapper takes the drag events; the label and native file input inside are the control
/* Adapted from Arc's file-dropzone / file-upload (MIT, Elia Kuratli) and BoardUI's file-upload
   (MIT, Mertcan Dundar Esmergul): drop target, accept/size/count rules, the file list.
   Rebuilt on a native file input and our roles. See THIRD_PARTY_NOTICES.md. */
import { type DragEvent, forwardRef, type InputHTMLAttributes, useId, useState } from 'react';
import { Icon } from '../../icons/Icon';
import { cn } from '../../lib/cn';
import { Glyph } from './glyph';

/* FileDropzone — drop files or browse for them; the list of what was chosen sits below.

   The whole zone is the <label> of a real, visually hidden <input type="file">, so the browser
   supplies the picker, the keyboard (Tab to it, Enter or Space opens the dialog) and the
   screen-reader name; the focus ring is drawn around the zone. Dropping runs the same
   checks as browsing: `accept` (the same tokens as the HTML attribute: `.pdf`, `image/*`,
   `text/csv`), `maxSize` in bytes, `maxFiles`. A refused file is named with the reason in a
   list with role="alert" and is never added; the rest are. The chosen files are controlled
   (`files` / `onFilesChange`) and each row has a "Remove <name>" button. A polite line says
   how many files were added or removed. It sits in a FormField: the id reaches the input. */
export interface FileDropzoneProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    'value' | 'defaultValue' | 'onChange' | 'type' | 'accept' | 'children'
  > {
  files: readonly File[];
  onFilesChange: (files: File[]) => void;
  /** Like the HTML attribute: ".pdf,.csv", "image/*", "text/plain". */
  accept?: string;
  /** Biggest file, in bytes. */
  maxSize?: number;
  /** Most files held at once. With `multiple={false}` it is 1. */
  maxFiles?: number;
  multiple?: boolean;
  /** The main line of the zone. */
  prompt?: string;
  /** A second line: the types and sizes allowed. */
  hint?: string;
  /** Hear about every refusal. */
  onReject?: (rejections: FileRejection[]) => void;
}

export interface FileRejection {
  file: File;
  reason: string;
}

export function formatBytes(bytes: number, locale = 'en-GB'): string {
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1000 && i < units.length - 1) {
    n /= 1000;
    i++;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: n < 10 && i > 0 ? 1 : 0 }).format(n)} ${units[i]}`;
}

/** Whether a file passes an `accept` string (an empty one accepts everything). */
export function fileAccepted(file: Pick<File, 'name' | 'type'>, accept: string | undefined) {
  const tokens = (accept ?? '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  if (tokens.length === 0) return true;
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  return tokens.some((t) =>
    t.startsWith('.')
      ? name.endsWith(t)
      : t.endsWith('/*')
        ? type.startsWith(t.slice(0, -1))
        : type === t,
  );
}

export const FileDropzone = forwardRef<HTMLInputElement, FileDropzoneProps>(function FileDropzone(
  {
    files,
    onFilesChange,
    accept,
    maxSize,
    maxFiles,
    multiple = true,
    prompt = 'Drop files here or browse',
    hint,
    onReject,
    disabled,
    className,
    ...rest
  },
  ref,
) {
  const [dragging, setDragging] = useState(false);
  const [problems, setProblems] = useState<FileRejection[]>([]);
  const [said, setSaid] = useState('');
  const hintId = useId();
  const limit = multiple ? maxFiles : 1;

  const take = (incoming: File[]) => {
    const rejected: FileRejection[] = [];
    const next = multiple ? [...files] : [];
    for (const file of incoming) {
      if (!fileAccepted(file, accept))
        rejected.push({ file, reason: 'is not an accepted file type' });
      else if (maxSize !== undefined && file.size > maxSize)
        rejected.push({ file, reason: `is too large (the limit is ${formatBytes(maxSize)})` });
      else if (limit !== undefined && next.length >= limit)
        rejected.push({
          file,
          reason: `would go over the limit of ${limit} file${limit === 1 ? '' : 's'}`,
        });
      else next.push(file);
    }
    setProblems(rejected);
    if (rejected.length > 0) onReject?.(rejected);
    const added = next.length - (multiple ? files.length : 0);
    if (added > 0 || (!multiple && next.length > 0)) {
      onFilesChange(next);
      setSaid(`Added ${next.at(-1)?.name ?? ''}${added > 1 ? ` and ${added - 1} more` : ''}`);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    take(Array.from(e.dataTransfer.files));
  };
  const remove = (file: File) => {
    onFilesChange(files.filter((f) => f !== file));
    setSaid(`Removed ${file.name}`);
    setProblems([]);
  };

  return (
    <div className={cn('ui-file-dropzone flex w-full flex-col gap-2', className)}>
      {/* the drag events of the zone; the label inside is the control */}
      <div
        role="presentation"
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
      >
        <label
          data-dragging={dragging || undefined}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-1 rounded-md border-2 border-dashed border-border-input bg-sunken px-4 py-6 text-center',
            'transition-[border-color,background-color] duration-(--dur-fast) ease-(--ease-out) motion-reduce:transition-none',
            'hover:border-fg-muted has-[:focus-visible]:border-primary has-[:focus-visible]:[box-shadow:var(--ring)]',
            'data-[dragging]:border-brand data-[dragging]:bg-selected',
            'has-[:disabled]:cursor-not-allowed has-[:disabled]:border-disabled-border has-[:disabled]:bg-disabled has-[:disabled]:text-disabled-fg',
          )}
        >
          <Glyph name="upload" size={22} className="text-fg-muted" />
          <span className="text-[13px] font-medium text-fg">{prompt}</span>
          {hint && (
            <span id={hintId} className="text-[12px] text-fg-muted">
              {hint}
            </span>
          )}
          <input
            {...rest}
            ref={ref}
            type="file"
            className="sr-only"
            accept={accept}
            multiple={multiple}
            disabled={disabled}
            aria-describedby={
              [rest['aria-describedby'], hint ? hintId : ''].filter(Boolean).join(' ') || undefined
            }
            onChange={(e) => {
              take(Array.from(e.target.files ?? []));
              // the same file can be picked again after it was removed
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {problems.length > 0 && (
        <ul
          role="alert"
          className="m-0 flex list-none flex-col gap-0.5 p-0 text-[12px] text-danger"
        >
          {problems.map((p) => (
            <li key={`${p.file.name}-${p.file.size}`} className="flex items-start gap-1.5">
              <Icon name="alert" size={13} className="mt-0.5 shrink-0" />
              <span>
                {p.file.name} {p.reason}.
              </span>
            </li>
          ))}
        </ul>
      )}
      {files.length > 0 && (
        <ul aria-label="Chosen files" className="m-0 flex list-none flex-col gap-1 p-0">
          {files.map((f) => (
            <li
              key={`${f.name}-${f.size}-${f.lastModified}`}
              className="flex items-center gap-2 rounded-sm border border-solid border-border bg-surface py-1 ps-2.5 pe-1 text-[13px]"
            >
              <Glyph name="file" size={15} className="shrink-0 text-fg-muted" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="shrink-0 text-[12px] tabular-nums text-fg-muted">
                {formatBytes(f.size)}
              </span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                disabled={disabled}
                onClick={() => remove(f)}
                className="inline-grid size-7 pointer-coarse:size-12 cursor-pointer place-items-center rounded-xs border-0 bg-transparent text-fg-muted transition-colors duration-(--dur-fast) hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)] disabled:cursor-not-allowed disabled:text-disabled-fg motion-reduce:transition-none"
              >
                <Icon name="x" size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div role="status" className="sr-only">
        {said}
      </div>
    </div>
  );
});
