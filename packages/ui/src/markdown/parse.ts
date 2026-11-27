/* A small Markdown parser: the CommonMark + GitHub subset that notes are written in, plus the
   Obsidian additions (wikilinks, embeds, callouts, ==highlight==, front matter). It returns a
   plain tree that <Markdown> draws with kit components; it never produces HTML, so nothing in a
   note can inject markup. Raw HTML in a note is shown as text.

   Blocks:  # headings, paragraphs, ``` / ~~~ fenced code, > quotes (and > [!note] callouts),
            - * + and 1. lists (nested by indent, [ ] / [x] tasks), | tables |, --- rules,
            YAML front matter at the very top.
   Inline:  **strong**, *em* / _em_, ~~strike~~, ==mark==, `code`, [text](url), ![alt](src),
            <https://autolinks>, bare https:// links, [[wikilink|alias]], ![[embed]], hard breaks.

   Pure and environment-free: no DOM, no React. */

export type MdInline =
  | { type: 'text'; value: string }
  | { type: 'strong' | 'em' | 'del' | 'mark'; children: MdInline[] }
  | { type: 'code'; value: string }
  | { type: 'link'; href: string; wiki: boolean; children: MdInline[] }
  | { type: 'image'; src: string; alt: string; wiki: boolean }
  | { type: 'break' };

export type MdAlign = 'left' | 'center' | 'right' | null;

export interface MdListItem {
  /** null: not a task; true/false: a [x] / [ ] task. */
  checked: boolean | null;
  children: MdBlock[];
}

export type MdBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4 | 5 | 6; id: string; children: MdInline[] }
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'code'; lang: string; value: string }
  | {
      type: 'quote';
      callout: { kind: string; title: MdInline[] } | null;
      children: MdBlock[];
    }
  | { type: 'list'; ordered: boolean; start: number; items: MdListItem[] }
  | { type: 'table'; align: MdAlign[]; head: MdInline[][]; rows: MdInline[][][] }
  | { type: 'rule' }
  | { type: 'frontmatter'; entries: [string, string][] };

export interface MdDocument {
  blocks: MdBlock[];
  /** The text of the first level-1 heading, or null. */
  title: string | null;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}> ?(.*)$/;
const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])(?:[ \t]+(.*))?$/;
const TABLE_SEP = /^ *\|?(?: *:?-+:? *\|)+(?: *:?-+:? *)?\|? *$/;
const CALLOUT = /^\[!([A-Za-z-]+)\][+-]?\s*(.*)$/;

/** A heading's anchor: lower-case words joined by hyphens (GitHub's rule, near enough). */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-');
}

/** The plain text of some inline nodes (a heading's anchor, an image's alt). */
export function inlineText(nodes: readonly MdInline[]): string {
  return nodes
    .map((n) => {
      if (n.type === 'text' || n.type === 'code') return n.value;
      if (n.type === 'break') return ' ';
      if (n.type === 'image') return n.alt;
      return inlineText(n.children);
    })
    .join('');
}

const isBlank = (line: string): boolean => line.trim() === '';
const indentOf = (line: string): number => line.match(/^ */)?.[0].length ?? 0;
const detab = (line: string): string => line.replace(/\t/g, '    ');

function splitRow(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells: string[] = [];
  let cur = '';
  let inCode = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i] as string;
    if (ch === '\\' && s[i + 1] === '|') {
      cur += '|';
      i++;
    } else if (ch === '`') {
      inCode = !inCode;
      cur += ch;
    } else if (ch === '|' && !inCode) {
      cells.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur.trim());
  return cells;
}

function parseFrontmatter(lines: string[]): { entries: [string, string][]; end: number } | null {
  if (lines[0]?.trim() !== '---') return null;
  const end = lines.findIndex((l, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(l));
  if (end < 0) return null;
  const entries: [string, string][] = [];
  for (const line of lines.slice(1, end)) {
    const m = /^([A-Za-z0-9_ -]+):\s*(.*)$/.exec(line);
    if (m) entries.push([(m[1] as string).trim(), (m[2] as string).trim()]);
    else if (/^\s+-\s+/.test(line) && entries.length > 0) {
      const last = entries[entries.length - 1] as [string, string];
      last[1] = last[1]
        ? `${last[1]}, ${line.replace(/^\s+-\s+/, '')}`
        : line.replace(/^\s+-\s+/, '');
    }
  }
  return { entries, end: end + 1 };
}

/* A line that interrupts a paragraph. */
function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    /^ {0,3}([-*+]|1[.)])[ \t]+\S/.test(line)
  );
}

function parseBlocks(lines: string[], ids: Map<string, number>): MdBlock[] {
  const out: MdBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] as string;
    if (isBlank(line)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const marker = fence[1] as string;
      const lang = fence[2] ?? '';
      const indent = indentOf(line);
      const body: string[] = [];
      i++;
      while (i < lines.length) {
        const l = lines[i] as string;
        if (
          l.trim().startsWith(marker[0] as string) &&
          l.trim().startsWith(marker) &&
          /^[`~]+\s*$/.test(l.trim())
        ) {
          i++;
          break;
        }
        body.push(l.slice(Math.min(indent, indentOf(l))));
        i++;
      }
      out.push({ type: 'code', lang, value: body.join('\n') });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      const children = parseInline(heading[2] ?? '');
      const base = slugify(inlineText(children)) || 'section';
      const seen = ids.get(base) ?? 0;
      ids.set(base, seen + 1);
      out.push({
        type: 'heading',
        level: (heading[1] as string).length as 1 | 2 | 3 | 4 | 5 | 6,
        id: seen === 0 ? base : `${base}-${seen}`,
        children,
      });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      out.push({ type: 'rule' });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const body: string[] = [];
      while (i < lines.length && !isBlank(lines[i] as string)) {
        const l = lines[i] as string;
        const m = QUOTE.exec(l);
        body.push(m ? (m[1] as string) : l);
        i++;
      }
      const first = CALLOUT.exec(body[0] ?? '');
      if (first) {
        out.push({
          type: 'quote',
          callout: { kind: (first[1] as string).toLowerCase(), title: parseInline(first[2] ?? '') },
          children: parseBlocks(body.slice(1), ids),
        });
      } else {
        out.push({ type: 'quote', callout: null, children: parseBlocks(body, ids) });
      }
      continue;
    }

    const item = LIST_ITEM.exec(line);
    if (item && (item[3] !== undefined || /^\s*([-*+]|\d+[.)])\s*$/.test(line))) {
      const parsed = parseList(lines, i, ids);
      out.push(parsed.block);
      i = parsed.next;
      continue;
    }

    // a table: a header row, then the separator row
    const next = lines[i + 1];
    if (line.includes('|') && next !== undefined && TABLE_SEP.test(next)) {
      const head = splitRow(line);
      const align: MdAlign[] = splitRow(next).map((c) => {
        const left = c.startsWith(':');
        const right = c.endsWith(':');
        return left && right ? 'center' : right ? 'right' : left ? 'left' : null;
      });
      const rows: MdInline[][][] = [];
      i += 2;
      while (
        i < lines.length &&
        !isBlank(lines[i] as string) &&
        (lines[i] as string).includes('|')
      ) {
        const cells = splitRow(lines[i] as string);
        rows.push(head.map((_, c) => parseInline(cells[c] ?? '')));
        i++;
      }
      out.push({
        type: 'table',
        align: head.map((_, c) => align[c] ?? null),
        head: head.map((h) => parseInline(h)),
        rows,
      });
      continue;
    }

    // a paragraph runs to a blank line or the start of another block
    const para: string[] = [line];
    i++;
    while (i < lines.length) {
      const l = lines[i] as string;
      if (isBlank(l) || startsBlock(l)) break;
      if (l.includes('|') && lines[i + 1] !== undefined && TABLE_SEP.test(lines[i + 1] as string)) {
        break;
      }
      para.push(l);
      i++;
    }
    out.push({ type: 'paragraph', children: parseInline(para.join('\n')) });
  }
  return out;
}

function parseList(
  lines: string[],
  from: number,
  ids: Map<string, number>,
): { block: MdBlock; next: number } {
  const first = LIST_ITEM.exec(lines[from] as string) as RegExpExecArray;
  const baseIndent = (first[1] as string).length;
  const ordered = /\d/.test(first[2] as string);
  const start = ordered ? Number.parseInt(first[2] as string, 10) : 1;
  const items: MdListItem[] = [];
  let i = from;
  while (i < lines.length) {
    const line = lines[i] as string;
    const m = LIST_ITEM.exec(line);
    if (!m || (m[1] as string).length !== baseIndent || /\d/.test(m[2] as string) !== ordered)
      break;
    const contentIndent = baseIndent + (m[2] as string).length + 1;
    const body: string[] = [m[3] ?? ''];
    i++;
    let blankRun = 0;
    while (i < lines.length) {
      const l = lines[i] as string;
      if (isBlank(l)) {
        blankRun++;
        body.push('');
        i++;
        continue;
      }
      const ind = indentOf(l);
      const sibling = LIST_ITEM.exec(l);
      if (ind < contentIndent && (sibling || blankRun > 0)) break;
      if (ind <= baseIndent && !sibling && blankRun === 0 && startsBlock(l)) break;
      blankRun = 0;
      body.push(ind >= contentIndent ? l.slice(contentIndent) : l.trimStart());
      i++;
    }
    while (body.length > 0 && isBlank(body[body.length - 1] as string)) body.pop();
    let checked: boolean | null = null;
    const task = /^\[([ xX])\][ \t]+/.exec(body[0] ?? '');
    if (task) {
      checked = task[1] !== ' ';
      body[0] = (body[0] as string).slice(task[0].length);
    }
    items.push({ checked, children: parseBlocks(body, ids) });
  }
  return { block: { type: 'list', ordered, start, items }, next: i };
}

/* ---- inline ---- */

const ESCAPABLE = new Set('\\`*_{}[]()#+-.!|~=<>'.split(''));

function findClosing(s: string, from: number, marker: string): number {
  let i = from;
  while (i < s.length) {
    const at = s.indexOf(marker, i);
    if (at < 0) return -1;
    if (s[at - 1] !== '\\' && at > from) return at;
    i = at + 1;
  }
  return -1;
}

/* The ] that closes the [ at `open`, allowing nested brackets. */
function closeBracket(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') {
      i++;
    } else if (ch === '[') {
      depth++;
    } else if (ch === ']') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/* (url "title") after a ] : the url and where the ) is. */
function linkTarget(s: string, open: number): { url: string; end: number } | null {
  if (s[open] !== '(') return null;
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '\\') i++;
    else if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        let inner = s.slice(open + 1, i).trim();
        inner = inner.replace(/\s+("[^"]*"|'[^']*')$/, '');
        if (inner.startsWith('<') && inner.endsWith('>')) inner = inner.slice(1, -1);
        return { url: inner, end: i };
      }
    }
  }
  return null;
}

const BARE_URL = /^https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"*_~]/;

export function parseInline(src: string): MdInline[] {
  const out: MdInline[] = [];
  let text = '';
  const flush = () => {
    if (text) out.push({ type: 'text', value: text });
    text = '';
  };
  const s = src;
  let i = 0;
  while (i < s.length) {
    const ch = s[i] as string;
    const rest = s.slice(i);

    if (ch === '\\' && i + 1 < s.length) {
      const next = s[i + 1] as string;
      if (next === '\n') {
        flush();
        out.push({ type: 'break' });
        i += 2;
        continue;
      }
      if (ESCAPABLE.has(next)) {
        text += next;
        i += 2;
        continue;
      }
    }

    if (ch === '\n') {
      // two trailing spaces before a newline are a hard break; otherwise a soft one (a space)
      if (text.endsWith('  ')) {
        text = text.replace(/ +$/, '');
        flush();
        out.push({ type: 'break' });
      } else {
        text = text.replace(/ +$/, '');
        text += ' ';
      }
      i++;
      continue;
    }

    if (ch === '`') {
      const run = /^`+/.exec(rest)?.[0] ?? '`';
      const close = s.indexOf(run, i + run.length);
      if (close > 0) {
        flush();
        let value = s.slice(i + run.length, close).replace(/\n/g, ' ');
        if (/^ .* $/.test(value)) value = value.slice(1, -1);
        out.push({ type: 'code', value });
        i = close + run.length;
        continue;
      }
      text += run;
      i += run.length;
      continue;
    }

    // ![[embed]] and [[wikilink|alias]]
    if (rest.startsWith('![[') || rest.startsWith('[[')) {
      const embed = ch === '!';
      const open = i + (embed ? 3 : 2);
      const close = s.indexOf(']]', open);
      if (close > open) {
        const inner = s.slice(open, close);
        const bar = inner.indexOf('|');
        const target = (bar >= 0 ? inner.slice(0, bar) : inner).trim();
        const label = (bar >= 0 ? inner.slice(bar + 1) : '').trim();
        flush();
        if (embed) {
          out.push({
            type: 'image',
            src: target,
            alt: label && !/^\d+(x\d+)?$/.test(label) ? label : target,
            wiki: true,
          });
        } else {
          out.push({
            type: 'link',
            href: target,
            wiki: true,
            children: [{ type: 'text', value: label || target.replace(/#.*$/, '') || target }],
          });
        }
        i = close + 2;
        continue;
      }
    }

    // ![alt](src) and [text](href)
    if ((ch === '!' && s[i + 1] === '[') || ch === '[') {
      const image = ch === '!';
      const open = image ? i + 1 : i;
      const close = closeBracket(s, open);
      const target = close > 0 ? linkTarget(s, close + 1) : null;
      if (target) {
        flush();
        const label = s.slice(open + 1, close);
        if (image) {
          out.push({ type: 'image', src: target.url, alt: label, wiki: false });
        } else {
          out.push({ type: 'link', href: target.url, wiki: false, children: parseInline(label) });
        }
        i = target.end + 1;
        continue;
      }
    }

    // <https://autolink>
    if (ch === '<') {
      const m = /^<(https?:\/\/[^\s>]+|mailto:[^\s>]+)>/.exec(rest);
      if (m) {
        flush();
        const url = m[1] as string;
        out.push({
          type: 'link',
          href: url,
          wiki: false,
          children: [{ type: 'text', value: url.replace(/^mailto:/, '') }],
        });
        i += m[0].length;
        continue;
      }
    }

    // a bare https:// link, at a word boundary
    if ((ch === 'h' || ch === 'H') && (i === 0 || /[\s(]/.test(s[i - 1] as string))) {
      const m = BARE_URL.exec(rest);
      if (m) {
        flush();
        out.push({
          type: 'link',
          href: m[0],
          wiki: false,
          children: [{ type: 'text', value: m[0] }],
        });
        i += m[0].length;
        continue;
      }
    }

    // **strong**, __strong__, *em*, _em_, ~~del~~, ==mark==
    const pair =
      rest.startsWith('**') || rest.startsWith('__')
        ? { marker: rest.slice(0, 2), type: 'strong' as const }
        : rest.startsWith('~~')
          ? { marker: '~~', type: 'del' as const }
          : rest.startsWith('==')
            ? { marker: '==', type: 'mark' as const }
            : ch === '*' || ch === '_'
              ? { marker: ch, type: 'em' as const }
              : null;
    if (pair) {
      const len = pair.marker.length;
      const after = s[i + len];
      const before = s[i - 1];
      // an opening marker is followed by a non-space; `_` inside a word (snake_case) is literal
      const opens =
        after !== undefined &&
        !/\s/.test(after) &&
        !(pair.marker[0] === '_' && before !== undefined && /[\p{L}\p{N}]/u.test(before));
      if (opens) {
        let close = findClosing(s, i + len, pair.marker);
        // for a single * or _, skip a ** / __ that belongs to a nested strong
        while (
          close > 0 &&
          len === 1 &&
          s[close + 1] === pair.marker &&
          s[close - 1] !== pair.marker
        ) {
          const skip = findClosing(s, close + 2, pair.marker + pair.marker);
          close = skip > 0 ? findClosing(s, skip + 2, pair.marker) : -1;
        }
        const inner = close > 0 ? s.slice(i + len, close) : '';
        const validClose =
          close > 0 &&
          !/\s/.test(s[close - 1] as string) &&
          !(pair.marker[0] === '_' && /[\p{L}\p{N}]/u.test(s[close + len] ?? ''));
        if (validClose && inner !== '') {
          flush();
          out.push({ type: pair.type, children: parseInline(inner) });
          i = close + len;
          continue;
        }
      }
      text += pair.marker;
      i += len;
      continue;
    }

    text += ch;
    i++;
  }
  flush();
  return out;
}

/** Parses a whole note. */
export function parseMarkdownDocument(source: string): MdDocument {
  const lines = source.replace(/\r\n?/g, '\n').split('\n').map(detab);
  const blocks: MdBlock[] = [];
  const front = parseFrontmatter(lines);
  const body = front ? lines.slice(front.end) : lines;
  if (front && front.entries.length > 0)
    blocks.push({ type: 'frontmatter', entries: front.entries });
  blocks.push(...parseBlocks(body, new Map()));
  const h1 = blocks.find(
    (b): b is Extract<MdBlock, { type: 'heading' }> => b.type === 'heading' && b.level === 1,
  );
  return { blocks, title: h1 ? inlineText(h1.children) : null };
}
