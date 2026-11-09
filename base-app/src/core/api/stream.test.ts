import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from './client';
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

/* A stream response delivered in the given pieces (cut anywhere, even mid-character). */
function sse(pieces: string[]): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const piece of pieces) {
          controller.enqueue(encoder.encode(piece));
          await new Promise((r) => setTimeout(r, 0));
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' } },
  );
}

const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const DONE = { provider: 'anthropic', model: 'm-1', stopReason: 'end_turn' };

describe('api.llmStream', () => {
  it('posts the body as JSON and reports each delta, then resolves with done', async () => {
    const spy = stubFetch(async () =>
      sse([
        frame('delta', { text: 'Hello, ' }),
        frame('delta', { text: 'a\nb' }),
        frame('done', DONE),
      ]),
    );
    const got: string[] = [];
    const done = await api.llmStream({ prompt: 'hi' }, { onDelta: (t) => got.push(t) });
    expect(got).toEqual(['Hello, ', 'a\nb']);
    expect(done).toEqual(DONE);
    expect(spy.mock.calls[0]?.[0]).toBe('/api/llm/stream');
    const init = spy.mock.calls[0]?.[1];
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"prompt":"hi"}');
    expect(init?.headers).toMatchObject({
      'content-type': 'application/json',
      accept: 'text/event-stream',
    });
  });

  it('reads events cut mid-line by the network', async () => {
    const whole = frame('delta', { text: 'café' }) + frame('done', DONE);
    stubFetch(async () => sse([...whole].map((c) => c)));
    const got: string[] = [];
    await api.llmStream({ prompt: 'hi' }, { onDelta: (t) => got.push(t) });
    expect(got).toEqual(['café']);
  });

  it('an error event rejects with the server code and safe message', async () => {
    stubFetch(async () =>
      sse([
        frame('delta', { text: 'partial' }),
        frame('error', { code: 'llm_not_configured', message: 'No key', errorId: 'e1' }),
      ]),
    );
    const got: string[] = [];
    const err = await api
      .llmStream({ prompt: 'hi' }, { onDelta: (t) => got.push(t) })
      .catch((e: unknown) => e);
    expect(got).toEqual(['partial']);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: 'llm_not_configured', message: 'No key' });
  });

  it('a failure before the stream is the usual envelope ApiError', async () => {
    stubFetch(
      async () =>
        new Response(
          JSON.stringify({ ok: false, error: { code: 'rate_limited', message: 'Slow down' } }),
          {
            status: 429,
          },
        ),
    );
    const err = await api
      .llmStream({ prompt: 'hi' }, { onDelta: () => {} })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 429, code: 'rate_limited', message: 'Slow down' });
  });

  it('a stream that ends without done is an error, not a silent success', async () => {
    stubFetch(async () => sse([frame('delta', { text: 'cut' })]));
    const err = await api
      .llmStream({ prompt: 'hi' }, { onDelta: () => {} })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'stream_ended' });
  });

  it('a dropped connection mid-stream is a network ApiError', async () => {
    stubFetch(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(new TextEncoder().encode(frame('delta', { text: 'x' })));
              c.error(new TypeError('terminated'));
            },
          }),
        ),
    );
    const err = await api
      .llmStream({ prompt: 'hi' }, { onDelta: () => {} })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 0, code: 'network' });
  });

  it('aborting the signal stops the read and rejects with the abort, not an ApiError', async () => {
    const controller = new AbortController();
    let cancelled = false;
    stubFetch(
      async (_url, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(new TextEncoder().encode(frame('delta', { text: 'one' })));
              init?.signal?.addEventListener('abort', () =>
                c.error(new DOMException('aborted', 'AbortError')),
              );
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
    );
    const got: string[] = [];
    const run = api.llmStream(
      { prompt: 'hi' },
      {
        signal: controller.signal,
        onDelta: (t) => {
          got.push(t);
          controller.abort();
        },
      },
    );
    const err = await run.catch((e: unknown) => e);
    expect(got).toEqual(['one']);
    expect(err).not.toBeInstanceOf(ApiError);
    expect((err as Error).name).toBe('AbortError');
    expect(cancelled || controller.signal.aborted).toBe(true);
  });
});
