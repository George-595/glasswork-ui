import { parseSse, type SseEvent } from '../../../lib/sse.ts';
import { LlmError, type LlmProvider } from './types.ts';

/* Shared plumbing for the raw-fetch provider clients: one JSON POST with a
   timeout, error mapping, and key redaction. Not exported from index.ts. */

export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_MAX_TOKENS = 16_000;
const MAX_ERROR_CHARS = 300;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function truncate(text: string): string {
  return text.length > MAX_ERROR_CHARS ? `${text.slice(0, MAX_ERROR_CHARS)}...` : text;
}

interface PostJsonArgs {
  provider: LlmProvider;
  fetchImpl: typeof fetch;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timeoutMs: number;
  apiKey: string;
  signal?: AbortSignal | undefined;
}

/* Resolves with the parsed JSON body of a 2xx response. Every failure is an
   LlmError; none of them carries the API key. */
export async function postJson(args: PostJsonArgs): Promise<unknown> {
  const timeout = AbortSignal.timeout(args.timeoutMs);
  const signal = args.signal ? AbortSignal.any([timeout, args.signal]) : timeout;
  try {
    const response = await args.fetchImpl(args.url, {
      method: 'POST',
      headers: { ...args.headers, 'content-type': 'application/json' },
      body: JSON.stringify(args.body),
      signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new LlmError(
        'http',
        args.provider,
        httpErrorMessage(text, response.status, args.apiKey),
        response.status,
      );
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      throw new LlmError('bad_response', args.provider, 'Provider response was not JSON');
    }
  } catch (err) {
    if (err instanceof LlmError) throw err;
    const name = errorName(err);
    if (name === 'AbortError' || name === 'TimeoutError') {
      throw new LlmError('timeout', args.provider, `${args.provider} request timed out`);
    }
    throw new LlmError('http', args.provider, `Could not reach ${args.provider}`);
  }
}

function errorName(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null || !('name' in err)) return undefined;
  return typeof err.name === 'string' ? err.name : undefined;
}

export function httpErrorMessage(text: string, status: number, apiKey: string): string {
  let message = `Provider returned HTTP ${status}`;
  try {
    const parsed: unknown = JSON.parse(text);
    if (isRecord(parsed) && isRecord(parsed.error) && typeof parsed.error.message === 'string') {
      message = parsed.error.message;
    }
  } catch {
    // Non-JSON error bodies are not echoed; the status alone is reported.
  }
  if (apiKey !== '') message = message.split(apiKey).join('[redacted]');
  return truncate(message);
}

interface PostStreamArgs extends PostJsonArgs {
  /** Silence longer than this (no bytes from the provider) ends the stream as a timeout. */
  timeoutMs: number;
}

/* POSTs the body and yields the provider's server-sent events as they arrive. The timeout is
   an idle one (it restarts with every event, and stops while the consumer is busy), so a long
   reply is fine and a stalled one is not. Every failure is an LlmError without the key. */
export async function* postStream(args: PostStreamArgs): AsyncGenerator<SseEvent> {
  const idle = new AbortController();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = (): void => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      timedOut = true;
      idle.abort();
    }, args.timeoutMs);
  };
  const signal = args.signal ? AbortSignal.any([idle.signal, args.signal]) : idle.signal;
  try {
    arm();
    const response = await args.fetchImpl(args.url, {
      method: 'POST',
      headers: { ...args.headers, 'content-type': 'application/json' },
      body: JSON.stringify(args.body),
      signal,
    });
    if (!response.ok) {
      throw new LlmError(
        'http',
        args.provider,
        httpErrorMessage(await response.text(), response.status, args.apiKey),
        response.status,
      );
    }
    if (!response.body) {
      throw new LlmError('bad_response', args.provider, 'Provider sent no stream');
    }
    for await (const event of parseSse(response.body)) {
      clearTimeout(timer);
      yield event;
      arm();
    }
  } catch (err) {
    if (err instanceof LlmError) throw err;
    if (args.signal?.aborted) {
      throw new LlmError('aborted', args.provider, 'The request was cancelled');
    }
    const name = errorName(err);
    if (timedOut || name === 'AbortError' || name === 'TimeoutError') {
      throw new LlmError('timeout', args.provider, `${args.provider} stream timed out`);
    }
    throw new LlmError('http', args.provider, `Lost the connection to ${args.provider}`);
  } finally {
    clearTimeout(timer);
  }
}

/* Parses one event's data as a JSON object, or throws bad_response. */
export function jsonData(data: string, provider: LlmProvider): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(data);
    if (isRecord(parsed)) return parsed;
  } catch {
    // fall through
  }
  throw new LlmError('bad_response', provider, 'Provider stream held data that was not JSON');
}
