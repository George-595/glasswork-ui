import type {
  LlmCompleteResponse,
  LlmStreamDelta,
  LlmStreamDone,
  LlmStreamError,
} from '../../shared/api.ts';
import { HttpError } from '../infra/http/errors.ts';
import { readJsonBody, sendJson } from '../infra/http/json.ts';
import { openSse } from '../infra/http/sse.ts';
import type { RequestContext } from '../infra/http/types.ts';
import { errorFields } from '../infra/log/logger.ts';
import { LlmError, type LlmMessage, type LlmProvider, type Services } from '../services/index.ts';

/* POST /api/llm/complete (any signed-in user). In front of the paid call: the
   router's Origin check and auth; here, Content-Type must be application/json
   (a cross-site page cannot send that without a CORS preflight, which this
   server never answers) and the body is capped at 64 KiB before parsing. */

const MAX_BODY_BYTES = 64 * 1024;
const MAX_MESSAGES = 50;
const MAX_TEXT_CHARS = 20_000;
const MAX_TOKENS_LIMIT = 32_000;

interface CompleteInput {
  provider?: LlmProvider;
  system?: string;
  messages: LlmMessage[];
  maxTokens?: number;
}

/* Paid calls: each signed-in user may have at most 2 in flight and 20 per minute. */
const MAX_IN_FLIGHT = 2;
const MAX_PER_MINUTE = 20;
const inFlight = new Map<string, number>();
const recentCalls = new Map<string, number[]>();

export function admit(userId: string): () => void {
  const cutoff = Date.now() - 60_000;
  const calls = (recentCalls.get(userId) ?? []).filter((t) => t > cutoff);
  if ((inFlight.get(userId) ?? 0) >= MAX_IN_FLIGHT || calls.length >= MAX_PER_MINUTE) {
    throw new HttpError(
      429,
      'rate_limited',
      'Too many model requests. Wait a moment and try again.',
    );
  }
  calls.push(Date.now());
  recentCalls.set(userId, calls);
  inFlight.set(userId, (inFlight.get(userId) ?? 0) + 1);
  return () => {
    const n = (inFlight.get(userId) ?? 1) - 1;
    if (n <= 0) inFlight.delete(userId);
    else inFlight.set(userId, n);
  };
}

export function llmCompleteHandler(services: Services) {
  return async (ctx: RequestContext): Promise<void> => {
    const { req, res } = ctx;
    const input = parseCompleteBody(await readJsonBody(req, MAX_BODY_BYTES));
    const release = admit(ctx.principal?.id ?? 'anonymous');

    // A client that disconnects should not keep a paid upstream call running.
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });

    try {
      const result = await services.llm.complete(input, { signal: abort.signal });
      sendJson(res, 200, {
        ok: true,
        text: result.text,
        provider: result.provider,
        model: result.model,
        stopReason: result.stopReason,
      } satisfies LlmCompleteResponse);
    } catch (err) {
      throw toHttpError(err);
    } finally {
      release();
    }
  };
}

/* POST /api/llm/stream: the same body, auth and quota as complete, answered as a
   server-sent event stream: `delta` {text} events, then one `done` or `error`. Everything
   that can be refused before a byte is sent (bad body, quota) is still the JSON envelope.
   After that the status is 200 and a failure is an `error` event with a safe message and the
   errorId of the log line; provider text and keys never reach it. The upstream call is
   aborted when the client goes away, and the quota slot is held until the stream ends. */
export function llmStreamHandler(services: Services) {
  return async (ctx: RequestContext): Promise<void> => {
    const { req, res, log, requestId } = ctx;
    const input = parseCompleteBody(await readJsonBody(req, MAX_BODY_BYTES));
    const release = admit(ctx.principal?.id ?? 'anonymous');
    const sse = openSse(req, res, { headers: { 'x-request-id': requestId } });
    try {
      const { provider, events } = services.llm.stream(input, { signal: sse.signal });
      for await (const event of events) {
        if (sse.closed) break;
        if (event.type === 'text') {
          await sse.send({ event: 'delta', data: { text: event.text } satisfies LlmStreamDelta });
        } else if (event.type === 'done') {
          // (this endpoint offers no tools, so no tool_call arrives; the agent's does)
          await sse.send({
            event: 'done',
            data: {
              provider,
              model: event.model,
              ...(event.stopReason ? { stopReason: event.stopReason } : {}),
              ...(event.usage ? { usage: event.usage } : {}),
            } satisfies LlmStreamDone,
          });
        }
      }
    } catch (err) {
      // The client already left: there is nobody to tell.
      if (!sse.closed) {
        const safe = toStreamError(err, requestId);
        const level = err instanceof LlmError ? 'warn' : 'error';
        log[level]('stream failed', { errorId: requestId, code: safe.code, ...errorFields(err) });
        await sse.send({ event: 'error', data: safe });
      }
    } finally {
      release();
      sse.close();
    }
  };
}

export function toStreamError(err: unknown, errorId: string): LlmStreamError {
  const mapped = toHttpError(err);
  if (mapped instanceof HttpError) {
    const message =
      mapped.code === 'llm_not_configured'
        ? 'The assistant is not set up: the server has no model key.'
        : mapped.message;
    return { code: mapped.code, message, errorId };
  }
  return {
    code: 'internal_error',
    message: 'Something went wrong on the server.',
    errorId,
  };
}

function toHttpError(err: unknown): unknown {
  if (!(err instanceof LlmError)) return err;
  switch (err.code) {
    case 'aborted':
      return new HttpError(499, 'aborted', 'The request was cancelled');
    case 'config':
      return new HttpError(503, 'llm_not_configured', err.message);
    case 'refusal':
      return new HttpError(422, 'refusal', 'The model declined this request');
    case 'timeout':
      return new HttpError(504, 'timeout', 'The model did not answer in time');
    case 'http':
    case 'bad_response':
      return new HttpError(502, 'upstream_error', 'The model provider returned an error');
  }
}

function invalid(message: string): HttpError {
  return new HttpError(400, 'invalid_body', message);
}

export function parseCompleteBody(raw: unknown): CompleteInput {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw invalid('Body must be a JSON object');
  }
  const body = raw as Record<string, unknown>;

  const prompt = body.prompt;
  const messagesField = body.messages;
  if ((prompt === undefined) === (messagesField === undefined)) {
    throw invalid('Send exactly one of "prompt" or "messages"');
  }

  let messages: LlmMessage[];
  if (prompt !== undefined) {
    if (typeof prompt !== 'string' || prompt.trim() === '') {
      throw invalid('"prompt" must be a non-empty string');
    }
    checkLength(prompt, 'prompt');
    messages = [{ role: 'user', content: prompt }];
  } else {
    messages = parseMessages(messagesField);
  }

  const input: CompleteInput = { messages };

  if (body.system !== undefined) {
    if (typeof body.system !== 'string') throw invalid('"system" must be a string');
    checkLength(body.system, 'system');
    if (body.system !== '') input.system = body.system;
  }

  if (body.provider !== undefined) {
    if (body.provider !== 'anthropic' && body.provider !== 'gemini') {
      throw invalid('"provider" must be "anthropic" or "gemini"');
    }
    input.provider = body.provider;
  }

  if (body.maxTokens !== undefined) {
    const max = body.maxTokens;
    if (typeof max !== 'number' || !Number.isInteger(max) || max < 1 || max > MAX_TOKENS_LIMIT) {
      throw invalid(`"maxTokens" must be an integer from 1 to ${MAX_TOKENS_LIMIT}`);
    }
    input.maxTokens = max;
  }

  return input;
}

function parseMessages(value: unknown): LlmMessage[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    throw invalid(`"messages" must be an array of 1 to ${MAX_MESSAGES} items`);
  }
  return value.map((item: unknown, index) => {
    if (typeof item !== 'object' || item === null) {
      throw invalid(`messages[${index}] must be an object`);
    }
    const message = item as Record<string, unknown>;
    if (message.role !== 'user' && message.role !== 'assistant') {
      throw invalid(`messages[${index}].role must be "user" or "assistant"`);
    }
    if (typeof message.content !== 'string' || message.content === '') {
      throw invalid(`messages[${index}].content must be a non-empty string`);
    }
    checkLength(message.content, `messages[${index}].content`);
    return { role: message.role, content: message.content };
  });
}

function checkLength(text: string, field: string): void {
  if (text.length > MAX_TEXT_CHARS) {
    throw invalid(`"${field}" is longer than ${MAX_TEXT_CHARS} characters`);
  }
}
