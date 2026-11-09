import type {
  AgentConversationResponse,
  AgentConversationsResponse,
  LlmStreamError,
} from '../../shared/api.ts';
import { HttpError } from '../infra/http/errors.ts';
import { readJsonBody, sendJson } from '../infra/http/json.ts';
import { openSse, type SseWriter } from '../infra/http/sse.ts';
import type { RequestContext, Route } from '../infra/http/types.ts';
import { errorFields } from '../infra/log/logger.ts';
import { validate } from '../lib/schema.ts';
import { LlmError, ServiceError, type Services } from '../services/index.ts';
import { clientIp } from './auth.ts';
import { call, toHttp } from './errors.ts';
import { admit, toStreamError } from './llm.ts';

/* The assistant over HTTP (services/agent.ts does the work).

   POST /api/agent/stream    one run, answered as server-sent events: `conversation`, then
                             `delta` / `tool` / `approval`, then `done` or `error`. Everything
                             refusable before the first event (bad body, no such chat, quota) is
                             the JSON envelope; the stream opens on the first event.
   GET  /api/agent/conversations          the caller's saved chats, newest first
   GET  /api/agent/conversations/:id      one chat, as the page shows it
   PATCH /api/agent/conversations/:id     { title } renames it
   DELETE /api/agent/conversations/:id    deletes it and its messages

   A run shares the model quota with /api/llm/* (2 in flight, 20 a minute per person). */

const MAX_BODY_BYTES = 64 * 1024;

const RUN_BODY = {
  type: 'object',
  properties: {
    conversationId: { type: 'string', minLength: 1, maxLength: 64 },
    message: { type: 'string', maxLength: 20_000 },
    decision: {
      type: 'object',
      properties: {
        callId: { type: 'string', minLength: 1, maxLength: 200 },
        approve: { type: 'boolean' },
      },
      required: ['callId', 'approve'],
      additionalProperties: false,
    },
    context: {
      type: 'object',
      properties: {
        path: { type: 'string', minLength: 1, maxLength: 300 },
        title: { type: 'string', maxLength: 200 },
        selection: {
          type: 'object',
          properties: {
            kind: { type: 'string', minLength: 1, maxLength: 40 },
            id: { type: 'string', minLength: 1, maxLength: 64 },
            label: { type: 'string', maxLength: 200 },
          },
          required: ['kind', 'id'],
          additionalProperties: false,
        },
      },
      required: ['path'],
      additionalProperties: false,
    },
    provider: { type: 'string', enum: ['anthropic', 'gemini'] },
  },
  additionalProperties: false,
} as const;

const RENAME_BODY = {
  type: 'object',
  properties: { title: { type: 'string', minLength: 1, maxLength: 200 } },
  required: ['title'],
  additionalProperties: false,
} as const;

function principalOf(ctx: RequestContext) {
  if (!ctx.principal) throw new HttpError(401, 'unauthenticated', 'Sign in to use this.');
  return ctx.principal;
}

function body<S extends Parameters<typeof validate>[0]>(schema: S, raw: unknown) {
  const r = validate(schema, raw);
  if (!r.ok) throw new HttpError(400, 'invalid_body', r.error);
  return r.value;
}

function streamHandler(services: Services) {
  return async (ctx: RequestContext): Promise<void> => {
    const { req, res, log, requestId } = ctx;
    const user = principalOf(ctx);
    const input = body(RUN_BODY, await readJsonBody(req, MAX_BODY_BYTES));
    const release = admit(user.id);

    // the client leaving stops the run (and the paid call), stream open or not
    const abort = new AbortController();
    res.on('close', () => {
      if (!res.writableEnded) abort.abort();
    });
    let sse: SseWriter | null = null;
    const sink = {
      async send(event: string, data: unknown) {
        if (!sse) {
          sse = openSse(req, res, { headers: { 'x-request-id': requestId } });
          sse.signal.addEventListener('abort', () => abort.abort());
        }
        if (!sse.closed) await sse.send({ event, data });
      },
    };

    try {
      await services.agent.run(user, input, sink, { ip: clientIp(ctx), signal: abort.signal });
    } catch (err) {
      const open = sse as SseWriter | null;
      if (!open) throw toHttp(errOf(err));
      if (!open.closed) {
        const safe: LlmStreamError =
          err instanceof ServiceError
            ? { code: err.code, message: err.message, errorId: requestId }
            : toStreamError(err, requestId);
        const level = err instanceof LlmError || err instanceof ServiceError ? 'warn' : 'error';
        log[level]('agent run failed', {
          errorId: requestId,
          code: safe.code,
          ...errorFields(err),
        });
        await open.send({ event: 'error', data: safe });
      }
    } finally {
      release();
      (sse as SseWriter | null)?.close();
    }
  };
}

/* Before the stream opened, a model failure (no key, say) is still a JSON answer. */
function errOf(err: unknown): unknown {
  if (!(err instanceof LlmError)) return err;
  const safe = toStreamError(err, '');
  const status =
    { llm_not_configured: 503, aborted: 499, refusal: 422, timeout: 504 }[safe.code] ?? 502;
  return new HttpError(status, safe.code, safe.message);
}

export function agentRoutes(services: Services): Route[] {
  return [
    { method: 'POST', path: '/api/agent/stream', auth: 'user', handler: streamHandler(services) },
    {
      method: 'GET',
      path: '/api/agent/conversations',
      auth: 'user',
      handler: async (ctx) => {
        const conversations = await call(() => services.agent.list(principalOf(ctx)));
        sendJson(ctx.res, 200, { ok: true, conversations } satisfies AgentConversationsResponse);
      },
    },
    {
      method: 'GET',
      path: '/api/agent/conversations/:id',
      auth: 'user',
      handler: async (ctx) => {
        const r = await call(() => services.agent.get(principalOf(ctx), ctx.params.id ?? ''));
        sendJson(ctx.res, 200, { ok: true, ...r } satisfies AgentConversationResponse);
      },
    },
    {
      method: 'PATCH',
      path: '/api/agent/conversations/:id',
      auth: 'user',
      handler: async (ctx) => {
        const user = principalOf(ctx);
        const { title } = body(RENAME_BODY, await readJsonBody(ctx.req, 4096));
        const conversation = await call(() =>
          services.agent.rename(user, ctx.params.id ?? '', title),
        );
        sendJson(ctx.res, 200, { ok: true, conversation });
      },
    },
    {
      method: 'DELETE',
      path: '/api/agent/conversations/:id',
      auth: 'user',
      handler: async (ctx) => {
        await call(() => services.agent.remove(principalOf(ctx), ctx.params.id ?? ''));
        sendJson(ctx.res, 200, { ok: true });
      },
    },
  ];
}
