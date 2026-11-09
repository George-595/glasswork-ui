/* POST /api/llm/stream end to end: a real HTTP server on loopback, the fake LLM, and the
   client's own parser reading the response. */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { parseSse, type SseEvent } from '../lib/sse.ts';
import { LlmError, type LlmStreamEvent } from './infra/llm/types.ts';
import { ORIGIN, startTestApp, type TestApp, VIEWER_EMAIL, VIEWER_PASSWORD } from './testing.ts';

let app: TestApp;
let viewer = '';
let admin = '';
let restore: TestApp['llm']['stream'];

beforeAll(async () => {
  app = await startTestApp();
  restore = app.llm.stream;
  viewer = await app.signIn(VIEWER_EMAIL, VIEWER_PASSWORD);
  admin = await app.signIn();
});
afterAll(() => app.close());

const post = (body: unknown, cookie?: string, signal?: AbortSignal) =>
  fetch(`${app.base}/api/llm/stream`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: ORIGIN, ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  });

async function readAll(res: Response): Promise<SseEvent[]> {
  const out: SseEvent[] = [];
  if (res.body) for await (const e of parseSse(res.body)) out.push(e);
  return out;
}

const text = (t: string): LlmStreamEvent => ({ type: 'text', text: t });
const done: LlmStreamEvent = {
  type: 'done',
  model: 'm-1',
  stopReason: 'end_turn',
  usage: { inputTokens: 3, outputTokens: 4 },
};

describe('POST /api/llm/stream', () => {
  it('streams delta events then done, with the stream headers', async () => {
    app.llm.stream = restore;
    const res = await post({ prompt: 'ping' }, viewer);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache, no-transform');
    expect(res.headers.get('x-accel-buffering')).toBe('no');
    expect(res.headers.get('x-request-id')).toBeTruthy();
    const events = await readAll(res);
    expect(events.map((e) => e.event)).toEqual(['delta', 'delta', 'done']);
    expect(events.map((e) => JSON.parse(e.data))).toEqual([
      { text: 'po' },
      { text: 'ng' },
      {
        provider: 'anthropic',
        model: 'fake-1',
        stopReason: 'end_turn',
        usage: { inputTokens: 1, outputTokens: 2 },
      },
    ]);
    expect(app.llmCalls.at(-1)).toMatchObject({ messages: [{ role: 'user', content: 'ping' }] });
  });

  it('keeps newlines inside a delta intact', async () => {
    app.llm.stream = async function* () {
      yield text('line one\nline two\n\n');
      yield done;
    };
    const events = await readAll(await post({ prompt: 'x' }, viewer));
    expect(JSON.parse(events[0]?.data ?? '{}')).toEqual({ text: 'line one\nline two\n\n' });
  });

  it('refuses what complete refuses, as the ordinary JSON envelope', async () => {
    expect((await post({ prompt: 'x' })).status).toBe(401);
    const bad = await post({}, viewer);
    expect(bad.status).toBe(400);
    expect(bad.headers.get('content-type')).toContain('application/json');
    expect(((await bad.json()) as { error: { code: string } }).error.code).toBe('invalid_body');
    const wrongType = await fetch(`${app.base}/api/llm/stream`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', origin: ORIGIN, cookie: viewer },
      body: 'hi',
    });
    expect(wrongType.status).toBe(415);
    const foreign = await fetch(`${app.base}/api/llm/stream`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: 'https://evil.example',
        cookie: viewer,
      },
      body: '{"prompt":"x"}',
    });
    expect(foreign.status).toBe(403);
  });

  it('turns a failure into an error event with a safe message and an errorId', async () => {
    const cases: [LlmError, string][] = [
      [new LlmError('refusal', 'anthropic', 'no'), 'refusal'],
      [new LlmError('timeout', 'anthropic', 'slow'), 'timeout'],
      [new LlmError('http', 'anthropic', 'upstream secret sk-ant-123', 500), 'upstream_error'],
      [new LlmError('bad_response', 'anthropic', 'upstream secret sk-ant-123'), 'upstream_error'],
    ];
    for (const [err, code] of cases) {
      // some text first, then the failure: the partial text must still arrive
      app.llm.stream = async function* () {
        yield text('partial');
        throw err;
      };
      const res = await post({ prompt: 'x' }, viewer);
      expect(res.status).toBe(200);
      const events = await readAll(res);
      expect(events.map((e) => e.event)).toEqual(['delta', 'error']);
      const body = JSON.parse(events[1]?.data ?? '{}') as {
        code: string;
        message: string;
        errorId: string;
      };
      expect(body.code).toBe(code);
      expect(body.errorId).toBe(res.headers.get('x-request-id'));
      expect(JSON.stringify(body)).not.toContain('secret');
    }
  });

  it('a missing key is an error event the page can recognise', async () => {
    app.llm.stream = () => {
      throw new LlmError('config', 'anthropic', 'ANTHROPIC_API_KEY is not set');
    };
    const events = await readAll(await post({ prompt: 'x' }, viewer));
    expect(events.map((e) => e.event)).toEqual(['error']);
    expect(JSON.parse(events[0]?.data ?? '{}').code).toBe('llm_not_configured');
  });

  it('an unexpected error is a generic message with the errorId logged', async () => {
    app.llm.stream = async function* () {
      yield text('x');
      throw new Error('db password is hunter2');
    };
    const res = await post({ prompt: 'x' }, viewer);
    const events = await readAll(res);
    const body = JSON.parse(events.at(-1)?.data ?? '{}') as {
      code: string;
      message: string;
      errorId: string;
    };
    expect(body.code).toBe('internal_error');
    expect(JSON.stringify(body)).not.toContain('hunter2');
    expect(app.logs.some((l) => l.errorId === body.errorId && l.level === 'error')).toBe(true);
  });

  it('aborts the upstream call when the client disconnects, and frees the quota slot', async () => {
    let upstreamAborted = false;
    app.llm.stream = async function* (_req, signal) {
      yield text('first');
      await new Promise<void>((resolve) => {
        signal?.addEventListener('abort', () => {
          upstreamAborted = true;
          resolve();
        });
      });
    };
    const controller = new AbortController();
    const res = await post({ prompt: 'x' }, admin, controller.signal);
    const reader = res.body?.getReader();
    await reader?.read(); // the first delta has arrived
    controller.abort();
    await vi.waitFor(() => expect(upstreamAborted).toBe(true));

    // the slot is back: two more concurrent streams are admitted (the limit is 2)
    app.llm.stream = restore;
    const a = await post({ prompt: 'x' }, admin);
    const b = await post({ prompt: 'x' }, admin);
    expect([a.status, b.status]).toEqual([200, 200]);
    await Promise.all([readAll(a), readAll(b)]);
  });

  it('shares the in-flight limit with complete: a third open stream is 429', async () => {
    const release: (() => void)[] = [];
    app.llm.stream = async function* () {
      await new Promise<void>((resolve) => release.push(resolve));
      yield done;
    };
    const cookie = await app.signIn();
    const a = await post({ prompt: 'x' }, cookie);
    const b = await post({ prompt: 'x' }, cookie);
    expect([a.status, b.status]).toEqual([200, 200]);
    const c = await post({ prompt: 'x' }, cookie);
    expect(c.status).toBe(429);
    for (const r of release) r();
    await Promise.all([readAll(a), readAll(b)]);
  });
});
