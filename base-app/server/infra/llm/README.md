# server/infra/llm

Raw-`fetch` clients for the Anthropic Messages API and Gemini `generateContent`. No SDKs: a deliberate supply-chain choice (see `apps/ENGINEERING.md`).

- **`types.ts`:** the one `LlmClient` interface (`complete()` and `stream()`), `LlmError` and its codes (`config`, `http`, `refusal`, `timeout`, `bad_response`).
- **`anthropic.ts`:** never sends `temperature` or `thinking`; sends the fallback beta header and field only for the models that accept them (Fable 5.1, Opus 5.5, Opus 5, Sonnet 5.5) and only when fallbacks are on.
- **`gemini.ts`:** the key goes in the `x-goog-api-key` header, never the URL.
- **`http.ts`:** shared POST with timeout, error mapping and key redaction (internal).
- **`index.ts`:** `createAnthropicClient`, `createGeminiClient`, and `createLlmClient(provider, cfg, fetchImpl?)`, which throws `LlmError('config')` when a key is missing.
- **Tests:** inject `fetchImpl`. Nothing here calls the real APIs.
- **Imports:** `types.ts`, its own files and `lib/sse.ts`. It never reads `process.env` or imports `config/`.
- **Imported by:** `infra/http/routes` (via `types.ts`) and `server/main.ts`.

**Streaming.** `client.stream(req, { signal })` is an async iterable of `{type:'text', text}` deltas and one closing
`{type:'done', model, stopReason?, usage?}`. Anthropic sends the same body as `complete()` plus `stream: true`
(same model ids, `anthropic-version`, and beta header + `fallbacks` only for the models that accept them) and reads
`message_start`, `content_block_delta` (`text_delta` only), `message_delta` and `message_stop`; Gemini calls
`:streamGenerateContent?alt=sse` and ends when the stream does. Both read through `postStream` in `http.ts` and
`lib/sse.ts`'s parser, so chunks may be cut anywhere. The timeout is an idle one (it restarts with each event).
Failures are `LlmError`s: before the first event they throw on the first `next()` (a plain error response is still
possible); after text has flowed they throw from a later `next()` and nothing is retried. Anthropic's server-side
fallback happens inside the provider before it streams the first token, so there is no client-side fallback to
trigger after one. Aborting `signal` closes the upstream connection and throws `LlmError('aborted')`.

**Tool calls.** A request may carry `tools` (`{ name, description, inputSchema }`, plain JSON Schema) and a
message's `content` may be neutral blocks: `text`, `tool_use { id, name, input, signature? }` and `tool_result
{ toolUseId, name, content, isError? }`. Anthropic gets `tools[].input_schema` and `tool_use`/`tool_result` blocks;
its stream gathers `input_json_delta` pieces per block and yields one `{type:'tool_call'}` at
`content_block_stop`. Gemini gets `functionDeclarations[].parametersJsonSchema`, `functionCall` and
`functionResponse` parts; a call's `thoughtSignature` comes back as `signature` and must be sent back with it, and
call ids (Gemini has none) are made here. `complete()` returns `toolCalls`. Running the tools is the agent's job
(`services/agent.ts`), not this layer's.
