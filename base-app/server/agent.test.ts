/* The actions API and the assistant end to end: a real HTTP server on loopback, the fake LLM
   scripted to call tools, and the client's own SSE parser reading the answers. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSse } from '../lib/sse.ts';
import type { LlmCompleteRequest, LlmStreamEvent } from './infra/llm/types.ts';
import { ORIGIN, startTestApp, type TestApp, VIEWER_EMAIL, VIEWER_PASSWORD } from './testing.ts';

let app: TestApp;
let viewer = '';
let admin = '';

beforeAll(async () => {
  app = await startTestApp();
  viewer = await app.signIn(VIEWER_EMAIL, VIEWER_PASSWORD);
  admin = await app.signIn();
});
afterAll(() => app.close());

// oxlint-disable-next-line typescript/no-explicit-any -- response JSON is inspected loosely in tests
type Json = any;
const req = (method: string, path: string, cookie: string, body?: unknown) =>
  fetch(`${app.base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
const json = async (r: Response | Promise<Response>): Promise<Json> => (await r).json();

async function run(body: unknown, cookie = admin) {
  const res = await req('POST', '/api/agent/stream', cookie, body);
  const events: { event: string; data: Json }[] = [];
  if (res.headers.get('content-type')?.includes('text/event-stream') && res.body) {
    for await (const e of parseSse(res.body))
      events.push({ event: e.event, data: JSON.parse(e.data) });
  }
  return {
    res,
    events,
    of: (name: string) => events.filter((e) => e.event === name).map((e) => e.data),
  };
}

const done: LlmStreamEvent = {
  type: 'done',
  model: 'fake-1',
  usage: { inputTokens: 1, outputTokens: 1 },
};
const call = (id: string, name: string, input: Record<string, unknown>): LlmStreamEvent => ({
  type: 'tool_call',
  id,
  name,
  input,
});
const CHART = {
  title: 'Revenue by category',
  chart: 'bar',
  query: { dataset: 'transactions', groupBy: 'category', metric: 'total' },
};

/* Each model call takes the next scripted turn; records what it was sent. */
function script(turns: LlmStreamEvent[][]): LlmCompleteRequest[] {
  const seen: LlmCompleteRequest[] = [];
  let i = 0;
  app.llm.stream = async function* (r) {
    seen.push(r);
    const turn = turns[i++] ?? [{ type: 'text', text: 'Done.' }];
    for (const e of turn) yield e;
    yield done;
  };
  return seen;
}

const names = (r: { actions: { name: string }[] }) => r.actions.map((x) => x.name);

describe('/api/actions', () => {
  it('lists only what the caller may run', async () => {
    const v = await json(req('GET', '/api/actions', viewer));
    const a = await json(req('GET', '/api/actions', admin));
    expect(names(v)).toContain('show_chart');
    expect(names(v)).not.toContain('invite_user');
    expect(names(a)).toContain('invite_user');
  });

  it('runs an action from a page, with the same checks the assistant gets', async () => {
    const ok = await req('POST', '/api/actions/show_chart', viewer, { input: CHART });
    expect(ok.status).toBe(200);
    const body = await json(ok);
    expect(body.visual).toMatchObject({ kind: 'chart', title: 'Revenue by category' });

    const bad = await req('POST', '/api/actions/show_chart', viewer, { input: { title: 'x' } });
    expect(bad.status).toBe(400);
    expect((await json(bad)).error.message).toBe('chart: is required');

    // an admin action is unknown to a viewer, exactly like a made-up one
    for (const name of ['list_users', 'no_such_action']) {
      const r = await req('POST', `/api/actions/${name}`, viewer, { input: {} });
      expect(r.status).toBe(404);
    }
  });

  it('saves, draws and deletes a view', async () => {
    const saved = await req('POST', '/api/actions/save_view', viewer, {
      input: { title: 'Mine', tool: 'show_chart', spec: CHART },
    });
    expect(saved.status).toBe(200);
    const id = (await json(saved)).result.id as string;
    const list = await json(req('GET', '/api/views', viewer));
    expect(list.views.find((v: { id: string }) => v.id === id)).toMatchObject({
      title: 'Mine',
      visual: { kind: 'chart' },
    });
    // another person cannot see or delete it
    expect(
      (await json(req('GET', '/api/views', admin))).views.some((v: { id: string }) => v.id === id),
    ).toBe(false);
    expect((await req('POST', '/api/actions/delete_view', admin, { input: { id } })).status).toBe(
      404,
    );
    expect((await req('POST', '/api/actions/delete_view', viewer, { input: { id } })).status).toBe(
      200,
    );
    expect(
      (await json(req('GET', '/api/views', viewer))).views.some((v: { id: string }) => v.id === id),
    ).toBe(false);
  });
});

describe('POST /api/agent/stream', () => {
  it('calls a tool, draws its visual from the database, and answers', async () => {
    const seen = script([
      [{ type: 'text', text: 'Let me look. ' }, call('c1', 'show_chart', CHART)],
      [{ type: 'text', text: 'Software leads.' }],
    ]);
    const { res, of } = await run({
      message: 'Revenue by category?',
      context: { path: '/table', title: 'Table' },
    });
    expect(res.status).toBe(200);
    const [conv] = of('conversation');
    expect(conv.title).toBe('Revenue by category?');
    expect(of('tool').map((t) => t.status)).toEqual(['running', 'done']);
    expect(of('tool')[1].visual).toMatchObject({ kind: 'chart' });
    expect(
      of('delta')
        .map((d) => d.text)
        .join(''),
    ).toBe('Let me look. Software leads.');
    expect(of('done')[0]).toMatchObject({ pending: false, model: 'fake-1' });

    // the model was offered the actions as tools, told the page, and given the result
    expect(seen[0]?.tools?.map((t) => t.name)).toContain('show_chart');
    expect(seen[0]?.system).toContain('/table');
    const last = seen[1]?.messages.at(-1);
    expect(Array.isArray(last?.content) && last.content[0]).toMatchObject({
      type: 'tool_result',
      toolUseId: 'c1',
    });

    // saved: reopening shows one assistant turn with its text and chart
    const chat = await json(req('GET', `/api/agent/conversations/${conv.id}`, admin));
    expect(chat.messages.map((m: { from: string }) => m.from)).toEqual(['user', 'assistant']);
    expect(chat.messages[1].parts.map((p: { type: string }) => p.type)).toEqual([
      'text',
      'tool',
      'text',
    ]);
    expect(chat.messages[1].parts[1]).toMatchObject({ status: 'done', visual: { kind: 'chart' } });
  });

  it('carries on an existing chat with its history', async () => {
    script([[{ type: 'text', text: 'First.' }]]);
    const first = await run({ message: 'One' });
    const id = first.of('conversation')[0].id;
    const seen = script([[{ type: 'text', text: 'Second.' }]]);
    await run({ conversationId: id, message: 'Two' });
    expect(seen[0]?.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
  });

  it('stops for approval before a change, and runs it once approved', async () => {
    script([
      [call('w1', 'invite_user', { name: 'Ada', email: 'ada@example.com', role: 'viewer' })],
      [{ type: 'text', text: 'Invited.' }],
    ]);
    const first = await run({ message: 'Invite Ada' });
    const id = first.of('conversation')[0].id;
    expect(first.of('approval')[0]).toMatchObject({ callId: 'w1', title: 'Invite Ada' });
    expect(first.of('tool')).toEqual([]);
    expect(first.of('done')[0].pending).toBe(true);
    const list = await json(req('GET', '/api/agent/conversations', admin));
    expect(list.conversations.find((c: { id: string }) => c.id === id).pending).toBe(true);

    // a stale decision is refused before the stream opens
    expect(
      (await run({ conversationId: id, decision: { callId: 'nope', approve: true } })).res.status,
    ).toBe(409);

    const second = await run({ conversationId: id, decision: { callId: 'w1', approve: true } });
    expect(second.of('tool').map((t) => t.status)).toEqual(['running', 'done']);
    expect(
      second
        .of('delta')
        .map((d) => d.text)
        .join(''),
    ).toBe('Invited.');
    const chat = await json(req('GET', `/api/agent/conversations/${id}`, admin));
    expect(chat.conversation.pending).toBe(false);
    expect(chat.messages[1].parts[0]).toMatchObject({ type: 'approval', decision: 'approved' });
  });

  it('two approvals of the same call at once run the action once', async () => {
    script([
      [call('w9', 'invite_user', { name: 'Di', email: 'di@example.com', role: 'viewer' })],
      [{ type: 'text', text: 'Invited.' }],
      [{ type: 'text', text: 'Invited.' }],
    ]);
    const first = await run({ message: 'Invite Di' });
    const id = first.of('conversation')[0].id;
    // hold the first invite's transaction open until the second approval has arrived
    const transaction = app.db.transaction.bind(app.db);
    let release = () => {};
    const held = new Promise<void>((r) => {
      release = r;
    });
    app.db.transaction = async (fn) => {
      await held;
      return transaction(fn);
    };
    let both: Awaited<ReturnType<typeof run>>[] = [];
    try {
      const a = run({ conversationId: id, decision: { callId: 'w9', approve: true } });
      await new Promise((r) => setTimeout(r, 50));
      const b = run({ conversationId: id, decision: { callId: 'w9', approve: true } });
      await new Promise((r) => setTimeout(r, 50));
      release();
      both = await Promise.all([a, b]);
    } finally {
      app.db.transaction = transaction;
    }
    const ran = both.filter((r) => r.of('tool').some((t) => t.status === 'done'));
    expect(ran).toHaveLength(1);
    expect(both.map((r) => r.res.status).sort()).toEqual([200, 409]);
  });

  it('a denial goes back to the model, and a new message declines what waited', async () => {
    const seen = script([
      [call('w2', 'invite_user', { name: 'Bo', email: 'bo@example.com', role: 'viewer' })],
      [{ type: 'text', text: 'Okay, not inviting.' }],
    ]);
    const first = await run({ message: 'Invite Bo' });
    const id = first.of('conversation')[0].id;
    await run({ conversationId: id, decision: { callId: 'w2', approve: false } });
    const result = seen[1]?.messages.at(-1)?.content;
    expect(Array.isArray(result) && result[0]).toMatchObject({
      type: 'tool_result',
      isError: true,
    });

    script([
      [call('w3', 'invite_user', { name: 'Cy', email: 'cy@example.com', role: 'viewer' })],
      [{ type: 'text', text: 'Sure.' }],
    ]);
    const again = await run({ message: 'Invite Cy' });
    const id2 = again.of('conversation')[0].id;
    const seen2 = script([[{ type: 'text', text: 'Something else.' }]]);
    await run({ conversationId: id2, message: 'Actually, never mind' });
    const sent = seen2[0]?.messages.at(-1)?.content;
    expect(Array.isArray(sent) && sent.map((b) => b.type)).toEqual(['tool_result', 'text']);
    const users = await json(req('GET', '/api/users', admin));
    expect(JSON.stringify(users)).not.toContain('cy@example.com');
  });

  it('a viewer’s assistant cannot reach admin actions', async () => {
    const seen = script([[call('x1', 'list_users', {})], [{ type: 'text', text: 'I cannot.' }]]);
    const { of } = await run({ message: 'List users' }, viewer);
    expect(seen[0]?.tools?.map((t) => t.name)).not.toContain('list_users');
    expect(of('tool').at(-1)).toMatchObject({ status: 'failed' });
  });

  it('refuses a bad body, and keeps chats private', async () => {
    expect((await run({})).res.status).toBe(400);
    expect((await run({ message: 'x', extra: 1 })).res.status).toBe(400);
    script([[{ type: 'text', text: 'Hi.' }]]);
    const mine = (await run({ message: 'Private' })).of('conversation')[0].id;
    expect((await req('GET', `/api/agent/conversations/${mine}`, viewer)).status).toBe(404);
    expect((await run({ conversationId: mine, message: 'x' }, viewer)).res.status).toBe(404);
    expect((await req('DELETE', `/api/agent/conversations/${mine}`, viewer)).status).toBe(404);
  });

  it('renames and deletes a chat', async () => {
    script([[{ type: 'text', text: 'Hi.' }]]);
    const id = (await run({ message: 'Name me' })).of('conversation')[0].id;
    const renamed = await req('PATCH', `/api/agent/conversations/${id}`, admin, {
      title: 'Renamed',
    });
    expect((await json(renamed)).conversation.title).toBe('Renamed');
    expect((await req('DELETE', `/api/agent/conversations/${id}`, admin)).status).toBe(200);
    expect((await req('GET', `/api/agent/conversations/${id}`, admin)).status).toBe(404);
  });

  it('a model failure takes the message back out and reports an error event', async () => {
    app.llm.stream = async function* () {
      yield* [];
      throw new Error('boom');
    };
    const before = (await json(req('GET', '/api/agent/conversations', admin))).conversations.length;
    const { of } = await run({ message: 'Will fail' });
    expect(of('error')[0]).toMatchObject({ code: 'internal_error' });
    const after = (await json(req('GET', '/api/agent/conversations', admin))).conversations.length;
    expect(after).toBe(before);
  });
});
