import { describe, expect, it } from 'vitest';
import { createAnthropicClient } from './anthropic.ts';
import { createGeminiClient } from './gemini.ts';
import { LlmError, type LlmStreamEvent } from './types.ts';

const KEY = 'sk-ant-api03-TESTKEY-do-not-leak';

/* A response whose body arrives in the given pieces, one per read, so the tests can cut
   the text in the middle of a line, a field name or a multi-byte character. */
function streamOf(pieces: (string | Uint8Array)[], init?: ResponseInit): Response {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream<Uint8Array>({
      async start(controller) {
        for (const p of pieces) {
          controller.enqueue(typeof p === 'string' ? encoder.encode(p) : p);
          await Promise.resolve();
        }
        controller.close();
      },
    }),
    { status: 200, headers: { 'content-type': 'text/event-stream' }, ...init },
  );
}

/* Cuts text into pieces of `size` bytes, wherever that lands. */
function sliced(text: string, size: number): Uint8Array[] {
  const bytes = new TextEncoder().encode(text);
  const out: Uint8Array[] = [];
  for (let i = 0; i < bytes.length; i += size) out.push(bytes.slice(i, i + size));
  return out;
}

interface Seen {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  signal: AbortSignal | undefined;
}
function stub(reply: () => Response, seen: Seen[] = []): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    seen.push({
      url: String(input),
      headers: init?.headers as Record<string, string>,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
      signal: init?.signal ?? undefined,
    });
    return reply();
  }) as typeof fetch;
}

async function collect(stream: AsyncIterable<LlmStreamEvent>): Promise<LlmStreamEvent[]> {
  const out: LlmStreamEvent[] = [];
  for await (const e of stream) out.push(e);
  return out;
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

const ANTHROPIC_STREAM = [
  sse('message_start', {
    type: 'message_start',
    message: { model: 'claude-sonnet-5-5', usage: { input_tokens: 12, output_tokens: 1 } },
  }),
  sse('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'thinking', thinking: '' },
  }),
  sse('content_block_delta', {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'private reasoning' },
  }),
  sse('content_block_start', {
    type: 'content_block_start',
    index: 1,
    content_block: { type: 'text', text: '' },
  }),
  'event: ping\ndata: {"type": "ping"}\n\n',
  sse('content_block_delta', {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'text_delta', text: 'Hello, ' },
  }),
  sse('content_block_delta', {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'text_delta', text: 'café \u{1F600}\nGeorge.' },
  }),
  sse('content_block_stop', { type: 'content_block_stop', index: 1 }),
  sse('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn' },
    usage: { output_tokens: 9 },
  }),
  sse('message_stop', { type: 'message_stop' }),
].join('');

const EXPECTED_ANTHROPIC: LlmStreamEvent[] = [
  { type: 'text', text: 'Hello, ' },
  { type: 'text', text: 'café \u{1F600}\nGeorge.' },
  {
    type: 'done',
    model: 'claude-sonnet-5-5',
    stopReason: 'end_turn',
    usage: { inputTokens: 12, outputTokens: 9 },
  },
];

describe('anthropic stream', () => {
  const make = (reply: () => Response, seen: Seen[] = []) =>
    createAnthropicClient({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      fetchImpl: stub(reply, seen),
    });
  const req = { messages: [{ role: 'user' as const, content: 'hi' }], system: 'be brief' };

  it('sends the same request as complete, with stream: true', async () => {
    const seen: Seen[] = [];
    await collect(make(() => streamOf([ANTHROPIC_STREAM]), seen).stream(req));
    expect(seen[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(seen[0]?.headers).toMatchObject({
      'x-api-key': KEY,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'content-type': 'application/json',
    });
    expect(seen[0]?.body).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 16000,
      system: 'be brief',
      messages: [{ role: 'user', content: 'hi' }],
      fallbacks: 'default',
      stream: true,
    });
    expect(seen[0]?.body).not.toHaveProperty('temperature');
    expect(seen[0]?.body).not.toHaveProperty('thinking');
  });

  it('yields text deltas then done, skipping thinking and ping', async () => {
    const events = await collect(make(() => streamOf([ANTHROPIC_STREAM])).stream(req));
    expect(events).toEqual(EXPECTED_ANTHROPIC);
  });

  it('is the same at every chunk size, even through the middle of a character', async () => {
    for (const size of [1, 2, 3, 5, 7, 16, 64]) {
      const events = await collect(
        make(() => streamOf(sliced(ANTHROPIC_STREAM, size))).stream(req),
      );
      expect(events).toEqual(EXPECTED_ANTHROPIC);
    }
  });

  it('a provider error event is an LlmError without the key or the provider text in a 5xx', async () => {
    const body =
      sse('message_start', { type: 'message_start', message: { model: 'm' } }) +
      sse('content_block_delta', {
        type: 'content_block_delta',
        delta: { type: 'text_delta', text: 'Part' },
      }) +
      sse('error', {
        type: 'error',
        error: { type: 'overloaded_error', message: `Overloaded for key ${KEY}` },
      });
    const seen: LlmStreamEvent[] = [];
    let caught: unknown;
    try {
      for await (const e of make(() => streamOf([body])).stream(req)) seen.push(e);
    } catch (err) {
      caught = err;
    }
    expect(seen).toEqual([{ type: 'text', text: 'Part' }]);
    expect(caught).toBeInstanceOf(LlmError);
    expect((caught as LlmError).code).toBe('http');
    expect((caught as LlmError).message).not.toContain(KEY);
  });

  it('an HTTP error before the stream throws on the first read, redacted', async () => {
    const client = make(
      () => new Response(JSON.stringify({ error: { message: `bad key ${KEY}` } }), { status: 401 }),
    );
    await expect(collect(client.stream(req))).rejects.toMatchObject({
      code: 'http',
      status: 401,
      message: 'bad key [redacted]',
    });
  });

  it('a stream that ends before message_stop is a bad_response', async () => {
    const cut = ANTHROPIC_STREAM.slice(0, ANTHROPIC_STREAM.indexOf('event: message_delta'));
    await expect(collect(make(() => streamOf([cut])).stream(req))).rejects.toMatchObject({
      code: 'bad_response',
    });
  });

  it('a refusal stop reason is a refusal', async () => {
    const body =
      sse('message_start', { type: 'message_start', message: { model: 'm' } }) +
      sse('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'refusal', stop_details: { explanation: 'Not allowed' } },
      }) +
      sse('message_stop', { type: 'message_stop' });
    await expect(collect(make(() => streamOf([body])).stream(req))).rejects.toMatchObject({
      code: 'refusal',
      message: 'Not allowed',
    });
  });

  it('non-JSON event data is a bad_response', async () => {
    await expect(
      collect(make(() => streamOf(['data: <html>\n\n'])).stream(req)),
    ).rejects.toMatchObject({ code: 'bad_response' });
  });

  it('aborting the signal cancels the body and throws aborted', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const client = make(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              c.enqueue(
                new TextEncoder().encode(
                  sse('content_block_delta', {
                    type: 'content_block_delta',
                    delta: { type: 'text_delta', text: 'one' },
                  }),
                ),
              );
            },
            cancel() {
              cancelled = true;
            },
          }),
        ),
    );
    const seen: LlmStreamEvent[] = [];
    await expect(
      (async () => {
        for await (const e of client.stream(req, { signal: controller.signal })) {
          seen.push(e);
          controller.abort();
          throw new LlmError('aborted', 'anthropic', 'stop'); // the consumer leaves
        }
      })(),
    ).rejects.toMatchObject({ code: 'aborted' });
    expect(seen).toHaveLength(1);
    expect(cancelled).toBe(true);
  });

  it('times out when the provider goes quiet', async () => {
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      timeoutMs: 30,
      // like a real fetch: the body errors when the request is aborted
      fetchImpl: (async (_url: string, init?: RequestInit) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(c) {
              init?.signal?.addEventListener('abort', () =>
                c.error(new DOMException('aborted', 'AbortError')),
              );
            },
          }),
        )) as unknown as typeof fetch,
    });
    await expect(collect(client.stream(req))).rejects.toMatchObject({ code: 'timeout' });
  });
});

const GEMINI_CHUNKS = [
  { candidates: [{ content: { parts: [{ text: 'Hel' }] } }] },
  { candidates: [{ content: { parts: [{ thought: true, text: 'secret thoughts' }] } }] },
  { candidates: [{ content: { parts: [{ text: 'lo\nthere' }] } }] },
  {
    candidates: [{ content: { parts: [{ text: '!' }] }, finishReason: 'STOP' }],
    usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 },
  },
];
const GEMINI_STREAM = GEMINI_CHUNKS.map((c) => `data: ${JSON.stringify(c)}\r\n\r\n`).join('');
const EXPECTED_GEMINI: LlmStreamEvent[] = [
  { type: 'text', text: 'Hel' },
  { type: 'text', text: 'lo\nthere' },
  { type: 'text', text: '!' },
  {
    type: 'done',
    model: 'gemini-test',
    stopReason: 'STOP',
    usage: { inputTokens: 5, outputTokens: 3 },
  },
];

describe('gemini stream', () => {
  const make = (reply: () => Response, seen: Seen[] = []) =>
    createGeminiClient({ apiKey: KEY, model: 'gemini-test', fetchImpl: stub(reply, seen) });
  const req = { messages: [{ role: 'user' as const, content: 'hi' }] };

  it('posts to streamGenerateContent?alt=sse with the key in a header', async () => {
    const seen: Seen[] = [];
    await collect(make(() => streamOf([GEMINI_STREAM]), seen).stream(req));
    expect(seen[0]?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-test:streamGenerateContent?alt=sse',
    );
    expect(seen[0]?.url).not.toContain(KEY);
    expect(seen[0]?.headers['x-goog-api-key']).toBe(KEY);
    expect(seen[0]?.body).toMatchObject({
      contents: [{ role: 'user', parts: [{ text: 'hi' }] }],
    });
  });

  it('yields the text parts then done, at every chunk size', async () => {
    for (const size of [1, 3, 11, 10_000]) {
      const events = await collect(make(() => streamOf(sliced(GEMINI_STREAM, size))).stream(req));
      expect(events).toEqual(EXPECTED_GEMINI);
    }
  });

  it('a blocked prompt or a safety stop is a refusal', async () => {
    const blocked = `data: ${JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } })}\n\n`;
    await expect(collect(make(() => streamOf([blocked])).stream(req))).rejects.toMatchObject({
      code: 'refusal',
    });
    const stopped = `data: ${JSON.stringify({ candidates: [{ finishReason: 'SAFETY' }] })}\n\n`;
    await expect(collect(make(() => streamOf([stopped])).stream(req))).rejects.toMatchObject({
      code: 'refusal',
    });
  });

  it('an error object in the stream, an empty stream and an HTTP error are LlmErrors', async () => {
    const withError = `data: ${JSON.stringify({ error: { message: `quota for ${KEY}` } })}\n\n`;
    const err = await collect(make(() => streamOf([withError])).stream(req)).catch(
      (e: unknown) => e,
    );
    expect(err).toMatchObject({ code: 'http' });
    expect((err as LlmError).message).not.toContain(KEY);
    await expect(collect(make(() => streamOf([])).stream(req))).rejects.toMatchObject({
      code: 'bad_response',
    });
    await expect(
      collect(make(() => new Response('nope', { status: 503 })).stream(req)),
    ).rejects.toMatchObject({ code: 'http', status: 503 });
  });
});

describe('tool calls', () => {
  const tools = [
    {
      name: 'search_orders',
      description: 'Find orders.',
      inputSchema: { type: 'object', properties: { q: { type: 'string' } } },
    },
  ];
  const history = [
    { role: 'user' as const, content: 'find acme' },
    {
      role: 'assistant' as const,
      content: [
        { type: 'text' as const, text: 'Looking.' },
        {
          type: 'tool_use' as const,
          id: 'call_1',
          name: 'search_orders',
          input: { q: 'acme' },
          signature: 'sig-1',
        },
      ],
    },
    {
      role: 'user' as const,
      content: [
        {
          type: 'tool_result' as const,
          toolUseId: 'call_1',
          name: 'search_orders',
          content: '2 orders',
        },
      ],
    },
  ];

  const ANTHROPIC_TOOL_STREAM = [
    sse('message_start', {
      type: 'message_start',
      message: { model: 'claude-sonnet-5-5', usage: { input_tokens: 30 } },
    }),
    sse('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }),
    sse('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'text_delta', text: 'Checking.' },
    }),
    sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
    sse('content_block_start', {
      type: 'content_block_start',
      index: 1,
      content_block: { type: 'tool_use', id: 'toolu_9', name: 'search_orders', input: {} },
    }),
    sse('content_block_delta', {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: '{"q": "ac' },
    }),
    sse('content_block_delta', {
      type: 'content_block_delta',
      index: 1,
      delta: { type: 'input_json_delta', partial_json: 'me"}' },
    }),
    sse('content_block_stop', { type: 'content_block_stop', index: 1 }),
    sse('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use' },
      usage: { output_tokens: 20 },
    }),
    sse('message_stop', { type: 'message_stop' }),
  ].join('');

  it('anthropic: sends tools and blocks in its own shape', async () => {
    const seen: Seen[] = [];
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      fetchImpl: stub(() => streamOf([ANTHROPIC_TOOL_STREAM]), seen),
    });
    await collect(client.stream({ messages: history, tools }));
    expect(seen[0]?.body.tools).toEqual([
      {
        name: 'search_orders',
        description: 'Find orders.',
        input_schema: tools[0]?.inputSchema,
      },
    ]);
    expect(seen[0]?.body.messages).toEqual([
      { role: 'user', content: 'find acme' },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Looking.' },
          { type: 'tool_use', id: 'call_1', name: 'search_orders', input: { q: 'acme' } },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'call_1', content: '2 orders' }],
      },
    ]);
  });

  it('anthropic: a tool call is yielded whole at its block stop, at every chunk size', async () => {
    for (const size of [1, 7, 10_000]) {
      const client = createAnthropicClient({
        apiKey: KEY,
        model: 'claude-sonnet-5-5',
        fetchImpl: stub(() => streamOf(sliced(ANTHROPIC_TOOL_STREAM, size))),
      });
      expect(await collect(client.stream({ messages: history, tools }))).toEqual([
        { type: 'text', text: 'Checking.' },
        { type: 'tool_call', id: 'toolu_9', name: 'search_orders', input: { q: 'acme' } },
        {
          type: 'done',
          model: 'claude-sonnet-5-5',
          stopReason: 'tool_use',
          usage: { inputTokens: 30, outputTokens: 20 },
        },
      ]);
    }
  });

  it('anthropic: tool input that is not a JSON object is a bad_response', async () => {
    const broken = ANTHROPIC_TOOL_STREAM.replace('me\\"}', 'me');
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      fetchImpl: stub(() => streamOf([broken])),
    });
    await expect(collect(client.stream({ messages: history, tools }))).rejects.toMatchObject({
      code: 'bad_response',
    });
  });

  it('gemini: sends declarations, the call with its signature and the response', async () => {
    const seen: Seen[] = [];
    const reply = `data: ${JSON.stringify({
      candidates: [
        {
          content: {
            parts: [
              { text: 'Checking.' },
              {
                functionCall: { name: 'search_orders', args: { q: 'acme' } },
                thoughtSignature: 'sig-2',
              },
            ],
          },
          finishReason: 'STOP',
        },
      ],
      usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 },
    })}\n\n`;
    const client = createGeminiClient({
      apiKey: KEY,
      model: 'gemini-test',
      fetchImpl: stub(() => streamOf([reply]), seen),
    });
    const events = await collect(client.stream({ messages: history, tools }));
    expect(seen[0]?.body.tools).toEqual([
      {
        functionDeclarations: [
          {
            name: 'search_orders',
            description: 'Find orders.',
            parametersJsonSchema: tools[0]?.inputSchema,
          },
        ],
      },
    ]);
    expect(seen[0]?.body.contents).toEqual([
      { role: 'user', parts: [{ text: 'find acme' }] },
      {
        role: 'model',
        parts: [
          { text: 'Looking.' },
          {
            functionCall: { name: 'search_orders', args: { q: 'acme' } },
            thoughtSignature: 'sig-1',
          },
        ],
      },
      {
        role: 'user',
        parts: [{ functionResponse: { name: 'search_orders', response: { result: '2 orders' } } }],
      },
    ]);
    expect(events[0]).toEqual({ type: 'text', text: 'Checking.' });
    expect(events[1]).toMatchObject({
      type: 'tool_call',
      name: 'search_orders',
      input: { q: 'acme' },
      signature: 'sig-2',
    });
    expect((events[1] as { id: string }).id).toMatch(/^call_/);
  });
});
