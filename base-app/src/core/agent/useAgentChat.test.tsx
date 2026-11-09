import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { click, getByRole } from '~/test/dom';
import { mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import { useAgentChat } from './useAgentChat';

/* The sounds of a finished run: `reply` for an answer, `approval` when the assistant waits on a
   decision, nothing for a run that failed. Observed through the kit's `ui:sound` event. */
const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

function Harness() {
  const chat = useAgentChat({ path: '/', title: 'Home' }, { loadList: false });
  return (
    <button type="button" onClick={() => void chat.send('Hello')}>
      Ask
    </button>
  );
}

let view: Rendered | null = null;
const heard: string[] = [];
const onSound = (e: Event) => heard.push((e as CustomEvent<{ name: string }>).detail.name);

beforeEach(() => {
  localStorage.removeItem('ui-sounds');
  heard.length = 0;
  window.addEventListener('ui:sound', onSound);
});
afterEach(async () => {
  window.removeEventListener('ui:sound', onSound);
  await view?.unmount();
  view = null;
});

/* mockApi, plus a run that ends with the given `done` event (or a server error). */
function run(done: { pending: boolean } | 'error') {
  const api = mockApi();
  const original = api.fetch.getMockImplementation() as typeof fetch;
  api.fetch.mockImplementation(async (input, init) => {
    if (!String(input).endsWith('/agent/stream') || init?.method !== 'POST') {
      return original(input, init);
    }
    if (done === 'error') {
      return new Response(JSON.stringify({ ok: false, error: { code: 'boom', message: 'No' } }), {
        status: 500,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response(
      [
        frame('conversation', { id: 'chat-1', title: 'Hello' }),
        frame('delta', { text: 'Hi' }),
        frame('done', { model: 'test-model', usage: { inputTokens: 1, outputTokens: 1 }, ...done }),
      ].join(''),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
}

async function ask() {
  view = await render(<Harness />);
  await click(getByRole(document.body, 'button', 'Ask'));
  await flush(6);
}

describe('useAgentChat sounds', () => {
  it('plays reply when a run finishes', async () => {
    run({ pending: false });
    await ask();
    expect(heard).toEqual(['reply']);
  });

  it('plays approval, not reply, when the run is waiting for a decision', async () => {
    run({ pending: true });
    await ask();
    expect(heard).toEqual(['approval']);
  });

  it('plays nothing when the run fails', async () => {
    run('error');
    await ask();
    expect(heard).toEqual([]);
  });
});

/* Deleting the chat on screen while its reply is still streaming. */
function DeleteHarness() {
  const chat = useAgentChat({ path: '/', title: 'Home' }, { loadList: false });
  return (
    <>
      <button type="button" onClick={() => void chat.send('Hello')}>
        Ask
      </button>
      <button type="button" onClick={() => void chat.remove(chat.activeId ?? '')}>
        Delete
      </button>
      <output data-testid="state">
        {`${chat.busy ? 'busy' : 'idle'} ${chat.activeId ?? 'new'} ${chat.messages.length}`}
      </output>
    </>
  );
}

describe('useAgentChat delete', () => {
  it('deleting the open chat mid-reply stops the run and shows a new chat', async () => {
    const api = mockApi();
    const original = api.fetch.getMockImplementation() as typeof fetch;
    api.fetch.mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/agent/stream') && init?.method === 'POST') {
        const signal = init.signal;
        const body = new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode(frame('conversation', { id: 'chat-1', title: 'Hello' })),
            );
            controller.enqueue(new TextEncoder().encode(frame('delta', { text: 'Hi' })));
            // …and the rest never comes, until the run is aborted
            signal?.addEventListener('abort', () =>
              controller.error(new DOMException('Aborted', 'AbortError')),
            );
          },
        });
        return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
      }
      if (url.includes('/agent/conversations/chat-1') && init?.method === 'DELETE') {
        return new Response(JSON.stringify({ ok: true }), {
          headers: { 'content-type': 'application/json' },
        });
      }
      return original(input, init);
    });
    view = await render(<DeleteHarness />);
    const state = () => document.querySelector('[data-testid="state"]')?.textContent;
    await click(getByRole(document.body, 'button', 'Ask'));
    await flush(6);
    expect(state()).toBe('busy chat-1 2');
    await click(getByRole(document.body, 'button', 'Delete'));
    await flush(6);
    expect(state()).toBe('idle new 0');
  });
});
