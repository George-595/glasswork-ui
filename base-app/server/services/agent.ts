import type {
  AgentApprovalPart,
  AgentContext,
  AgentConversation,
  AgentMessage,
  AgentToolPart,
  AgentVisual,
  SessionUser,
} from '../../shared/api.ts';
import type { DbClient } from '../infra/db/types.ts';
import {
  type LlmBlock,
  LlmError,
  type LlmMessage,
  type LlmProvider,
  type LlmTool,
  type LlmToolCall,
} from '../infra/llm/types.ts';
import { newId } from '../lib/ids.ts';
import type { AgentMessageRecord, ConversationRecord } from '../repositories/agent.ts';
import { createRepositories } from '../repositories/index.ts';
import type { ActionContext, ActionRegistry, ApprovalText } from './actions/define.ts';
import { VISUAL_TOOLS } from './actions/visuals.ts';
import { ServiceError } from './errors.ts';
import type { LlmService } from './llm.ts';

/* The agent: a conversation with the model in which it acts through the app's actions
   (services/actions). One run is one request from the page:

     1. the person's message (or their answer to an approval) is saved;
     2. the model is called with the conversation so far and, as tools, every action this
        person may run; its text streams to the page;
     3. each tool call is checked and run as the person (same role check, same code as the
        page's POST /api/actions/:name). A `confirm` action is not run: the run stops, the
        page shows an approval card, and the next run starts with the person's decision;
     4. the results go back to the model and it continues, up to MAX_STEPS model calls.

   Everything is saved as it happens (saved chats): the person's messages, the model's text
   and tool calls, and the results with what the page showed for them (a chart, a summary).
   Reopening a chat replays it from the database; GET /api/agent/conversations/:id derives the
   page's view with `toDisplay`.

   What the model is told about a result is text (`forModel`, cut to 12k characters). A
   visual's numbers are read from the database by the server; the model is told what was shown,
   with the numbers, so its words agree with the chart. */

export const MAX_STEPS = 10;
const MAX_HISTORY_MESSAGES = 80;
const MAX_HISTORY_CHARS = 400_000;
const MAX_TOKENS_PER_STEP = 8_000;
const TITLE_CHARS = 60;

/* What is stored in agent_messages.content: the neutral blocks the providers take, a result's
   `display` (what the page showed), and a `stopped` marker. Display and markers are stripped
   before the history goes to the model. */
type ToolDisplay = {
  status: 'done' | 'failed' | 'denied';
  summary?: string;
  visual?: AgentVisual;
  approval?: ApprovalText & { destructive: boolean; decision: 'approved' | 'denied' };
};
type StoredBlock =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use';
      id: string;
      name: string;
      input: Record<string, unknown>;
      signature?: string;
    }
  | {
      type: 'tool_result';
      toolUseId: string;
      name: string;
      content: string;
      isError?: boolean;
      display?: ToolDisplay;
    }
  | { type: 'stopped' };

/* A run that stopped for an approval: the turn's calls, the results so far, and which call
   waits. Kept in agent_conversations.pending until the person decides (or moves on). */
interface Pending {
  calls: LlmToolCall[];
  results: StoredBlock[];
  index: number;
  approval: ApprovalText & { destructive: boolean };
}

export interface AgentSink {
  send(
    event: 'conversation' | 'delta' | 'tool' | 'approval' | 'done',
    data: unknown,
  ): Promise<void>;
}

export interface AgentRunInput {
  conversationId?: string;
  message?: string;
  decision?: { callId: string; approve: boolean };
  context?: AgentContext;
  provider?: LlmProvider;
}

const parseBlocks = (json: string): StoredBlock[] => {
  try {
    const v: unknown = JSON.parse(json);
    return Array.isArray(v) ? (v as StoredBlock[]) : [];
  } catch {
    return [];
  }
};
const parsePending = (json: string | null): Pending | null => {
  if (!json) return null;
  try {
    return JSON.parse(json) as Pending;
  } catch {
    return null;
  }
};

/* A call that was not run: the model is told why; the page shows the decision. */
const declined = (call: LlmToolCall, why: string, approval?: Pending['approval']): StoredBlock => ({
  type: 'tool_result',
  toolUseId: call.id,
  name: call.name,
  content: why,
  isError: true,
  display: {
    status: 'denied',
    ...(approval ? { approval: { ...approval, decision: 'denied' as const } } : {}),
  },
});

export function titleFrom(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > TITLE_CHARS
    ? `${line.slice(0, TITLE_CHARS - 1).trimEnd()}…`
    : line || 'New chat';
}

function toConversation(r: ConversationRecord): AgentConversation {
  return {
    id: r.id,
    title: r.title,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    pending: r.pending !== null,
  };
}

const isVisualTool = (name: string) => (VISUAL_TOOLS as readonly string[]).includes(name);

const size = (m: { content: LlmBlock[] }) => JSON.stringify(m.content).length;

/* The stored messages as the providers want them: display and markers stripped, a tool call
   that never got a result (a run that crashed) answered with a short note so the history stays
   valid, consecutive messages of one role merged, and the oldest turns dropped to fit. */
export function toLlmHistory(
  records: readonly { role: 'user' | 'assistant'; blocks: StoredBlock[] }[],
): LlmMessage[] {
  const out: { role: 'user' | 'assistant'; content: LlmBlock[] }[] = [];
  const push = (role: 'user' | 'assistant', blocks: LlmBlock[]) => {
    if (blocks.length === 0) return;
    const last = out.at(-1);
    if (last && last.role === role) last.content.push(...blocks);
    else out.push({ role, content: [...blocks] });
  };
  for (const [i, rec] of records.entries()) {
    const blocks: LlmBlock[] = [];
    for (const b of rec.blocks) {
      if (b.type === 'text' && b.text !== '') blocks.push({ type: 'text', text: b.text });
      else if (b.type === 'tool_use')
        blocks.push({
          type: 'tool_use',
          id: b.id,
          name: b.name,
          input: b.input,
          ...(b.signature ? { signature: b.signature } : {}),
        });
      else if (b.type === 'tool_result')
        blocks.push({
          type: 'tool_result',
          toolUseId: b.toolUseId,
          name: b.name,
          content: b.content,
          ...(b.isError ? { isError: true } : {}),
        });
    }
    if (rec.role === 'assistant') {
      push('assistant', blocks);
      // every call needs its result in the next user message
      const calls = rec.blocks.filter((b) => b.type === 'tool_use');
      if (calls.length > 0) {
        const next = records[i + 1];
        const answered = new Set(
          next?.role === 'user'
            ? next.blocks.filter((b) => b.type === 'tool_result').map((b) => b.toolUseId)
            : [],
        );
        const missing: LlmBlock[] = calls
          .filter((c) => !answered.has(c.id))
          .map((c) => ({
            type: 'tool_result',
            toolUseId: c.id,
            name: c.name,
            content: 'This call did not finish.',
            isError: true,
          }));
        push('user', missing);
      }
    } else {
      // results first: the Messages API wants tool_result blocks before any text
      blocks.sort((a, b) => Number(b.type === 'tool_result') - Number(a.type === 'tool_result'));
      push('user', blocks);
    }
  }
  // fit: drop whole turns from the front, restarting at a plain user message
  let total = out.reduce((n, m) => n + size(m), 0);
  let start = 0;
  while (
    start < out.length &&
    (out.length - start > MAX_HISTORY_MESSAGES || total > MAX_HISTORY_CHARS)
  ) {
    total -= size(out[start] as { content: LlmBlock[] });
    start++;
    while (start < out.length) {
      const m = out[start] as { role: string; content: LlmBlock[] };
      if (m.role === 'user' && !m.content.some((b) => b.type === 'tool_result')) break;
      total -= size(m);
      start++;
    }
  }
  return out.slice(start);
}

/* The page's view of a chat: the person's messages, and each assistant turn (its text, tool
   chips with their visuals, approval cards) as one message, however many model calls and
   tool results it took. */
export function toDisplay(
  records: readonly AgentMessageRecord[],
  pending: Pending | null,
  titleOf: (name: string) => string,
): AgentMessage[] {
  const out: AgentMessage[] = [];
  const results = new Map<string, StoredBlock & { type: 'tool_result' }>();
  for (const r of records) {
    for (const b of parseBlocks(r.content))
      if (b.type === 'tool_result') results.set(b.toolUseId, b);
  }
  if (pending)
    for (const b of pending.results) if (b.type === 'tool_result') results.set(b.toolUseId, b);
  const waiting = pending ? pending.calls[pending.index] : undefined;

  let turn: AgentMessage | null = null;
  for (const r of records) {
    const blocks = parseBlocks(r.content);
    if (r.role === 'user') {
      const text = blocks.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n');
      if (text === '') continue; // only tool results: part of the assistant's turn
      turn = null;
      out.push({ id: r.id, from: 'user', at: r.createdAt, parts: [{ type: 'text', text }] });
      continue;
    }
    if (!turn) {
      turn = { id: r.id, from: 'assistant', at: r.createdAt, parts: [] };
      out.push(turn);
    }
    if (r.model) turn.model = r.model;
    for (const b of blocks) {
      if (b.type === 'text' && b.text !== '') {
        const last = turn.parts.at(-1);
        if (last?.type === 'text') last.text += `\n\n${b.text}`;
        else turn.parts.push({ type: 'text', text: b.text });
      } else if (b.type === 'stopped') {
        turn.stopped = true;
      } else if (b.type === 'tool_use') {
        const res = results.get(b.id);
        const d = res?.display;
        if (d?.approval) {
          turn.parts.push({
            type: 'approval',
            callId: b.id,
            name: b.name,
            title: d.approval.title,
            details: d.approval.details,
            destructive: d.approval.destructive,
            decision: d.approval.decision,
          });
        } else if (waiting && waiting.id === b.id && pending) {
          turn.parts.push({
            type: 'approval',
            callId: b.id,
            name: b.name,
            title: pending.approval.title,
            details: pending.approval.details,
            destructive: pending.approval.destructive,
          });
          continue;
        }
        if (d?.status === 'denied') continue;
        const part: AgentToolPart = {
          type: 'tool',
          callId: b.id,
          name: b.name,
          title: titleOf(b.name),
          status: d ? d.status : res ? 'done' : 'failed',
        };
        if (d?.summary) part.summary = d.summary;
        if (d?.visual) part.visual = d.visual;
        if (d?.visual && isVisualTool(b.name)) part.input = b.input;
        if (!res && pending && pending.calls.some((c) => c.id === b.id)) continue; // queued behind the approval
        turn.parts.push(part);
      }
    }
  }
  return out;
}

function systemPrompt(user: SessionUser, now: Date, context?: AgentContext): string {
  const looking = context
    ? `They are looking at the page ${context.path}${context.title ? ` ("${context.title}")` : ''}${
        context.selection
          ? `, with ${context.selection.kind} ${context.selection.id}${context.selection.label ? ` ("${context.selection.label}")` : ''} selected`
          : ''
      }.`
    : '';
  return [
    'You are the assistant inside this web app. You act through tools, which are the same actions the app’s own pages use, and you can do exactly what the signed-in person may do, no more.',
    `The person: ${user.name}, role ${user.role}. Today is ${now.toISOString().slice(0, 10)} (UTC). ${looking}`,
    'Look things up with the tools instead of guessing. Every number you state must come from a tool result; if you cannot find it, say so.',
    'Show rather than tell. When an answer holds more than a couple of numbers, draw it: show_chart, show_kpis or show_table with a query, so the server reads the numbers from the database. Use show_diagram to explain a process or how things connect. Use open_page to hand them a page, such as the table already filtered. Then say in a sentence or two what the visual shows; do not repeat every number.',
    'Write plain text: no markdown, no headings, no asterisks, no tables in text. Short paragraphs. Money in pounds with £.',
    'Changes (inviting or changing users, removing saved views) wait for the person to approve in the chat. Say what you are about to do, then call the tool once. If they decline, do not try again unless they ask.',
    'When they ask to save, pin or keep a visual, call save_view with the same tool and input you used to show it.',
    'The data: transactions have a date, customer, description, category (Software, Hardware, Services, Travel, Office), amount and status (paid, pending, failed, refunded). There are also daily revenue and costs, monthly signups, headline KPIs, recent activity and (for admins) users and the audit log.',
  ].join('\n\n');
}

export function createAgentService(deps: {
  db: DbClient;
  llm: LlmService;
  actions: ActionRegistry;
  now?: () => Date;
}) {
  const { db, llm, actions } = deps;
  const repos = createRepositories(db);
  const now = deps.now ?? (() => new Date());
  const titleOf = (name: string): string => {
    try {
      return (
        actions.list({ id: '', name: '', email: '', role: 'admin' }).find((a) => a.name === name)
          ?.title ?? name
      );
    } catch {
      return name;
    }
  };

  async function own(user: SessionUser, id: string): Promise<ConversationRecord> {
    const c = await repos.agent.findConversation(user.id, id);
    if (!c) throw new ServiceError('not_found', 'conversation_not_found', 'No such chat.');
    return c;
  }

  async function save(
    conversationId: string,
    role: 'user' | 'assistant',
    blocks: StoredBlock[],
    meta?: { model?: string; inputTokens?: number; outputTokens?: number },
  ): Promise<string> {
    const id = newId();
    await repos.agent.insertMessage({
      id,
      conversationId,
      role,
      content: JSON.stringify(blocks),
      model: meta?.model ?? null,
      inputTokens: meta?.inputTokens ?? null,
      outputTokens: meta?.outputTokens ?? null,
      at: now(),
    });
    return id;
  }

  return {
    async list(user: SessionUser): Promise<AgentConversation[]> {
      return (await repos.agent.listConversations(user.id, 100)).map(toConversation);
    },
    async get(
      user: SessionUser,
      id: string,
    ): Promise<{ conversation: AgentConversation; messages: AgentMessage[] }> {
      const c = await own(user, id);
      const records = await repos.agent.listMessages(c.id);
      return {
        conversation: toConversation(c),
        messages: toDisplay(records, parsePending(c.pending), titleOf),
      };
    },
    async rename(user: SessionUser, id: string, title: string): Promise<AgentConversation> {
      const clean = title.replace(/\s+/g, ' ').trim();
      if (clean === '' || clean.length > 200) {
        throw new ServiceError(
          'invalid',
          'invalid_title',
          'Give the chat a name of up to 200 characters.',
          'title',
        );
      }
      if (!(await repos.agent.renameConversation(user.id, id, clean, now()))) {
        throw new ServiceError('not_found', 'conversation_not_found', 'No such chat.');
      }
      return toConversation(await own(user, id));
    },
    async remove(user: SessionUser, id: string): Promise<void> {
      if (!(await repos.agent.deleteConversation(user.id, id))) {
        throw new ServiceError('not_found', 'conversation_not_found', 'No such chat.');
      }
    },

    /** One run (see the header). Throws before the first event for anything refusable; after
        that, a failure is thrown for the route to turn into an `error` event. */
    async run(
      user: SessionUser,
      input: AgentRunInput,
      sink: AgentSink,
      opts: { ip: string; signal?: AbortSignal },
    ): Promise<void> {
      const message = input.message?.trim() ?? '';
      if (message === '' && !input.decision) {
        throw new ServiceError('invalid', 'invalid_body', 'Send a message or a decision.');
      }
      const ctx: ActionContext = {
        user,
        ip: opts.ip,
        now: now(),
        ...(opts.signal ? { signal: opts.signal } : {}),
      };
      const tools: LlmTool[] = actions
        .list(user)
        .map((a) => ({ name: a.name, description: a.description, inputSchema: a.input }));

      // the conversation: existing (theirs), or a new one named after the message
      let conversation: ConversationRecord;
      let created = false;
      if (input.conversationId) {
        conversation = await own(user, input.conversationId);
      } else {
        if (input.decision)
          throw new ServiceError('invalid', 'invalid_body', 'A decision needs its chat.');
        const at = now();
        conversation = {
          id: newId(),
          userId: user.id,
          title: titleFrom(message),
          pending: null,
          createdAt: at.toISOString(),
          updatedAt: at.toISOString(),
        };
        await repos.agent.insertConversation({
          id: conversation.id,
          userId: user.id,
          title: conversation.title,
          at,
        });
        created = true;
      }
      let pending = parsePending(conversation.pending);
      if (
        input.decision &&
        (!pending || pending.calls[pending.index]?.id !== input.decision.callId)
      ) {
        throw new ServiceError('conflict', 'nothing_pending', 'That approval was already decided.');
      }
      /* Waiting → decided happens once. Take the waiting approval before anything runs, so a
         second approve of the same call (a double click, another tab) is refused rather than
         running the action twice, and a run that dies after the action leaves nothing to
         approve again. */
      if (
        pending &&
        conversation.pending !== null &&
        !(await repos.agent.claimPending(conversation.id, conversation.pending, now()))
      ) {
        throw new ServiceError('conflict', 'nothing_pending', 'That approval was already decided.');
      }
      await sink.send('conversation', { id: conversation.id, title: conversation.title });

      const usage = { inputTokens: 0, outputTokens: 0 };
      let model: string | undefined;
      let wroteAssistant = false;
      let userMessageId: string | null = null;

      const emitTool = (
        call: LlmToolCall,
        status: AgentToolPart['status'],
        extra: Partial<AgentToolPart> = {},
      ) =>
        sink.send('tool', {
          type: 'tool',
          callId: call.id,
          name: call.name,
          title: titleOf(call.name),
          status,
          ...extra,
        } satisfies AgentToolPart);

      /* Runs one call (already approved if it needed approval) and returns its result block. */
      const runCall = async (
        call: LlmToolCall,
        approval?: Pending['approval'],
      ): Promise<StoredBlock> => {
        const decided = approval
          ? { approval: { ...approval, decision: 'approved' as const } }
          : {};
        await emitTool(call, 'running');
        try {
          const action = actions.find(user, call.name);
          const outcome = await action.execute(ctx, actions.check(action, call.input));
          const display: ToolDisplay = { status: 'done', ...decided };
          if (outcome.summary) display.summary = outcome.summary;
          if (outcome.visual) display.visual = outcome.visual;
          await emitTool(call, 'done', {
            ...(display.visual && isVisualTool(call.name) ? { input: call.input } : {}),
            ...(display.summary ? { summary: display.summary } : {}),
            ...(display.visual ? { visual: display.visual } : {}),
          });
          return {
            type: 'tool_result',
            toolUseId: call.id,
            name: call.name,
            content: outcome.forModel ?? JSON.stringify(outcome.result).slice(0, 12_000),
            display,
          };
        } catch (err) {
          // a refusal the model can act on (bad input, a rule) goes back as an error result;
          // anything else is still the model's to explain, but its text stays on the server
          const why =
            err instanceof ServiceError ? err.message : 'The action failed on the server.';
          await emitTool(call, 'failed', { summary: why });
          return {
            type: 'tool_result',
            toolUseId: call.id,
            name: call.name,
            content: why,
            isError: true,
            display: { status: 'failed', summary: why, ...decided },
          };
        }
      };

      /* Works through a turn's calls from `index`; stops at one that needs approval. */
      const work = async (
        calls: LlmToolCall[],
        index: number,
        results: StoredBlock[],
      ): Promise<'done' | 'waiting'> => {
        for (let i = index; i < calls.length; i++) {
          const call = calls[i] as LlmToolCall;
          let action: ReturnType<ActionRegistry['find']> | null = null;
          try {
            action = actions.find(user, call.name);
          } catch {
            action = null;
          }
          if (action?.confirm) {
            let checked: unknown;
            try {
              checked = actions.check(action, call.input);
            } catch (err) {
              const why = err instanceof ServiceError ? err.message : 'Invalid input.';
              await emitTool(call, 'failed', { summary: why });
              results.push({
                type: 'tool_result',
                toolUseId: call.id,
                name: call.name,
                content: why,
                isError: true,
                display: { status: 'failed', summary: why },
              });
              continue;
            }
            const text = await action.describe(checked, ctx);
            pending = {
              calls,
              results,
              index: i,
              approval: { ...text, destructive: action.destructive },
            };
            await repos.agent.touchConversation(conversation.id, JSON.stringify(pending), now());
            await sink.send('approval', {
              type: 'approval',
              callId: call.id,
              name: call.name,
              title: text.title,
              details: text.details,
              destructive: action.destructive,
            } satisfies AgentApprovalPart);
            return 'waiting';
          }
          results.push(await runCall(call));
        }
        return 'done';
      };

      try {
        // 1. what the person sent: an answer to the approval, a new message, or both
        if (pending) {
          const p = pending;
          const waitingCall = p.calls[p.index] as LlmToolCall;
          if (input.decision) {
            p.results.push(
              input.decision.approve
                ? await runCall(waitingCall, p.approval)
                : declined(
                    waitingCall,
                    'The person declined this. Do not try again unless they ask.',
                    p.approval,
                  ),
            );
            pending = null;
            const state = message === '' ? await work(p.calls, p.index + 1, p.results) : 'done';
            if (state === 'waiting') {
              await sink.send('done', { ...(model ? { model } : {}), usage, pending: true });
              return;
            }
            if (message !== '') {
              for (const c of p.calls.slice(p.index + 1))
                p.results.push(declined(c, 'Skipped: the person sent a new message instead.'));
            }
          } else {
            // a new message instead of a decision declines what was waiting
            p.results.push(
              declined(
                waitingCall,
                'The person did not approve this; they sent a new message instead.',
                p.approval,
              ),
            );
            for (const c of p.calls.slice(p.index + 1))
              p.results.push(declined(c, 'Skipped: the person sent a new message instead.'));
            pending = null;
          }
          const blocks: StoredBlock[] = [...p.results];
          if (message !== '') blocks.push({ type: 'text', text: message });
          userMessageId = await save(conversation.id, 'user', blocks);
          await repos.agent.touchConversation(conversation.id, null, now());
        } else {
          userMessageId = await save(conversation.id, 'user', [{ type: 'text', text: message }]);
          await repos.agent.touchConversation(conversation.id, null, now());
        }

        // 2..4. the model, the tools, and back
        for (let step = 0; step < MAX_STEPS; step++) {
          if (opts.signal?.aborted) return;
          const history = toLlmHistory(
            (await repos.agent.listMessages(conversation.id)).map((r) => ({
              role: r.role,
              blocks: parseBlocks(r.content),
            })),
          );
          const { events } = llm.stream(
            {
              system: systemPrompt(user, ctx.now, input.context),
              messages: history,
              tools,
              maxTokens: MAX_TOKENS_PER_STEP,
              ...(input.provider ? { provider: input.provider } : {}),
            },
            opts.signal ? { signal: opts.signal } : undefined,
          );
          let text = '';
          const calls: LlmToolCall[] = [];
          let stepUsage: { inputTokens?: number; outputTokens?: number } | undefined;
          try {
            for await (const e of events) {
              if (e.type === 'text') {
                text += e.text;
                await sink.send('delta', { text: e.text });
              } else if (e.type === 'tool_call') {
                calls.push({
                  id: e.id,
                  name: e.name,
                  input: e.input,
                  ...(e.signature ? { signature: e.signature } : {}),
                });
              } else {
                model = e.model;
                stepUsage = e.usage;
              }
            }
          } catch (err) {
            if (err instanceof LlmError && err.code === 'aborted') {
              // Stop: keep what had arrived, marked, and drop any half-made calls
              if (text !== '') {
                await save(
                  conversation.id,
                  'assistant',
                  [{ type: 'text', text }, { type: 'stopped' }],
                  model ? { model } : {},
                );
                wroteAssistant = true;
              }
              return;
            }
            throw err;
          }
          usage.inputTokens += stepUsage?.inputTokens ?? 0;
          usage.outputTokens += stepUsage?.outputTokens ?? 0;

          const blocks: StoredBlock[] = [];
          if (text !== '') blocks.push({ type: 'text', text });
          for (const c of calls)
            blocks.push({
              type: 'tool_use',
              id: c.id,
              name: c.name,
              input: c.input,
              ...(c.signature ? { signature: c.signature } : {}),
            });
          if (blocks.length === 0) break; // an empty reply ends the turn
          await save(conversation.id, 'assistant', blocks, {
            ...(model ? { model } : {}),
            ...(stepUsage?.inputTokens !== undefined ? { inputTokens: stepUsage.inputTokens } : {}),
            ...(stepUsage?.outputTokens !== undefined
              ? { outputTokens: stepUsage.outputTokens }
              : {}),
          });
          wroteAssistant = true;
          if (calls.length === 0) break;

          const results: StoredBlock[] = [];
          if ((await work(calls, 0, results)) === 'waiting') {
            await sink.send('done', { ...(model ? { model } : {}), usage, pending: true });
            return;
          }
          await save(conversation.id, 'user', results);
          await repos.agent.touchConversation(conversation.id, null, now());
          if (step === MAX_STEPS - 1) {
            await save(conversation.id, 'assistant', [
              {
                type: 'text',
                text: `I stopped after ${MAX_STEPS} steps. Ask me to carry on if you want more.`,
              },
            ]);
            await sink.send('delta', {
              text: `\n\nI stopped after ${MAX_STEPS} steps. Ask me to carry on if you want more.`,
            });
          }
        }
        await sink.send('done', { ...(model ? { model } : {}), usage, pending: false });
      } catch (err) {
        // nothing came of the message: take it back out, so the page can return it to the box
        if (!wroteAssistant && userMessageId && !input.decision) {
          await repos.agent.deleteMessage(userMessageId);
          if (created) await repos.agent.deleteConversation(user.id, conversation.id);
        }
        throw err;
      }
    },
  };
}
export type AgentService = ReturnType<typeof createAgentService>;
