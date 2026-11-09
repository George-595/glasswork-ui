/* Server-sent events, the reading side: one parser for the browser (the assistant's
   fetch stream) and the server (the Anthropic and Gemini streams). Pure: it takes
   text or a byte stream and gives events; it opens no connection.

   The wire format (WHATWG HTML 9.2): lines end in \n, \r or \r\n; a blank line ends an
   event; `field: value` lines set event / data / id / retry; a line starting with `:` is a
   comment (heartbeats); several `data:` lines join with \n. An event with no data line is
   not delivered. A last event that is not followed by a blank line is dropped, as in a
   browser: the stream was cut. */

export interface SseEvent {
  /** The `event:` field, 'message' when absent. */
  event: string;
  data: string;
  id?: string;
  retry?: number;
}

export interface SseParser {
  /** Feeds text. Chunks may split anywhere: mid-line, mid-field, between \r and \n. */
  push(chunk: string): void;
  /** The stream ended: nothing more will come. Drops a half-received event. */
  end(): void;
}

export function createSseParser(onEvent: (event: SseEvent) => void): SseParser {
  let buffer = '';
  let started = false;
  let event = '';
  let data: string[] = [];
  let id: string | undefined;
  let retry: number | undefined;

  function reset(): void {
    event = '';
    data = [];
    id = undefined;
    retry = undefined;
  }

  function dispatch(): void {
    if (data.length > 0) {
      const out: SseEvent = { event: event === '' ? 'message' : event, data: data.join('\n') };
      if (id !== undefined) out.id = id;
      if (retry !== undefined) out.retry = retry;
      onEvent(out);
    }
    reset();
  }

  function line(text: string): void {
    if (text === '') {
      dispatch();
      return;
    }
    if (text.startsWith(':')) return;
    const colon = text.indexOf(':');
    const field = colon === -1 ? text : text.slice(0, colon);
    let value = colon === -1 ? '' : text.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
    else if (field === 'id') {
      if (!value.includes('\0')) id = value;
    } else if (field === 'retry' && /^\d+$/.test(value)) retry = Number(value);
  }

  return {
    push(chunk) {
      buffer += chunk;
      if (!started && buffer.length > 0) {
        started = true;
        if (buffer.startsWith('﻿')) buffer = buffer.slice(1);
      }
      for (;;) {
        const end = buffer.search(/[\r\n]/);
        if (end === -1) return;
        // A \r at the very end may be the first half of \r\n: wait for the next chunk.
        if (buffer[end] === '\r' && end === buffer.length - 1) return;
        const next = buffer[end] === '\r' && buffer[end + 1] === '\n' ? end + 2 : end + 1;
        const text = buffer.slice(0, end);
        buffer = buffer.slice(next);
        line(text);
      }
    },
    end() {
      // A trailing \r that waited for a \n is a complete line ending.
      if (buffer.endsWith('\r')) line(buffer.slice(0, -1));
      buffer = '';
      reset();
    },
  };
}

/* Reads a byte stream (a fetch body) as events. Stops when the stream ends or the
   consumer stops iterating; the reader is cancelled either way, which closes the
   connection. Decoding keeps a multi-byte character that a chunk splits in half. */
export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const queue: SseEvent[] = [];
  const parser = createSseParser((e) => queue.push(e));
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
      while (queue.length > 0) yield queue.shift() as SseEvent;
    }
    parser.push(decoder.decode());
    parser.end();
    while (queue.length > 0) yield queue.shift() as SseEvent;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
