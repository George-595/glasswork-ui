// @vitest-environment jsdom
/* The app frame: AppShell's standing parts (home link, breadcrumbs, pull to refresh, no-sidebar
   apps, the live slot) and the floating stack (Back to top, Fab, Floating) that keeps every
   floating button in one managed corner. Structure first, then the whole frame through axe. */
import axe from 'axe-core';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  BackToTop,
  BottomTabBar,
  Fab,
  Floating,
  FloatingStack,
  Sidebar,
  Topbar,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-skin');
  window.scrollY = 0;
  vi.restoreAllMocks();
});

const render = (node: ReactNode) => act(() => root.render(node));
const $ = <E extends Element = HTMLElement>(sel: string) => document.body.querySelector(sel) as E;
const $$ = (sel: string) => Array.from(document.body.querySelectorAll<HTMLElement>(sel));

const scrollTo = (y: number) =>
  act(async () => {
    Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
    window.dispatchEvent(new Event('scroll'));
    await new Promise((r) => requestAnimationFrame(() => r(null)));
  });

describe('AppShell home and breadcrumbs', () => {
  it('puts the hub first in the trail and in the sidebar foot', () => {
    render(
      <AppShell
        brand="Markets"
        home={{ href: '/hub' }}
        breadcrumbs={[{ label: 'Strategies', href: '#/s' }, { label: 'Merton' }]}
        sidebar={<Sidebar sections={[]} current="x" />}
        topbar={<Topbar title="Merton" />}
      >
        <h1>Merton</h1>
      </AppShell>,
    );
    const crumbs = $$('.ui-shell-crumbs li');
    expect(crumbs.map((c) => c.textContent)).toEqual(['Hub', 'Strategies', 'Merton']);
    expect(crumbs[0]?.querySelector('a')?.getAttribute('href')).toBe('/hub');
    expect($('.ui-sidebar-home').getAttribute('href')).toBe('/hub');
    expect($('.ui-sidebar-home').textContent).toContain('Back to Hub');
  });

  it('shows a plain hub link when there is no trail', () => {
    render(
      <AppShell brand="X" home={{ href: '/', label: 'Home' }} topbar={<Topbar title="X" />}>
        <h1>X</h1>
      </AppShell>,
    );
    expect($('.ui-shell-crumbs')).toBeNull();
    expect($('.ui-shell-home').textContent).toBe('Home');
  });
});

describe('AppShell without a sidebar', () => {
  it('has no column, no drawer, no menu button, and shows the brand at every width', () => {
    render(
      <AppShell
        brand="Chevy"
        topbar={<Topbar title="Cars" brand={<span>Chevy</span>} />}
        backToTop={false}
      >
        <h1>Cars</h1>
      </AppShell>,
    );
    expect($('.ui-sidebar')).toBeNull();
    expect($('.ui-drawer-scrim')).toBeNull();
    expect($('.ui-topbar-menu')).toBeNull();
    expect($('.ui-topbar-brand').className).not.toContain('md:hidden');
    expect($('.ui-shell').className).not.toContain('md:grid-cols-[var(--sidebar-w)');
  });
});

describe('AppShell onRefresh and live', () => {
  it('wraps the page in pull to refresh and centres the live pill under the bar', () => {
    const onRefresh = vi.fn<() => void>();
    render(
      <AppShell
        brand="X"
        topbar={<Topbar title="X" />}
        onRefresh={onRefresh}
        live={<span data-live="">Deploying</span>}
      >
        <h1>X</h1>
      </AppShell>,
    );
    expect($('main .ui-ptr')).toBeTruthy();
    expect($('.ui-shell-live [data-live]')).toBeTruthy();
    act(() => $<HTMLButtonElement>('.ui-ptr-button button').click());
    expect(onRefresh).toHaveBeenCalledOnce();
  });
});

describe('the floating stack', () => {
  it('holds Back to top and a Fab in one column, the Fab nearest the thumb', () => {
    render(
      <AppShell
        brand="X"
        topbar={<Topbar title="X" />}
        floating={<Fab label="Add car" onClick={() => {}} />}
      >
        <h1>X</h1>
      </AppShell>,
    );
    const stacks = $$('[data-slot="floating-stack"]');
    expect(stacks).toHaveLength(1);
    const items = Array.from(stacks[0]?.children ?? []) as HTMLElement[];
    expect(items).toHaveLength(2);
    const fab = items.find((i) => i.querySelector('[aria-label="Add car"]'));
    const top = items.find((i) => i.querySelector('.ui-back-to-top'));
    expect(Number(fab?.style.order)).toBeLessThan(Number(top?.style.order));
    // the column reverses, so the lower order sits at the bottom
    expect(stacks[0]?.className).toContain('flex-col-reverse');
    // above the bars at the bottom and the safe area
    expect(stacks[0]?.className).toContain('var(--ui-bottom-inset');
  });

  it('lets a page add its own item from deep inside, and takes it away again', () => {
    function Page({ show }: { show: boolean }) {
      return (
        <section>
          {show && (
            <Floating order={5}>
              <button type="button">Jump to now</button>
            </Floating>
          )}
        </section>
      );
    }
    render(
      <AppShell brand="X" topbar={<Topbar title="X" />} backToTop={false}>
        <Page show />
      </AppShell>,
    );
    render(
      <AppShell brand="X" topbar={<Topbar title="X" />} backToTop={false}>
        <Page show />
      </AppShell>,
    );
    const stack = $('[data-slot="floating-stack"]');
    expect(stack.textContent).toBe('Jump to now');
    expect($('main').textContent).not.toContain('Jump to now');
    render(
      <AppShell brand="X" topbar={<Topbar title="X" />} backToTop={false}>
        <Page show={false} />
      </AppShell>,
    );
    expect(stack.textContent).toBe('');
  });

  it('shows Back to top only past the threshold, then scrolls up and focuses main', async () => {
    const scroll = vi.fn<(o: ScrollToOptions) => void>();
    window.scrollTo = scroll as unknown as typeof window.scrollTo;
    render(
      <AppShell brand="X" topbar={<Topbar title="X" />} backToTop={300}>
        <h1>X</h1>
      </AppShell>,
    );
    const item = () => $('.ui-back-to-top').parentElement as HTMLElement;
    expect(item().hidden).toBe(true);
    await scrollTo(400);
    expect(item().hidden).toBe(false);
    const btn = $<HTMLButtonElement>('.ui-back-to-top');
    expect(btn.getAttribute('aria-label')).toBe('Back to top');
    // solid, not see-through
    expect(btn.className).toContain('bg-raised');
    act(() => btn.click());
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
    expect(document.activeElement?.id).toBe('main');
  });

  it('works without the shell: a stack of its own', () => {
    render(
      <FloatingStack>
        <Fab label="Add" />
        <BackToTop />
      </FloatingStack>,
    );
    render(
      <FloatingStack>
        <Fab label="Add" />
        <BackToTop />
      </FloatingStack>,
    );
    expect($$('[data-slot="floating-stack"]')).toHaveLength(1);
    expect($('[aria-label="Add"]').closest('[data-slot="floating-stack"]')).toBeTruthy();
  });
});

describe('axe: the whole frame, every skin x mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(
          <AppShell
            brand="Acme"
            home={{ href: '/hub' }}
            breadcrumbs={[{ label: 'Stock', href: '#/stock' }, { label: 'Sofa' }]}
            onRefresh={() => {}}
            sidebar={
              <Sidebar
                sections={[{ items: [{ id: 'home', title: 'Home', icon: 'home', href: '#/' }] }]}
                current="home"
              />
            }
            topbar={<Topbar title="Sofa" brand={<span>Acme</span>} />}
            bottomNav={
              <BottomTabBar
                tabs={[{ id: 'home', label: 'Home', icon: 'home', href: '#/' }]}
                current="home"
              />
            }
            floating={<Fab label="Add item" />}
          >
            <h1>Sofa</h1>
          </AppShell>,
        );
        await scrollTo(2000);
        const results = await axe.run(document.body, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
          },
          rules: { 'color-contrast': { enabled: false } },
          resultTypes: ['violations'],
        });
        const report = results.violations
          .map(
            (v) =>
              `${v.id}: ${v.help}\n${v.nodes.map((n) => `  ${n.target.join(' ')}`).join('\n')}`,
          )
          .join('\n');
        expect(report).toBe('');
      });
    }
  }
});

describe('Back to top in an app that scrolls a column', () => {
  it('finds the column round <main> from its scroll events and scrolls it', async () => {
    render(
      <AppShell brand="X" topbar={<Topbar title="X" />} backToTop={300}>
        <h1>X</h1>
      </AppShell>,
    );
    const column = $('.ui-shell-column');
    const colScroll = vi.fn<(o: ScrollToOptions) => void>();
    column.scrollTo = colScroll as unknown as typeof column.scrollTo;
    await act(async () => {
      column.scrollTop = 900;
      column.dispatchEvent(new Event('scroll'));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
    const btn = $<HTMLButtonElement>('.ui-back-to-top');
    expect((btn.parentElement as HTMLElement).hidden).toBe(false);
    act(() => btn.click());
    expect(colScroll).toHaveBeenCalledWith(expect.objectContaining({ top: 0 }));
  });
});

describe('syncThemeColor', () => {
  it('writes the page canvas role into one theme-color meta and keeps it in step', async () => {
    const { syncThemeColor } = await import('../src/lib/theme-color');
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
      m.remove();
    });
    document.documentElement.style.setProperty('--canvas', 'test-canvas');
    syncThemeColor();
    syncThemeColor();
    const metas = document.head.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
    expect(metas).toHaveLength(1);
    expect(metas[0]?.content).toBe('test-canvas');
    document.documentElement.style.removeProperty('--canvas');
  });
});
