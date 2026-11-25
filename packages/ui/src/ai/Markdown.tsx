import { Fragment, type ReactNode, useState } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { CopyGlyph } from './icons';

/* Markdown — the small, safe subset a model's reply uses, drawn with the kit's roles.
   Never HTML: the text is parsed into React elements, so nothing in a reply can inject markup.
   Blocks: # headings (h3 to h5, so a reply never outranks the page), paragraphs, - and 1. lists,
   > quotes, ``` fenced code (with the language and a Copy button), | tables | with a header
   row, and ---. Inline: **bold**, *italic*, `code` and [links](https://…) (http, https and
   mailto only; they open in a new tab with rel="noreferrer").
   `streaming` draws a blinking caret after the last word (hidden from assistive tech; the
   message itself is aria-busy). */
export interface MarkdownProps {
  children: string;
  streaming?: boolean;
  className?: string;
}

type Block =
  | { t: 'h'; level: number; text: string }
  | { t: 'p'; text: string }
  | { t: 'ul' | 'ol'; items: string[] }
  | { t: 'quote'; text: string }
  | { t: 'code'; lang: string; text: string }
  | { t: 'table'; head: string[]; rows: string[][] }
  | { t: 'hr' };

const cells = (line: string) =>
  line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());

export function parseMarkdown(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i++;
      continue;
    }
    const fence = /^```\s*([\w+-]*)/.exec(line);
    if (fence) {
      const body: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').startsWith('```')) body.push(lines[i++] ?? '');
      i++; // the closing fence (absent while streaming)
      out.push({ t: 'code', lang: fence[1] ?? '', text: body.join('\n') });
      continue;
    }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) {
      out.push({ t: 'h', level: Math.min(5, (h[1]?.length ?? 1) + 2), text: h[2] ?? '' });
      i++;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] ?? '')) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i] ?? ''))
        rows.push(cells(lines[i++] ?? ''));
      out.push({ t: 'table', head, rows });
      continue;
    }
    const list = /^\s*([-*+]|\d+[.)])\s+/.exec(line);
    if (list) {
      const ordered = /\d/.test(list[1] ?? '');
      const items: string[] = [];
      while (i < lines.length) {
        const m = /^\s*([-*+]|\d+[.)])\s+(.*)$/.exec(lines[i] ?? '');
        if (!m) break;
        items.push(m[2] ?? '');
        i++;
      }
      out.push({ t: ordered ? 'ol' : 'ul', items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i] ?? ''))
        body.push((lines[i++] ?? '').replace(/^>\s?/, ''));
      out.push({ t: 'quote', text: body.join(' ') });
      continue;
    }
    const para: string[] = [];
    while (
      i < lines.length &&
      (lines[i] ?? '').trim() !== '' &&
      !/^(```|#{1,6}\s|>|\s*([-*+]|\d+[.)])\s|\s*\|)/.test(lines[i] ?? '')
    )
      para.push(lines[i++] ?? '');
    if (para.length === 0) para.push(lines[i++] ?? '');
    out.push({ t: 'p', text: para.join('\n') });
  }
  return out;
}

const SAFE_URL = /^(https?:|mailto:)/i;

/** Inline marks: `code`, **bold**, *italic*, [text](url). */
export function inline(text: string, key = 'i'): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*\s][^*]*\*|_[^_\s][^_]*_)|(\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let n = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${key}-${n++}`;
    if (m[1])
      out.push(
        <code
          key={k}
          className="rounded-xs border border-solid border-border-subtle bg-sunken px-1 py-px font-mono text-[0.88em]"
        >
          {tok.slice(1, -1)}
        </code>,
      );
    else if (m[2]) out.push(<strong key={k}>{inline(tok.slice(2, -2), k)}</strong>);
    else if (m[3]) out.push(<em key={k}>{inline(tok.slice(1, -1), k)}</em>);
    else {
      const [, label = '', href = ''] = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(tok) ?? [];
      out.push(
        SAFE_URL.test(href) ? (
          <a
            key={k}
            href={href}
            target="_blank"
            rel="noreferrer"
            className="text-link underline underline-offset-2 hover:text-link-hover"
          >
            {label}
          </a>
        ) : (
          label
        ),
      );
    }
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function CodeBlock({ lang, text }: { lang: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <figure className="ui-md-code m-0 w-full min-w-0 overflow-hidden rounded-md border border-solid border-border bg-sunken">
      <figcaption className="flex items-center justify-between gap-2 border-0 border-b border-solid border-border-subtle py-1 ps-3 pe-1 font-sans text-[12px] text-fg-muted">
        <span>{lang || 'Code'}</span>
        <button
          type="button"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            } catch {
              setCopied(false);
            }
          }}
          className="inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-xs border-0 bg-transparent px-1.5 font-sans text-[12px] text-fg-muted hover:bg-hover hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
        >
          {copied ? <Icon name="check" size={13} /> : <CopyGlyph size={13} />}
          {copied ? 'Copied' : 'Copy'}
          <span className="sr-only"> {lang || 'code'}</span>
        </button>
      </figcaption>
      <pre
        {...SCROLLS}
        className="m-0 overflow-x-auto px-3 py-2.5 font-mono text-[12.5px] leading-[1.55] text-fg focus-visible:outline-none focus-visible:[box-shadow:inset_var(--ring)]"
      >
        <code>{text}</code>
      </pre>
    </figure>
  );
}

/* A scrolling region takes focus so a keyboard can scroll it (axe scrollable-region-focusable);
   spread, because the linter's no-noninteractive-tabindex rule does not know that case. */
const SCROLLS = { tabIndex: 0 } as const;

/** Positional items (table cells) with a stable id of their place. */
const keyed = <V,>(list: readonly V[]) => list.map((v, n) => ({ v, id: `n${n}` }));

const Caret = () => (
  <span
    aria-hidden="true"
    className="ui-md-caret ms-0.5 inline-block h-[1.05em] w-[0.5em] translate-y-[0.15em] rounded-[1px] bg-brand"
  />
);

export function Markdown({ children, streaming = false, className }: MarkdownProps) {
  const blocks = parseMarkdown(children);
  const lastIdx = blocks.length - 1;
  return (
    <div
      className={cn(
        'ui-markdown flex w-full min-w-0 flex-col gap-2.5 font-sans text-[14px] leading-[1.6] text-fg [overflow-wrap:anywhere]',
        className,
      )}
    >
      {blocks.map((b, i) => {
        const caret =
          streaming && i === lastIdx && b.t !== 'code' && b.t !== 'table' ? (
            <Caret key="caret" />
          ) : null;
        const k = `b${i}`;
        switch (b.t) {
          case 'h': {
            const H = `h${b.level}` as 'h3' | 'h4' | 'h5';
            return (
              <H
                key={k}
                className={cn(
                  'm-0 mt-1 font-semibold leading-[1.3] text-fg',
                  b.level === 3 ? 'text-[17px]' : b.level === 4 ? 'text-[15px]' : 'text-[14px]',
                )}
              >
                {inline(b.text, k)}
                {caret}
              </H>
            );
          }
          case 'p':
            return (
              <p key={k} className="m-0 whitespace-pre-line">
                {inline(b.text, k)}
                {caret}
              </p>
            );
          case 'ul':
          case 'ol': {
            const L = b.t;
            return (
              <L
                key={k}
                className={cn(
                  'm-0 flex flex-col gap-1 ps-5',
                  L === 'ul' ? 'list-disc' : 'list-decimal',
                )}
              >
                {b.items.map((it, j) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: list items have no identity of their own
                  <li key={j} className="ps-0.5 marker:text-fg-muted">
                    {inline(it, `${k}-${j}`)}
                    {j === b.items.length - 1 && caret}
                  </li>
                ))}
              </L>
            );
          }
          case 'quote':
            return (
              <blockquote
                key={k}
                className="m-0 border-0 border-s-2 border-solid border-border-strong ps-3 text-fg-muted"
              >
                {inline(b.text, k)}
                {caret}
              </blockquote>
            );
          case 'code':
            return <CodeBlock key={k} lang={b.lang} text={b.text} />;
          case 'table':
            return (
              <div
                key={k}
                {...SCROLLS}
                className="w-full overflow-x-auto rounded-md border border-solid border-border focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]"
              >
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr>
                      {keyed(b.head).map(({ id, v: c }) => (
                        <th
                          key={id}
                          scope="col"
                          className="border-0 border-b border-solid border-border bg-sunken px-3 py-1.5 text-start font-semibold"
                        >
                          {inline(c, `${k}-h${id}`)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {keyed(b.rows).map(({ id: j, v: r }) => (
                      <tr
                        key={j}
                        className="[&:not(:last-child)>td]:border-b [&:not(:last-child)>td]:border-solid [&>td]:border-0 [&:not(:last-child)>td]:border-border-subtle"
                      >
                        {keyed(r).map(({ id: x, v: c }) => (
                          <td key={x} className="px-3 py-1.5 tabular-nums">
                            {inline(c, `${k}-${j}-${x}`)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case 'hr':
            return (
              <hr
                key={k}
                className="m-0 w-full border-0 border-t border-solid border-border-subtle"
              />
            );
          default:
            return <Fragment key={k} />;
        }
      })}
      {streaming &&
        (lastIdx < 0 || blocks[lastIdx]?.t === 'code' || blocks[lastIdx]?.t === 'table') && (
          <span>
            <Caret />
          </span>
        )}
    </div>
  );
}
