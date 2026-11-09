import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_TIMEOUT_MS,
  httpErrorMessage,
  isRecord,
  jsonData,
  postJson,
  postStream,
  truncate,
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

export type AnthropicFallbacks = 'default' | 'off';

export interface AnthropicClientOptions extends LlmClientOptions {
  fallbacks?: AnthropicFallbacks;
}

const PROVIDER = 'anthropic' as const;
const ANTHROPIC_VERSION = '2023-06-01';
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';
/* The models that accept `fallbacks: "default"`. Any other model (Haiku has
   no fallback; older models predate the scalar form) would get a 400. */
const FALLBACK_MODELS = new Set([
  'claude-fable-5-1',
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-5-5',
]);

/* Raw fetch against the Messages API. Never sends temperature or thinking:
   the 5.5 models reject both with a 400. */
export function createAnthropicClient(o: AnthropicClientOptions): LlmClient {
  if (o.apiKey === '') {
    throw new LlmError('config', PROVIDER, 'ANTHROPIC_API_KEY is not set');
  }
  const fetchImpl = o.fetchImpl ?? globalThis.fetch;
  const timeoutMs = o.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = (o.baseUrl ?? 'https://api.anthropic.com').replace(/\/+$/, '');
  const fallbacks = o.fallbacks ?? 'default';

  /* The URL, headers and body both calls send; `stream` is the only difference. */
  function build(req: LlmCompleteRequest, stream: boolean) {
    const model = req.model ?? o.model;
    const useFallbacks = fallbacks === 'default' && FALLBACK_MODELS.has(model);

    const headers: Record<string, string> = {
      'x-api-key': o.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    };
    if (useFallbacks) headers['anthropic-beta'] = FALLBACK_BETA;

    const body: Record<string, unknown> = {
      model,
      max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
      messages: req.messages.map(toWireMessage),
    };
    if (req.system) body.system = req.system;
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
    }
    if (useFallbacks) body.fallbacks = 'default';
    if (stream) body.stream = true;
    return { model, headers, body, url: `${baseUrl}/v1/messages` };
  }

  return {
    provider: PROVIDER,
    model: o.model,
    async complete(req, opts) {
      const { model, headers, body, url } = build(req, false);
      const raw = await postJson({
        provider: PROVIDER,
        fetchImpl,
        url,
        headers,
        body,
        timeoutMs,
        apiKey: o.apiKey,
        signal: opts?.signal,
      });
      return parseMessage(raw, model);
    },
    async *stream(req, opts) {
      const { model, headers, body, url } = build(req, true);
      const events = postStream({
        provider: PROVIDER,
        fetchImpl,
        url,
        headers,
        body,
        timeoutMs,
        apiKey: o.apiKey,
        signal: opts?.signal,
      });
      yield* readMessageStream(events, model, o.apiKey);
    },
  };
}

/* A neutral message as the Messages API wants it: a string stays a string, blocks map 1:1. */
function toWireMessage(m: LlmMessage): { role: string; content: unknown } {
  if (typeof m.content === 'string') return { role: m.role, content: m.content };
  return { role: m.role, content: m.content.map(toWireBlock) };
}
function toWireBlock(b: LlmBlock): Record<string, unknown> {
  switch (b.type) {
    case 'text':
      return { type: 'text', text: b.text };
    case 'tool_use':
      return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
    case 'tool_result':
      return {
        type: 'tool_result',
        tool_use_id: b.toolUseId,
        content: b.content,
        ...(b.isError ? { is_error: true } : {}),
      };
  }
}

/* A tool call's input, from the JSON the stream sent in pieces (empty means no arguments). */
function parseToolInput(json: string): Record<string, unknown> {
  if (json.trim() === '') return {};
  try {
    const parsed: unknown = JSON.parse(json);
    if (isRecord(parsed)) return parsed;
  } catch {
    // fall through
  }
  throw new LlmError('bad_response', PROVIDER, 'A tool call held input that was not a JSON object');
}

/* The Messages API stream: message_start (model, input tokens), then per block
   content_block_start / content_block_delta / content_block_stop, then message_delta (stop
   reason, output tokens so far) and message_stop. text_delta reaches the caller as it comes;
   a tool_use block's input arrives as input_json_delta pieces and is yielded whole, as one
   tool_call, at its content_block_stop. Thinking and fallback blocks are skipped. A mid-stream
   `error` event is a thrown LlmError, with the provider's words redacted of the key. */
async function* readMessageStream(
  events: AsyncIterable<{ event: string; data: string }>,
  requestedModel: string,
  apiKey: string,
): AsyncGenerator<LlmStreamEvent> {
  let model = requestedModel;
  let stopReason: string | undefined;
  let inputTokens: number | undefined;
  let outputTokens: number | undefined;
  // tool_use blocks being written, by content block index
  const tools = new Map<number, { id: string; name: string; json: string }>();
  for await (const { data } of events) {
    const payload = jsonData(data, PROVIDER);
    switch (payload.type) {
      case 'content_block_start': {
        const block = isRecord(payload.content_block) ? payload.content_block : undefined;
        if (
          block?.type === 'tool_use' &&
          typeof block.id === 'string' &&
          typeof block.name === 'string' &&
          typeof payload.index === 'number'
        ) {
          tools.set(payload.index, { id: block.id, name: block.name, json: '' });
        }
        break;
      }
      case 'content_block_stop': {
        const tool = typeof payload.index === 'number' ? tools.get(payload.index) : undefined;
        if (tool) {
          tools.delete(payload.index as number);
          yield {
            type: 'tool_call',
            id: tool.id,
            name: tool.name,
            input: parseToolInput(tool.json),
          };
        }
        break;
      }
      case 'message_start': {
        const message = isRecord(payload.message) ? payload.message : undefined;
        if (typeof message?.model === 'string') model = message.model;
        const usage = isRecord(message?.usage) ? message.usage : undefined;
        inputTokens = numberOrUndefined(usage?.input_tokens);
        outputTokens = numberOrUndefined(usage?.output_tokens);
        break;
      }
      case 'content_block_delta': {
        const delta = isRecord(payload.delta) ? payload.delta : undefined;
        if (delta?.type === 'text_delta' && typeof delta.text === 'string' && delta.text !== '') {
          yield { type: 'text', text: delta.text };
        } else if (delta?.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
          const tool = typeof payload.index === 'number' ? tools.get(payload.index) : undefined;
          if (tool) tool.json += delta.partial_json;
        }
        break;
      }
      case 'message_delta': {
        const delta = isRecord(payload.delta) ? payload.delta : undefined;
        if (typeof delta?.stop_reason === 'string') stopReason = delta.stop_reason;
        if (stopReason === 'refusal') {
          const details = isRecord(delta?.stop_details) ? delta.stop_details : undefined;
          const why = details?.explanation;
          throw new LlmError(
            'refusal',
            PROVIDER,
            typeof why === 'string' ? truncate(why) : 'Request declined',
            200,
          );
        }
        const usage = isRecord(payload.usage) ? payload.usage : undefined;
        inputTokens = numberOrUndefined(usage?.input_tokens) ?? inputTokens;
        outputTokens = numberOrUndefined(usage?.output_tokens) ?? outputTokens;
        break;
      }
      case 'message_stop':
        yield {
          type: 'done',
          model,
          ...(stopReason ? { stopReason } : {}),
          usage: { inputTokens, outputTokens },
        };
        return;
      case 'error': {
        const error = isRecord(payload.error) ? payload.error : undefined;
        const text = JSON.stringify({ error: { message: error?.message } });
        throw new LlmError('http', PROVIDER, httpErrorMessage(text, 500, apiKey));
      }
      default:
        // ping and event types added later
        break;
    }
  }
  throw new LlmError('bad_response', PROVIDER, 'The Anthropic stream ended before it finished');
}

function parseMessage(raw: unknown, requestedModel: string): LlmCompleteResult {
  if (!isRecord(raw) || !Array.isArray(raw.content)) {
    throw new LlmError('bad_response', PROVIDER, 'Unexpected Anthropic response shape');
  }

  if (raw.stop_reason === 'refusal') {
    const explanation = isRecord(raw.stop_details) ? raw.stop_details.explanation : undefined;
    throw new LlmError(
      'refusal',
      PROVIDER,
      typeof explanation === 'string' ? truncate(explanation) : 'Request declined',
      200,
    );
  }

  let text = '';
  const toolCalls: LlmToolCall[] = [];
  for (const block of raw.content) {
    if (isRecord(block) && block.type === 'text' && typeof block.text === 'string') {
      text += block.text;
    } else if (
      isRecord(block) &&
      block.type === 'tool_use' &&
      typeof block.id === 'string' &&
      typeof block.name === 'string'
    ) {
      toolCalls.push({
        id: block.id,
        name: block.name,
        input: isRecord(block.input) ? block.input : {},
      });
    }
  }

  const usage = isRecord(raw.usage) ? raw.usage : undefined;
  return {
    text,
    provider: PROVIDER,
    model: typeof raw.model === 'string' ? raw.model : requestedModel,
    stopReason: typeof raw.stop_reason === 'string' ? raw.stop_reason : 'unknown',
    usage: {
      inputTokens: numberOrUndefined(usage?.input_tokens),
      outputTokens: numberOrUndefined(usage?.output_tokens),
    },
    toolCalls,
  };
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
