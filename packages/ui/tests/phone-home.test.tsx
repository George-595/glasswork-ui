// @vitest-environment jsdom
/* The phone Home's kit pieces : ActionTiles / ActionTile, IconCircle,
   FillHeight, PhotoCapture's quiet gallery button and the Topbar's brand slot. Structure first,
   then the composed screen through axe in every skin x mode (colour contrast is the colour gate's
   job; jsdom cannot compute it). */
import axe from 'axe-core';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ActionTile,
  ActionTiles,
  AppShell,
  BottomTabBar,
  FillHeight,
  IconCircle,
  PhotoCapture,
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
  document.documentElement.style.removeProperty('--ui-bottom-inset');
  vi.restoreAllMocks();
});

const render = (node: ReactNode) => act(() => root.render(node));
const $ = <E extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as E;
const $$ = (sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel));

describe('IconCircle', () => {
  it('is a decorative 48px disc by default, 40px when md, filled with the tint role', () => {
    render(
      <>
        <IconCircle icon="camera" tint="aqua" data-testid="a" />
        <IconCircle icon="camera" tint="periwinkle" size="md" data-testid="b" />
      </>,
    );
    const [a, b] = $$('.ui-icon-circle');
    expect(a?.getAttribute('aria-hidden')).toBe('true');
    expect(a?.className).toContain('size-12');
    expect(a?.className).toContain('bg-seaglass-4');
    expect(a?.className).toContain('rounded-full');
    expect(b?.className).toContain('size-10');
    expect(b?.className).toContain('bg-seaglass-3');
    expect(a?.querySelector('svg')).toBeTruthy();
  });
});

describe('PhotoCapture galleryStyle="quiet"', () => {
  it('keeps both real inputs, makes the gallery a smaller full-width text button, no icon', () => {
    render(
      <PhotoCapture onFile={() => {}} galleryStyle="quiet" galleryLabel="or choose from gallery" />,
    );
    const camera = $('[data-capture="camera"]');
    const gallery = $('[data-capture="gallery"]');
    expect(camera.className).toContain('w-full');
    expect(gallery.className).toContain('w-full');
    expect(camera.className).toContain('min-h-14');
    expect(gallery.className).not.toContain('min-h-14');
    expect(gallery.className).toContain('min-h-10');
    expect(gallery.textContent).toBe('or choose from gallery');
    expect(gallery.querySelector('svg')).toBeNull();
    expect(camera.querySelector('svg')).toBeTruthy();
    // T7 still holds: no capture on the gallery input
    expect($<HTMLInputElement>('[data-capture="gallery"] input').hasAttribute('capture')).toBe(
      false,
    );
    expect($<HTMLInputElement>('[data-capture="camera"] input').getAttribute('capture')).toBe(
      'environment',
    );
  });

  it('is the bordered full-size button by default', () => {
    render(<PhotoCapture onFile={() => {}} />);
    expect($('[data-capture="gallery"]').className).toContain('min-h-14');
    expect($('[data-capture="gallery"] svg')).toBeTruthy();
  });
});

describe('Topbar brand', () => {
  it('shows the brand on a phone and keeps the title for screen readers; absent without it', () => {
    render(<Topbar title="Home" brand={<span data-brand="">Acme</span>} />);
    const brand = $('.ui-topbar-brand');
    expect(brand.className).toContain('md:hidden');
    expect(brand.className).toContain('flex-1');
    expect(brand.querySelector('[data-brand]')).toBeTruthy();
    expect($('.ui-topbar-title').className).toContain('max-md:sr-only');
    expect($('.ui-topbar-title').textContent).toBe('Home');
    render(<Topbar title="Home" />);
    expect($('.ui-topbar-brand')).toBeNull();
    expect($('.ui-topbar-title').className).not.toContain('max-md:sr-only');
  });

  it('gives every icon button in its actions the same 44px floor on a phone', () => {
    render(
      <Topbar
        title="Home"
        actions={
          <>
            <button type="button">a</button>
            <button type="button">b</button>
          </>
        }
      />,
    );
    const cls = $('.ui-topbar-actions').className;
    expect(cls).toContain('max-md:[&_button]:min-h-11');
    expect(cls).toContain('max-md:[&_button]:min-w-11');
  });
});

describe('FillHeight', () => {
  function geometry(top: number, viewport: number, scroll = 0) {
    Object.defineProperty(window, 'innerHeight', { value: viewport, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: scroll, configurable: true });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      top: top - scroll,
      bottom: 0,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: top - scroll,
      toJSON: () => ({}),
    });
  }

  it('is as tall as the room under it, less the tab bar and the 16px gap', () => {
    geometry(100, 740);
    document.documentElement.style.setProperty('--ui-bottom-inset', '64px');
    render(<FillHeight>x</FillHeight>);
    // 740 - 100 - 64 - 16
    expect($('.ui-fill-height').style.minHeight).toBe('560px');
  });

  it('measures from the top of the page, not of the window, and needs no tab bar', () => {
    geometry(100, 740, 30);
    render(<FillHeight reserve={0}>x</FillHeight>);
    expect($('.ui-fill-height').style.minHeight).toBe('640px');
  });

  it('is measured again when the tab bar publishes its height', async () => {
    geometry(100, 740);
    render(<FillHeight>x</FillHeight>);
    expect($('.ui-fill-height').style.minHeight).toBe('624px');
    await act(async () => {
      document.documentElement.style.setProperty('--ui-bottom-inset', '80px');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect($('.ui-fill-height').style.minHeight).toBe('544px');
  });
});

describe('ActionTiles', () => {
  const tiles = (
    <ActionTiles>
      <ActionTile icon="arrow-down" tint="aqua" title="Scan in" description="Add items to stock">
        <PhotoCapture
          onFile={() => {}}
          galleryStyle="quiet"
          galleryLabel="or choose from gallery"
        />
      </ActionTile>
      <ActionTile icon="arrow-up" tint="periwinkle" title="Scan out" description="Take items out">
        <PhotoCapture
          onFile={() => {}}
          galleryStyle="quiet"
          galleryLabel="or choose from gallery"
        />
      </ActionTile>
    </ActionTiles>
  );

  it('is one symmetric stage with no paper, holding equal tiles of at least 220px', () => {
    render(tiles);
    const stage = $('.ui-seaglass');
    expect(stage.getAttribute('data-symmetric')).toBe('true');
    expect(stage.className).not.toContain('bg-seaglass-paper');
    expect(stage.className).toContain('flex-col');
    const els = $$('.ui-action-tile');
    expect(els).toHaveLength(2);
    for (const tile of els) {
      // centred on its own axis, splits the height, never shorter than 220px
      expect(tile.className).toContain('flex-1');
      expect(tile.className).toContain('min-h-55');
      expect(tile.className).toContain('flex-col');
      expect(tile.className).toContain('text-center');
      expect(tile.className).toContain('w-full');
      // the same order inside: icon, title and line, then the actions
      expect(Array.from(tile.children).map((c) => c.className.split(' ')[0])).toEqual([
        'ui-icon-circle',
        'flex',
        'ui-photo-capture',
      ]);
    }
  });

  it('the title is a real heading at the level asked for, the line is text', () => {
    render(tiles);
    expect($$('h2').map((h) => h.textContent)).toEqual(['Scan in', 'Scan out']);
    render(
      <ActionTile icon="camera" title="Only" level={3}>
        <p>x</p>
      </ActionTile>,
    );
    expect($('h3')?.textContent).toBe('Only');
  });
});

describe('axe: the phone Home composed in the shell, every skin x mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(
          <AppShell
            brand="Acme"
            sidebar={<Sidebar sections={[]} current="home" />}
            topbar={<Topbar title="Home" brand={<span>Acme</span>} />}
            bottomNav={
              <BottomTabBar
                tabs={[{ id: 'home', label: 'Home', icon: 'home', href: '#/' }]}
                current="home"
              />
            }
          >
            <h1 className="max-md:sr-only">Home</h1>
            <p>Evening, Vic · Thu 15 Oct</p>
            <ActionTiles>
              <ActionTile icon="arrow-down" tint="aqua" title="Scan in" description="Add to stock">
                <PhotoCapture
                  onFile={() => {}}
                  galleryStyle="quiet"
                  galleryLabel="or choose from gallery"
                />
              </ActionTile>
              <ActionTile icon="arrow-up" tint="periwinkle" title="Scan out" description="Take out">
                <PhotoCapture
                  onFile={() => {}}
                  galleryStyle="quiet"
                  galleryLabel="or choose from gallery"
                />
              </ActionTile>
            </ActionTiles>
          </AppShell>,
        );
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
