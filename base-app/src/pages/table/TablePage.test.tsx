import { act } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { setAskOpen, useAsk } from '~/core/agent';
import type { Category, Transaction, TransactionStatus } from '~/core/api';
import { Toaster } from '~/core/ui';
import { formatMoney } from '~/core/utils';
import { formatViolations, runAxe } from '~/test/axe';
import { changeValue, click, getAllByRole, getByRole } from '~/test/dom';
import { locationNow, setLocation } from '~/test/location';
import { mockApi } from '~/test/mockApi';
import { flush, render } from '~/test/render';
import { getTransactions } from '../../../fixtures/index.ts';
import { dayEnd, dayStart } from './range';
import TablePage from './TablePage';

/* mockApi matches routes by path alone, and the table talks in query strings, so
   this file puts a small fake of the server's table mode in front of it: it filters,
   sorts, pages and counts facets the way GET /api/transactions does, over the same
   fixtures. Everything else (auth, health) still goes to mockApi. */

const ALL = getTransactions();
const STATUSES: readonly TransactionStatus[] = ['paid', 'pending', 'failed', 'refunded'];
const CATEGORIES: readonly Category[] = ['Software', 'Hardware', 'Services', 'Travel', 'Office'];

const listParam = (q: URLSearchParams, key: string) =>
  q
    .getAll(key)
    .flatMap((v) => v.split(','))
    .filter(Boolean);

const value = (t: Transaction, key: string) =>
  key === 'amount' ? t.amountMinor : String(t[key as keyof Transaction]);

function pageReply(q: URLSearchParams) {
  const needle = (q.get('q') ?? '').toLowerCase();
  const statuses = listParam(q, 'status');
  const categories = listParam(q, 'category');
  const from = q.get('from');
  const before = q.get('before');
  const matches = (t: Transaction, skip?: 'status' | 'category') =>
    (needle === '' ||
      t.customer.toLowerCase().includes(needle) ||
      t.description.toLowerCase().includes(needle)) &&
    (!from || t.date >= from) &&
    (!before || t.date < before) &&
    (skip === 'status' || statuses.length === 0 || statuses.includes(t.status)) &&
    (skip === 'category' || categories.length === 0 || categories.includes(t.category));
  const rows = ALL.filter((t) => matches(t));
  const sort = (q.get('sort') ?? '-date').split(',');
  rows.sort((a, b) => {
    for (const s of sort) {
      const desc = s.startsWith('-');
      const key = desc ? s.slice(1) : s;
      const x = value(a, key);
      const y = value(b, key);
      const d =
        typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
      if (d !== 0) return desc ? -d : d;
    }
    return a.id.localeCompare(b.id);
  });
  const page = Number(q.get('page') ?? 1);
  const pageSize = Number(q.get('pageSize') ?? 25);
  const count = <K extends string>(
    keys: readonly K[],
    pick: (t: Transaction) => K,
    skip: 'status' | 'category',
  ) =>
    Object.fromEntries(
      keys.map((k) => [k, ALL.filter((t) => matches(t, skip) && pick(t) === k).length]),
    ) as Record<K, number>;
  return {
    ok: true,
    transactions: rows.slice((page - 1) * pageSize, page * pageSize),
    total: rows.length,
    page,
    pageSize,
    facets: {
      status: count(STATUSES, (t) => t.status, 'status'),
      category: count(CATEGORIES, (t) => t.category, 'category'),
    },
  };
}

interface Fake {
  /** Every request the page made, as a URL. */
  urls: URL[];
  /** The table-mode requests (those with a query string). */
  pages: () => URLSearchParams[];
  release: () => void;
  hold: () => void;
  failNext: (n: number) => void;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

function installApi(opts: { hold?: boolean } = {}): Fake {
  const base = mockApi();
  const urls: URL[] = [];
  let holding = opts.hold ?? false;
  let failures = 0;
  const waiting: (() => void)[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input), 'http://127.0.0.1');
      const isList = url.pathname === '/api/transactions' && url.search !== '';
      const isDetail = url.pathname.startsWith('/api/transactions/');
      if (!isList && !isDetail) return base.fetch(input, init);
      urls.push(url);
      if (holding) await new Promise<void>((resolve) => waiting.push(resolve));
      if (isList && failures > 0) {
        failures -= 1;
        return json(500, { ok: false, error: { code: 'internal_error', message: 'Boom' } });
      }
      if (isList) return json(200, pageReply(url.searchParams));
      const id = decodeURIComponent(url.pathname.slice('/api/transactions/'.length));
      const transaction = ALL.find((t) => t.id === id);
      if (!transaction) {
        return json(404, {
          ok: false,
          error: { code: 'transaction_not_found', message: 'No such transaction' },
        });
      }
      const others = ALL.filter((t) => t.customer === transaction.customer && t.id !== id);
      return json(200, {
        ok: true,
        transaction,
        relatedCount: others.length,
        related: others.slice(0, 5),
      });
    }),
  );
  return {
    urls,
    pages: () =>
      urls
        .filter((u) => u.search !== '' && u.pathname === '/api/transactions')
        .map((u) => u.searchParams),
    release() {
      holding = false;
      for (const resolve of waiting.splice(0)) resolve();
    },
    hold() {
      holding = true;
    },
    failNext(n) {
      failures = n;
    },
  };
}

const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
const settle = () => flush(5);
/** The search box debounces for 250 ms. */
const debounced = async () => {
  await wait(300);
  await settle();
};

const bodyRows = () => Array.from(document.querySelectorAll<HTMLElement>('.ui-table tbody tr'));
const statusLine = () =>
  Array.from(document.querySelectorAll('[role="status"]')).find((e) =>
    (e.textContent ?? '').startsWith('Showing'),
  )?.textContent;
const button = (name: string | RegExp, within: ParentNode = document) =>
  getByRole(within, 'button', name);
/** The filter bar, so "Status" means the facet and not the column header. */
const filterBar = () => document.querySelector('.ui-table-toolbar') as HTMLElement;
const lastPage = (fake: Fake) => fake.pages().at(-1) ?? new URLSearchParams();
const search = () => getByRole(document.body, 'textbox', 'Search') as HTMLInputElement;
const hash = () => locationNow();

/** A sink that records the files instead of downloading them. */
function sink() {
  const files: { name: string; csv: string }[] = [];
  return { files, save: (name: string, csv: string) => void files.push({ name, csv }) };
}
const csvLines = (csv: string) => csv.trim().split('\r\n');

const boxes = () =>
  Array.from(document.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]'));

async function open(hashValue = '', props: Parameters<typeof TablePage>[0] = {}) {
  setLocation(hashValue);
  // the app mounts the one Toaster (App.tsx); a page rendered alone gets one here
  const view = await render(
    <>
      <TablePage {...props} />
      <Toaster />
    </>,
  );
  await settle();
  return view;
}

describe('TablePage, server mode', () => {
  it('shows a skeleton in the table frame, then the first page, asking the API for it', async () => {
    const fake = installApi({ hold: true });
    setLocation('/');
    const view = await render(<TablePage />);
    await settle();

    expect(getByRole(document.body, 'heading', 'Transactions').tagName).toBe('H1');
    expect(document.querySelector('section[aria-busy="true"]')).not.toBeNull();
    expect(bodyRows()).toHaveLength(0);

    fake.release();
    await settle();
    expect(document.querySelector('section[aria-busy="true"]')).toBeNull();
    expect(bodyRows()).toHaveLength(25);
    expect(statusLine()).toBe('Showing 1–25 of 240 transactions');

    const q = lastPage(fake);
    expect(q.get('page')).toBe('1');
    expect(q.get('pageSize')).toBe('25');
    expect(q.get('sort')).toBe('-date');
    expect(q.get('q')).toBeNull();
    // server mode never asks for the plain list
    expect(fake.urls.every((u) => u.search !== '' || u.pathname !== '/api/transactions')).toBe(
      true,
    );
    await view.unmount();
  });

  it('a search becomes one debounced request, a chip and a URL parameter', async () => {
    const fake = installApi();
    const view = await open();
    const customer = ALL[0]?.customer ?? '';
    const before = fake.pages().length;

    await changeValue(search(), customer);
    expect(fake.pages()).toHaveLength(before); // not before the pause
    await debounced();

    expect(fake.pages()).toHaveLength(before + 1);
    expect(lastPage(fake).get('q')).toBe(customer);
    expect(lastPage(fake).get('page')).toBe('1');
    expect(new URLSearchParams(hash().split('?')[1]).get('q')).toBe(customer);
    expect(getAllByRole(document.body, 'button', `Remove filter Search: ${customer}`)).toHaveLength(
      1,
    );
    const total = pageReply(new URLSearchParams({ q: customer })).total;
    expect(statusLine()).toBe(`Showing 1–${Math.min(25, total)} of ${total} transactions`);
    await view.unmount();
  });

  it('shows the server’s facet counts, filters by ticking, and removes the chip', async () => {
    const fake = installApi();
    const view = await open();
    const paid = pageReply(new URLSearchParams()).facets.status.paid;

    await click(button(/^Status/, filterBar()));
    await settle();
    const dialog = getByRole(document.body, 'dialog', 'Status filter');
    const label = (text: string) =>
      Array.from(dialog.querySelectorAll<HTMLLabelElement>('label')).find((l) =>
        (l.textContent ?? '').startsWith(text),
      );
    expect(label('Paid')?.textContent).toBe(`Paid${paid}`);
    expect(label('Failed')?.textContent).toMatch(/^Failed\d+$/);

    const box = label('Paid')?.querySelector('input');
    if (box) await click(box);
    await settle();
    expect(lastPage(fake).get('status')).toBe('paid');
    expect(lastPage(fake).get('page')).toBe('1');
    expect(hash()).toContain('status=paid');
    expect(statusLine()).toContain(`of ${paid} transactions`);
    // a facet's own counts ignore its own choice
    expect(label('Failed')?.textContent).toMatch(/^Failed\d+$/);

    // close the popover, then remove the chip
    await click(button(/^Status/, filterBar()));
    await settle();
    await click(button('Remove filter Status: Paid'));
    await settle();
    expect(lastPage(fake).get('status')).toBeNull();
    expect(hash()).not.toContain('status=');
    expect(statusLine()).toBe('Showing 1–25 of 240 transactions');
    await view.unmount();
  });

  it('sorts on the server by the clicked column, and again for descending', async () => {
    const fake = installApi();
    const view = await open();
    const amount = Array.from(document.querySelectorAll('th')).find((h) =>
      (h.textContent ?? '').includes('Amount'),
    );
    const sortButton = amount?.querySelector('button');
    expect(sortButton).toBeTruthy();
    if (sortButton) await click(sortButton);
    await settle();
    expect(lastPage(fake).get('sort')).toBe('amount');
    expect(amount?.getAttribute('aria-sort')).toBe('ascending');
    expect(hash()).toContain('sort=amount');
    if (sortButton) await click(sortButton);
    await settle();
    expect(lastPage(fake).get('sort')).toBe('-amount');
    expect(amount?.getAttribute('aria-sort')).toBe('descending');
    await view.unmount();
  });

  it('pages on the server and keeps the old rows on screen while the next page loads', async () => {
    const fake = installApi();
    const view = await open();
    const firstRow = bodyRows()[0]?.textContent;

    fake.hold();
    await click(button('Next'));
    // the answer has not come back yet: the old rows stay, quieter, never a skeleton
    expect(document.querySelector('.ui-list-frame[aria-busy="true"]')).not.toBeNull();
    expect(document.querySelector('.ui-skeleton-table')).toBeNull();
    expect(bodyRows()[0]?.textContent).toBe(firstRow);
    fake.release();
    await settle();

    expect(lastPage(fake).get('page')).toBe('2');
    expect(hash()).toContain('page=2');
    expect(document.querySelector('.ui-list-frame[aria-busy="true"]')).toBeNull();
    expect(bodyRows()[0]?.textContent).not.toBe(firstRow);
    expect(statusLine()).toBe('Showing 26–50 of 240 transactions');
    expect(document.body.textContent).toContain('Page 2 of 10');
    await view.unmount();
  });

  it('restores the whole view from the URL, and the controls reflect it', async () => {
    const fake = installApi();
    const view = await open(
      '/table?q=a&status=paid,failed&category=Travel&sort=-amount,customer&page=2&size=10&density=compact&hide=description',
    );

    const q = lastPage(fake);
    expect(q.get('q')).toBe('a');
    expect(q.get('status')).toBe('paid,failed');
    expect(q.get('category')).toBe('Travel');
    expect(q.get('sort')).toBe('-amount,customer');
    expect(q.get('page')).toBe('2');
    expect(q.get('pageSize')).toBe('10');

    expect(search().value).toBe('a');
    expect(button(/^Status/, filterBar()).textContent).toContain('2');
    expect(button(/^Category/, filterBar()).textContent).toContain('1');
    expect((getByRole(document.body, 'combobox', 'Density') as HTMLSelectElement).value).toBe(
      'compact',
    );
    expect((getByRole(document.body, 'combobox', 'Rows per page') as HTMLSelectElement).value).toBe(
      '10',
    );
    const headers = Array.from(document.querySelectorAll('thead th')).map((h) => h.textContent);
    expect(headers.some((h) => h?.includes('Description'))).toBe(false);
    expect(headers.some((h) => h?.includes('Amount'))).toBe(true);
    expect(getAllByRole(document.body, 'button', /^Remove filter/)).toHaveLength(4);
    expect(document.querySelector('th[aria-sort="descending"]')?.textContent).toContain('Amount');
    await view.unmount();
  });

  it('shows the Page total, and tells the honest label', async () => {
    installApi();
    const view = await open('/table?size=10');
    const foot = document.querySelector('.ui-table-foot');
    expect(foot?.textContent).toContain('Page total');
    const rows = pageReply(new URLSearchParams('pageSize=10')).transactions;
    const expected = formatMoney(
      rows.reduce((sum, t) => sum + t.amountMinor, 0),
      'GBP',
    );
    expect(foot?.querySelector('.app-money')?.textContent).toBe(expected);
    await view.unmount();
  });
});

describe('TablePage, browser mode', () => {
  it('loads the plain list once and filters, sorts and pages client-side', async () => {
    const fake = installApi();
    const view = await open('/table?mode=browser');

    expect(fake.pages()).toHaveLength(0); // never the table-mode query
    expect(statusLine()).toBe('Showing 1–25 of 240 transactions');
    expect(document.querySelector('.ui-table-foot')?.textContent).toContain('Total');
    expect(document.querySelector('.ui-table-foot')?.textContent).not.toContain('Page total');

    const customer = ALL[3]?.customer ?? '';
    const expected = ALL.filter(
      (t) =>
        t.customer.toLowerCase().includes(customer.toLowerCase()) ||
        t.description.toLowerCase().includes(customer.toLowerCase()),
    ).length;
    await changeValue(search(), customer);
    await debounced();
    expect(statusLine()).toBe(`Showing 1–${Math.min(25, expected)} of ${expected} transactions`);
    // no further request: the table did it
    expect(fake.urls.filter((u) => u.pathname === '/api/transactions')).toHaveLength(0);
    await view.unmount();
  });

  it('counts facets itself and keeps the mode in the URL', async () => {
    installApi();
    const view = await open('/table?mode=browser');
    await click(button(/^Status/, filterBar()));
    await settle();
    const dialog = getByRole(document.body, 'dialog', 'Status filter');
    const paid = ALL.filter((t) => t.status === 'paid').length;
    expect(dialog.textContent).toContain(`Paid${paid}`);
    await click(button(/^Status/, filterBar()));

    // switching to Server rewrites the URL and asks the API
    const server = getAllByRole(document.body, 'radio', 'Server')[0] ?? null;
    expect(server).not.toBeNull();
    if (server) await click(server);
    await settle();
    expect(hash()).not.toContain('mode=browser');
    await view.unmount();
  });
});

describe('TablePage, export, bulk actions and rows', () => {
  it('Export CSV fetches every page of the current query and saves one file', async () => {
    const fake = installApi();
    const out = sink();
    const view = await open('/table?status=paid', { csvSink: out });
    const paid = ALL.filter((t) => t.status === 'paid').length;

    await click(button('Export CSV'));
    await settle();

    const exportCalls = fake.pages().filter((q) => q.get('pageSize') === '100');
    expect(exportCalls).toHaveLength(Math.ceil(paid / 100));
    expect(exportCalls.every((q) => q.get('status') === 'paid')).toBe(true);
    expect(out.files).toHaveLength(1);
    expect(out.files[0]?.name).toBe('transactions.csv');
    const lines = csvLines(out.files[0]?.csv ?? '');
    expect(lines[0]).toContain('ID,Customer');
    expect(lines).toHaveLength(paid + 1);
    expect(document.body.textContent).toContain(`Exported ${paid} transactions`);
    await view.unmount();
  });

  it('Export CSV in browser mode exports the filtered rows without asking the API', async () => {
    const fake = installApi();
    const out = sink();
    const view = await open('/table?mode=browser&category=Travel', { csvSink: out });
    const travel = ALL.filter((t) => t.category === 'Travel').length;
    await click(button('Export CSV'));
    await settle();
    expect(csvLines(out.files[0]?.csv ?? '')).toHaveLength(travel + 1);
    expect(fake.pages()).toHaveLength(0);
    await view.unmount();
  });

  it('selecting rows shows the bulk bar: export selected, mark reviewed, clear', async () => {
    installApi();
    const out = sink();
    const view = await open('', { csvSink: out });
    expect(document.querySelector('[aria-label="Bulk actions"]')).toBeNull();

    await click(boxes()[0] as HTMLElement);
    await click(boxes()[1] as HTMLElement);
    const bar = getByRole(document.body, 'region', 'Bulk actions');
    expect(bar.textContent).toContain('2 selected');

    await click(button('Export selected', bar));
    expect(out.files[0]?.name).toBe('transactions-selected.csv');
    expect(csvLines(out.files[0]?.csv ?? '')).toHaveLength(3);

    await click(button('Mark as reviewed (demo)', bar));
    expect(document.querySelector('[aria-label="Bulk actions"]')).toBeNull();
    expect(document.body.textContent).toContain('nothing is sent to the server');
    const reviewed = bodyRows().filter((r) => (r.textContent ?? '').includes('Reviewed (demo)'));
    expect(reviewed).toHaveLength(2);

    await click(boxes()[4] as HTMLElement);
    await click(button('Clear selection'));
    expect(document.querySelector('[aria-label="Bulk actions"]')).toBeNull();
    await view.unmount();
  });

  it('opens the details in a sheet, and closing it puts focus back on the row', async () => {
    const fake = installApi();
    const view = await open();
    const opener = document.querySelector<HTMLElement>(
      'tbody tr:first-child button[data-row-open]',
    );
    expect(opener).not.toBeNull();
    if (!opener) return;
    opener.focus();
    const txId = pageReply(new URLSearchParams()).transactions[0]?.id ?? '';

    await click(opener);
    await settle();
    const dialog = getByRole(document.body, 'dialog');
    expect(dialog.getAttribute('aria-labelledby')).not.toBeNull();
    expect(fake.urls.some((u) => u.pathname === `/api/transactions/${txId}`)).toBe(true);
    expect(dialog.querySelector('dl')?.textContent).toContain(txId);
    expect(dialog.querySelector('.app-money')).not.toBeNull();
    expect(dialog.textContent).toMatch(/Other transactions from|No other transactions from/);

    await click(button('Close', dialog));
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
    await view.unmount();
  });

  it('"Ask about this" closes the sheet and opens the Ask panel about the transaction', async () => {
    installApi();
    function Probe() {
      return <output data-ask>{JSON.stringify(useAsk())}</output>;
    }
    setLocation('/');
    const view = await render(
      <>
        <TablePage />
        <Probe />
      </>,
    );
    await settle();
    const opener = document.querySelector<HTMLElement>(
      'tbody tr:first-child button[data-row-open]',
    );
    if (!opener) throw new Error('no row');
    const txId = pageReply(new URLSearchParams()).transactions[0]?.id ?? '';
    await click(opener);
    await settle();
    await click(button('Ask about this', getByRole(document.body, 'dialog')));
    await settle();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    const ask = JSON.parse(document.querySelector('[data-ask]')?.textContent ?? '{}');
    expect(ask).toMatchObject({ open: true, selection: { kind: 'transaction', id: txId } });
    act(() => setAskOpen(false));
    await view.unmount();
  });

  it('a transaction that is gone shows the error inside the sheet, with Retry', async () => {
    installApi();
    const view = await open();
    const original = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input, init) =>
        String(input).includes('/api/transactions/')
          ? new Response(
              JSON.stringify({
                ok: false,
                error: { code: 'transaction_not_found', message: 'Gone' },
              }),
              { status: 404, headers: { 'content-type': 'application/json' } },
            )
          : original(input, init),
      ),
    );
    const opener = document.querySelector<HTMLElement>(
      'tbody tr:first-child button[data-row-open]',
    );
    if (opener) await click(opener);
    await settle();
    const dialog = getByRole(document.body, 'dialog');
    expect(dialog.querySelector('[role="alert"]')).not.toBeNull();
    expect(button('Retry', dialog)).toBeTruthy();
    // the table behind is untouched
    expect(bodyRows().length).toBe(25);
    await view.unmount();
  });

  it('the row menu has View details, Copy ID and Filter by this customer', async () => {
    const fake = installApi();
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const view = await open();
    const first = bodyRows()[0];
    const trigger = first?.querySelector<HTMLElement>('.ui-row-actions button');
    expect(trigger?.textContent).toMatch(/^Actions for /);
    const items = async () => {
      await act(async () => {
        trigger?.dispatchEvent(
          new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
        );
      });
      await settle();
      return getAllByRole(document.body, 'menuitem');
    };

    let menu = await items();
    expect(menu.map((i) => i.textContent)).toEqual([
      'View details',
      'Copy ID',
      'Filter by this customer',
    ]);
    await click(menu[1] as HTMLElement);
    await settle();
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toContain('Copied the ID');

    const customer = first?.querySelector('td:nth-child(2)')?.textContent ?? '';
    menu = await items();
    await click(menu[2] as HTMLElement);
    await settle();
    expect(lastPage(fake).get('q')).toBe(customer);
    expect(search().value).toBe(customer);
    await view.unmount();
  });

  it('Copy ID says so when the clipboard is not available', async () => {
    installApi();
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    const view = await open();
    const trigger = bodyRows()[0]?.querySelector<HTMLElement>('.ui-row-actions button');
    await act(async () => {
      trigger?.dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 }),
      );
    });
    await settle();
    await click(getAllByRole(document.body, 'menuitem')[1] as HTMLElement);
    await settle();
    expect(document.body.textContent).toContain('Couldn’t copy the ID');
    await view.unmount();
  });
});

describe('TablePage, empty and error states', () => {
  it('an empty result shows the empty state, and Clear filters brings the rows back', async () => {
    installApi();
    const view = await open('/table?q=zzzzzzzz');
    expect(bodyRows()).toHaveLength(1);
    expect(document.body.textContent).toContain('No transactions match these filters');
    expect(statusLine()).toBe('Showing 0–0 of 0 transactions');
    const empty = document.querySelector<HTMLElement>('.ui-empty-state') as HTMLElement;
    await click(button('Clear filters', empty));
    await settle();
    expect(hash()).not.toContain('q=');
    expect(bodyRows()).toHaveLength(25);
    expect(search().value).toBe('');
    await view.unmount();
  });

  describe('the date range', () => {
    /* The page's "today" is the UK day of the clock; pin it to the fixtures' anchor. */
    const pinClock = () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
    };
    const between = (from: string, to: string) =>
      ALL.filter((t) => t.date >= dayStart(from) && t.date < dayEnd(to)).length;
    const picker = () => button('Date range', filterBar());

    it('a link carries the range: the API gets the UK day bounds and the picker shows it', async () => {
      const fake = installApi();
      const view = await open('/table?from=2026-09-20&to=2026-09-25');
      const q = lastPage(fake);
      expect(q.get('from')).toBe(dayStart('2026-09-20'));
      expect(q.get('before')).toBe(dayEnd('2026-09-25'));
      const total = between('2026-09-20', '2026-09-25');
      expect(total).toBeGreaterThan(0);
      expect(statusLine()).toBe(`Showing 1–${Math.min(25, total)} of ${total} transactions`);
      expect(picker().textContent).toContain('20 Sept 2026');
      expect(picker().textContent).toContain('25 Sept 2026');
      await click(button('Clear date range', filterBar()));
      await settle();
      expect(hash()).not.toContain('from=');
      expect(lastPage(fake).get('from')).toBeNull();
      expect(statusLine()).toBe('Showing 1–25 of 240 transactions');
      await view.unmount();
    });

    it('choosing "Last 7 days" asks the server for those UK days and resets the page', async () => {
      pinClock();
      try {
        const fake = installApi();
        const view = await open('/table?page=2');
        await click(picker());
        await settle();
        await click(button('Last 7 days', document.body));
        await settle();
        const q = lastPage(fake);
        expect(q.get('page')).toBe('1');
        expect(q.get('from')).toBe(dayStart('2026-09-25'));
        expect(q.get('before')).toBe(dayEnd('2026-10-01'));
        expect(hash()).toContain('from=2026-09-25');
        expect(hash()).toContain('to=2026-10-01');
        expect(hash()).not.toContain('page=2');
        const total = between('2026-09-25', '2026-10-01');
        expect(statusLine()).toContain(`of ${total} transactions`);
        await view.unmount();
      } finally {
        vi.useRealTimers();
      }
    });

    it('in browser mode the same range filters the rows without another request', async () => {
      const fake = installApi();
      const view = await open('/table?mode=browser&from=2026-09-20&to=2026-09-25');
      const total = between('2026-09-20', '2026-09-25');
      expect(statusLine()).toBe(`Showing 1–${Math.min(25, total)} of ${total} transactions`);
      expect(fake.pages()).toHaveLength(0);
      await view.unmount();
    });

    it('an empty range offers Clear filters, which drops the dates too', async () => {
      installApi();
      const view = await open('/table?from=2030-01-01&to=2030-01-02');
      expect(document.body.textContent).toContain('No transactions match these filters');
      const empty = document.querySelector<HTMLElement>('.ui-empty-state') as HTMLElement;
      await click(button('Clear filters', empty));
      await settle();
      expect(hash()).not.toContain('from=');
      expect(bodyRows()).toHaveLength(25);
      await view.unmount();
    });

    it('ignores a range in the URL that is not a day', async () => {
      const fake = installApi();
      const view = await open('/table?from=soon&to=2026-13-99');
      expect(lastPage(fake).get('from')).toBeNull();
      expect(lastPage(fake).get('before')).toBeNull();
      expect(statusLine()).toBe('Showing 1–25 of 240 transactions');
      await view.unmount();
    });
  });

  it('a failed request shows the error with Retry, and Retry loads the table', async () => {
    const fake = installApi();
    fake.failNext(1);
    const view = await open();
    expect(getByRole(document.body, 'alert').textContent).toContain('Couldn’t load transactions.');
    expect(document.querySelector('.ui-table')).toBeNull();
    // the toolbar is still there
    expect(search()).toBeTruthy();

    await click(button('Retry'));
    await settle();
    expect(fake.pages()).toHaveLength(2);
    expect(bodyRows()).toHaveLength(25);
    await view.unmount();
  });

  it('a link to a page past the end goes to the last page', async () => {
    const fake = installApi();
    const view = await open('/table?page=99');
    expect(lastPage(fake).get('page')).toBe('10');
    expect(hash()).toContain('page=10');
    expect(bodyRows()).toHaveLength(15);
    await view.unmount();
  });
});

describe('a11y Table page', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['dark', 'light'] as const) {
      it(`on success · ${skin} · ${mode}`, async () => {
        installApi();
        setLocation('/');
        const view = await render(<TablePage />, { skin, mode });
        await settle();
        expect(bodyRows()).toHaveLength(25);
        expect(formatViolations(await runAxe())).toBe('');
        await view.unmount();
      });

      it(`while loading · ${skin} · ${mode}`, async () => {
        const fake = installApi({ hold: true });
        setLocation('/');
        const view = await render(<TablePage />, { skin, mode });
        await settle();
        expect(formatViolations(await runAxe())).toBe('');
        fake.release();
        await settle();
        await view.unmount();
      });

      it(`with the detail sheet open · ${skin} · ${mode}`, async () => {
        installApi();
        setLocation('/');
        const view = await render(<TablePage />, { skin, mode });
        await settle();
        const opener = document.querySelector<HTMLElement>(
          'tbody tr:first-child button[data-row-open]',
        );
        if (opener) await click(opener);
        await settle();
        expect(document.querySelector('[role="dialog"] dl')).not.toBeNull();
        expect(formatViolations(await runAxe())).toBe('');
        await view.unmount();
      });
    }
  }
});
