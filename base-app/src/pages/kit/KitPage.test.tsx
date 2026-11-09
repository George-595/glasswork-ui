import { afterEach, describe, expect, it } from 'vitest';
import { SOUND_NAMES } from '~/core/ui';
import { formatViolations, runAxe } from '~/test/axe';
import { click, getAllByRole, getByRole } from '~/test/dom';
import { locationNow, setLocation } from '~/test/location';
import { mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import KitPage from './KitPage';

const SECTION_IDS = [
  'buttons',
  'inputs',
  'pickers',
  'display',
  'cards',
  'feedback',
  'overlays',
  'tables',
  'charts',
  'viz',
  'effects',
  'sea-glass',
  'sounds',
  'ai',
];

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
});

async function mount(
  skin: 'enterprise' | 'glass' = 'enterprise',
  mode: 'light' | 'dark' = 'light',
) {
  mockApi();
  view = await render(<KitPage />, { skin, mode });
  await flush();
  return view;
}

describe('KitPage', () => {
  it('renders every section, each with an h2, under one h1', async () => {
    await mount();
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    expect(getByRole(document.body, 'heading', 'Kit').tagName).toBe('H1');
    for (const id of SECTION_IDS) {
      const section = document.getElementById(id);
      expect(`${id}:${section?.tagName}`).toBe(`${id}:SECTION`);
      expect(`${id}:${section?.querySelector('h2') !== null}`).toBe(`${id}:true`);
      expect(`${id}:${Boolean(section?.getAttribute('aria-labelledby'))}`).toBe(`${id}:true`);
    }
  });

  it('has a section nav with one link per section', async () => {
    await mount();
    const nav = getByRole(document.body, 'navigation', 'Kit sections');
    const links = getAllByRole(nav, 'link');
    expect(links).toHaveLength(SECTION_IDS.length);
    expect(links.map((l) => l.textContent)).toContain('Tables');
  });

  it('a nav link moves focus to its section heading and keeps the route', async () => {
    setLocation('/kit');
    await mount();
    const nav = getByRole(document.body, 'navigation', 'Kit sections');
    await click(getByRole(nav, 'link', 'Charts'));
    expect(document.activeElement).toBe(document.querySelector('#charts h2'));
    expect(locationNow()).toBe('/kit');
  });

  it('shows the components in their states', async () => {
    await mount();
    const body = document.body;
    // buttons: every variant has a row
    expect(document.querySelectorAll('#buttons [data-level]')).toHaveLength(8);
    // forms
    expect(body.textContent).toContain('Remember me');
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBeGreaterThanOrEqual(3);
    expect(document.querySelector('[role="switch"]')).not.toBeNull();
    expect(document.querySelector('[role="slider"]')).not.toBeNull();
    // feedback
    expect(document.querySelector('.ui-empty-state')).not.toBeNull();
    expect(document.querySelector('[role="progressbar"]')).not.toBeNull();
    // the table and the charts
    expect(document.querySelector('#tables table')).not.toBeNull();
    expect(document.querySelectorAll('#charts h4').length).toBeGreaterThanOrEqual(5);
  });

  it('overlay buttons open their overlays', async () => {
    await mount();
    await click(getByRole(document.body, 'button', 'Open dialog'));
    await flush();
    expect(document.querySelector('dialog[open], [role="dialog"]')).not.toBeNull();
    expect(document.body.textContent).toContain('Invite a teammate');
  });

  it('shows loaded states by default and the busy ones when the preview switch is on', async () => {
    await mount();
    expect(document.querySelectorAll('[aria-busy="true"]')).toHaveLength(0);

    await click(getByRole(document.body, 'switch', 'Preview loading states'));
    await flush();
    // a loading region, a KPI skeleton, a loading table and a loading chart card
    expect(document.querySelectorAll('[aria-busy="true"]').length).toBeGreaterThanOrEqual(4);
  });

  it('the skin and mode switchers drive the shared theme', async () => {
    await mount();
    const glass = Array.from(document.querySelectorAll<HTMLElement>('[role="radio"], button')).find(
      (el) => el.textContent === 'Glass',
    );
    expect(glass).toBeTruthy();
    await click(glass as HTMLElement);
    expect(document.documentElement.getAttribute('data-skin')).toBe('glass');
  });
});

describe('KitPage sounds', () => {
  it('has a button per sound that plays it, and none plays when Sounds is off', async () => {
    localStorage.removeItem('ui-sounds');
    await mount();
    const section = document.getElementById('sounds') as HTMLElement;
    const buttons = getAllByRole(section, 'button').filter((b) =>
      b.textContent?.startsWith('Play: '),
    );
    expect(buttons.map((b) => b.textContent)).toEqual(SOUND_NAMES.map((n) => `Play: ${n}`));
    const heard: string[] = [];
    const listen = (e: Event) => heard.push((e as CustomEvent<{ name: string }>).detail.name);
    window.addEventListener('ui:sound', listen);
    try {
      // the engine plays a sound at most once per 60 ms, so give each press its own moment
      for (const b of buttons) {
        await click(b);
        await new Promise((r) => setTimeout(r, 70));
      }
      expect(heard).toEqual([...SOUND_NAMES]);
      heard.length = 0;
      localStorage.setItem('ui-sounds', 'off');
      await click(buttons[0] as HTMLElement);
      expect(heard).toEqual([]);
    } finally {
      window.removeEventListener('ui:sound', listen);
      localStorage.removeItem('ui-sounds');
    }
  });
});

describe('a11y KitPage', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      // the page is the whole kit (hundreds of nodes, tables, charts), so axe needs a longer leash
      it(`a11y kit · ${skin} · ${mode}`, { timeout: 120_000 }, async () => {
        await mount(skin, mode);
        const violations = await runAxe(document.body);
        expect(formatViolations(violations)).toBe('');
      });
    }
  }
});
