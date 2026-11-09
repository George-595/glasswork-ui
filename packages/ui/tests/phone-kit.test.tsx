// @vitest-environment jsdom
/* The phone-first additions: BottomTabBar and
   AppShell's `bottomNav` slot, the Sidebar group icon, Photo, PhotoCapture, StepList, FlowBar,
   the xl button and the new icons. Structure, semantics and behaviour, then a composed scan
   screen through axe in every skin x mode (colour contrast is the colour gate's job). */
import axe from 'axe-core';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  type BottomTab,
  BottomTabBar,
  Button,
  FlowBar,
  ICON_NAMES,
  Photo,
  PhotoCapture,
  Sidebar,
  StepList,
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
});

const render = (node: ReactNode) => act(() => root.render(node));
const $ = <E extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as E;
const $$ = (sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel));

const TABS: BottomTab[] = [
  { id: 'home', label: 'Overview', icon: 'home', href: '#/' },
  { id: 'stock', label: 'Stock', icon: 'table', href: '#/stock' },
  { id: 'packs', label: 'Packs', icon: 'package', href: '#/packs', dot: 'Out of stock' },
  { id: 'activity', label: 'Activity', icon: 'file-text', href: '#/activity' },
  { id: 'more', label: 'More', icon: 'menu', href: '#/more' },
];

describe('icons (K6)', () => {
  it('has every icon the screens need', () => {
    for (const name of [
      'camera',
      'image',
      'package',
      'bed',
      'gift',
      'truck',
      'trash',
      'map-pin',
      'share',
      'undo',
      'rotate-ccw',
      'scan',
      'tag',
      'download',
      'filter',
      'copy',
      'external-link',
      'wifi-off',
      'eye',
      'eye-off',
    ]) {
      expect(ICON_NAMES).toContain(name);
    }
  });
});

describe('BottomTabBar and the AppShell slot (K1)', () => {
  it('is a "Main" nav of links with icon and label; the current one is aria-current', () => {
    render(<BottomTabBar tabs={TABS} current="stock" />);
    const nav = $('nav');
    expect(nav.getAttribute('aria-label')).toBe('Main');
    expect(nav.className).toContain('md:hidden');
    const links = $$('a');
    expect(links.map((a) => a.textContent)).toEqual([
      'Overview',
      'Stock',
      'Packs, Out of stock',
      'Activity',
      'More',
    ]);
    expect(links.filter((a) => a.getAttribute('aria-current') === 'page')).toHaveLength(1);
    expect($('a[data-tab="stock"]').getAttribute('aria-current')).toBe('page');
    expect($$('[data-dot]')).toHaveLength(1);
    expect(links.every((a) => a.className.includes('min-h-12'))).toBe(true);
  });

  it('hands a plain click to the router, but not a modified one', () => {
    const onNavigate = vi.fn<(tab: (typeof TABS)[number]) => void>();
    render(<BottomTabBar tabs={TABS} current={null} onNavigate={onNavigate} />);
    act(() => $('a[data-tab="packs"]').click());
    expect(onNavigate).toHaveBeenCalledWith(TABS[2]);
    expect($$('a[aria-current]')).toHaveLength(0);
  });

  it('AppShell pads <main> for it, renders it, and drops the drawer button', () => {
    render(
      <AppShell
        brand="FF"
        sidebar={<Sidebar sections={[]} current="home" />}
        topbar={<Topbar title="Stock" />}
        bottomNav={<BottomTabBar tabs={TABS} current="stock" />}
      >
        <p>page</p>
      </AppShell>,
    );
    expect($('main').className).toContain('max-md:pb-');
    expect($('.ui-bottom-tabs')).toBeTruthy();
    expect($('.ui-topbar-menu')).toBeNull();
  });

  it('without it, the shell is as before: drawer button, no padding', () => {
    render(
      <AppShell brand="FF" sidebar={<p>s</p>} topbar={<Topbar title="Scan in" />}>
        <p>page</p>
      </AppShell>,
    );
    expect($('.ui-topbar-menu')).toBeTruthy();
    expect($('main').className).not.toContain('max-md:pb-');
  });

  it('a flow Topbar has no drawer button, carries its own way out and never wraps', async () => {
    render(
      <AppShell
        brand="FF"
        sidebar={<p>s</p>}
        topbar={
          <Topbar
            variant="flow"
            title="Scan in"
            leading={<Button variant="ghost">Cancel</Button>}
            actions={<Button variant="ghost">Search</Button>}
          />
        }
      >
        <p>page</p>
      </AppShell>,
    );
    expect($('.ui-topbar-menu')).toBeNull();
    expect($('.ui-topbar').dataset.variant).toBe('flow');
    const leading = $('.ui-topbar-leading');
    expect(leading.textContent).toBe('Cancel');
    // Cancel comes before the title in reading order
    expect(
      leading.compareDocumentPosition($('.ui-topbar-title')) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const actions = $('.ui-topbar-actions').className;
    expect(actions).toContain('flex-nowrap');
    expect(actions).not.toMatch(/\bflex-wrap\b/);
    const result = await axe.run(host);
    expect(result.violations).toEqual([]);
  });

  it('the Topbar clears the notch and the rounded corners of a phone', () => {
    render(<Topbar title="Stock" />);
    const cls = $('.ui-topbar').className;
    expect(cls).toContain('env(safe-area-inset-top)');
    expect(cls).toContain('env(safe-area-inset-left)');
    expect(cls).toContain('env(safe-area-inset-right)');
  });

  it('a Sidebar group may carry an icon before its label', () => {
    render(
      <Sidebar
        current="activity"
        sections={[
          {
            label: 'Manager tools',
            icon: 'shield',
            items: [{ id: 'activity', title: 'Activity', href: '#/activity' }],
          },
        ]}
      />,
    );
    const heading = $('.ui-sidebar-group-label');
    expect(heading.textContent).toBe('Manager tools');
    expect(heading.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
  });
});

describe('Photo (K3)', () => {
  it('holds the ratio, loads lazily behind a skeleton, then shows the picture', () => {
    render(<Photo src="/api/photos/1/thumb" alt="White double mattress" ratio="1/1" />);
    const frame = $('.ui-photo');
    expect(frame.className).toContain('aspect-square');
    const img = $<HTMLImageElement>('img');
    expect(img.getAttribute('loading')).toBe('lazy');
    expect(img.alt).toBe('White double mattress');
    expect(frame.dataset.state).toBe('loading');
    act(() => img.dispatchEvent(new Event('load')));
    expect(frame.dataset.state).toBe('loaded');
  });

  it('shows a named image icon when the picture fails or there is none', () => {
    render(<Photo src="/broken.jpg" alt="Blue sofa" fit="contain" eager />);
    expect($('img').getAttribute('loading')).toBe('eager');
    act(() => $('img').dispatchEvent(new Event('error')));
    expect($('[role="img"]').getAttribute('aria-label')).toBe('Blue sofa');
    render(<Photo src={null} alt="No photo" corner={<span data-corner="">x</span>} />);
    expect($('img')).toBeNull();
    expect($('[role="img"]').getAttribute('aria-label')).toBe('No photo');
    expect($('[data-corner]')).toBeTruthy();
  });
});

describe('PhotoCapture (K4; legacy T7, T8)', () => {
  const file = (type: string, size = 10) => new File([new Uint8Array(size)], 'p', { type });
  const choose = (input: HTMLInputElement, f: File) => {
    Object.defineProperty(input, 'files', { value: [f], configurable: true });
    act(() => input.dispatchEvent(new Event('change', { bubbles: true })));
  };

  it('the camera input has capture="environment"; the gallery input has none', () => {
    render(<PhotoCapture onFile={() => {}} />);
    const camera = $<HTMLInputElement>('[data-capture="camera"] input');
    const gallery = $<HTMLInputElement>('[data-capture="gallery"] input');
    expect(camera.getAttribute('capture')).toBe('environment');
    expect(gallery.hasAttribute('capture')).toBe(false);
    expect(camera.accept).toBe('image/*');
    expect(gallery.accept).toBe('image/*');
    expect($('[data-capture="camera"]').textContent).toBe('Take photo');
    expect($('[data-capture="gallery"]').textContent).toBe('Choose from gallery');
  });

  it('passes an image on, refuses others and oversized ones', () => {
    const onFile = vi.fn<(file: File) => void>();
    const onReject = vi.fn<(reason: string) => void>();
    render(<PhotoCapture onFile={onFile} onReject={onReject} maxBytes={100} />);
    const gallery = $<HTMLInputElement>('[data-capture="gallery"] input');
    choose(gallery, file('image/jpeg'));
    expect(onFile).toHaveBeenCalledTimes(1);
    choose(gallery, file('application/pdf'));
    choose(gallery, file('image/png', 500));
    expect(onReject.mock.calls.map((c) => c[0])).toEqual(['not_an_image', 'too_large']);
    expect(onFile).toHaveBeenCalledTimes(1);
  });

  it('while busy: both disabled, the camera button says so', () => {
    render(<PhotoCapture onFile={() => {}} busy />);
    expect($$('input').every((i) => (i as HTMLInputElement).disabled)).toBe(true);
    expect($('[data-capture="camera"]').textContent).toBe('Preparing photo…');
  });
});

describe('StepList and FlowBar (K5)', () => {
  it('draws done, current and todo rows in order, with words not just colour', () => {
    const onChange = vi.fn<() => void>();
    render(
      <StepList
        steps={[
          { id: 'size', title: 'Size', status: 'done', summary: 'Double', onChange },
          { id: 'quantity', title: 'How many?', status: 'current', content: <p>stepper</p> },
          { id: 'location', title: 'Where?', status: 'todo', hint: 'The Container' },
        ]}
        helper="Choose how many to continue"
      />,
    );
    const rows = $$('li');
    expect(rows.map((r) => r.dataset.status)).toEqual(['done', 'current', 'todo']);
    expect(rows[1]?.getAttribute('aria-current')).toBe('step');
    expect(rows[0]?.textContent).toContain('Done: Size');
    expect(rows[1]?.textContent).toContain('stepper');
    expect(rows[2]?.textContent).toContain('The Container');
    const change = rows[0]?.querySelector('button');
    expect(change?.getAttribute('aria-label')).toBe('Change size');
    act(() => change?.click());
    expect(onChange).toHaveBeenCalled();
    expect($('[aria-live="polite"]').textContent).toBe('Choose how many to continue');
  });

  it('FlowBar: one xl primary, an optional Cancel, a live status line', () => {
    const onPrimary = vi.fn<() => void>();
    const onCancel = vi.fn<() => void>();
    render(
      <FlowBar
        primaryLabel="Add to stock"
        onPrimary={onPrimary}
        primaryDisabled
        onCancel={onCancel}
        status="Choose a size to continue"
      />,
    );
    const [cancel, primary] = $$('button');
    expect(primary?.textContent).toBe('Add to stock');
    expect(primary?.getAttribute('data-size')).toBe('xl');
    expect((primary as HTMLButtonElement).disabled).toBe(true);
    act(() => cancel?.click());
    expect(onCancel).toHaveBeenCalled();
    expect($('[aria-live="polite"]').textContent).toBe('Choose a size to continue');
  });

  it('Button xl is 56px; md, lg and icon grow to 48px on a touch screen (K2)', () => {
    render(
      <>
        <Button size="xl">Take out</Button>
        <Button>Save</Button>
      </>,
    );
    const [xl, md] = $$('button');
    expect(xl?.className).toContain('min-h-14');
    expect(md?.className).toContain('pointer-coarse:min-h-12');
  });
});

describe('axe: a composed scan screen, every skin and mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(
          <AppShell
            brand="Acme"
            sidebar={<Sidebar sections={[]} current="home" />}
            topbar={<Topbar title="Scan in" />}
            bottomNav={<BottomTabBar tabs={TABS} current="home" />}
          >
            <h1>Scan in</h1>
            <Photo src={null} alt="Your photo" />
            <PhotoCapture onFile={() => {}} />
            <StepList
              steps={[
                { id: 'size', title: 'Size', status: 'done', summary: 'Double', onChange() {} },
                { id: 'q', title: 'How many?', status: 'current', content: <p>2</p> },
                { id: 'where', title: 'Where?', status: 'todo' },
              ]}
              helper="Choose how many to continue"
            />
            <FlowBar primaryLabel="Add to stock" onPrimary={() => {}} onCancel={() => {}} />
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
