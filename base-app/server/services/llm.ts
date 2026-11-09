import type {
  LlmClient,
  LlmCompleteRequest,
  LlmCompleteResult,
  LlmProvider,
  LlmStreamEvent,
} from '../infra/llm/types.ts';

/* Text completion through the configured provider. The route validates the
   body; this picks the provider and calls it. */
export function createLlmService(deps: {
  defaultProvider: LlmProvider;
  getClient: (provider: LlmProvider) => LlmClient;
}) {
  return {
    complete(
      req: LlmCompleteRequest & { provider?: LlmProvider },
      opts?: { signal?: AbortSignal },
    ): Promise<LlmCompleteResult> {
      const client = deps.getClient(req.provider ?? deps.defaultProvider);
      return client.complete(
        { system: req.system, messages: req.messages, maxTokens: req.maxTokens, tools: req.tools },
        opts,
      );
    },
    /* The same call, answered as it is written. getClient() throws LlmError('config') at once
       when the provider has no key; the rest throws while the events are read. */
    stream(
      req: LlmCompleteRequest & { provider?: LlmProvider },
      opts?: { signal?: AbortSignal },
    ): { provider: LlmProvider; events: AsyncIterable<LlmStreamEvent> } {
      const client = deps.getClient(req.provider ?? deps.defaultProvider);
      return {
        provider: client.provider,
        events: client.stream(
          {
            system: req.system,
            messages: req.messages,
            maxTokens: req.maxTokens,
            tools: req.tools,
          },
          opts,
        ),
      };
    },
  };
}
export type LlmService = ReturnType<typeof createLlmService>;
