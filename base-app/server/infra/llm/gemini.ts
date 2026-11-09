import { randomUUID } from 'node:crypto';
import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_MS,
  httpErrorMessage,
  isRecord,
  jsonData,
  postJson,
  postStream,
} from './http.ts';
import {
  type LlmBlock,
  type LlmClient,
  type LlmClientOptions,
  type LlmCompleteRequest,
  type LlmCompleteResult,
  LlmError,
  type LlmMessage,
  type LlmStreamEvent,
  type LlmToolCall,
} from './types.ts';

const PROVIDER = 'gemini' as const;
const BLOCKING_FINISH_REASONS = ['SAFETY', 'PROHIBITED_CONTENT'];

/* Raw fetch against generateContent. The key goes in a header, never the URL. */
export function createGeminiClient(o: LlmClientOptions): LlmClient {
  if (o.apiKey === '') {
    throw new LlmError('config', PROVIDER, 'GEMINI_API_KEY is not set');
  }
  const fetchImpl = o.fetchImpl ?? globalThis.fetch;
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = (o.baseUrl ?? 'https://generativelanguage.googleapis.com').replace(/\/+$/, '');

  function body(req: LlmCompleteRequest): Record<string, unknown> {
    const out: Record<string, unknown> = {
      contents: req.messages.map(toContent),
      generationConfig: { maxOutputTokens: req.maxTokens ?? DEFAULT_MAX_TOKENS },
    };
    if (req.system) out.systemInstruction = { parts: [{ text: req.system }] };
    if (req.tools && req.tools.length > 0) {
      out.tools = [
        {
          functionDeclarations: req.tools.map((t) => ({
            name: t.name,
            description: t.description,
            parametersJsonSchema: t.inputSchema,
          })),
        },
      ];
    }
    return out;
  }
  const endpoint = (model: string, method: string): string =>
    `${baseUrl}/v1beta/models/${encodeURIComponent(model)}:${method}`;

  return {
    provider: PROVIDER,
    model: o.model,
    async complete(req, opts) {
      const model = req.model ?? o.model;
      const raw = await postJson({
        provider: PROVIDER,
        fetchImpl,
        url: endpoint(model, 'generateContent'),
        headers: { 'x-goog-api-key': o.apiKey },
        body: body(req),
        timeoutMs,
        apiKey: o.apiKey,
        signal: opts?.signal,
      });
      return parseResponse(raw, model);
    },
    async *stream(req, opts) {
      const model = req.model ?? o.model;
      const events = postStream({
        provider: PROVIDER,
        fetchImpl,
        url: `${endpoint(model, 'streamGenerateContent')}?alt=sse`,
        headers: { 'x-goog-api-key': o.apiKey },
        body: body(req),
        timeoutMs,
        apiKey: o.apiKey,
        signal: opts?.signal,
      });
      yield* readChunkStream(events, model, o.apiKey);
    },
  };
}

/* A neutral message as a Gemini Content. A tool call goes back with its thought signature
   (Gemini refuses a function-calling history whose signatures were dropped); a result is a
   functionResponse matched to its call by name. */
function toContent(m: LlmMessage): { role: string; parts: unknown[] } {
  const role = m.role === 'assistant' ? 'model' : 'user';
  if (typeof m.content === 'string') return { role, parts: [{ text: m.content }] };
  return { role, parts: m.content.map(toPart) };
}
function toPart(b: LlmBlock): Record<string, unknown> {
  switch (b.type) {
    case 'text':
      return { text: b.text };
    case 'tool_use':
      return {
        functionCall: { name: b.name, args: b.input },
        ...(b.signature ? { thoughtSignature: b.signature } : {}),
      };
    case 'tool_result':
      return {
        functionResponse: {
          name: b.name,
          response: b.isError ? { error: b.content } : { result: b.content },
        },
      };
  }
}

/* A functionCall part as a neutral tool call. Gemini gives a call no id of its own, so one is
   made here; it only has to pair the call with its result inside our own history. */
function toolCallOf(part: Record<string, unknown>): LlmToolCall | null {
  const call = isRecord(part.functionCall) ? part.functionCall : undefined;
  if (!call || typeof call.name !== 'string') return null;
  return {
    id: typeof call.id === 'string' && call.id !== '' ? call.id : `call_${randomUUID()}`,
    name: call.name,
    input: isRecord(call.args) ? call.args : {},
    ...(typeof part.thoughtSignature === 'string' ? { signature: part.thoughtSignature } : {}),
  };
}

/* streamGenerateContent?alt=sse: every event is a GenerateContentResponse holding the next
   piece of text. There is no closing event; the stream just ends, and the last chunk carries
   finishReason and usageMetadata. A functionCall arrives whole in one part and is yielded as a
   tool_call. Thought parts are skipped, as complete() skips them. */
async function* readChunkStream(
  events: AsyncIterable<{ data: string }>,
  model: string,
  apiKey: string,
): AsyncGenerator<LlmStreamEvent> {
  let stopReason: string | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  let chunks = 0;
  for await (const { data } of events) {
    const raw = jsonData(data, PROVIDER);
    if (isRecord(raw.error)) {
      const text = JSON.stringify({ error: { message: raw.error.message } });
      throw new LlmError('http', PROVIDER, httpErrorMessage(text, 500, apiKey));
    }
    const feedback = raw.promptFeedback;
    if (isRecord(feedback) && typeof feedback.blockReason === 'string') {
      throw new LlmError('refusal', PROVIDER, `Prompt blocked: ${feedback.blockReason}`, 200);
    }
    chunks++;
    const meta = isRecord(raw.usageMetadata) ? raw.usageMetadata : undefined;
    inputTokens = numberOrUndefined(meta?.promptTokenCount) ?? inputTokens;
    outputTokens = numberOrUndefined(meta?.candidatesTokenCount) ?? outputTokens;
    const candidate = Array.isArray(raw.candidates) ? raw.candidates[0] : undefined;
    if (!isRecord(candidate)) continue;
    if (typeof candidate.finishReason === 'string') {
      stopReason = candidate.finishReason;
      if (BLOCKING_FINISH_REASONS.includes(stopReason)) {
        throw new LlmError('refusal', PROVIDER, `Response blocked: ${stopReason}`, 200);
      }
    }
    const content = isRecord(candidate.content) ? candidate.content : undefined;
    if (!content || !Array.isArray(content.parts)) continue;
    for (const part of content.parts) {
      if (!isRecord(part) || part.thought === true) continue;
      const call = toolCallOf(part);
      if (call) yield { type: 'tool_call', ...call };
      else if (typeof part.text === 'string' && part.text !== '') {
        yield { type: 'text', text: part.text };
      }
    }
  }
  if (chunks === 0) {
    throw new LlmError('bad_response', PROVIDER, 'The Gemini stream was empty');
  }
  yield {
    type: 'done',
    model,
    ...(stopReason ? { stopReason } : {}),
    usage: { inputTokens, outputTokens },
  };
}

function parseResponse(raw: unknown, model: string): LlmCompleteResult {
  if (!isRecord(raw)) {
    throw new LlmError('bad_response', PROVIDER, 'Unexpected Gemini response shape');
  }

  const feedback = raw.promptFeedback;
  if (isRecord(feedback) && typeof feedback.blockReason === 'string') {
    throw new LlmError('refusal', PROVIDER, `Prompt blocked: ${feedback.blockReason}`, 200);
  }

  if (!Array.isArray(raw.candidates) || !isRecord(raw.candidates[0])) {
    throw new LlmError('bad_response', PROVIDER, 'Gemini response has no candidates');
  }
  const candidate = raw.candidates[0];
  const finish = typeof candidate.finishReason === 'string' ? candidate.finishReason : 'unknown';
  if (BLOCKING_FINISH_REASONS.includes(finish)) {
    throw new LlmError('refusal', PROVIDER, `Response blocked: ${finish}`, 200);
  }

  let text = '';
  const toolCalls: LlmToolCall[] = [];
  const content = isRecord(candidate.content) ? candidate.content : undefined;
  if (content && Array.isArray(content.parts)) {
    for (const part of content.parts) {
      if (!isRecord(part) || part.thought === true) continue;
      const call = toolCallOf(part);
      if (call) toolCalls.push(call);
      else if (typeof part.text === 'string') text += part.text;
    }
  }

  const meta = isRecord(raw.usageMetadata) ? raw.usageMetadata : undefined;
  return {
    text,
    provider: PROVIDER,
    model,
    stopReason: finish,
    usage: {
      inputTokens: numberOrUndefined(meta?.promptTokenCount),
      outputTokens: numberOrUndefined(meta?.candidatesTokenCount),
    },
    toolCalls,
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
