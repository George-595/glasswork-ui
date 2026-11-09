/* The one LLM interface every provider implements. Providers are raw fetch
   clients (no SDKs) — a deliberate supply-chain choice, see apps/ENGINEERING.md. */
export type LlmProvider = 'anthropic' | 'gemini';
/* A message is plain text, or blocks when tools are in play: the model's text and the tool
   calls it made (assistant), and the results of those calls (user). The block shapes are
   provider-neutral; each client maps them to its own wire format. */
export type LlmBlock =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
      /** Gemini's thought signature for this call, sent back with it on the next turn. */
      signature?: string;
    }
  | {
      type: 'tool_result';
      toolUseId: string;
      /** The tool's name (Gemini matches a result to its call by name). */
      name: string;
      content: string;
      isError?: boolean;
    };
export interface LlmMessage {
  role: 'user' | 'assistant';
  content: string | readonly LlmBlock[];
}
/* A tool the model may call. `inputSchema` is a JSON Schema object (the subset in
   server/lib/schema.ts), the same one the server validates the call's input against. */
export interface LlmTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
export interface LlmToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
  signature?: string;
}
export interface LlmCompleteRequest {
  system?: string;
  messages: readonly LlmMessage[];
  maxTokens?: number;
  model?: string;
  tools?: readonly LlmTool[];
}
export interface LlmCompleteResult {
  text: string;
  provider: LlmProvider;
  model: string;
  stopReason: string;
  usage?: { inputTokens?: number; outputTokens?: number };
  /** The tools the model asked to call, in order (empty without tools). */
  toolCalls?: LlmToolCall[];
}
/* One step of a streamed reply: any number of text deltas and tool calls (each call whole,
   once its input is complete), then exactly one done. A failure (including one after some
   text) is a thrown LlmError, never an event. */
export type LlmStreamEvent =
  | { type: 'text'; text: string }
  | ({ type: 'tool_call' } & LlmToolCall)
  | {
      type: 'done';
      model: string;
      stopReason?: string;
      usage?: { inputTokens?: number; outputTokens?: number };
    };
export interface LlmClient {
  readonly provider: LlmProvider;
  readonly model: string;
  complete(req: LlmCompleteRequest, opts?: { signal?: AbortSignal }): Promise<LlmCompleteResult>;
  /* The same request as complete(), answered as it is written. Failures before the first
     event (no key, HTTP error, refusal of the prompt) throw from the first next(); the
     caller can still answer with a plain error. Once text has flowed, a failure throws from
     a later next() and nothing is retried. Aborting `signal` closes the upstream connection
     and throws LlmError('aborted'). */
  stream(req: LlmCompleteRequest, opts?: { signal?: AbortSignal }): AsyncIterable<LlmStreamEvent>;
}
export type LlmErrorCode = 'config' | 'http' | 'refusal' | 'timeout' | 'bad_response' | 'aborted';
export class LlmError extends Error {
  readonly code: LlmErrorCode;
  readonly provider: LlmProvider;
  readonly status: number | undefined;
  constructor(code: LlmErrorCode, provider: LlmProvider, message: string, status?: number) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.provider = provider;
    this.status = status;
  }
}
export interface LlmClientOptions {
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  baseUrl?: string;
}
