import { describe, expect, it } from 'vitest';
import { createSseParser, parseSse, type SseEvent } from './sse.ts';

function parseAll(chunks: string[]): SseEvent[] {
  const out: SseEvent[] = [];
  const parser = createSseParser((e) => out.push(e));
  for (const c of chunks) parser.push(c);
  parser.end();
  return out;
}

describe('createSseParser', () => {
  it('reads named events with data', () => {
    expect(parseAll(['event: delta\ndata: {"text":"Hi"}\n\n'])).toEqual([
      { event: 'delta', data: '{"text":"Hi"}' },
    ]);
  });

  it('defaults the event name to message and keeps id and retry', () => {
    expect(parseAll(['id: 7\nretry: 3000\ndata: x\n\n'])).toEqual([
      { event: 'message', data: 'x', id: '7', retry: 3000 },
    ]);
  });

  it('joins several data lines with a newline and keeps empty ones', () => {
    expect(parseAll(['data: a\ndata:\ndata: c\n\n'])).toEqual([
      { event: 'message', data: 'a\n\nc' },
    ]);
  });

  it('strips one leading space only', () => {
    expect(parseAll(['data:  two\n\n'])[0]?.data).toBe(' two');
    expect(parseAll(['data:none\n\n'])[0]?.data).toBe('none');
  });

  it('ignores comments and events without data', () => {
    expect(parseAll([': heartbeat\n\nevent: ping\n\ndata: real\n\n'])).toEqual([
      { event: 'message', data: 'real' },
    ]);
  });

  it('handles \\r\\n and bare \\r line endings', () => {
    expect(parseAll(['data: a\r\n\r\ndata: b\r\rdata: c\n\n']).map((e) => e.data)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('is robust to every chunk boundary', () => {
    const text = ': hi\r\nevent: delta\r\ndata: one\r\ndata: two\r\n\r\nevent: done\ndata: {}\n\n';
    const whole = parseAll([text]);
    expect(whole).toHaveLength(2);
    for (let cut = 1; cut < text.length; cut++) {
      expect(parseAll([text.slice(0, cut), text.slice(cut)])).toEqual(whole);
    }
    expect(parseAll(text.split(''))).toEqual(whole);
  });

  it('drops a BOM at the start and an event that was never finished', () => {
    expect(parseAll(['﻿data: a\n\ndata: cut off'])).toEqual([{ event: 'message', data: 'a' }]);
  });

  it('ignores an id containing NUL and a non-numeric retry', () => {
    expect(parseAll(['id: a\0b\nretry: soon\ndata: x\n\n'])).toEqual([
      { event: 'message', data: 'x' },
    ]);
  });
});

const bytes = (...parts: Uint8Array[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      for (const p of parts) c.enqueue(p);
      c.close();
    },
  });

describe('parseSse', () => {
  it('yields events from a byte stream split mid-line and mid-character', async () => {
    const whole = new TextEncoder().encode('event: delta\ndata: café \u{1F600}\n\n');
    const cut = whole.indexOf(0xc3) + 1; // between the two bytes of the e-acute
    const emoji = whole.indexOf(0xf0) + 2; // inside the 4-byte emoji
    const events: SseEvent[] = [];
    for await (const e of parseSse(
      bytes(whole.slice(0, cut), whole.slice(cut, emoji), whole.slice(emoji)),
    )) {
      events.push(e);
    }
    expect(events).toEqual([{ event: 'delta', data: 'café \u{1F600}' }]);
  });

  it('cancels the stream when the consumer stops early', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(new TextEncoder().encode('data: x\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });
    for await (const _ of parseSse(body)) break;
    expect(cancelled).toBe(true);
  });
});
