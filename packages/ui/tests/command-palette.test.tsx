// @vitest-environment jsdom
/* CommandPalette: opening by shortcut and by the button, the combobox/listbox wiring, filtering,
   keyboard selection, Esc returning focus, recent commands, and an axe pass in every skin x mode.
   jsdom has no layout, so axe's colour-contrast rule is off (the token gate and the browser pass
   hold contrast). */
import axe from 'axe-core';
import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMaterialMaps } from '../src/glass';
import {
  type CommandItem,
  CommandPalette,
  CommandPaletteButton,
  filterCommands,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= ResizeObserverStub;
  Element.prototype.scrollIntoView ??= () => {};
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  clearMaterialMaps();
  localStorage.clear();
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

const calls: string[] = [];
const COMMANDS: CommandItem[] = [
  { id: 'home', label: 'Home', group: 'Go to', icon: 'home', onSelect: () => calls.push('home') },
  {
    id: 'table',
    label: 'Table',
    group: 'Go to',
    shortcut: ['g', 't'],
    onSelect: () => calls.push('table'),
  },
  {
    id: 'dark',
    label: 'Switch to dark mode',
    group: 'Appearance',
    keywords: ['night', 'theme'],
    onSelect: () => calls.push('dark'),
  },
  { id: 'out', label: 'Sign out', group: 'Account', onSelect: () => calls.push('out') },
];

function Host({
  recentKey,
  commands = COMMANDS,
}: {
  recentKey?: string;
  commands?: CommandItem[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <CommandPaletteButton id="opener" onClick={() => setOpen(true)} />
      <CommandPalette
        open={open}
        onOpenChange={setOpen}
        commands={commands}
        recentKey={recentKey}
      />
    </>
  );
}

function render(node: ReactNode) {
  act(() => root.render(node));
}
const $doc = <E extends Element = HTMLElement>(sel: string) => document.querySelector<E>(sel);
const $$doc = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
function key(el: Element, k: string, init: KeyboardEventInit = {}) {
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  });
}
function type(el: HTMLInputElement, value: string) {
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const input = () => $doc<HTMLInputElement>('input[role="combobox"]') as HTMLInputElement;
const options = () => $$doc('[role="option"]').map((o) => o.textContent);
const activeOption = () =>
  document.getElementById(input().getAttribute('aria-activedescendant') ?? '');

async function openPalette() {
  render(<Host />);
  const opener = $doc('#opener') as HTMLElement;
  act(() => opener.focus());
  act(() => opener.click());
  await flush();
  return opener;
}

describe('filterCommands', () => {
  it('matches every word against label, group and keywords, case-insensitively', () => {
    expect(filterCommands(COMMANDS, '').length).toBe(4);
    expect(filterCommands(COMMANDS, 'DARK').map((c) => c.id)).toEqual(['dark']);
    expect(filterCommands(COMMANDS, 'night').map((c) => c.id)).toEqual(['dark']);
    expect(filterCommands(COMMANDS, 'go to ta').map((c) => c.id)).toEqual(['table']);
    expect(filterCommands(COMMANDS, 'zzz')).toEqual([]);
  });
});

describe('CommandPalette opening', () => {
  it('has a visible Search button with the shortcut as Kbd', () => {
    render(<Host />);
    const button = $doc('#opener') as HTMLElement;
    expect(button.textContent).toContain('Search…');
    expect(button.querySelectorAll('kbd').length).toBe(2);
    expect(button.getAttribute('aria-keyshortcuts')).toBe('Control+K Meta+K');
    expect($doc('[role="dialog"]')).toBeNull();
  });

  it('opens from the button as a named modal dialog with the input focused', async () => {
    await openPalette();
    const dialog = $doc('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(document.getElementById(dialog.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Command palette',
    );
    expect(document.activeElement).toBe(input());
  });

  it('opens and closes with Ctrl+K and Cmd+K', async () => {
    render(<Host />);
    key(document.body, 'k', { ctrlKey: true });
    await flush();
    expect($doc('[role="dialog"]')).not.toBeNull();
    key(input(), 'k', { metaKey: true });
    await flush();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect($doc('[role="dialog"]')).toBeNull();
    // a bare K is just a letter
    key(document.body, 'k');
    await flush();
    expect($doc('[role="dialog"]')).toBeNull();
  });
});

describe('CommandPalette combobox and listbox', () => {
  it('wires combobox, listbox, groups and aria-activedescendant', async () => {
    await openPalette();
    const box = input();
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect(box.getAttribute('aria-autocomplete')).toBe('list');
    const list = $doc('[role="listbox"]') as HTMLElement;
    expect(box.getAttribute('aria-controls')).toBe(list.id);
    const groups = $$doc('[role="group"]');
    expect(
      groups.map(
        (g) => document.getElementById(g.getAttribute('aria-labelledby') ?? '')?.textContent,
      ),
    ).toEqual(['Go to', 'Appearance', 'Account']);
    expect(options()).toEqual(['Home', 'Tablegt', 'Switch to dark mode', 'Sign out']);
    expect(activeOption()?.textContent).toBe('Home');
    expect(activeOption()?.getAttribute('aria-selected')).toBe('true');
    expect($$doc('[role="option"][aria-selected="true"]').length).toBe(1);
  });

  it('filters as you type, announces the count and shows an empty message', async () => {
    await openPalette();
    type(input(), 'dark');
    expect(options()).toEqual(['Switch to dark mode']);
    expect($doc('[role="status"]')?.textContent).toBe('1 result');
    type(input(), 'zzz');
    expect($$doc('[role="option"]').length).toBe(0);
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().hasAttribute('aria-controls')).toBe(false);
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
    expect($doc('[role="status"]')?.textContent).toBe('No matching commands.');
    expect(document.body.textContent).toContain('No matching commands.');
  });

  it('moves with the arrow keys (wrapping), Home and End', async () => {
    await openPalette();
    key(input(), 'ArrowDown');
    expect(activeOption()?.textContent).toBe('Tablegt');
    key(input(), 'End');
    expect(activeOption()?.textContent).toBe('Sign out');
    key(input(), 'ArrowDown');
    expect(activeOption()?.textContent).toBe('Home');
    key(input(), 'ArrowUp');
    expect(activeOption()?.textContent).toBe('Sign out');
    key(input(), 'Home');
    expect(activeOption()?.textContent).toBe('Home');
  });

  it('Enter runs the highlighted command and closes', async () => {
    calls.length = 0;
    await openPalette();
    type(input(), 'dark');
    key(input(), 'Enter');
    await flush();
    expect(calls).toEqual(['dark']);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect($doc('[role="dialog"]')).toBeNull();
  });

  it('clicking an option runs it', async () => {
    calls.length = 0;
    await openPalette();
    act(() => (options().length ? $$doc('[role="option"]')[3] : null)?.click());
    await flush();
    expect(calls).toEqual(['out']);
  });

  it('Escape closes and gives focus back to the button', async () => {
    const opener = await openPalette();
    key(input(), 'Escape');
    await flush();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect($doc('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('starts clean each time it opens', async () => {
    const opener = await openPalette();
    type(input(), 'dark');
    key(input(), 'Escape');
    await flush();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    act(() => opener.click());
    await flush();
    expect(input().value).toBe('');
    expect(options().length).toBe(4);
  });
});

describe('CommandPalette recent commands', () => {
  it('remembers what ran and lists it first while the box is empty', async () => {
    render(<Host recentKey="test-recent" />);
    const opener = $doc('#opener') as HTMLElement;
    act(() => opener.click());
    await flush();
    type(input(), 'sign');
    key(input(), 'Enter');
    await flush();
    expect(JSON.parse(localStorage.getItem('test-recent') ?? '[]')).toEqual(['out']);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    act(() => opener.click());
    await flush();
    const groups = $$doc('[role="group"]').map(
      (g) => document.getElementById(g.getAttribute('aria-labelledby') ?? '')?.textContent,
    );
    expect(groups[0]).toBe('Recent');
    expect(options()[0]).toBe('Sign out');
  });
});

describe('axe: WCAG 2.2 AA structure, every skin and mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      for (const state of ['closed', 'open'] as const) {
        it(`${skin} · ${mode} · ${state}`, async () => {
          document.documentElement.setAttribute('data-skin', skin);
          document.documentElement.setAttribute('data-theme', mode);
          render(
            <main>
              <h1>Page</h1>
              {state === 'open' ? (
                <CommandPalette
                  open
                  onOpenChange={vi.fn<(next: boolean) => void>()}
                  commands={COMMANDS}
                />
              ) : (
                <Host />
              )}
            </main>,
          );
          await flush();
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
                `${v.id}: ${v.help}\n${v.nodes.map((n) => `  ${n.target.join(' ')} ${n.failureSummary ?? ''}`).join('\n')}`,
            )
            .join('\n');
          expect(report).toBe('');
        });
      }
    }
  }
});
