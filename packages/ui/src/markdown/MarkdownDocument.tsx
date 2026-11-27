import {
  createElement,
  Fragment,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
  useMemo,
} from 'react';
import { Notice, type NoticeTone } from '../components/notice';
import { Code } from '../components/typography/Text';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../components/ui/table';
import { cn } from '../lib/cn';
import {
  type MdAlign,
  type MdBlock,
  type MdInline,
  type MdListItem,
  parseMarkdownDocument,
} from './parse';

/* MarkdownDocument — a document (a note, a README) drawn with kit parts: the kit's type scale, Code, Notice (for Obsidian
   callouts) and Table. The source is parsed by ./parse (no HTML is ever produced from it, so a
   note cannot inject markup or script).

   Links and images go through the caller:
   - `resolveLink(target, wiki)` turns a link's target into an address and says whether it is
     inside the app; an inside link's click calls `onNavigate(href)` instead of loading a page
     (the app's router). External links open in a new tab.
   - `resolveImage(src, wiki)` turns an image's source into an address, or null to show its alt.
   Headings carry ids (`#section` links work); the outline starts at `headingOffset + 1` so a
   note's `#` can sit under the page's own <h1>. */

export interface ResolvedLink {
  href: string;
  internal: boolean;
}

export interface MarkdownDocumentProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  source: string;
  resolveLink?: (target: string, wiki: boolean) => ResolvedLink;
  resolveImage?: (src: string, wiki: boolean) => string | null;
  onNavigate?: (href: string) => void;
  /** Added to each heading's level (1 makes a note's `#` an <h2>). Capped at h6. */
  headingOffset?: number;
}

const HEADING_CLASS: Record<number, string> = {
  1: '[font:var(--t-h1)] tracking-[-0.015em] mt-2',
  2: '[font:var(--t-h2)] tracking-[-0.01em] mt-6',
  3: '[font:var(--t-h3)] mt-5',
  4: 'text-[15px] leading-[1.3] font-semibold mt-4',
  5: 'text-[14px] leading-[1.3] font-semibold mt-3',
  6: 'text-[13px] leading-[1.3] font-semibold uppercase tracking-wide text-fg-muted mt-3',
};

const CALLOUT_TONE: Record<string, NoticeTone> = {
  warning: 'warning',
  caution: 'warning',
  attention: 'warning',
  danger: 'danger',
  error: 'danger',
  bug: 'danger',
  failure: 'danger',
  fail: 'danger',
  success: 'success',
  check: 'success',
  done: 'success',
  tip: 'success',
};

const defaultLink = (target: string): ResolvedLink => ({
  href: target,
  internal: !/^[a-z][a-z0-9+.-]*:/i.test(target) && !target.startsWith('//'),
});

interface Ctx {
  resolveLink: (target: string, wiki: boolean) => ResolvedLink;
  resolveImage: (src: string, wiki: boolean) => string | null;
  onNavigate: ((href: string) => void) | undefined;
  offset: number;
}

function inlineNode(n: MdInline, ctx: Ctx): ReactNode {
  switch (n.type) {
    case 'text':
      return n.value;
    case 'break':
      return <br />;
    case 'code':
      return <Code>{n.value}</Code>;
    case 'strong':
      return (
        <strong className="font-semibold">
          <Inline nodes={n.children} ctx={ctx} />
        </strong>
      );
    case 'em':
      return (
        <em>
          <Inline nodes={n.children} ctx={ctx} />
        </em>
      );
    case 'del':
      return (
        <del>
          <Inline nodes={n.children} ctx={ctx} />
        </del>
      );
    case 'mark':
      return (
        <mark className="rounded-xs bg-warning-soft px-0.5 text-fg">
          <Inline nodes={n.children} ctx={ctx} />
        </mark>
      );
    case 'image': {
      const src = ctx.resolveImage(n.src, n.wiki);
      if (!src) {
        return <span className="text-fg-muted">[{n.alt || 'image'}]</span>;
      }
      return (
        <img
          src={src}
          alt={n.alt}
          loading="lazy"
          className="my-2 block h-auto max-w-full rounded-md border border-solid border-border-subtle"
        />
      );
    }
    case 'link': {
      const target = n.href.startsWith('#')
        ? { href: n.href, internal: false }
        : ctx.resolveLink(n.href, n.wiki);
      const external = !target.internal && !target.href.startsWith('#');
      const onClick =
        target.internal && ctx.onNavigate
          ? (e: MouseEvent<HTMLAnchorElement>) => {
              if (
                e.defaultPrevented ||
                e.button !== 0 ||
                e.metaKey ||
                e.ctrlKey ||
                e.shiftKey ||
                e.altKey
              )
                return;
              e.preventDefault();
              ctx.onNavigate?.(target.href);
            }
          : undefined;
      return (
        <a
          href={target.href}
          {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          onClick={onClick}
          className="text-link underline underline-offset-4 hover:text-link-hover break-words"
        >
          <Inline nodes={n.children} ctx={ctx} />
        </a>
      );
    }
    default:
      return null;
  }
}

function blockNode(b: MdBlock, ctx: Ctx): ReactNode {
  switch (b.type) {
    case 'heading': {
      const level = Math.min(6, b.level + ctx.offset);
      const Tag = `h${level}` as 'h2';
      return (
        <Tag
          id={b.id}
          className={cn('m-0 scroll-mt-20 text-balance text-fg', HEADING_CLASS[b.level])}
        >
          <Inline nodes={b.children} ctx={ctx} />
        </Tag>
      );
    }
    case 'paragraph':
      return (
        <p className="m-0">
          <Inline nodes={b.children} ctx={ctx} />
        </p>
      );
    case 'code':
      return (
        <Code block aria-label={b.lang ? `${b.lang} code` : 'Code'}>
          {b.value}
        </Code>
      );
    case 'rule':
      return <hr className="my-2 w-full border-0 border-t border-solid border-border" />;
    case 'quote':
      if (b.callout) {
        const tone = CALLOUT_TONE[b.callout.kind] ?? 'info';
        const title =
          b.callout.title.length > 0 ? (
            <Inline nodes={b.callout.title} ctx={ctx} />
          ) : (
            b.callout.kind
          );
        return (
          <Notice tone={tone} role="note" title={title}>
            <div className="flex flex-col gap-2">
              <Blocks blocks={b.children} ctx={ctx} />
            </div>
          </Notice>
        );
      }
      return (
        <blockquote className="m-0 flex flex-col gap-2 rounded-md bg-sunken px-4 py-3 text-fg-muted">
          <Blocks blocks={b.children} ctx={ctx} />
        </blockquote>
      );
    case 'list': {
      const tasks = b.items.some((it) => it.checked !== null);
      const items = seq(b.items.map((it) => listItem(it, ctx)));
      const cls = cn(
        'm-0 flex flex-col gap-1',
        tasks ? 'ps-1' : 'ps-6',
        b.ordered ? 'list-decimal' : 'list-disc',
      );
      return b.ordered ? (
        <ol start={b.start} className={cls}>
          {items}
        </ol>
      ) : (
        <ul className={cls}>{items}</ul>
      );
    }
    case 'table':
      return (
        <Table>
          <TableHeader>
            <TableRow>{seq(b.head.map((h, c) => headCell(h, b.align[c] ?? null, ctx)))}</TableRow>
          </TableHeader>
          <TableBody>{seq(b.rows.map((row) => tableRow(row, b.align, ctx)))}</TableBody>
        </Table>
      );
    case 'frontmatter':
      return (
        <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 rounded-md bg-sunken px-4 py-3 [font:var(--t-small)]">
          {b.entries.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-fg-muted">{k}</dt>
              <dd className="m-0 min-w-0 text-fg [overflow-wrap:anywhere]">{v}</dd>
            </div>
          ))}
        </dl>
      );
    default:
      return null;
  }
}

function listItem(it: MdListItem, ctx: Ctx): ReactNode {
  return (
    <li className={cn('flex-col gap-1', it.checked !== null ? 'flex list-none' : 'list-item')}>
      {it.checked !== null ? (
        <span className="flex items-start gap-2">
          <span
            role="img"
            aria-label={it.checked ? 'Done' : 'Not done'}
            className={cn(
              'mt-1 inline-flex size-3.5 shrink-0 items-center justify-center rounded-xs border border-solid text-[10px] leading-none',
              it.checked ? 'border-success bg-success-soft text-success' : 'border-border-strong',
            )}
          >
            {it.checked ? '✓' : ''}
          </span>
          <span className="flex min-w-0 flex-col gap-1">
            <Blocks blocks={it.children} ctx={ctx} />
          </span>
        </span>
      ) : (
        <span className="flex min-w-0 flex-col gap-1">
          <Blocks blocks={it.children} ctx={ctx} />
        </span>
      )}
    </li>
  );
}

function headCell(h: MdInline[], align: MdAlign, ctx: Ctx): ReactNode {
  return (
    <TableHead className={alignClass(align)}>
      <Inline nodes={h} ctx={ctx} />
    </TableHead>
  );
}

function bodyCell(cell: MdInline[], align: MdAlign, ctx: Ctx): ReactNode {
  return (
    <TableCell className={alignClass(align)}>
      <Inline nodes={cell} ctx={ctx} />
    </TableCell>
  );
}

function tableRow(row: MdInline[][], align: readonly MdAlign[], ctx: Ctx): ReactNode {
  return <TableRow>{seq(row.map((cell, c) => bodyCell(cell, align[c] ?? null, ctx)))}</TableRow>;
}

function Inline({ nodes, ctx }: { nodes: readonly MdInline[]; ctx: Ctx }): ReactNode {
  return seq(nodes.map((n) => inlineNode(n, ctx)));
}

function Blocks({ blocks, ctx }: { blocks: readonly MdBlock[]; ctx: Ctx }): ReactNode {
  return seq(blocks.map((b) => blockNode(b, ctx)));
}

/* Siblings passed as separate children (not one array), so React needs no keys: the order of a
   parsed note never changes under the same element. */
function seq(nodes: ReactNode[]): ReactNode {
  return createElement(Fragment, null, ...nodes);
}

function alignClass(a: MdAlign): string | undefined {
  return a === 'center' ? 'text-center' : a === 'right' ? 'text-right' : undefined;
}

export function MarkdownDocument({
  source,
  resolveLink,
  resolveImage,
  onNavigate,
  headingOffset = 0,
  className,
  ...props
}: MarkdownDocumentProps) {
  const doc = useMemo(() => parseMarkdownDocument(source), [source]);
  const ctx: Ctx = {
    resolveLink: resolveLink ?? defaultLink,
    resolveImage: resolveImage ?? ((src) => src),
    onNavigate,
    offset: headingOffset,
  };
  return (
    <div
      {...props}
      className={cn(
        'ui-markdown flex min-w-0 flex-col gap-3 text-fg [font:var(--t-body)] [overflow-wrap:break-word]',
        className,
      )}
    >
      <Blocks blocks={doc.blocks} ctx={ctx} />
    </div>
  );
}
