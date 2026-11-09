import { buttonAttrs, Text } from '@apps/ui';

/* LinkedText — plain text whose http(s) addresses are clickable links, everything else shown
   as written (line breaks kept). It is for text the server wrote that holds links: the admin
   Mail page shows an email's body with it, so an invite or reset link can be followed in dev.

   Only `http:` and `https:` become links. Text is never read as HTML (React escapes it), and a
   link opens in a new tab with `noopener noreferrer`, so the page behind it cannot be reached
   from it. Trailing punctuation (`.`, `,`, `)`, ...) is not part of the address. */
export interface TextPart {
  text: string;
  /** Set when this part is a link. */
  url?: string;
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const TRAILING = /[.,;:!?)\]}]+$/;

/** Splits text into plain parts and link parts, in order. */
export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const url = match[0].replace(TRAILING, '');
    if (start > last) parts.push({ text: text.slice(last, start) });
    parts.push({ text: url, url });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export interface LinkedTextProps {
  text: string;
  /** Names the block for assistive tech. */
  label?: string;
}

export function LinkedText({ text, label }: LinkedTextProps) {
  return (
    <Text as="div" size="small" preserveLines role={label ? 'group' : undefined} aria-label={label}>
      {splitLinks(text).map((part, i) =>
        part.url ? (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder
            key={i}
            href={part.url}
            target="_blank"
            rel="noopener noreferrer"
            {...buttonAttrs('link', 'sm')}
            className={`${buttonAttrs('link', 'sm').className} break-all text-start`}
          >
            {part.text}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: parts are positional and never reorder
          <span key={i}>{part.text}</span>
        ),
      )}
    </Text>
  );
}
