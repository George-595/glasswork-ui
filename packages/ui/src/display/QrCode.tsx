import { type HTMLAttributes, useMemo } from 'react';
import { cn } from '../lib/cn';
import { encodeQr } from './qr/encode';

/* QrCode — a QR code for a short text (an address, a code). Generic: it knows nothing of what it carries.

   The code is drawn as one SVG path of dark modules (`qr-ink`) on a light ground (`qr-ground`) with a four-module quiet
   zone, in every skin and mode: many scanners do not read an inverted code, so it never follows the theme's polarity.
   Byte mode, error correction level M, up to 213 bytes (`encode.ts`); a longer text draws nothing and says so.

   It carries a name ("QR code for <label>") and nothing else: put the text it holds beside it, so a person who cannot
   scan it can still type it. It is never the only way to do something, and it must never hold a secret that is not
   already on the screen. */
export type QrCodeSize = 'sm' | 'md' | 'lg';
const SIZE: Record<QrCodeSize, string> = { sm: 'size-32', md: 'size-44', lg: 'size-56' };
const QUIET = 4;

export interface QrCodeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** The text the code holds. */
  value: string;
  /** What the code is for, in a few words: "linking Telegram". Names the image. */
  label: string;
  size?: QrCodeSize;
}

/** One path: a horizontal run of dark modules per segment. */
function pathOf(modules: boolean[][]): string {
  const parts: string[] = [];
  modules.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x++;
        continue;
      }
      let end = x;
      while (row[end]) end++;
      parts.push(`M${x + QUIET} ${y + QUIET}h${end - x}v1h-${end - x}z`);
      x = end;
    }
  });
  return parts.join('');
}

export function QrCode({ value, label, size = 'md', className, ...rest }: QrCodeProps) {
  const code = useMemo(() => {
    try {
      return encodeQr(value);
    } catch {
      return null;
    }
  }, [value]);
  if (!code) {
    return (
      <span {...rest} className={cn('text-sm text-fg-muted', className)}>
        This is too long for a QR code.
      </span>
    );
  }
  const span = code.size + QUIET * 2;
  return (
    <span {...rest} className={cn('inline-block shrink-0 rounded-md bg-qr-ground', className)}>
      <svg
        role="img"
        aria-label={`QR code for ${label}`}
        viewBox={`0 0 ${span} ${span}`}
        shapeRendering="crispEdges"
        className={cn('block', SIZE[size])}
      >
        <rect width={span} height={span} className="fill-qr-ground" />
        <path d={pathOf(code.modules)} className="fill-qr-ink" />
      </svg>
    </span>
  );
}
