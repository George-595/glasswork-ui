import { describe, expect, it } from 'vitest';
import { createGeminiClient } from './gemini.ts';
import { LlmError } from './types.ts';

const KEY = 'AIza-TESTKEY-do-not-leak';

interface Captured {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function recordingFetch(reply: () => Response, captured: Captured[]): typeof fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    captured.push({
      url: String(input),
      headers: init?.headers as Record<string, string>,
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

const OK = {
  candidates: [
    {
      content: {
        role: 'model',
        parts: [{ text: 'private thought', thought: true }, { text: 'Hi ' }, { text: 'there.' }],
      },
      finishReason: 'STOP',
    },
  ],
  usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 3 },
};

describe('createGeminiClient', () => {
  it('posts generateContent with the key in a header, not the URL', async () => {
    const captured: Captured[] = [];
    const client = createGeminiClient({
      apiKey: KEY,
      model: 'gemini-flash-latest',
      fetchImpl: recordingFetch(() => json(200, OK), captured),
    });

    await client.complete({
      system: 'Be brief.',
      messages: [
        { role: 'user', content: 'one' },
        { role: 'assistant', content: 'two' },
        { role: 'user', content: 'three' },
      ],
      maxTokens: 99,
    });

    const call = captured[0];
    expect(call?.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent',
    );
    expect(call?.url).not.toContain(KEY);
    expect(call?.headers['x-goog-api-key']).toBe(KEY);
    expect(call?.body).toEqual({
      contents: [
        { role: 'user', parts: [{ text: 'one' }] },
        { role: 'model', parts: [{ text: 'two' }] },
        { role: 'user', parts: [{ text: 'three' }] },
      ],
      systemInstruction: { parts: [{ text: 'Be brief.' }] },
      generationConfig: { maxOutputTokens: 99 },
    });
  });

  it('joins non-thought text parts and maps usage', async () => {
    const client = createGeminiClient({
      apiKey: KEY,
      model: 'gemini-flash-latest',
      fetchImpl: recordingFetch(() => json(200, OK), []),
    });
    const result = await client.complete({ messages: [{ role: 'user', content: 'x' }] });
    expect(result).toEqual({
      text: 'Hi there.',
      provider: 'gemini',
      model: 'gemini-flash-latest',
      stopReason: 'STOP',
      usage: { inputTokens: 5, outputTokens: 3 },
      toolCalls: [],
    });
  });

  it('maps a prompt block to refusal', async () => {
    const client = createGeminiClient({
      apiKey: KEY,
      model: 'gemini-flash-latest',
      fetchImpl: recordingFetch(() => json(200, { promptFeedback: { blockReason: 'SAFETY' } }), []),
    });
    const err = (await client
      .complete({ messages: [{ role: 'user', content: 'x' }] })
      .catch((e: unknown) => e)) as LlmError;
    expect(err.code).toBe('refusal');
  });

  it('maps a SAFETY finish to refusal', async () => {
    const client = createGeminiClient({
      apiKey: KEY,
      model: 'gemini-flash-latest',
      fetchImpl: recordingFetch(() => json(200, { candidates: [{ finishReason: 'SAFETY' }] }), []),
    });
    const err = (await client
      .complete({ messages: [{ role: 'user', content: 'x' }] })
      .catch((e: unknown) => e)) as LlmError;
    expect(err.code).toBe('refusal');
  });

  it('maps a 403 to LlmError http and never echoes the key', async () => {
    const client = createGeminiClient({
      apiKey: KEY,
      model: 'gemini-flash-latest',
      fetchImpl: recordingFetch(() => json(403, { error: { message: `bad key ${KEY}` } }), []),
    });
    const err = (await client
      .complete({ messages: [{ role: 'user', content: 'x' }] })
      .catch((e: unknown) => e)) as LlmError;
    expect(err.code).toBe('http');
    expect(err.status).toBe(403);
    expect(err.message).not.toContain(KEY);
  });

  it('maps an aborted request to LlmError timeout', async () => {
    const client = createGeminiClient({
      apiKey: KEY,
      model: 'gemini-flash-latest',
      timeoutMs: 5,
      fetchImpl: ((_input: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        })) as typeof fetch,
    });
    const err = (await client
      .complete({ messages: [{ role: 'user', content: 'x' }] })
      .catch((e: unknown) => e)) as LlmError;
    expect(err.code).toBe('timeout');
  });

  it('refuses to build without a key', () => {
    expect(() => createGeminiClient({ apiKey: '', model: 'gemini-flash-latest' })).toThrow(
      LlmError,
    );
    expect(() => createGeminiClient({ apiKey: '', model: 'gemini-flash-latest' })).toThrow(
      /GEMINI_API_KEY/,
    );
  });
});
