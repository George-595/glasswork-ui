import { describe, expect, it } from 'vitest';
import { createAnthropicClient } from './anthropic.ts';
import { LlmError } from './types.ts';

const KEY = 'sk-ant-api03-TESTKEY-do-not-leak';

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function recordingFetch(reply: () => Response, captured: Captured[]): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = init?.headers as Record<string, string>;
    captured.push({
      url: String(input),
      headers,
      body: JSON.parse(String(init?.body)) as Record<string, unknown>,
    });
    return reply();
  }) as typeof fetch;
}

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const OK_MESSAGE = {
  model: 'claude-sonnet-5-5',
  stop_reason: 'end_turn',
  content: [
    { type: 'thinking', thinking: 'private reasoning' },
    { type: 'text', text: 'Hello, ' },
    { type: 'fallback', from: 'x' },
    { type: 'text', text: 'George.' },
  ],
  usage: { input_tokens: 12, output_tokens: 7 },
};

describe('createAnthropicClient request shape', () => {
  it('posts to the Messages API with the beta header and fallbacks for sonnet', async () => {
    const captured: Captured[] = [];
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      fetchImpl: recordingFetch(() => json(200, OK_MESSAGE), captured),
    });

    await client.complete({ system: 'Be brief.', messages: [{ role: 'user', content: 'hi' }] });

    const call = captured[0];
    expect(call?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(call?.headers['x-api-key']).toBe(KEY);
    expect(call?.headers['anthropic-version']).toBe('2023-06-01');
    expect(call?.headers['anthropic-beta']).toBe('server-side-fallback-2026-07-01');
    expect(call?.body).toEqual({
      model: 'claude-sonnet-5-5',
      max_tokens: 16000,
      messages: [{ role: 'user', content: 'hi' }],
      system: 'Be brief.',
      fallbacks: 'default',
    });
  });

  it('never sends temperature or thinking', async () => {
    const captured: Captured[] = [];
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-opus-5-5',
      fetchImpl: recordingFetch(() => json(200, OK_MESSAGE), captured),
    });
    await client.complete({ messages: [{ role: 'user', content: 'hi' }], maxTokens: 50 });
    expect(captured[0]?.body).not.toHaveProperty('temperature');
    expect(captured[0]?.body).not.toHaveProperty('thinking');
    expect(captured[0]?.body.max_tokens).toBe(50);
  });

  it('omits the beta header and the fallbacks field for haiku', async () => {
    const captured: Captured[] = [];
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-haiku-5-5',
      fallbacks: 'default',
      fetchImpl: recordingFetch(() => json(200, OK_MESSAGE), captured),
    });
    await client.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(captured[0]?.headers).not.toHaveProperty('anthropic-beta');
    expect(captured[0]?.body).not.toHaveProperty('fallbacks');
  });

  it('omits the beta header and the fallbacks field when fallbacks are off', async () => {
    const captured: Captured[] = [];
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      fallbacks: 'off',
      fetchImpl: recordingFetch(() => json(200, OK_MESSAGE), captured),
    });
    await client.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(captured[0]?.headers).not.toHaveProperty('anthropic-beta');
    expect(captured[0]?.body).not.toHaveProperty('fallbacks');
    expect(captured[0]?.body).not.toHaveProperty('system');
  });
});

describe('createAnthropicClient response handling', () => {
  it('joins text blocks only and maps usage and model', async () => {
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      fetchImpl: recordingFetch(() => json(200, OK_MESSAGE), []),
    });
    const result = await client.complete({ messages: [{ role: 'user', content: 'hi' }] });
    expect(result).toEqual({
      text: 'Hello, George.',
      provider: 'anthropic',
      model: 'claude-sonnet-5-5',
      stopReason: 'end_turn',
      usage: { inputTokens: 12, outputTokens: 7 },
      toolCalls: [],
    });
  });

  it('maps stop_reason refusal to LlmError refusal', async () => {
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      fetchImpl: recordingFetch(
        () =>
          json(200, {
            model: 'claude-sonnet-5-5',
            stop_reason: 'refusal',
            stop_details: { explanation: 'Cannot help with that.' },
            content: [],
          }),
        [],
      ),
    });
    const err = await client
      .complete({ messages: [{ role: 'user', content: 'x' }] })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LlmError);
    expect((err as LlmError).code).toBe('refusal');
    expect((err as LlmError).message).toBe('Cannot help with that.');
  });

  it('maps a 401 to LlmError http with the status and no key in the message', async () => {
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      fetchImpl: recordingFetch(
        () => json(401, { error: { message: `invalid x-api-key ${KEY}` } }),
        [],
      ),
    });
    const err = (await client
      .complete({ messages: [{ role: 'user', content: 'x' }] })
      .catch((e: unknown) => e)) as LlmError;
    expect(err.code).toBe('http');
    expect(err.status).toBe(401);
    expect(err.message).toContain('[redacted]');
    expect(err.message).not.toContain(KEY);
  });

  it('truncates a long provider message to 300 characters', async () => {
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      fetchImpl: recordingFetch(() => json(400, { error: { message: 'e'.repeat(1000) } }), []),
    });
    const err = (await client
      .complete({ messages: [{ role: 'user', content: 'x' }] })
      .catch((e: unknown) => e)) as LlmError;
    expect(err.message.length).toBeLessThanOrEqual(303);
  });

  it('maps a non-JSON 200 to bad_response', async () => {
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      fetchImpl: recordingFetch(() => new Response('<html>oops</html>', { status: 200 }), []),
    });
    const err = (await client
      .complete({ messages: [{ role: 'user', content: 'x' }] })
      .catch((e: unknown) => e)) as LlmError;
    expect(err.code).toBe('bad_response');
  });

  it('maps an aborted request to LlmError timeout', async () => {
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      timeoutMs: 5,
      fetchImpl: ((_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        })) as typeof fetch,
    });
    const err = (await client
      .complete({ messages: [{ role: 'user', content: 'x' }] })
      .catch((e: unknown) => e)) as LlmError;
    expect(err).toBeInstanceOf(LlmError);
    expect(err.code).toBe('timeout');
  });

  it('refuses to build without a key, naming the variable', () => {
    expect(() => createAnthropicClient({ apiKey: '', model: 'claude-sonnet-5-5' })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
    expect(() => createAnthropicClient({ apiKey: '', model: 'claude-sonnet-5-5' })).toThrow(
      LlmError,
    );
  });
});

describe('createAnthropicClient tool calls', () => {
  it('returns tool_use blocks as toolCalls and the text beside them', async () => {
    const client = createAnthropicClient({
      apiKey: KEY,
      model: 'claude-sonnet-5-5',
      fetchImpl: recordingFetch(
        () =>
          json(200, {
            model: 'claude-sonnet-5-5',
            stop_reason: 'tool_use',
            content: [
              { type: 'text', text: 'Let me look.' },
              { type: 'tool_use', id: 'toolu_1', name: 'get_kpis', input: { days: 30 } },
            ],
          }),
        [],
      ),
    });
    const result = await client.complete({ messages: [{ role: 'user', content: 'kpis?' }] });
    expect(result.text).toBe('Let me look.');
    expect(result.stopReason).toBe('tool_use');
    expect(result.toolCalls).toEqual([{ id: 'toolu_1', name: 'get_kpis', input: { days: 30 } }]);
  });
});
