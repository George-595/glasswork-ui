import { afterEach, describe, expect, it } from 'vitest';
import { formatViolations, runAxe } from '~/test/axe';
import { changeValue, click, getByRole, getByText, press, queryByText } from '~/test/dom';
import { type MockReply, mockApi } from '~/test/mockApi';
import { flush, type Rendered, type RenderOptions, render as renderRaw } from '~/test/render';
import AssistantPage from './AssistantPage';

const mounted: Rendered[] = [];
async function render(opts?: RenderOptions) {
  const r = await renderRaw(<AssistantPage />, opts);
  mounted.push(r);
  await flush();
  return r;
}
afterEach(async () => {
  for (const r of mounted.splice(0)) await r.unmount().catch(() => {});
});

const failure = (status: number, code: string, message: string): MockReply => ({
  status,
  body: { ok: false, error: { code, message } },
});

const field = () => getByRole(document.body, 'textbox', 'Message') as HTMLTextAreaElement;
const sendButton = () => getByRole(document.body, 'button', 'Send message');
const stopButton = () => getByRole(document.body, 'button', 'Stop generating');
const log = () => getByRole(document.body, 'log', 'Conversation with the assistant');
/** The page's one status line: empty while a reply streams, a short phrase when it ends. */
const announced = () =>
  Array.from(document.querySelectorAll('[role="status"].sr-only')).at(-1)?.textContent ?? '';

type Posted = {
  conversationId?: string;
  message?: string;
  decision?: { callId: string; approve: boolean };
  context?: { path: string };
};

const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
const DONE = { model: 'test-model', usage: { inputTokens: 1, outputTokens: 1 }, pending: false };
const CHAT = { id: 'chat-1', title: 'Hello there' };
const headers = { 'content-type': 'text/event-stream' };

/* One streamed reply the test steers by hand: push() sends a delta, send() any event, finish()
   the closing event, fail() an error event; `aborted` says whether the page cancelled it. */
interface Live {
  push(text: string): Promise<void>;
  send(event: string, data: unknown): Promise<void>;
  finish(): Promise<void>;
  fail(code: string, message: string): Promise<void>;
  aborted: boolean;
}

/* The page cancels the reader as soon as it sees the end of the reply, so close() may find it closed. */
function closeQuietly(c: ReadableStreamDefaultController<Uint8Array> | undefined) {
  try {
    c?.close();
  } catch {
    // already closed
  }
}

function liveStream(
  signal: AbortSignal | null | undefined,
  first = '',
): [Live, ReadableStream<Uint8Array>] {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const write = async (text: string) => {
    controller?.enqueue(encoder.encode(text));
    await flush();
  };
  const live: Live = {
    aborted: false,
    push: (text) => write(frame('delta', { text })),
    send: (event, data) => write(frame(event, data)),
    async finish() {
      await write(frame('done', DONE));
      closeQuietly(controller);
      await flush();
    },
    async fail(code, message) {
      await write(frame('error', { code, message, errorId: 'e1' }));
      closeQuietly(controller);
      await flush();
    },
  };
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      if (first) c.enqueue(encoder.encode(first));
      signal?.addEventListener('abort', () => {
        live.aborted = true;
        c.error(new DOMException('aborted', 'AbortError'));
      });
    },
  });
  return [live, body];
}

/* Answers POST /api/agent/stream with `respond(n)` (n = how many runs came before): an array is
   a whole reply (the conversation event, one delta per string, done); 'live' is a reply the test
   steers (the conversation event already sent); a string of frames is sent as is; a MockReply
   is a JSON answer (a refusal before the stream starts). The saved-chat routes answer from
   `chats`; everything else is mockApi's. */
function streamApi(
  respond: (n: number) => string[] | 'live' | { frames: string } | MockReply = () => ['Ok'],
  chats: {
    id: string;
    title: string;
    updatedAt: string;
    createdAt: string;
    pending: boolean;
  }[] = [],
) {
  const api = mockApi({
    routes: {
      'GET /api/agent/conversations': { body: { ok: true, conversations: chats } },
      'POST /api/actions/save_view': (req) => ({
        body: { ok: true, result: { id: 'view-1', ...(req.body as { input: object }).input } },
      }),
    },
  });
  const original = api.fetch.getMockImplementation() as typeof fetch;
  const bodies: Posted[] = [];
  const lives: Live[] = [];
  api.fetch.mockImplementation(async (input, init) => {
    if (!String(input).endsWith('/agent/stream') || init?.method !== 'POST') {
      return original(input, init);
    }
    bodies.push(JSON.parse(String(init.body)) as Posted);
    const made = respond(bodies.length - 1);
    if (made === 'live') {
      const [live, body] = liveStream(init.signal, frame('conversation', CHAT));
      lives.push(live);
      return new Response(body, { headers });
    }
    if (Array.isArray(made)) {
      const text = [
        frame('conversation', CHAT),
        ...made.map((t) => frame('delta', { text: t })),
        frame('done', DONE),
      ].join('');
      return new Response(text, { headers });
    }
    if ('frames' in made) return new Response(made.frames, { headers });
    return new Response(JSON.stringify(made.body), { status: made.status ?? 200 });
  });
  return { api, bodies, lives };
}

const CHART_PART = {
  type: 'tool',
  callId: 'c1',
  name: 'show_chart',
  title: 'Show a chart',
  status: 'done',
  summary: '5 categories',
  input: { title: 'Spend by category', chart: 'bar', query: { dataset: 'transactions' } },
  visual: {
    kind: 'chart',
    chart: 'bar',
    title: 'Spend by category',
    format: 'gbp',
    series: [
      {
        name: 'Total',
        points: [
          { x: 'Software', y: 1200 },
          { x: 'Travel', y: 300 },
        ],
      },
    ],
  },
};
const APPROVAL = {
  type: 'approval',
  callId: 'w1',
  name: 'invite_user',
  title: 'Invite Bo',
  details: [{ term: 'Email', detail: 'bo@example.com' }],
  destructive: false,
};

describe('AssistantPage', () => {
  it('opens on an empty state with suggestions and the saved-chat list, under one h1', async () => {
    streamApi(undefined, [
      {
        id: 'old',
        title: 'Last week',
        createdAt: '2026-10-01T09:00:00Z',
        updatedAt: '2026-10-01T09:00:00Z',
        pending: false,
      },
    ]);
    const view = await render();
    expect(view.container.querySelectorAll('h1')).toHaveLength(1);
    expect(getByText(document.body, 'Ask about your data')).not.toBeNull();
    expect(view.container.querySelectorAll('ul[aria-label="Suggestions"] button')).toHaveLength(4);
    expect(getByRole(document.body, 'navigation', 'Saved chats').textContent).toContain(
      'Last week',
    );
    expect(log().tabIndex).toBe(0);
  });

  it('shows Thinking until the first token, then streams the reply in; the chat is saved', async () => {
    const { bodies, lives } = streamApi(() => 'live');
    await render();
    await changeValue(field(), 'Hello there');
    await click(sendButton());

    expect(queryByText(document.body, 'Hello there')).not.toBeNull();
    expect(queryByText(document.body, 'Thinking')).not.toBeNull();
    expect(log().getAttribute('aria-busy')).toBe('true');
    expect(stopButton()).not.toBeNull();
    expect(field().value).toBe('');

    await lives[0]?.push('Hello');
    expect(queryByText(document.body, 'Thinking')).toBeNull();
    await lives[0]?.push(', back!');
    expect(document.querySelectorAll('article[data-role="assistant"]')).toHaveLength(1);
    expect(queryByText(document.body, 'Hello, back!')).not.toBeNull();
    expect(announced()).toBe('');

    await lives[0]?.finish();
    expect(log().getAttribute('aria-busy')).toBeNull();
    expect(announced()).toBe('Reply complete.');
    expect(bodies[0]).toEqual({
      message: 'Hello there',
      context: { path: '/assistant', title: 'Assistant' },
    });
  });

  it('the next message goes to the same saved chat', async () => {
    const { bodies } = streamApi((n) => (n === 0 ? ['Hello', ' back'] : ['Again']));
    await render();
    await changeValue(field(), 'Hello there');
    await click(sendButton());
    await flush();
    await changeValue(field(), 'And again');
    await click(sendButton());
    await flush();
    expect(bodies[1]).toMatchObject({ conversationId: 'chat-1', message: 'And again' });
    expect(queryByText(document.body, 'Again')).not.toBeNull();
  });

  it('a suggestion chip sends its text', async () => {
    const { bodies } = streamApi(() => ['Sure']);
    const view = await render();
    await click(view.container.querySelector('ul[aria-label="Suggestions"] button') as HTMLElement);
    await flush();
    expect(bodies[0]?.message).toBe('Chart revenue by category this year');
    expect(queryByText(document.body, 'Sure')).not.toBeNull();
  });

  it('draws a tool’s visual under its chip, and pins it to Views with the input that drew it', async () => {
    const { api } = streamApi(() => ({
      frames: [
        frame('conversation', CHAT),
        frame('tool', {
          ...CHART_PART,
          status: 'running',
          summary: undefined,
          visual: undefined,
          input: undefined,
        }),
        frame('tool', CHART_PART),
        frame('delta', { text: 'Software leads.' }),
        frame('done', DONE),
      ].join(''),
    }));
    const view = await render();
    await changeValue(field(), 'Spend by category');
    await click(sendButton());
    await flush();
    const chips = Array.from(view.container.querySelectorAll('.ui-tool-chip'));
    expect(chips.map((c) => c.getAttribute('data-status'))).toEqual(['done']);
    expect(view.container.querySelector('figure')?.textContent).toContain('Spend by category');
    expect(queryByText(document.body, 'Software leads.')).not.toBeNull();

    await click(getByRole(document.body, 'button', 'Pin to Views'));
    await flush();
    expect(getByRole(document.body, 'button', 'Pinned to Views')).not.toBeNull();
    const posted = api.fetch.mock.calls.find((c) => String(c[0]).endsWith('/actions/save_view'));
    expect(JSON.parse(String(posted?.[1]?.body))).toEqual({
      input: { title: 'Spend by category', tool: 'show_chart', spec: CHART_PART.input },
    });
    expect(announced()).toBe('Pinned “Spend by category” to Views.');
  });

  it('asks before a change; Approve sends the decision and the same reply carries on', async () => {
    const { bodies } = streamApi((n) =>
      n === 0
        ? {
            frames: [
              frame('conversation', CHAT),
              frame('delta', { text: 'I will invite Bo.' }),
              frame('approval', APPROVAL),
              frame('done', { ...DONE, pending: true }),
            ].join(''),
          }
        : {
            frames: [
              frame('conversation', CHAT),
              frame('tool', {
                type: 'tool',
                callId: 'w1',
                name: 'invite_user',
                title: 'Invite a user',
                status: 'done',
                summary: 'Invited',
              }),
              frame('delta', { text: 'Done.' }),
              frame('done', DONE),
            ].join(''),
          },
    );
    const view = await render();
    await changeValue(field(), 'Invite Bo');
    await click(sendButton());
    await flush();
    expect(announced()).toBe('Waiting for your approval.');
    expect(queryByText(document.body, 'Invite Bo')).not.toBeNull();

    await click(getByRole(document.body, 'button', 'Approve'));
    await flush();
    expect(bodies[1]).toMatchObject({
      conversationId: 'chat-1',
      decision: { callId: 'w1', approve: true },
    });
    expect(view.container.querySelector('[data-decision="approved"]')).not.toBeNull();
    expect(document.querySelectorAll('article[data-role="assistant"]')).toHaveLength(1);
    expect(queryByText(document.body, 'Done.')).not.toBeNull();
  });

  it('opens a saved chat from the list, and deletes one after confirming', async () => {
    const chats = [
      {
        id: 'old',
        title: 'Last week',
        createdAt: '2026-10-01T09:00:00Z',
        updatedAt: '2026-10-01T09:00:00Z',
        pending: false,
      },
    ];
    const { api } = streamApi(undefined, chats);
    const original = api.fetch.getMockImplementation() as typeof fetch;
    api.fetch.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/agent/conversations/old') && (init?.method ?? 'GET') === 'GET') {
        return new Response(
          JSON.stringify({
            ok: true,
            conversation: chats[0],
            messages: [
              {
                id: 'm1',
                from: 'user',
                at: '2026-10-01T09:00:00Z',
                parts: [{ type: 'text', text: 'Old question' }],
              },
              {
                id: 'm2',
                from: 'assistant',
                at: '2026-10-01T09:00:05Z',
                parts: [{ type: 'text', text: 'Old answer' }, CHART_PART],
              },
            ],
          }),
        );
      }
      if (url.endsWith('/agent/conversations/old') && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true }));
      }
      return original(input, init);
    });
    await render();
    await click(getByRole(document.body, 'button', /^Last week/));
    await flush();
    expect(queryByText(document.body, 'Old answer')).not.toBeNull();
    expect(getByRole(document.body, 'button', /^Last week/).getAttribute('aria-current')).toBe(
      'page',
    );

    await click(getByRole(document.body, 'button', 'Delete chat: Last week'));
    await click(getByRole(document.body, 'button', 'Delete chat'));
    await flush();
    expect(
      api.fetch.mock.calls.some(
        (c) => String(c[0]).endsWith('/agent/conversations/old') && c[1]?.method === 'DELETE',
      ),
    ).toBe(true);
    expect(queryByText(document.body, 'Old answer')).toBeNull();
  });

  it('Stop mid-reply aborts and keeps the partial text, marked as stopped', async () => {
    const { lives } = streamApi(() => 'live');
    await render();
    await changeValue(field(), 'Slow one');
    await click(sendButton());
    await lives[0]?.push('Half an ans');
    await click(stopButton());
    expect(lives[0]?.aborted).toBe(true);
    expect(queryByText(document.body, 'Half an ans')).not.toBeNull();
    expect(queryByText(document.body, 'Stopped')).not.toBeNull();
    expect(log().getAttribute('aria-busy')).toBeNull();
    expect(announced()).toBe('Reply stopped.');
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('Stop before the first token adds no reply', async () => {
    const { lives } = streamApi(() => 'live');
    await render();
    await changeValue(field(), 'Slow one');
    await click(sendButton());
    await click(stopButton());
    expect(lives[0]?.aborted).toBe(true);
    expect(document.querySelectorAll('article[data-role="assistant"]')).toHaveLength(0);
    expect(queryByText(document.body, 'Stopped')).toBeNull();
    expect(queryByText(document.body, 'Slow one')).not.toBeNull();
  });

  it('a refusal before the stream starts says why and gives the text back to the composer', async () => {
    streamApi(() => failure(429, 'rate_limited', 'Too many model requests. Wait a moment.'));
    await render();
    await changeValue(field(), 'Will fail');
    await click(sendButton());
    await flush();
    const alert = getByRole(document.body, 'alert');
    expect(alert.textContent).toContain('Too many model requests');
    expect(field().value).toBe('Will fail');
    expect(document.querySelectorAll('article')).toHaveLength(0);
  });

  it('an error part-way through takes the half reply back out and returns the text', async () => {
    const { lives } = streamApi(() => 'live');
    await render();
    await changeValue(field(), 'Will break');
    await click(sendButton());
    await lives[0]?.push('Some words');
    await lives[0]?.fail('upstream_error', 'The model provider returned an error');
    expect(getByRole(document.body, 'alert').textContent).toContain(
      'The model provider returned an error',
    );
    expect(queryByText(document.body, 'Some words')).toBeNull();
    expect(field().value).toBe('Will break');
  });

  it('not configured: explains the key, keeps the text, and the example conversation still works', async () => {
    const { lives } = streamApi(() => 'live');
    await render();
    await changeValue(field(), 'Anyone there?');
    await click(sendButton());
    await lives[0]?.fail('llm_not_configured', 'No key');
    const alert = getByRole(document.body, 'alert');
    expect(alert.textContent).toContain('ANTHROPIC_API_KEY');
    expect(field().value).toBe('Anyone there?');
    const sample = getByRole(document.body, 'button', 'Show example conversation');
    await click(sample);
    expect(sample.getAttribute('aria-pressed')).toBe('true');
    expect(field().disabled).toBe(true);
  });

  it('a stream that is cut off is an error, not a half reply left as if it were whole', async () => {
    streamApi(() => ({ frames: frame('conversation', CHAT) + frame('delta', { text: 'Cut' }) }));
    await render();
    await changeValue(field(), 'Hello');
    await click(sendButton());
    await flush();
    expect(getByRole(document.body, 'alert').textContent).toContain(
      'closed before the reply finished',
    );
    expect(queryByText(document.body, 'Cut')).toBeNull();
    expect(field().value).toBe('Hello');
  });

  describe('keyboard', () => {
    it('Enter sends, Shift+Enter adds a line, an empty box sends nothing', async () => {
      const { bodies } = streamApi();
      await render();
      await press(field(), 'Enter');
      expect(bodies).toHaveLength(0);
      await changeValue(field(), 'line one\nline two');
      await press(field(), 'Enter');
      await flush();
      expect(bodies[0]?.message).toBe('line one\nline two');
      expect(field().value).toBe('');
    });
  });

  it('axe: empty, streaming, a visual, an approval, stopped and the example, in every skin and mode', async () => {
    for (const skin of ['enterprise', 'glass'] as const) {
      for (const mode of ['light', 'dark'] as const) {
        const { lives } = streamApi(
          () => 'live',
          [
            {
              id: 'old',
              title: 'Last week',
              createdAt: '2026-10-01T09:00:00Z',
              updatedAt: '2026-10-01T09:00:00Z',
              pending: true,
            },
          ],
        );
        const view = await render({ skin, mode });
        expect(formatViolations(await runAxe(document.body))).toBe('');
        await changeValue(field(), 'Hello');
        await click(sendButton());
        expect(formatViolations(await runAxe(document.body))).toBe(''); // Thinking
        await lives[0]?.push('A reply\nover two lines');
        await lives[0]?.send('tool', CHART_PART);
        await lives[0]?.send('tool', {
          type: 'tool',
          callId: 'd1',
          name: 'show_diagram',
          title: 'Show a diagram',
          status: 'done',
          visual: {
            kind: 'diagram',
            title: 'Payments',
            direction: 'right',
            nodes: [
              { id: 'a', label: 'Pending' },
              { id: 'b', label: 'Paid' },
            ],
            edges: [{ from: 'a', to: 'b', label: 'cleared' }],
          },
        });
        await lives[0]?.send('approval', APPROVAL);
        expect(formatViolations(await runAxe(document.body))).toBe(''); // streaming, visuals
        await lives[0]?.finish();
        expect(formatViolations(await runAxe(document.body))).toBe('');
        await changeValue(field(), 'Again');
        await click(sendButton());
        await lives[1]?.push('Half');
        await click(stopButton());
        expect(formatViolations(await runAxe(document.body))).toBe(''); // stopped
        await click(getByRole(document.body, 'button', 'Show example conversation'));
        expect(formatViolations(await runAxe(document.body))).toBe('');
        await view.unmount();
      }
    }
  });
});
