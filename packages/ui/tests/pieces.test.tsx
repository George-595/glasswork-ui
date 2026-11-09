// @vitest-environment jsdom
/* Behaviour of the second set: keyboard patterns and state the axe gate
   cannot see (sorting, paging, selection, persistence). Menu, Tabs, Tooltip
   and Switch are Radix (shadcn) underneath; charts live in charts.test.tsx. */
import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AppShell,
  type Column,
  DataTable,
  Menu,
  Sidebar,
  Switch,
  Tabs,
  Tooltip,
  Topbar,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* What Radix needs from a browser that jsdom lacks: ResizeObserver (Popper
   measures its anchor), pointer capture and scrollIntoView. */
beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const g = globalThis as { ResizeObserver?: unknown };
  g.ResizeObserver ??= ResizeObserverStub;
  const proto = Element.prototype as Partial<{
    hasPointerCapture: (id: number) => boolean;
    releasePointerCapture: (id: number) => void;
    setPointerCapture: (id: number) => void;
    scrollIntoView: () => void;
  }>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
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
  localStorage.clear();
});

function render(node: ReactNode) {
  act(() => root.render(node));
  return host;
}
const $ = <E extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as E;
const $$ = (sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel));
/* Radix portals menus and tooltips to <body>, outside the host */
const $doc = <E extends Element = HTMLElement>(sel: string) => document.querySelector<E>(sel);
const $$doc = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
function key(el: Element, k: string, init: KeyboardEventInit = {}) {
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  });
}
const click = (el: HTMLElement) => act(() => el.click());
/** A primary-button press, which is what opens a Radix menu. */
const press = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
  });
/** Run Radix's deferred work (roving focus, focus return, outside listeners). */
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
const active = () => document.activeElement as HTMLElement;

describe('Switch', () => {
  it('is a role="switch" control named by its label and described by its description', () => {
    const spy = vi.fn<(checked: boolean) => void>();
    render(<Switch checked={false} onCheckedChange={spy} label="Alerts" description="By email" />);
    const sw = $('[role="switch"]');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    const named = sw.getAttribute('aria-labelledby') ?? '';
    expect(document.getElementById(named)?.textContent).toBe('Alerts');
    expect(document.getElementById(sw.getAttribute('aria-describedby') ?? '')?.textContent).toBe(
      'By email',
    );
    click(sw);
    expect(spy).toHaveBeenCalledWith(true);
  });

  it('does not toggle when disabled', () => {
    const spy = vi.fn<(checked: boolean) => void>();
    render(<Switch checked onCheckedChange={spy} label="Beta" disabled />);
    const sw = $<HTMLButtonElement>('[role="switch"]');
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.disabled).toBe(true);
    click(sw);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('Tabs', () => {
  const TABS = [
    { id: 'a', label: 'Alpha', content: 'A body' },
    { id: 'b', label: 'Beta', content: 'B body' },
    { id: 'c', label: 'Gamma', content: 'C body' },
  ];
  it('keeps one tab in the tab order and moves with the arrow keys, Home and End', async () => {
    render(<Tabs tabs={TABS} label="Demo" />);
    const tabs = $$('[role="tab"]');
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
    expect($('[role="tablist"]').hasAttribute('tabindex')).toBe(false); // the tab is the stop
    expect($('[role="tablist"]').getAttribute('aria-label')).toBe('Demo');
    act(() => tabs[0]?.focus());
    key(tabs[0] as HTMLElement, 'ArrowLeft'); // wraps to the end
    await flush();
    expect(active().textContent).toBe('Gamma');
    expect($('[aria-selected="true"]').textContent).toBe('Gamma');
    expect($$('[role="tab"]').map((t) => t.tabIndex)).toEqual([-1, -1, 0]);
    key(active(), 'Home');
    await flush();
    expect(active().textContent).toBe('Alpha');
    key(active(), 'End');
    await flush();
    expect(active().textContent).toBe('Gamma');
    key(active(), 'ArrowRight'); // wraps to the start
    await flush();
    key(active(), 'ArrowRight');
    await flush();
    const panels = $$('[role="tabpanel"]');
    expect(panels).toHaveLength(3); // every panel stays rendered
    const panel = panels.find((p) => !p.hidden);
    expect(panel?.textContent).toBe('B body');
    expect(panel?.getAttribute('aria-labelledby')).toBe(tabs[1]?.id);
    expect(tabs[1]?.getAttribute('aria-controls')).toBe(panel?.id);
    expect(panel?.tabIndex).toBe(0);
  });

  it('is controlled through value and onValueChange', () => {
    const spy = vi.fn<(id: string) => void>();
    render(<Tabs tabs={TABS} label="Demo" value="b" onValueChange={spy} />);
    expect($('[aria-selected="true"]').textContent).toBe('Beta');
    act(() => {
      $$('[role="tab"]')[2]?.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    expect(spy).toHaveBeenCalledWith('c');
    expect($('[aria-selected="true"]').textContent).toBe('Beta'); // the parent decides
  });
});

const ITEMS = (signOut: () => void) => [
  { id: 'u', label: 'Users', href: '#/users' },
  { separator: true as const },
  { id: 's', label: 'Sign out', onSelect: signOut, danger: true },
];

describe('Menu', () => {
  it('opens on the first item, wraps, and Esc closes back to the trigger', async () => {
    const signOut = vi.fn<() => void>();
    render(<Menu label="Admin" items={ITEMS(signOut)} />);
    const trigger = $('button');
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu');
    act(() => trigger.focus());
    key(trigger, 'ArrowDown');
    await flush();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect($doc('[role="menu"]')?.getAttribute('aria-labelledby')).toBe(trigger.id);
    expect(active().textContent).toBe('Users');
    key(active(), 'ArrowUp');
    await flush();
    expect(active().textContent).toBe('Sign out');
    key(active(), 'Escape');
    await flush();
    expect($doc('[role="menu"]')).toBeNull();
    expect(active()).toBe(trigger);

    press(trigger);
    await flush();
    click($$doc('[role="menuitem"]')[1] as HTMLElement);
    await flush();
    expect(signOut).toHaveBeenCalledOnce();
    expect($doc('[role="menu"]')).toBeNull();
    expect(active()).toBe(trigger); // focus returns to the trigger
  });

  it('opens on the last item with ArrowUp, and on a bare click (assistive tech)', async () => {
    render(<Menu label="Admin" items={ITEMS(() => {})} />);
    const trigger = $('button');
    act(() => trigger.focus());
    key(trigger, 'ArrowUp');
    await flush();
    expect(active().textContent).toBe('Sign out');
    key(active(), 'Escape');
    await flush();
    click(trigger);
    await flush();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('leaves browser shortcuts alone, closes as Tab leaves, and Space follows a link item', async () => {
    render(
      <>
        <Menu
          label="Admin"
          items={[
            { id: 'u', label: 'Users', href: '#/users' },
            { id: 'r', label: 'Reports' },
          ]}
        />
        <button type="button">After</button>
      </>,
    );
    const trigger = $('button');
    act(() => trigger.focus());
    key(trigger, 'ArrowDown');
    await flush();
    const item = active();
    expect(item.textContent).toBe('Users');
    const ctrlR = new KeyboardEvent('keydown', {
      key: 'r',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      item.dispatchEvent(ctrlR);
    });
    await flush();
    expect(ctrlR.defaultPrevented).toBe(false);
    expect(active()).toBe(item); // no type-ahead jump to Reports

    // Tab leaves for the next control and closes the menu, not back to the trigger
    key(item, 'Tab');
    await flush();
    expect($doc('[role="menu"]')).toBeNull();
    expect(active().textContent).toBe('After');

    // Shift+Tab goes back to the trigger
    act(() => trigger.focus());
    key(trigger, 'ArrowDown');
    await flush();
    key(active(), 'Tab', { shiftKey: true });
    await flush();
    expect($doc('[role="menu"]')).toBeNull();
    expect(active()).toBe(trigger);

    // focus leaving any other way closes it without pulling focus back
    key(trigger, 'ArrowDown');
    await flush();
    act(() => {
      active().dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    });
    await flush();
    expect($doc('[role="menu"]')).toBeNull();

    act(() => trigger.focus());
    key(trigger, 'ArrowDown');
    await flush();
    const link = active() as HTMLAnchorElement;
    expect(link.tagName).toBe('A');
    const follow = vi.fn<(e: Event) => void>();
    link.addEventListener('click', follow);
    key(link, ' ');
    await flush();
    expect(follow).toHaveBeenCalledOnce();
    expect(window.location.hash).toBe('#/users'); // the link was followed
    expect($doc('[role="menu"]')).toBeNull();
    window.location.hash = '';
  });

  it('opens from defaultOpen without taking focus, and closes on a press outside', async () => {
    render(<Menu label="More" items={[{ id: 'a', label: 'A' }]} defaultOpen />);
    await flush();
    expect($doc('[role="menu"]')).not.toBeNull();
    expect(active()).toBe(document.body);
    act(() => {
      document.body.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    await flush();
    expect($doc('[role="menu"]')).toBeNull();
  });

  it('server-renders a defaultOpen menu open, in place (the a11y gate scans it)', () => {
    const html = renderToStaticMarkup(
      <Menu label="Admin" items={ITEMS(() => {})} align="end" defaultOpen />,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const menu = doc.querySelector('.ui-menu-wrap [role="menu"]');
    expect(menu).not.toBeNull();
    expect(menu?.hasAttribute('data-static')).toBe(true);
    expect(Array.from(doc.querySelectorAll('[role="menuitem"]')).map((m) => m.textContent)).toEqual(
      ['Users', 'Sign out'],
    );
    expect(doc.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
  });
});

describe('Tooltip', () => {
  it('describes its child while shown and is dismissed by Esc', async () => {
    render(
      <Tooltip content="Copies a link" defaultOpen>
        <button type="button">Share</button>
      </Tooltip>,
    );
    await flush();
    const tip = $doc('[role="tooltip"]');
    expect(tip?.textContent).toBe('Copies a link');
    expect($('button').getAttribute('aria-describedby')).toBe(tip?.id);
    key(document.body, 'Escape');
    await flush();
    expect($doc('[role="tooltip"]')).toBeNull();
    expect($('button').hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows on keyboard focus', async () => {
    render(
      <Tooltip content="Copies a link">
        <button type="button">Share</button>
      </Tooltip>,
    );
    expect($doc('[role="tooltip"]')).toBeNull();
    act(() => $('button').focus());
    await flush();
    expect($doc('[role="tooltip"]')?.textContent).toBe('Copies a link');
  });

  it('server-renders a defaultOpen tip in place', () => {
    const html = renderToStaticMarkup(
      <Tooltip content="Copies a link" defaultOpen>
        <button type="button">Share</button>
      </Tooltip>,
    );
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const tip = doc.querySelector('.ui-tooltip-wrap [role="tooltip"]');
    expect(tip?.textContent).toBe('Copies a link');
    expect(doc.querySelector('button')?.getAttribute('aria-describedby')).toBe(tip?.id);
  });
});

interface Row {
  id: string;
  name: string;
  n: number;
}
const ROWS: Row[] = Array.from({ length: 12 }, (_, i) => ({
  id: `r${i}`,
  name: `Item ${i}`,
  n: (i * 7) % 12,
}));
const COLS: Column<Row>[] = [
  { key: 'name', header: 'Name', sortable: true },
  { key: 'n', header: 'Count', align: 'end', sortable: true },
];

/* The row checkboxes, native or Radix: either way checked / mixed read the same. */
const boxes = () => $$('input[type="checkbox"], [role="checkbox"]');
const isChecked = (el: HTMLElement | undefined) =>
  el instanceof HTMLInputElement ? el.checked : el?.getAttribute('aria-checked') === 'true';
const isMixed = (el: HTMLElement | undefined) =>
  el instanceof HTMLInputElement ? el.indeterminate : el?.getAttribute('aria-checked') === 'mixed';

function Harness() {
  const [sel, setSel] = useState(new Set<string>());
  return (
    <DataTable
      caption="Items"
      columns={COLS}
      rows={ROWS}
      rowKey={(r) => r.id}
      pageSize={0}
      selectable
      selected={sel}
      onSelectedChange={setSel}
    />
  );
}

describe('DataTable', () => {
  it('sorts with aria-sort, pages, and resets to page 1 on a new sort', () => {
    render(
      <DataTable caption="Items" columns={COLS} rows={ROWS} rowKey={(r) => r.id} pageSize={5} />,
    );
    expect($('table caption').textContent).toBe('Items');
    expect($('section').getAttribute('aria-labelledby')).toBe($('caption').id);
    expect($('[aria-live]').textContent).toBe('Page 1 of 3');
    click($$('nav[aria-label="Pagination"] button')[1] as HTMLElement);
    expect($('[aria-live]').textContent).toBe('Page 2 of 3');

    const countSort = $$('th button')[1] as HTMLElement;
    click(countSort);
    expect(countSort.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    expect($('[aria-live]').textContent).toBe('Page 1 of 3');
    expect($$('tbody td:last-child').map((td) => td.textContent)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
    ]);
    click(countSort);
    expect(countSort.closest('th')?.getAttribute('aria-sort')).toBe('descending');
    expect($$('tbody td:last-child')[0]?.textContent).toBe('11');
  });

  it('selects rows, names each checkbox, and goes mixed in the header', () => {
    render(<Harness />);
    expect(boxes()[0]?.getAttribute('aria-label')).toBe('Select all 12 rows');
    expect(boxes()[1]?.getAttribute('aria-label')).toBe('Select Item 0');
    click(boxes()[1] as HTMLElement);
    expect(isMixed(boxes()[0])).toBe(true);
    expect($('tbody tr').getAttribute('data-state')).toBe('selected');
    click(boxes()[0] as HTMLElement);
    expect(boxes().every((b) => isChecked(b))).toBe(true);
    expect($('.ui-table-status').textContent).toContain('12 selected');
  });

  it('shows the empty text across every column', () => {
    render(<DataTable caption="None" columns={COLS} rows={[]} rowKey={(r) => r.id} selectable />);
    const td = $('tbody td');
    expect(td.textContent).toBe('No rows to show.');
    expect(td.getAttribute('colspan')).toBe('3');
  });

  it('starts again on page 1 and drops gone selections when the rows change', () => {
    const onSel = vi.fn<(s: Set<string>) => void>();
    const table = (rows: readonly Row[]) => (
      <DataTable
        caption="Items"
        columns={COLS}
        rows={rows}
        rowKey={(r) => r.id}
        pageSize={5}
        selectable
        selected={new Set(['r1', 'r11'])}
        onSelectedChange={onSel}
      />
    );
    render(table(ROWS));
    click($$('nav[aria-label="Pagination"] button')[1] as HTMLElement);
    click($$('nav[aria-label="Pagination"] button')[1] as HTMLElement);
    expect($('[aria-live]').textContent).toBe('Page 3 of 3');
    render(table([...ROWS])); // an equal array keeps the page
    expect($('[aria-live]').textContent).toBe('Page 3 of 3');
    expect(onSel).not.toHaveBeenCalled();
    render(table(ROWS.slice(0, 10)));
    expect($('[aria-live]').textContent).toBe('Page 1 of 2');
    expect(onSel).toHaveBeenLastCalledWith(new Set(['r1']));
    render(table(ROWS));
    expect($('[aria-live]').textContent).toBe('Page 1 of 3');
  });

  it('keeps focus on Next when it reaches the last page', () => {
    render(
      <DataTable caption="Items" columns={COLS} rows={ROWS} rowKey={(r) => r.id} pageSize={5} />,
    );
    const next = $$('nav[aria-label="Pagination"] button')[1] as HTMLButtonElement;
    act(() => next.focus());
    click(next);
    click(next);
    expect($('[aria-live]').textContent).toBe('Page 3 of 3');
    expect(next.disabled).toBe(false);
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(next);
    click(next); // a no-op on the last page
    expect($('[aria-live]').textContent).toBe('Page 3 of 3');
  });

  it('names a row by its key when the first column holds an object, and prints no object', () => {
    render(
      <DataTable
        caption="Objects"
        columns={[
          { key: 'meta', header: 'Meta', cell: () => 'x' },
          { key: 'extra', header: 'Extra' },
        ]}
        rows={[{ id: 'k1', meta: { a: 1 }, extra: { b: 2 } }]}
        rowKey={(r) => r.id}
        selectable
      />,
    );
    expect(boxes()[1]?.getAttribute('aria-label')).toBe('Select k1');
    expect($('tbody').textContent).not.toContain('[object Object]');
  });

  it('scrolls inside a focusable, labelled region', () => {
    render(<DataTable caption="Items" columns={COLS} rows={ROWS} rowKey={(r) => r.id} />);
    const region = $('section.ui-table-scroll');
    expect(region.tabIndex).toBe(0);
    expect(document.getElementById(region.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Items',
    );
  });
});

function Shell() {
  return (
    <AppShell
      brand="App"
      sidebar={
        <Sidebar
          current="home"
          sections={[
            { items: [{ id: 'home', title: 'Home', href: '#/' }] },
            { label: 'Admin', items: [{ id: 'users', title: 'Users', href: '#/users' }] },
          ]}
        />
      }
      topbar={<Topbar title="Home" />}
    >
      <p>Body</p>
    </AppShell>
  );
}

describe('AppShell', () => {
  it('puts the banner between the top bar and main, never inside main', () => {
    render(
      <AppShell brand="App" sidebar={null} topbar={<Topbar title="Home" />} banner={<p>Notice</p>}>
        <h1>Page</h1>
      </AppShell>,
    );
    const banner = [...document.querySelectorAll('p')].find((p) => p.textContent === 'Notice');
    expect(banner?.closest('main')).toBeNull();
    expect(banner?.nextElementSibling).toBe($('main'));
  });

  it('has a skip link to main, labelled navs and a drawer button', () => {
    render(<Shell />);
    const skip = $<HTMLAnchorElement>('a.ui-skip-link');
    expect(skip.getAttribute('href')).toBe('#main');
    expect($('main').id).toBe('main');
    expect($$('nav').map((n) => n.getAttribute('aria-label'))).toEqual(['Main', 'Admin']);
    const menu = $('.ui-topbar-menu');
    expect(menu.getAttribute('aria-controls')).toBe($('aside').id);
    click(menu);
    expect(menu.getAttribute('aria-expanded')).toBe('true');
    expect($('.ui-shell-column').hasAttribute('inert')).toBe(true);
    key(document.body, 'Escape');
    expect(menu.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(menu);
  });

  it('the skip link focuses main without touching the hash route', () => {
    window.location.hash = '#/users';
    render(<Shell />);
    click($('a.ui-skip-link'));
    expect(window.location.hash).toBe('#/users');
    expect(document.activeElement).toBe($('main'));
    window.location.hash = '';
  });

  it('opening the drawer focuses its first link, not the hidden collapse button', () => {
    render(<Shell />);
    click($('.ui-topbar-menu'));
    expect(document.activeElement?.textContent).toBe('Home');
  });

  it('closing the drawer refocuses the menu button only once the column is not inert', () => {
    render(<Shell />);
    const menu = $<HTMLButtonElement>('.ui-topbar-menu');
    click(menu);
    const column = $('.ui-shell-column');
    const inertAtFocus: boolean[] = [];
    const focus = menu.focus.bind(menu);
    menu.focus = () => {
      inertAtFocus.push(column.hasAttribute('inert'));
      focus();
    };
    click($('.ui-sidebar-close'));
    expect(inertAtFocus).toEqual([false]);
    expect(document.activeElement).toBe(menu);
  });

  it('remembers the collapsed sidebar', () => {
    render(<Shell />);
    const toggle = $('.ui-sidebar-collapse');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(localStorage.getItem('ui-sidebar-collapsed')).toBe('1');
    act(() => root.unmount());
    root = createRoot(host);
    render(<Shell />);
    expect($('.ui-shell').hasAttribute('data-collapsed')).toBe(true);
  });
});
