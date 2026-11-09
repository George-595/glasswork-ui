/* GET /api/transactions in table mode and GET /api/transactions/:id, end to
   end over the SQLite driver: parsing, filtering, facets, sorting, paging,
   the 400s and the 404. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  Transaction,
  TransactionDetailResponse,
  TransactionsPageResponse,
} from '../shared/api.ts';
import { startTestApp, type TestApp, VIEWER_EMAIL, VIEWER_PASSWORD } from './testing.ts';

let app: TestApp;
let cookie = '';
let all: Transaction[] = [];

const get = (path: string, withCookie: string = cookie) =>
  fetch(`${app.base}${path}`, { headers: withCookie ? { cookie: withCookie } : {} });
const page = async (qs: string) => {
  const res = await get(`/api/transactions?${qs}`);
  expect(res.status).toBe(200);
  return (await res.json()) as TransactionsPageResponse;
};
const errorCode = async (res: Response) =>
  ((await res.json()) as { error: { code: string } }).error.code;

beforeAll(async () => {
  app = await startTestApp();
  cookie = await app.signIn(VIEWER_EMAIL, VIEWER_PASSWORD);
  all = ((await (await get('/api/transactions')).json()) as { transactions: Transaction[] })
    .transactions;
});
afterAll(() => app.close());

describe('table mode', () => {
  it('without a query still returns everything, with no paging fields', async () => {
    const body = (await (await get('/api/transactions')).json()) as Record<string, unknown>;
    expect(body.transactions).toHaveLength(240);
    expect(body.total).toBeUndefined();
    expect(body.facets).toBeUndefined();
  });

  it('pages newest first by default and reports total, page and pageSize', async () => {
    const body = await page('page=2&pageSize=10');
    expect(body).toMatchObject({ ok: true, total: 240, page: 2, pageSize: 10 });
    expect(body.transactions.map((t) => t.id)).toEqual(all.slice(10, 20).map((t) => t.id));
  });

  it('defaults pageSize to 25 and answers an empty page past the end', async () => {
    expect((await page('page=1')).transactions).toHaveLength(25);
    const past = await page('page=999&pageSize=100');
    expect(past.transactions).toEqual([]);
    expect(past.total).toBe(240);
  });

  it('sorts by several keys, descending with a minus', async () => {
    const rows = (await page('pageSize=100&sort=category,-amount')).transactions;
    const outOfOrder = rows.filter((b, i) => {
      const a = rows[i - 1];
      if (!a) return false;
      return a.category === b.category ? a.amountMinor < b.amountMinor : a.category > b.category;
    });
    expect(rows.length).toBe(100);
    expect(outOfOrder).toEqual([]);
  });

  it('searches customer and description, case-insensitively', async () => {
    const needle = (all[0] as Transaction).customer.slice(0, 4).toLowerCase();
    const body = await page(`q=${encodeURIComponent(needle.toUpperCase())}&pageSize=100`);
    const expected = all.filter(
      (t) =>
        t.customer.toLowerCase().includes(needle) || t.description.toLowerCase().includes(needle),
    );
    expect(body.total).toBe(expected.length);
    expect(body.total).toBeGreaterThan(0);
  });

  it('treats % and _ in the search text literally', async () => {
    expect((await page('q=%25')).total).toBe(0);
    const underscores = all.filter((t) => `${t.customer}${t.description}`.includes('_')).length;
    expect((await page('q=_')).total).toBe(underscores);
  });

  it('filters by status and category, as repeats or commas', async () => {
    const want = all.filter(
      (t) => (t.status === 'paid' || t.status === 'failed') && t.category === 'Travel',
    );
    for (const qs of [
      'status=paid,failed&category=Travel',
      'status=paid&status=failed&category=Travel',
    ]) {
      expect((await page(qs)).total).toBe(want.length);
    }
  });

  it('counts facets under every filter but their own', async () => {
    const body = await page('status=paid&category=Travel');
    const underCategory = all.filter((t) => t.category === 'Travel');
    const underStatus = all.filter((t) => t.status === 'paid');
    for (const status of ['paid', 'pending', 'failed', 'refunded'] as const) {
      expect(body.facets.status[status]).toBe(
        underCategory.filter((t) => t.status === status).length,
      );
    }
    for (const category of ['Software', 'Hardware', 'Services', 'Travel', 'Office'] as const) {
      expect(body.facets.category[category]).toBe(
        underStatus.filter((t) => t.category === category).length,
      );
    }
    expect(body.total).toBe(underCategory.filter((t) => t.status === 'paid').length);
  });

  it('applies the search to the facets too, and lists every value even at zero', async () => {
    const body = await page('q=zzzz-no-match');
    expect(body.total).toBe(0);
    expect(body.facets.status).toEqual({ paid: 0, pending: 0, failed: 0, refunded: 0 });
    expect(Object.keys(body.facets.category)).toHaveLength(5);
  });

  it('filters by time: from is inclusive, before is exclusive, facets follow', async () => {
    const cut = (all[40] as Transaction).date;
    const older = all.filter((t) => t.date < cut);
    const body = await page(`before=${encodeURIComponent(cut)}&pageSize=100`);
    expect(body.total).toBe(older.length);
    expect(body.transactions.every((t) => t.date < cut)).toBe(true);
    const since = await page(`from=${encodeURIComponent(cut)}&pageSize=100`);
    expect(since.total).toBe(all.length - older.length);
    // a day, as a date: 'from' includes the whole day, 'before' the next day's start excludes it
    const day = cut.slice(0, 10);
    const sameDay = all.filter((t) => t.date.startsWith(day));
    const next = new Date(Date.parse(`${day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
    const one = await page(`from=${day}&before=${next}&pageSize=100`);
    expect(one.total).toBe(sameDay.length);
    expect(Object.values(one.facets.status).reduce((a, b) => a + b, 0)).toBe(sameDay.length);
  });

  it('is safe against injection in every parameter', async () => {
    expect((await page(`q=${encodeURIComponent("'; DROP TABLE transactions; --")}`)).total).toBe(0);
    expect((await get('/api/transactions?sort=date;DROP')).status).toBe(400);
    expect((await get('/api/transactions')).status).toBe(200);
  });
});

describe('table mode rejects bad input with 400', () => {
  it.each([
    ['pageSize=101', 'invalid_page_size'],
    ['pageSize=0', 'invalid_page_size'],
    ['pageSize=abc', 'invalid_page_size'],
    ['page=0', 'invalid_page'],
    ['page=-1', 'invalid_page'],
    ['page=1.5', 'invalid_page'],
    ['sort=nope', 'invalid_sort'],
    ['sort=-nope', 'invalid_sort'],
    ['sort=date,-date', 'invalid_sort'],
    ['status=paid,bogus', 'invalid_status'],
    ['category=Food', 'invalid_category'],
    [`q=${'x'.repeat(101)}`, 'invalid_q'],
    ['from=yesterday', 'invalid_from'],
    ['before=2026-13-45', 'invalid_before'],
    ["from=2026-10-01'; DROP TABLE transactions; --", 'invalid_from'],
    ['from=2026-10-05&before=2026-10-01', 'invalid_range'],
  ])('%s -> %s', async (qs, code) => {
    const res = await get(`/api/transactions?${qs}`);
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe(code);
  });

  it('needs a signed-in user', async () => {
    expect((await get('/api/transactions?page=1', '')).status).toBe(401);
  });
});

describe('GET /api/transactions/:id', () => {
  it('returns the record with the same customer’s other transactions', async () => {
    const first = all[0] as Transaction;
    const res = await get(`/api/transactions/${encodeURIComponent(first.id)}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as TransactionDetailResponse;
    expect(body.transaction).toEqual(first);
    const others = all.filter((t) => t.customer === first.customer && t.id !== first.id);
    expect(body.relatedCount).toBe(others.length);
    expect(body.related.map((t) => t.id)).toEqual(others.slice(0, 5).map((t) => t.id));
  });

  it('404s on an unknown id', async () => {
    const res = await get('/api/transactions/nope');
    expect(res.status).toBe(404);
    expect(await errorCode(res)).toBe('transaction_not_found');
  });

  it('needs a signed-in user', async () => {
    expect((await get(`/api/transactions/${(all[0] as Transaction).id}`, '')).status).toBe(401);
  });

  it('rejects other methods with 405', async () => {
    const res = await fetch(`${app.base}/api/transactions/x`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: '{}',
    });
    expect(res.status).toBe(405);
  });
});
