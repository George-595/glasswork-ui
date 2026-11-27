// @vitest-environment jsdom
/* Documents: the Markdown parser and renderer, the folder tree and the sandboxed HTML frame. */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildFileTree,
  FileTree,
  HtmlFrame,
  MarkdownDocument as Markdown,
  parseMarkdownDocument as parseMarkdown,
} from '../src/index.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});
function mount(node: React.ReactNode): HTMLElement {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root?.render(node));
  return host;
}

describe('parseMarkdown', () => {
  it('reads headings with unique anchors, and the title', () => {
    const doc = parseMarkdown('# Hello *you*\n\n## Map\n\n## Map\n');
    expect(doc.title).toBe('Hello you');
    expect(doc.blocks.map((b) => (b.type === 'heading' ? b.id : b.type))).toEqual([
      'hello-you',
      'map',
      'map-1',
    ]);
  });

  it('reads front matter, including list values', () => {
    const doc = parseMarkdown('---\ntitle: X\ntags:\n  - a\n  - b\n---\nbody');
    expect(doc.blocks[0]).toEqual({
      type: 'frontmatter',
      entries: [
        ['title', 'X'],
        ['tags', 'a, b'],
      ],
    });
  });

  it('reads nested lists, tasks and ordered starts', () => {
    const doc = parseMarkdown('- one\n- [x] two\n  - deep\n\n3. c\n4. d');
    const [ul, ol] = doc.blocks;
    expect(ul).toMatchObject({ type: 'list', ordered: false });
    if (ul?.type !== 'list') throw new Error('no list');
    expect(ul.items.map((i) => i.checked)).toEqual([null, true]);
    expect(ul.items[1]?.children[1]).toMatchObject({ type: 'list' });
    expect(ol).toMatchObject({ type: 'list', ordered: true, start: 3 });
  });

  it('reads fenced code verbatim, tables with alignment, quotes and callouts', () => {
    const doc = parseMarkdown(
      '```js\nconst a = **b**;\n```\n\n| a | b |\n|:-:|--:|\n| `x|y` | 2 |\n\n> [!tip] Nice\n> body\n\n> plain',
    );
    expect(doc.blocks[0]).toEqual({ type: 'code', lang: 'js', value: 'const a = **b**;' });
    expect(doc.blocks[1]).toMatchObject({ type: 'table', align: ['center', 'right'] });
    expect(doc.blocks[2]).toMatchObject({ type: 'quote', callout: { kind: 'tip' } });
    expect(doc.blocks[3]).toMatchObject({ type: 'quote', callout: null });
  });

  it('reads inline marks, links, wikilinks, embeds and bare URLs; snake_case stays literal', () => {
    const [p] = parseMarkdown(
      'a **b** _c_ ~~d~~ ==e== `f` [g](h.md) [[I|eye]] ![[j.png]] https://k.test/l. snake_case_name',
    ).blocks;
    if (p?.type !== 'paragraph') throw new Error('no paragraph');
    expect(p.children.map((n) => n.type)).toEqual([
      'text',
      'strong',
      'text',
      'em',
      'text',
      'del',
      'text',
      'mark',
      'text',
      'code',
      'text',
      'link',
      'text',
      'link',
      'text',
      'image',
      'text',
      'link',
      'text',
    ]);
    expect(p.children[13]).toMatchObject({ type: 'link', href: 'I', wiki: true });
    expect(p.children[15]).toMatchObject({ type: 'image', src: 'j.png', wiki: true });
    expect(p.children[17]).toMatchObject({ href: 'https://k.test/l' });
    expect(p.children.at(-1)).toEqual({ type: 'text', value: '. snake_case_name' });
  });
});

describe('Markdown', () => {
  it('never turns a note into HTML: tags in the text are shown as text', () => {
    const html = renderToStaticMarkup(
      <Markdown source={'<script>alert(1)</script>\n\n<b>x</b>'} />,
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('offsets headings, opens other sites in a new tab and routes internal links', () => {
    const go = vi.fn<(href: string) => void>();
    const el = mount(
      <Markdown
        source={'# Top\n\n[in](a.md) [out](https://x.test) [here](#top)'}
        headingOffset={1}
        resolveLink={(t) => ({ href: `/v?p=${t}`, internal: !t.startsWith('http') })}
        onNavigate={go}
      />,
    );
    expect(el.querySelector('h2')?.id).toBe('top');
    const [inside, outside, here] = Array.from(el.querySelectorAll('a'));
    expect(outside?.getAttribute('target')).toBe('_blank');
    expect(here?.getAttribute('href')).toBe('#top');
    act(() =>
      inside?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      ),
    );
    expect(go).toHaveBeenCalledWith('/v?p=a.md');
  });

  it('shows an image it cannot resolve as its alt text', () => {
    const html = renderToStaticMarkup(
      <Markdown source={'![a chart](x.png)'} resolveImage={() => null} />,
    );
    expect(html).not.toContain('<img');
    expect(html).toContain('[a chart]');
  });
});

describe('FileTree', () => {
  it('builds folders first, A to Z with numbers in order', () => {
    const nodes = buildFileTree(['b.md', 'a/10.md', 'a/2.md', 'c/x.md']);
    expect(nodes.map((n) => n.name)).toEqual(['a', 'c', 'b.md']);
    expect(nodes[0]?.children?.map((n) => n.name)).toEqual(['2.md', '10.md']);
  });

  it('opens the folder holding the selected file and marks it current', () => {
    const el = mount(
      <FileTree
        nodes={buildFileTree(['a/x.md', 'b/y.md'])}
        selected="a/x.md"
        hrefFor={(p) => `/v?p=${p}`}
      />,
    );
    const details = Array.from(el.querySelectorAll('details'));
    expect(details.map((d) => d.open)).toEqual([true, false]);
    expect(el.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/v?p=a/x.md');
  });
});

describe('HtmlFrame', () => {
  it('is sandboxed without same-origin, grows to the reported height and passes on links', () => {
    const open = vi.fn<(href: string) => void>();
    const el = mount(<HtmlFrame src="/doc.html" title="Doc" onOpen={open} />);
    const frame = el.querySelector('iframe') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe(
      'allow-scripts allow-popups allow-popups-to-escape-sandbox',
    );
    const send = (data: unknown, source: unknown = frame.contentWindow) =>
      act(() =>
        window.dispatchEvent(new MessageEvent('message', { data, source: source as Window })),
      );
    send({ uiFrame: 'height', value: 1234 });
    expect(frame.style.height).toBe('1234px');
    send({ uiFrame: 'open', href: 'a/b.md#x' });
    expect(open).toHaveBeenCalledWith('a/b.md#x');
    // another window's messages are ignored
    send({ uiFrame: 'height', value: 99 }, window);
    expect(frame.style.height).toBe('1234px');
  });
});
