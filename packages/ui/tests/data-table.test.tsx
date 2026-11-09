// @vitest-environment jsdom
/* The composable table system: the pure helpers, the headless hook through
   DataTable and through the parts on their own, and axe in every skin and
   mode. The older DataTable behaviour stays covered in pieces.test.tsx. */
import axe from 'axe-core';
import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMaterialMaps } from '../src/glass';
import {
  BulkActionBar,
  type Column,
  DataTable,
  type DataTableState,
  DataTableToolbar,
  DataTableView,
  downloadCsv,
  FacetFilter,
  facetCounts,
  filterRows,
  sortRows,
  TablePagination,
  TableSearch,
  toCsv,
  useDataTable,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* What Radix needs from a browser that jsdom lacks. */
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
  clearMaterialMaps();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-skin');
});
afterAll(() => {
  document.body.replaceChildren();
});

function render(node: ReactNode) {
  act(() => root.render(node));
}
const $ = <E extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as E;
const $$ = (sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel));
/* popovers and menus portal to <body> */
const $doc = <E extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as E;
const $$doc = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const click = (el: Element | null | undefined) => act(() => (el as HTMLElement).click());
const shiftClick = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, shiftKey: true }));
  });
const press = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }));
  });
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
function type(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const button = (name: string | RegExp, within: ParentNode = document) =>
  Array.from(within.querySelectorAll<HTMLElement>('button')).find((b) =>
    typeof name === 'string'
      ? (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === name
      : name.test(b.getAttribute('aria-label') ?? b.textContent ?? ''),
  );
const names = () => $$('tbody tr td:nth-child(1)').map((td) => td.textContent);

interface Order {
  id: string;
  name: string;
  status: 'Active' | 'Paused' | 'Closed';
  region: string;
  total: number;
  tags: string[];
}
const ORDERS: Order[] = [
  { id: 'o1', name: 'Ada', status: 'Active', region: 'North', total: 120, tags: ['vip'] },
  { id: 'o2', name: 'Bea', status: 'Paused', region: 'South', total: 80, tags: [] },
  { id: 'o3', name: 'Cal', status: 'Active', region: 'South', total: 200, tags: ['vip', 'new'] },
  { id: 'o4', name: 'Dee', status: 'Closed', region: 'North', total: 80, tags: ['new'] },
  { id: 'o5', name: 'Eli', status: 'Active', region: 'North', total: 40, tags: [] },
  { id: 'o6', name: 'Fay', status: 'Closed', region: 'South', total: 60, tags: [] },
];
const gbp = (n: number) => `£${n}`;
const COLUMNS: Column<Order>[] = [
  { key: 'name', header: 'Name', sortable: true, searchable: true },
  { key: 'status', header: 'Status', sortable: true, facet: true },
  { key: 'region', header: 'Region', sortable: true, facet: true, hideable: true },
  {
    key: 'total',
    header: 'Total',
    align: 'end',
    sortable: true,
    cell: (o) => gbp(o.total),
    sortValue: (o) => o.total,
    footer: (rows) => gbp(rows.reduce((a, o) => a + o.total, 0)),
    csv: (o) => o.total,
  },
  {
    key: 'tags',
    header: 'Tags',
    hideable: true,
    defaultHidden: true,
    filterValue: (o) => o.tags,
    cell: (o) => o.tags.join(', '),
    searchValue: (o) => o.tags.join(' '),
  },
];

/* ---- the pure helpers ---------------------------------------------------- */

describe('table helpers', () => {
  it('sortRows breaks ties with the next key, is stable and leaves its input alone', () => {
    const input = [...ORDERS];
    const out = sortRows(input, COLUMNS, [
      { key: 'total', dir: 'asc' },
      { key: 'name', dir: 'desc' },
    ]);
    expect(out.map((o) => o.name)).toEqual(['Eli', 'Fay', 'Dee', 'Bea', 'Ada', 'Cal']);
    expect(input).toEqual(ORDERS);
    expect(sortRows(ORDERS, COLUMNS, []).map((o) => o.id)).toEqual(ORDERS.map((o) => o.id));
    expect(sortRows(ORDERS, COLUMNS, [{ key: 'nope', dir: 'asc' }])).toHaveLength(6);
  });

  it('filterRows searches the searchable columns, ORs inside a facet and ANDs across', () => {
    const q = (search: string, facets: Record<string, string[]> = {}) => ({ search, facets });
    expect(filterRows(ORDERS, COLUMNS, q('AD')).map((o) => o.id)).toEqual(['o1']);
    // `tags` has a searchValue, so it is searched too; 'region' is not
    expect(filterRows(ORDERS, COLUMNS, q('vip')).map((o) => o.id)).toEqual(['o1', 'o3']);
    expect(filterRows(ORDERS, COLUMNS, q('north'))).toHaveLength(0);
    expect(filterRows(ORDERS, COLUMNS, q('', { status: ['Active', 'Closed'] }))).toHaveLength(5);
    expect(
      filterRows(ORDERS, COLUMNS, q('', { status: ['Active'], region: ['South'] })).map(
        (o) => o.id,
      ),
    ).toEqual(['o3']);
    // a multi-valued facet matches any of a row's values
    expect(filterRows(ORDERS, COLUMNS, q('', { tags: ['new'] })).map((o) => o.id)).toEqual([
      'o3',
      'o4',
    ]);
  });

  it('searches every column when none is marked searchable', () => {
    const cols: Column<Order>[] = [
      { key: 'name', header: 'Name' },
      { key: 'region', header: 'R' },
    ];
    expect(filterRows(ORDERS, cols, { search: 'south', facets: {} })).toHaveLength(3);
  });

  it('facetCounts counts rows that pass every filter except that facet', () => {
    const query = { search: '', facets: { status: ['Active'], region: ['South'] } };
    expect(facetCounts(ORDERS, COLUMNS, 'status', query)).toEqual([
      { value: 'Active', label: 'Active', count: 1 },
      { value: 'Closed', label: 'Closed', count: 1 },
      { value: 'Paused', label: 'Paused', count: 1 },
    ]);
    // region ignores its own choice but obeys status
    expect(facetCounts(ORDERS, COLUMNS, 'region', query)).toEqual([
      { value: 'North', label: 'North', count: 2 },
      { value: 'South', label: 'South', count: 1 },
    ]);
    // a chosen value no row has any more stays listed, at 0
    const gone = { search: 'zzz', facets: { status: ['Active'] } };
    expect(facetCounts(ORDERS, COLUMNS, 'status', gone)).toEqual([
      { value: 'Active', label: 'Active', count: 0 },
    ]);
    expect(facetCounts(ORDERS, COLUMNS, 'nope', query)).toEqual([]);
  });

  it('toCsv quotes, uses csv() before sortValue before the field, and defuses formulas', () => {
    const cols: Column<{ a: string; n: number }>[] = [
      { key: 'a', header: 'Say "hi"' },
      { key: 'n', header: 'N', sortValue: (r) => r.n * 2 },
    ];
    expect(
      toCsv(cols, [
        { a: 'x,y', n: 1 },
        { a: '=SUM(A1)', n: -3 },
        { a: 'two\nlines', n: 0 },
      ]),
    ).toBe('"Say ""hi""",N\r\n"x,y",2\r\n\'=SUM(A1),-6\r\n"two\nlines",0\r\n');
    expect(toCsv(COLUMNS.slice(3, 4), ORDERS.slice(0, 2))).toBe('Total\r\n120\r\n80\r\n');
  });

  it('downloadCsv hands the file to an injected sink, and does nothing in jsdom by default', () => {
    const save = vi.fn<(name: string, csv: string) => void>();
    const csv = downloadCsv('orders.csv', COLUMNS.slice(0, 1), ORDERS.slice(0, 2), { save });
    expect(save).toHaveBeenCalledWith('orders.csv', 'Name\r\nAda\r\nBea\r\n');
    expect(csv).toBe('Name\r\nAda\r\nBea\r\n');
    expect(() => downloadCsv('x.csv', COLUMNS, ORDERS)).not.toThrow();
  });
});

/* ---- DataTable on the hook ----------------------------------------------- */

const rowKey = (o: Order) => o.id;
const rich = (props: Partial<Parameters<typeof DataTable<Order>>[0]> = {}) => (
  <DataTable
    caption="Orders"
    columns={COLUMNS}
    rows={ORDERS}
    rowKey={rowKey}
    pageSize={0}
    search={{ debounce: 0 }}
    {...props}
  />
);

describe('DataTable sorting', () => {
  it('click sorts by one key; Shift+click adds a secondary key, flips it, then drops it', () => {
    render(rich());
    const [name, status, region, total] = $$('th button');
    click(total);
    expect(names()).toEqual(['Eli', 'Fay', 'Bea', 'Dee', 'Ada', 'Cal']);
    shiftClick(name as Element);
    // totals tie at 80: Bea before Dee by name ascending
    expect(names()).toEqual(['Eli', 'Fay', 'Bea', 'Dee', 'Ada', 'Cal']);
    expect(total?.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    expect(name?.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    expect(total?.textContent).toContain('sort priority 1');
    expect(name?.textContent).toContain('sort priority 2');
    shiftClick(name as Element); // name goes descending
    expect(names()).toEqual(['Eli', 'Fay', 'Dee', 'Bea', 'Ada', 'Cal']);
    shiftClick(name as Element); // and off
    expect(name?.closest('th')?.hasAttribute('aria-sort')).toBe(false);
    expect(total?.textContent).not.toContain('priority'); // one key left: no ranks
    // a plain click on another column replaces every key
    click(status);
    expect(total?.closest('th')?.hasAttribute('aria-sort')).toBe(false);
    expect(status?.closest('th')?.getAttribute('aria-sort')).toBe('ascending');
    click(status);
    expect(status?.closest('th')?.getAttribute('aria-sort')).toBe('descending');
    expect(region).toBeTruthy();
  });
});

describe('DataTable search, facets and chips', () => {
  const clickTrigger = (label: RegExp | string) => click(button(label, host));

  it('filters by the search text and shows a chip for it', () => {
    render(rich({ pageSize: 10 }));
    expect($('input[type="search"]').getAttribute('id')).toBeTruthy();
    expect(
      document.querySelector(`label[for="${$('input[type="search"]').id}"]`)?.textContent,
    ).toBe('Search');
    type($('input[type="search"]'), 'ee');
    expect(names()).toEqual(['Dee']);
    expect($('.ui-chip').textContent).toContain('Search: ee');
    expect($('.ui-table-status').textContent).toBe('Showing 1–1 of 1');
  });

  it('lists a facet with counts from the other filters, and filters by ticking', async () => {
    render(rich());
    clickTrigger(/^Status/);
    await flush();
    const dialog = $doc('[role="dialog"]');
    expect(dialog.getAttribute('aria-label')).toBe('Status filter');
    const row = (label: string) =>
      Array.from(dialog.querySelectorAll<HTMLLabelElement>('label')).find((l) =>
        l.textContent?.startsWith(label),
      );
    expect(row('Active')?.textContent).toBe('Active3');
    expect(row('Closed')?.textContent).toBe('Closed2');
    expect(row('Paused')?.textContent).toBe('Paused1');

    click(row('Active')?.querySelector('input'));
    expect(names()).toEqual(['Ada', 'Cal', 'Eli']);
    expect(button(/^Status/, host)?.textContent).toContain('Status');
    expect(button(/^Status/, host)?.textContent).toContain('1');
    // the facet's own counts ignore its own choice
    expect(row('Closed')?.textContent).toBe('Closed2');
    click(row('Closed')?.querySelector('input'));
    expect(names()).toEqual(['Ada', 'Cal', 'Dee', 'Eli', 'Fay']);

    // other facets count within the Status choice
    click(button(/^Status/, host)); // close
    await flush();
    clickTrigger(/^Region/);
    await flush();
    const region = Array.from($doc('[role="dialog"]').querySelectorAll('label')).map(
      (l) => l.textContent,
    );
    expect(region).toEqual(['North3', 'South2']);

    // Clear in the footer
    click(button('Clear', $doc('[role="dialog"]')));
    expect($$('.ui-chip')).toHaveLength(2);
  });

  it('removes chips one by one, keeps focus in the list, and Clear all empties it', async () => {
    render(
      rich({
        initialState: { facets: { status: ['Active', 'Closed'] }, search: 'a' },
      }),
    );
    const chips = () => $$('.ui-chip').map((c) => c.textContent);
    expect(chips()).toEqual(['Search: a', 'Status: Active', 'Status: Closed']);
    const first = button('Remove filter Status: Active', host);
    act(() => first?.focus());
    click(first);
    expect(chips()).toHaveLength(2);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Remove filter Status: Closed');
    click(button('Remove filter Search: a', host));
    expect($('input[type="search"]').getAttribute('value') ?? '').toBe('');
    expect(($('input[type="search"]') as HTMLInputElement).value).toBe('');
    click(button('Clear all', host));
    expect($('.ui-filter-chips')).toBeNull();
    expect(names()).toHaveLength(6);
  });

  it('says why a filtered table is empty', () => {
    render(rich());
    type($('input[type="search"]'), 'zzz');
    expect($('tbody td').textContent).toBe('No rows match these filters.');
  });
});

describe('DataTable columns and density', () => {
  it('starts with defaultHidden columns hidden and toggles hideable ones', async () => {
    render(rich({ columnToggle: true }));
    expect($$('th').map((h) => h.textContent)).toEqual(['Name', 'Status', 'Region', 'Total']);
    click(button('Columns', host));
    await flush();
    const dialog = $doc('[role="dialog"]');
    const boxes = Array.from(dialog.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'));
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
    click(boxes[1]);
    expect($$('th').map((h) => h.textContent)).toEqual([
      'Name',
      'Status',
      'Region',
      'Total',
      'Tags',
    ]);
    click(boxes[0]);
    expect($$('th').map((h) => h.textContent)).toEqual(['Name', 'Status', 'Total', 'Tags']);
    click(button('Reset', dialog));
    expect($$('th').map((h) => h.textContent)).toEqual(['Name', 'Status', 'Region', 'Total']);
  });

  it('never hides the last visible column', async () => {
    const cols: Column<Order>[] = [
      { key: 'name', header: 'Name', hideable: true },
      { key: 'region', header: 'Region', hideable: true },
    ];
    render(rich({ columns: cols, columnToggle: true }));
    click(button('Columns', host));
    await flush();
    const boxes = Array.from($doc('[role="dialog"]').querySelectorAll<HTMLInputElement>('input'));
    click(boxes[0]);
    click(boxes[1]); // the last one: refused
    expect($$('th').map((h) => h.textContent)).toEqual(['Region']);
    expect(boxes[1]?.getAttribute('aria-disabled')).toBe('true');
  });

  it('changes row density from the select', () => {
    render(rich({ densityToggle: true }));
    expect($('section').getAttribute('data-density')).toBe('normal');
    expect($('tbody td').className).toContain('py-2.5');
    const select = $<HTMLSelectElement>('.ui-density select');
    expect(document.querySelector(`label[for="${select.id}"]`)?.textContent).toBe('Density');
    act(() => {
      select.value = 'compact';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect($('section').getAttribute('data-density')).toBe('compact');
    expect($('tbody td').className).toContain('py-1');
    act(() => {
      select.value = 'comfortable';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect($('tbody td').className).toContain('py-4');
  });
});

describe('DataTable paging', () => {
  it('pages with first / previous / next / last and a rows-per-page select', () => {
    render(rich({ pageSize: 2, pageSizes: [2, 4, 0] }));
    const status = () => $('.ui-table-status').textContent;
    const live = () => $('[aria-live]').textContent;
    const nav = () => $$('nav[aria-label="Pagination"] button').map((b) => b.textContent?.trim());
    expect(nav()).toEqual(['First', 'Previous', 'Next', 'Last']);
    expect(status()).toBe('Showing 1–2 of 6');
    expect(live()).toBe('Page 1 of 3');
    click(button('Last', host));
    expect(live()).toBe('Page 3 of 3');
    expect(status()).toBe('Showing 5–6 of 6');
    expect(button('Last', host)?.getAttribute('aria-disabled')).toBe('true');
    click(button('First', host));
    expect(live()).toBe('Page 1 of 3');

    const size = $<HTMLSelectElement>('.ui-page-size select');
    expect(document.querySelector(`label[for="${size.id}"]`)?.textContent).toBe('Rows per page');
    click(button('Next', host));
    act(() => {
      size.value = '4';
      size.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(live()).toBe('Page 1 of 2'); // back to page 1
    expect($$('tbody tr')).toHaveLength(4);
    act(() => {
      size.value = '0';
      size.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect($$('tbody tr')).toHaveLength(6);
    expect(status()).toBe('6 rows');
  });

  it('goes back to page 1 when a filter changes', () => {
    render(rich({ pageSize: 2 }));
    click(button('Next', host));
    expect($('[aria-live]').textContent).toBe('Page 2 of 3');
    type($('input[type="search"]'), 'a');
    expect($('[aria-live]').textContent).toBe('Page 1 of 2');
  });
});

describe('DataTable selection and the bulk bar', () => {
  it('shows the bar while rows are selected, with count, actions and Clear selection', () => {
    const onDelete = vi.fn<(s: ReadonlySet<string>) => void>();
    render(
      rich({
        selectable: true,
        bulkActions: (sel) => (
          <button type="button" onClick={() => onDelete(sel)}>
            Delete
          </button>
        ),
      }),
    );
    expect($('[role="region"][aria-label="Bulk actions"]')).toBeNull();
    const boxes = $$('tbody input[type="checkbox"]');
    click(boxes[0]);
    click(boxes[2]);
    const bar = $('[role="region"][aria-label="Bulk actions"]');
    expect(bar.textContent).toContain('2 selected');
    click(button('Delete', bar));
    expect(onDelete).toHaveBeenCalledWith(new Set(['o1', 'o3']));
    click(button('Clear selection', bar));
    expect($('[role="region"][aria-label="Bulk actions"]')).toBeNull();
    expect($('.ui-table-status').textContent).toContain('0 selected');
  });

  it('selects only the rows that pass the filters, and keeps the rest', () => {
    render(rich({ selectable: true }));
    const header = () => $<HTMLInputElement>('thead input[type="checkbox"]');
    expect(header().getAttribute('aria-label')).toBe('Select all 6 rows');
    type($('input[type="search"]'), 'a'); // Ada, Bea, Cal, Fay
    expect(header().getAttribute('aria-label')).toBe('Select all 4 rows');
    click(header());
    expect($('.ui-table-status').textContent).toContain('4 selected');
    type($('input[type="search"]'), '');
    expect(header().indeterminate).toBe(true);
    click(header());
    expect($('.ui-table-status').textContent).toContain('6 selected');
    click(header());
    expect($('.ui-table-status').textContent).toContain('0 selected');
  });

  it('can scope the header checkbox to the page (selectPage)', () => {
    function Harness() {
      const table = useDataTable({
        columns: COLUMNS,
        rows: ORDERS,
        rowKey,
        initialState: { pageSize: 2 },
      });
      return (
        <>
          <DataTableView table={table} caption="Orders" selectable selectScope="page" />
          <TablePagination table={table} selectedCount={table.selection.count} />
        </>
      );
    }
    render(<Harness />);
    expect($('thead input').getAttribute('aria-label')).toBe('Select all 2 rows');
    click($('thead input'));
    expect($('.ui-table-status').textContent).toContain('2 selected');
    click(button('Next', host));
    expect($<HTMLInputElement>('thead input').checked).toBe(false);
  });
});

describe('DataTable rows', () => {
  it('expands a row with a disclosure button that owns the detail row', () => {
    render(rich({ renderExpanded: (o) => <p>Notes for {o.name}</p> }));
    const toggle = $<HTMLButtonElement>('tbody tr button[aria-expanded]');
    expect(toggle.getAttribute('aria-label')).toBe('Details for Ada');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.hasAttribute('aria-controls')).toBe(false);
    click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const detail = document.getElementById(toggle.getAttribute('aria-controls') ?? '');
    expect(detail?.textContent).toBe('Notes for Ada');
    expect(detail?.previousElementSibling).toBe(toggle.closest('tr'));
    expect(detail?.querySelector('td')?.getAttribute('colspan')).toBe('5');
    click(toggle);
    expect($$('.ui-table-detail')).toHaveLength(0);
  });

  it('opens a row by keyboard through the first cell button, and not from other controls', () => {
    const onRow = vi.fn<(o: Order) => void>();
    render(rich({ onRowClick: onRow, selectable: true }));
    const tr = $('tbody tr');
    expect(tr.hasAttribute('tabindex')).toBe(false); // the row is not a tab stop
    const opener = $<HTMLButtonElement>('tbody tr button.ui-row-open');
    expect(opener.textContent).toBe('Ada');
    act(() => opener.focus());
    expect(document.activeElement).toBe(opener);
    click(opener); // Enter and Space on a button are clicks
    expect(onRow).toHaveBeenCalledTimes(1);
    expect(onRow).toHaveBeenLastCalledWith(ORDERS[0]);
    click($('tbody tr input[type="checkbox"]')); // a checkbox is not an open
    click($$('tbody tr td')[2]); // a plain cell click is (mouse convenience)
    expect(onRow).toHaveBeenCalledTimes(2);
    // no control is nested inside another
    expect($$('button button, a button, button a')).toHaveLength(0);
  });

  it('can use a dedicated Open button when the first cell holds a link', () => {
    const onRow = vi.fn<(o: Order) => void>();
    const cols: Column<Order>[] = [
      { key: 'name', header: 'Name', cell: (o) => <a href={`#${o.id}`}>{o.name}</a> },
      { key: 'region', header: 'Region' },
    ];
    render(rich({ columns: cols, onRowClick: onRow, rowOpenButton: true }));
    expect($$('tbody button.ui-row-open')).toHaveLength(6);
    const open = $<HTMLButtonElement>('tbody button.ui-row-open');
    expect(open.getAttribute('aria-label')).toBe('Open Ada');
    expect($('tbody a button')).toBeNull();
    click(open);
    expect(onRow).toHaveBeenCalledWith(ORDERS[0]);
    click($('tbody a')); // the link is its own control
    expect(onRow).toHaveBeenCalledTimes(1);
  });

  it('gives each row a Menu named after the row', async () => {
    const onEdit = vi.fn<() => void>();
    render(
      rich({
        rowActions: (o) => [
          { id: 'edit', label: 'Edit', onSelect: onEdit },
          { separator: true },
          { id: 'del', label: `Delete ${o.name}`, danger: true },
        ],
      }),
    );
    expect($$('thead th').at(-1)?.textContent).toBe('Actions');
    const trigger = $<HTMLButtonElement>('tbody .ui-row-actions button');
    expect(trigger.textContent).toBe('Actions for Ada');
    press(trigger);
    await flush();
    expect($$doc('[role="menuitem"]').map((i) => i.textContent)).toEqual(['Edit', 'Delete Ada']);
    click($$doc('[role="menuitem"]')[0]);
    expect(onEdit).toHaveBeenCalled();
  });

  it('totals the footer over every filtered row, not just the page', () => {
    render(rich({ pageSize: 2 }));
    expect($('tfoot').textContent).toBe('£580');
    click(button('Next', host));
    expect($('tfoot').textContent).toBe('£580');
    type($('input[type="search"]'), 'a'); // Ada, Bea, Cal, Fay
    expect($('tfoot td:last-child').textContent).toBe('£460');
    expect($$('tfoot td')).toHaveLength(4);
    render(rich({ footer: false }));
    expect($('tfoot')).toBeNull();
  });

  it('shows a custom empty node', () => {
    render(rich({ rows: [], empty: <em>Nothing yet</em> }));
    expect($('tbody td em').textContent).toBe('Nothing yet');
  });

  it('keeps the header in view when stickyHeader is set', () => {
    render(rich({ stickyHeader: true }));
    expect($('thead').className).toContain('sticky');
    expect($('section').className).toContain('overflow-y-auto');
  });

  it('exports the filtered rows as a CSV download', async () => {
    const make = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:orders');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const anchors: string[] = [];
    const follow = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      anchors.push(`${this.download} ${this.href}`);
    });
    try {
      render(rich({ exportCsv: 'orders.csv' }));
      type($('input[type="search"]'), 'a'); // 4 rows
      click(button('Export CSV', host));
      expect(anchors).toEqual(['orders.csv blob:orders']);
      const blob = make.mock.calls[0]?.[0] as Blob;
      // hidden columns (Tags) are left out; the footer is not a row
      expect(await blob.text()).toBe(
        'Name,Status,Region,Total\r\nAda,Active,North,120\r\nBea,Paused,South,80\r\nCal,Active,South,200\r\nFay,Closed,South,60\r\n',
      );
      expect(revoke).toHaveBeenCalledWith('blob:orders');
    } finally {
      make.mockRestore();
      revoke.mockRestore();
      follow.mockRestore();
    }
  });
});

describe('DataTable loading', () => {
  it('draws the skeleton in the same frame, busy, with no table', () => {
    render(rich({ loading: true }));
    const frame = $('section');
    expect(frame.getAttribute('aria-busy')).toBe('true');
    expect($('table')).toBeNull();
    expect($('.ui-skeleton-table')).not.toBeNull();
    expect(document.getElementById(frame.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Orders',
    );
    expect($('[role="status"]').textContent).toBe('Loading Orders');
    render(rich({ loading: false }));
    expect($('section').hasAttribute('aria-busy')).toBe(false);
    expect($('table')).not.toBeNull();
  });
});

/* ---- controlled, uncontrolled and manual state --------------------------- */

describe('state', () => {
  it('takes controlled state and reports patches', () => {
    const seen: Partial<DataTableState>[] = [];
    function Page() {
      const [sort, setSort] = useState<DataTableState['sort']>([{ key: 'total', dir: 'desc' }]);
      return rich({
        state: { sort },
        onStateChange: (patch) => {
          seen.push(patch);
          if (patch.sort) setSort(patch.sort);
        },
      });
    }
    render(<Page />);
    expect(names()[0]).toBe('Cal');
    click($$('th button')[0]);
    expect(seen).toContainEqual({ sort: [{ key: 'name', dir: 'asc' }], pageIndex: 0 });
    expect(names()[0]).toBe('Ada');
  });

  it('a controlled key ignores the hook until the parent changes it', () => {
    render(rich({ state: { search: 'cal' } }));
    expect(names()).toEqual(['Cal']);
    type($('input[type="search"]'), 'ada'); // reported, but the parent did not take it
    expect(names()).toEqual(['Cal']);
  });

  it('manual mode reports changes, never reorders or filters rows, and uses the server count', () => {
    const onChange = vi.fn<(patch: Partial<DataTableState>, next: DataTableState) => void>();
    const page = [ORDERS[3], ORDERS[0], ORDERS[2]] as Order[]; // deliberately not sorted
    render(
      rich({
        rows: page,
        pageSize: 3,
        manual: { rowCount: 40 },
        onStateChange: onChange,
        columns: COLUMNS.map((c) =>
          c.key === 'status'
            ? { ...c, facetOptions: [{ value: 'Active', label: 'Active', count: 25 }] }
            : c,
        ),
      }),
    );
    expect(names()).toEqual(['Dee', 'Ada', 'Cal']);
    expect($('.ui-table-status').textContent).toBe('Showing 1–3 of 40');
    expect($('[aria-live]').textContent).toBe('Page 1 of 14');

    click($$('th button')[0]);
    expect(onChange).toHaveBeenLastCalledWith(
      { sort: [{ key: 'name', dir: 'asc' }], pageIndex: 0 },
      expect.objectContaining({ pageSize: 3 }),
    );
    expect(names()).toEqual(['Dee', 'Ada', 'Cal']); // the server sorts

    type($('input[type="search"]'), 'zzz');
    expect(onChange).toHaveBeenLastCalledWith({ search: 'zzz', pageIndex: 0 }, expect.anything());
    expect(names()).toEqual(['Dee', 'Ada', 'Cal']); // the server filters

    click(button('Next', host));
    expect(onChange).toHaveBeenLastCalledWith({ pageIndex: 1 }, expect.anything());
  });

  it('manual mode keeps the page and selection when the server sends the next page', () => {
    const table = (rows: Order[]) =>
      rich({ rows, pageSize: 3, manual: { rowCount: 6 }, selectable: true });
    render(table(ORDERS.slice(0, 3)));
    click($('tbody input[type="checkbox"]'));
    click(button('Next', host));
    render(table(ORDERS.slice(3)));
    expect($('[aria-live]').textContent).toBe('Page 2 of 2');
    expect($('.ui-table-status').textContent).toContain('1 selected');
  });

  it('is usable headless: the hook plus any layout', () => {
    function Bare() {
      const t = useDataTable({
        columns: COLUMNS,
        rows: ORDERS,
        rowKey,
        initialState: { search: 'a', sort: [{ key: 'name', dir: 'desc' }] },
      });
      return (
        <ol>
          {t.pageRows.map((o) => (
            <li key={o.id}>{o.name}</li>
          ))}
        </ol>
      );
    }
    render(<Bare />);
    expect($$('li').map((l) => l.textContent)).toEqual(['Fay', 'Cal', 'Bea', 'Ada']);
  });
});

/* ---- the parts on their own ---------------------------------------------- */

describe('TableSearch', () => {
  it('debounces by 200ms by default, Enter sends at once, and the clear button clears', () => {
    vi.useFakeTimers();
    const onChange = vi.fn<(v: string) => void>();
    render(<TableSearch value="" onChange={onChange} />);
    const input = $<HTMLInputElement>('input');
    expect(button('Clear search', host)).toBeUndefined();
    type(input, 'ab');
    act(() => vi.advanceTimersByTime(199));
    expect(onChange).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('ab');

    type(input, 'abc');
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onChange).toHaveBeenLastCalledWith('abc');
    act(() => vi.advanceTimersByTime(500));
    expect(onChange).toHaveBeenCalledTimes(2); // the pending timer was cancelled

    click(button('Clear search', host));
    expect(onChange).toHaveBeenLastCalledWith('');
    expect(input.value).toBe('');
  });

  it('follows a value changed from outside without echoing it', () => {
    vi.useFakeTimers();
    const onChange = vi.fn<(v: string) => void>();
    render(<TableSearch value="a" onChange={onChange} />);
    render(<TableSearch value="" onChange={onChange} />);
    expect($<HTMLInputElement>('input').value).toBe('');
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('the parts compose', () => {
  it('lays out toolbar, facet, pagination and bulk bar by hand', async () => {
    function Page() {
      const t = useDataTable({
        columns: COLUMNS,
        rows: ORDERS,
        rowKey,
        initialState: { pageSize: 4 },
      });
      const status = t.facets.find((f) => f.key === 'status');
      return (
        <>
          <DataTableToolbar actions={<span>right</span>}>
            {status && <FacetFilter facet={status} />}
          </DataTableToolbar>
          <BulkActionBar count={t.selection.count} onClear={t.selection.clear}>
            <span>actions</span>
          </BulkActionBar>
          <DataTableView table={t} caption="Orders" selectable />
          <TablePagination
            table={t}
            selectedCount={t.selection.count}
            pageSizeSelect
            edges={false}
          />
        </>
      );
    }
    render(<Page />);
    expect($('fieldset legend').textContent).toBe('Table controls');
    expect($('.ui-table-toolbar-end').textContent).toBe('right');
    expect($$('nav[aria-label="Pagination"] button')).toHaveLength(2);
    expect($('.ui-page-size select')).not.toBeNull();
    click($('tbody input'));
    expect($('[role="region"]').textContent).toContain('1 selected');
  });
});

/* ---- axe, every skin and mode -------------------------------------------- */

describe('axe', () => {
  const PASSES = [
    { skin: 'enterprise', theme: 'light' },
    { skin: 'enterprise', theme: 'dark' },
    { skin: 'glass', theme: 'light' },
    { skin: 'glass', theme: 'dark' },
  ];

  it.each(PASSES)('a rich table has no violations: $skin $theme', async ({ skin, theme }) => {
    document.documentElement.setAttribute('data-skin', skin);
    document.documentElement.setAttribute('data-theme', theme);
    render(
      <main>
        <h1>Orders</h1>
        <DataTable
          caption="Orders"
          columns={COLUMNS}
          rows={ORDERS}
          rowKey={rowKey}
          pageSize={4}
          pageSizes={[4, 8, 0]}
          initialSort={{ key: 'total', dir: 'desc' }}
          initialState={{ facets: { status: ['Active'] } }}
          search
          columnToggle
          densityToggle
          selectable
          selected={new Set(['o1'])}
          onSelectedChange={() => {}}
          bulkActions={<button type="button">Archive</button>}
          exportCsv="orders.csv"
          renderExpanded={(o) => <p>Notes for {o.name}</p>}
          onRowClick={() => {}}
          rowActions={() => [{ id: 'edit', label: 'Edit' }]}
          stickyHeader
        />
      </main>,
    );
    click($('tbody button[aria-expanded]'));
    await flush();
    const run = async () =>
      (
        await axe.run(document.body, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
          },
          // jsdom has no layout or cascade, so contrast is the browser gate's job
          rules: { 'color-contrast': { enabled: false } },
          resultTypes: ['violations'],
        })
      ).violations;
    expect(await run()).toEqual([]);

    // with a facet popover open
    click(button(/^Status/, host));
    await flush();
    expect($doc('[role="dialog"]')).not.toBeNull();
    expect(await run()).toEqual([]);
  });

  it('the loading and empty states have no violations', async () => {
    render(
      <main>
        <h1>Orders</h1>
        <DataTable caption="Loading" columns={COLUMNS} rows={ORDERS} rowKey={rowKey} loading />
        <DataTable caption="Empty" columns={COLUMNS} rows={[]} rowKey={rowKey} search />
      </main>,
    );
    const { violations } = await axe.run(document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
      resultTypes: ['violations'],
    });
    expect(violations).toEqual([]);
  });
});
