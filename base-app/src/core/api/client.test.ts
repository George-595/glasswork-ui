import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiGet, apiPost, apiPut, onMaintenance } from './client';
import { api } from './endpoints';

afterEach(() => {
  vi.unstubAllGlobals();
});

type FetchImpl = (url: string, init: RequestInit | undefined) => Promise<Response>;

function stubFetch(impl: FetchImpl) {
  const spy = vi.fn<FetchImpl>(impl);
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('apiGet', () => {
  it('returns the parsed JSON on success, under the API base', async () => {
    const spy = stubFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(apiGet<{ ok: boolean }>('/health')).resolves.toEqual({ ok: true });
    expect(spy.mock.calls[0]?.[0]).toBe('/api/health');
  });

  it('maps an error envelope to ApiError with the server code', async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({ ok: false, error: { code: 'db_unavailable', message: 'down' } }),
          { status: 503 },
        ),
    );
    const err = await apiGet('/db/ping').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 503, code: 'db_unavailable', message: 'down' });
  });

  it('falls back to http_error when a failure has no envelope', async () => {
    stubFetch(async () => new Response('<html>', { status: 502 }));
    const err = await apiGet('/health').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, code: 'http_error' });
  });

  it('maps a network rejection to code network with status 0', async () => {
    stubFetch(async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await apiGet('/health').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 0, code: 'network' });
  });
});

describe('apiPost', () => {
  it('sends a JSON body with the content-type header', async () => {
    const spy = stubFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await apiPost('/llm/complete', { prompt: 'hi' });
    const init = spy.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"prompt":"hi"}');
    expect(new Headers(init?.headers).get('content-type')).toBe('application/json');
  });
});

describe('api endpoints', () => {
  it('calls the documented routes', async () => {
    const spy = stubFetch(async () => new Response('{"ok":true}', { status: 200 }));
    await api.health();
    await api.dbPing();
    expect(spy.mock.calls.map((c) => c[0])).toEqual(['/api/health', '/api/db/ping']);
  });
});

describe('maintenance', () => {
  const answer = (code: string) => async () =>
    new Response(JSON.stringify({ ok: false, error: { code, message: 'Soon' } }), { status: 503 });

  it('announces a 503 maintenance answer, and only that', async () => {
    const heard = vi.fn<() => void>();
    const stop = onMaintenance(heard);
    stubFetch(answer('maintenance'));
    const err = await apiGet('/transactions').catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 503, code: 'maintenance', message: 'Soon' });
    expect(heard).toHaveBeenCalledOnce();

    stubFetch(answer('db_unavailable'));
    await apiGet('/db/ping').catch(() => undefined);
    expect(heard).toHaveBeenCalledOnce();

    stop();
    stubFetch(answer('maintenance'));
    await apiGet('/transactions').catch(() => undefined);
    expect(heard).toHaveBeenCalledOnce();
  });

  it('apiPut sends a PUT with a JSON body', async () => {
    const spy = stubFetch(async () => new Response('{"ok":true}', { status: 200 }));
    await apiPut('/settings', { a: 1 });
    expect(spy.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(spy.mock.calls[0]?.[1]?.body).toBe('{"a":1}');
  });
});

describe('deadlines (a stalled request on a phone outdoors)', () => {
  /** A fetch that never answers until its signal aborts, as a dropped radio does. */
  const hang: FetchImpl = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
    });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives up on a JSON request after 20 s, as a lost connection with the plain words', async () => {
    vi.useFakeTimers();
    stubFetch(hang);
    const pending = apiPost('/transactions', {}).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(19_999);
    let settled = false;
    void pending.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const err = await pending;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 0,
      code: 'timeout',
      message: 'This is taking too long. Check your connection and tap Try again.',
    });
  });

  it('waits 60 s for an upload, and as long as a caller with a slower job asks for', async () => {
    vi.useFakeTimers();
    stubFetch(hang);
    const upload = api.uploadAvatar(new File(['x'], 'me.png', { type: 'image/png' }));
    const settledUpload = upload.catch((e: unknown) => e);
    const slow = apiGet('/reports', { timeoutMs: 90_000 }).catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(59_999);
    await vi.advanceTimersByTimeAsync(1);
    expect(await settledUpload).toMatchObject({ status: 0, code: 'timeout' });
    let read = false;
    void slow.then(() => {
      read = true;
    });
    await vi.advanceTimersByTimeAsync(29_000);
    expect(read).toBe(false); // its own, longer deadline
    await vi.advanceTimersByTimeAsync(1_000);
    expect(await slow).toMatchObject({ status: 0, code: 'timeout' });
  });

  it("counts a body that stalls after the headers, and leaves the caller's own abort alone", async () => {
    vi.useFakeTimers();
    stubFetch(async (_url, init) => {
      const body = new ReadableStream({
        start(controller) {
          init?.signal?.addEventListener('abort', () => controller.error(init.signal?.reason));
        },
      });
      return new Response(body, { status: 200 });
    });
    const stalled = apiGet('/transactions').catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20_000);
    expect(await stalled).toMatchObject({ status: 0, code: 'timeout' });

    stubFetch(hang);
    const mine = new AbortController();
    const aborted = apiGet('/transactions', { signal: mine.signal }).catch((e: unknown) => e);
    mine.abort();
    const err = await aborted;
    expect(err).not.toBeInstanceOf(ApiError);
    expect((err as Error).name).toBe('AbortError');
  });

  it('clears its timer once the answer is read', async () => {
    vi.useFakeTimers();
    stubFetch(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    await expect(apiGet('/health')).resolves.toEqual({ ok: true });
    expect(vi.getTimerCount()).toBe(0);
  });
});
