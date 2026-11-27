import { type IframeHTMLAttributes, useEffect, useEffectEvent, useRef, useState } from 'react';
import { cn } from '../lib/cn';

/* HtmlFrame — a whole HTML document shown inside the page, sandboxed: its scripts run in an
   opaque origin (no cookies, no same-origin access to the app), forms and top navigation are
   blocked, and links open new tabs. The server serving `src` should send its own CSP too.

   The document may talk back with postMessage (the server can inject a small script for it):
     { uiFrame: 'height', value: number }   grow the frame to fit, so the page scrolls, not the frame
     { uiFrame: 'open', href: string }      a link the app should follow itself (onOpen)
   Only messages from this frame's own window are read; anything else is ignored. */

export interface HtmlFrameProps
  extends Omit<IframeHTMLAttributes<HTMLIFrameElement>, 'sandbox' | 'src' | 'title'> {
  src: string;
  /** The frame's accessible name (the document's title). */
  title: string;
  onOpen?: (href: string) => void;
  /** Height before the document reports its own (px). */
  minHeight?: number;
}

const MAX_HEIGHT = 200_000;

export function HtmlFrame({
  src,
  title,
  onOpen,
  minHeight = 480,
  className,
  ...props
}: HtmlFrameProps) {
  const ref = useRef<HTMLIFrameElement>(null);
  // the height the document reported, for the document it was reported by
  const [reported, setReported] = useState<{ src: string; height: number } | null>(null);
  const height = reported?.src === src ? reported.height : null;
  const open = useEffectEvent((href: string) => onOpen?.(href));
  const report = useEffectEvent((h: number) => setReported({ src, height: h }));

  useEffect(() => {
    const listen = (e: MessageEvent) => {
      if (!ref.current || e.source !== ref.current.contentWindow) return;
      const data = e.data as { uiFrame?: unknown; value?: unknown; href?: unknown } | null;
      if (!data || typeof data !== 'object') return;
      if (
        data.uiFrame === 'height' &&
        typeof data.value === 'number' &&
        Number.isFinite(data.value)
      ) {
        report(Math.max(120, Math.min(MAX_HEIGHT, Math.ceil(data.value))));
      } else if (
        data.uiFrame === 'open' &&
        typeof data.href === 'string' &&
        data.href.length < 2048
      ) {
        open(data.href);
      }
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, []);

  return (
    <iframe
      ref={ref}
      src={src}
      title={title}
      sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      loading="lazy"
      {...props}
      style={{ height: height ?? minHeight }}
      className={cn(
        'ui-html-frame block w-full rounded-md border border-solid border-border-subtle bg-surface-solid',
        className,
      )}
    />
  );
}
