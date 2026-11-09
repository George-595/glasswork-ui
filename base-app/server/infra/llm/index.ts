import { type AnthropicFallbacks, createAnthropicClient } from './anthropic.ts';
import { createGeminiClient } from './gemini.ts';
import type { LlmClient, LlmProvider } from './types.ts';

export { createAnthropicClient } from './anthropic.ts';
export { createGeminiClient } from './gemini.ts';
export type {
  LlmClient,
  LlmClientOptions,
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmErrorCode,
  LlmMessage,
  LlmProvider,
  LlmStreamEvent,
} from './types.ts';
export { LlmError } from './types.ts';

/* The subset of server config the LLM clients need. Structurally matches
   ServerEnv['llm'] without importing config/. */
export interface LlmProviderSettings {
  timeoutMs: number;
  anthropic: { apiKey?: string | undefined; model: string; fallbacks: AnthropicFallbacks };
  gemini: { apiKey?: string | undefined; model: string };
}

/* Throws LlmError('config') when the chosen provider has no API key. */
export function createLlmClient(
  provider: LlmProvider,
  cfg: LlmProviderSettings,
  fetchImpl?: typeof fetch,
): LlmClient {
  if (provider === 'anthropic') {
    return createAnthropicClient({
      apiKey: cfg.anthropic.apiKey ?? '',
      model: cfg.anthropic.model,
      fallbacks: cfg.anthropic.fallbacks,
      timeoutMs: cfg.timeoutMs,
      fetchImpl,
    });
  }
  return createGeminiClient({
    apiKey: cfg.gemini.apiKey ?? '',
    model: cfg.gemini.model,
    timeoutMs: cfg.timeoutMs,
    fetchImpl,
  });
}
