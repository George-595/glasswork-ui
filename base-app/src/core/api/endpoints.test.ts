import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, transactionsQueryString } from './endpoints';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch() {
  const spy = vi.fn<(url: string) => Promise<Response>>(
    async () => new Response('{"ok":true}', { status: 200 }),
  );
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('transactionsQueryString', () => {
  it('always names page, which is what switches the server to table mode', () => {
    expect(transactionsQueryString({})).toBe('?page=1');
  });

  it('writes sort, search and facets in the wire form', () => {
    const qs = transactionsQueryString({
      page: 3,
      pageSize: 50,
      sort: ['-date', 'customer'],
      q: 'acme & co',
      status: ['paid', 'failed'],
      category: ['Travel'],
      from: '2026-10-01T00:00:00.000Z',
      before: '2026-10-08T00:00:00.000Z',
    });
    expect(Object.fromEntries(new URLSearchParams(qs))).toEqual({
      page: '3',
      pageSize: '50',
      sort: '-date,customer',
      q: 'acme & co',
      status: 'paid,failed',
      category: 'Travel',
      from: '2026-10-01T00:00:00.000Z',
      before: '2026-10-08T00:00:00.000Z',
    });
  });

  it('leaves empty filters out', () => {
    expect(transactionsQueryString({ q: '', status: [], category: [], sort: [] })).toBe('?page=1');
  });
});

describe('transaction endpoints', () => {
  it('transactionsPage calls the list route with the query', async () => {
    const spy = stubFetch();
    await api.transactionsPage({ page: 2, sort: ['-amount'] });
    expect(spy.mock.calls[0]?.[0]).toBe('/api/transactions?page=2&sort=-amount');
  });

  it('transaction encodes the id into the path', async () => {
    const spy = stubFetch();
    await api.transaction('tx 1/2');
    expect(spy.mock.calls[0]?.[0]).toBe('/api/transactions/tx%201%2F2');
  });
});

describe('user management endpoints', () => {
  it('updateUser PATCHes the user with only the fields given', async () => {
    const spy = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{"ok":true}', { status: 200 }),
    );
    vi.stubGlobal('fetch', spy);
    await api.updateUser('usr 1', { role: 'editor' });
    expect(spy.mock.calls[0]?.[0]).toBe('/api/users/usr%201');
    expect(spy.mock.calls[0]?.[1]?.method).toBe('PATCH');
    expect(spy.mock.calls[0]?.[1]?.body).toBe('{"role":"editor"}');
  });

  it('resendInvite POSTs to the user’s resend-invite route', async () => {
    const spy = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{"ok":true}', { status: 200 }),
    );
    vi.stubGlobal('fetch', spy);
    await api.resendInvite('usr_1');
    expect(spy.mock.calls[0]?.[0]).toBe('/api/users/usr_1/resend-invite');
    expect(spy.mock.calls[0]?.[1]?.method).toBe('POST');
  });
});

describe('platform endpoints', () => {
  function spyFetch() {
    const spy = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{"ok":true}', { status: 200 }),
    );
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('settings GETs, updateSettings PUTs only what it is given', async () => {
    const spy = spyFetch();
    await api.settings();
    await api.updateSettings({ 'workspace.name': 'Acme HQ' });
    expect(spy.mock.calls[0]?.[0]).toBe('/api/settings');
    expect(spy.mock.calls[1]?.[0]).toBe('/api/settings');
    expect(spy.mock.calls[1]?.[1]?.method).toBe('PUT');
    expect(spy.mock.calls[1]?.[1]?.body).toBe('{"workspace.name":"Acme HQ"}');
  });

  it('emails and email name the page and the encoded id', async () => {
    const spy = spyFetch();
    await api.emails();
    await api.emails(3, 50);
    await api.email('em 1/2');
    expect(spy.mock.calls.map((c) => c[0])).toEqual([
      '/api/admin/emails?page=1&pageSize=25',
      '/api/admin/emails?page=3&pageSize=50',
      '/api/admin/emails/em%201%2F2',
    ]);
  });

  it('jobs names the status only when given, and retryJob POSTs', async () => {
    const spy = spyFetch();
    await api.jobs();
    await api.jobs({ status: 'dead', page: 2, pageSize: 10 });
    await api.retryJob('job 1');
    expect(spy.mock.calls.map((c) => c[0])).toEqual([
      '/api/admin/jobs?page=1&pageSize=25',
      '/api/admin/jobs?status=dead&page=2&pageSize=10',
      '/api/admin/jobs/job%201/retry',
    ]);
    expect(spy.mock.calls[2]?.[1]?.method).toBe('POST');
  });
});
