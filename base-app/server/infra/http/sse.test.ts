import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { frameSse, openSse } from './sse.ts';

/* A response and a socket that record what the writer does to them. */
function fake() {
  const socket = {
    setTimeout: vi.fn<(ms: number) => void>(),
    setNoDelay: vi.fn<(on: boolean) => void>(),
    setKeepAlive: vi.fn<(on: boolean) => void>(),
  };
  const req = { socket } as unknown as IncomingMessage;
  const emitter = new EventEmitter();
  const state = {
    head: undefined as undefined | [number, Record<string, string>],
    writes: [] as string[],
  };
  const res = Object.assign(emitter, {
    writableEnded: false,
    writableNeedDrain: false,
    destroyed: false,
    // false = the kernel buffer is full; the 'drain' event says it emptied
    accept: true,
    writeHead: vi.fn<(status: number, headers: Record<string, string>) => void>(
      (status: number, headers: Record<string, string>) => {
        state.head = [status, headers];
      },
    ),
    flushHeaders: vi.fn<() => void>(),
    write: vi.fn<(chunk: string) => boolean>(function (this: { accept: boolean }, chunk: string) {
      state.writes.push(chunk);
      return this.accept;
    }),
    end: vi.fn<() => void>(function (this: { writableEnded: boolean }) {
      this.writableEnded = true;
    }),
  });
  return { req, res, resTyped: res as unknown as ServerResponse, socket, state };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('frameSse', () => {
  it('frames id, event and data, ending in a blank line', () => {
    expect(frameSse({ id: '4', event: 'delta', data: 'hi' })).toBe(
      'id: 4\nevent: delta\ndata: hi\n\n',
    );
  });

  it('splits multi-line data into one data: line each, whatever the line ending', () => {
    expect(frameSse({ data: 'a\nb\r\nc\rd' })).toBe('data: a\ndata: b\ndata: c\ndata: d\n\n');
    expect(frameSse({ data: 'a\n' })).toBe('data: a\ndata: \n\n');
  });

  it('sends objects as one line of JSON', () => {
    expect(frameSse({ event: 'done', data: { text: 'a\nb' } })).toBe(
      'event: done\ndata: {"text":"a\\nb"}\n\n',
    );
  });

  it('cannot be made to start a second field through event or id', () => {
    expect(frameSse({ event: 'x\ndata: forged', id: '1\r\nevent: y', data: 'ok' })).toBe(
      'id: 1 event: y\nevent: x data: forged\ndata: ok\n\n',
    );
  });
});

describe('openSse', () => {
  it('writes the stream headers and flushes them, with no content-length', () => {
    const { req, resTyped, res, socket } = fake();
    openSse(req, resTyped, { headers: { 'x-request-id': 'r1' } });
    const [status, headers] = res.writeHead.mock.calls[0] ?? [];
    expect(status).toBe(200);
    expect(headers).toMatchObject({
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      'x-content-type-options': 'nosniff',
      'x-request-id': 'r1',
    });
    expect(Object.keys(headers ?? {})).not.toContain('content-length');
    expect(res.flushHeaders).toHaveBeenCalledOnce();
    expect(socket.setTimeout).toHaveBeenCalledWith(0);
    expect(socket.setNoDelay).toHaveBeenCalledWith(true);
  });

  it('can tell EventSource how long to wait before reconnecting', () => {
    const { req, resTyped, state } = fake();
    openSse(req, resTyped, { retryMs: 2500 });
    expect(state.writes).toEqual(['retry: 2500\n\n']);
  });

  it('send writes the frame', async () => {
    const { req, resTyped, state } = fake();
    const sse = openSse(req, resTyped);
    await sse.send({ event: 'delta', data: 'a\nb' });
    expect(state.writes).toEqual(['event: delta\ndata: a\ndata: b\n\n']);
    await sse.comment('hello\nworld');
    expect(state.writes.at(-1)).toBe(': hello world\n\n');
  });

  it('waits for drain when the socket is backed up, then goes on', async () => {
    const { req, resTyped, res } = fake();
    const sse = openSse(req, resTyped);
    res.accept = false;
    let done = false;
    const pending = sse.send({ data: 'big' }).then(() => {
      done = true;
    });
    await Promise.resolve();
    expect(done).toBe(false);
    res.emit('drain');
    await pending;
    expect(done).toBe(true);
  });

  it('a send waiting on drain is released when the client leaves', async () => {
    const { req, resTyped, res } = fake();
    const sse = openSse(req, resTyped);
    res.accept = false;
    const pending = sse.send({ data: 'x' });
    res.emit('close');
    await expect(pending).resolves.toBeUndefined();
  });

  it('beats on an interval with a comment, skips a backed-up socket, and never keeps the process alive', () => {
    vi.useFakeTimers();
    const { req, resTyped, res, state } = fake();
    const unref = vi.spyOn(globalThis, 'setInterval');
    openSse(req, resTyped, { heartbeatMs: 1000 });
    expect(unref).toHaveBeenCalledOnce();
    const timer = unref.mock.results[0]?.value as { hasRef: () => boolean };
    expect(timer.hasRef()).toBe(false);
    vi.advanceTimersByTime(2500);
    expect(state.writes).toEqual([': keep-alive\n\n', ': keep-alive\n\n']);
    res.writableNeedDrain = true;
    vi.advanceTimersByTime(1000);
    expect(state.writes).toHaveLength(2);
  });

  it('heartbeatMs 0 turns the heartbeat off', () => {
    vi.useFakeTimers();
    const { req, resTyped, state } = fake();
    openSse(req, resTyped, { heartbeatMs: 0 });
    vi.advanceTimersByTime(120_000);
    expect(state.writes).toEqual([]);
  });

  it('a client disconnect aborts the signal, stops the heartbeat and ignores later sends', async () => {
    vi.useFakeTimers();
    const { req, resTyped, res, state } = fake();
    const sse = openSse(req, resTyped, { heartbeatMs: 1000 });
    const aborted = vi.fn<() => void>();
    sse.signal.addEventListener('abort', aborted);
    expect(sse.closed).toBe(false);
    res.emit('close');
    expect(aborted).toHaveBeenCalledOnce();
    expect(sse.signal.aborted).toBe(true);
    expect(sse.closed).toBe(true);
    vi.advanceTimersByTime(5000);
    await sse.send({ data: 'late' });
    expect(state.writes).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('close ends the response once and is idempotent', () => {
    const { req, resTyped, res } = fake();
    const sse = openSse(req, resTyped);
    sse.close();
    sse.close();
    expect(res.end).toHaveBeenCalledOnce();
    expect(sse.closed).toBe(true);
    expect(sse.signal.aborted).toBe(true);
  });
});
