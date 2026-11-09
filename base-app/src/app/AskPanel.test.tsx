/* The Ask panel through the real App: the topbar button and the `a` shortcut open it, a message
   carries the page it was asked from (and the thing a page opened it about), the thread survives
   closing it, a page change closes it, and the Assistant page has no Ask button. Tests whose
   names start with "a11y" are the axe pass over the open panel in every skin and mode. */
import { act } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { askAbout, setAskOpen } from '~/core/agent';
import { AuthProvider } from '~/core/auth';
import { hrefFor, navigate } from '~/core/router';
import { ThemeProvider } from '~/core/ui';
import { formatViolations, runAxe } from '~/test/axe';
import { changeValue, click, getByRole, press, queryByText } from '~/test/dom';
import { setLocation } from '~/test/location';
import { mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import { App } from './App';
import { loadSignedIn } from './SignedInGate';

// The signed-in app is its own chunk (SignedInGate.tsx). The browser has it fetched before it hydrates;
// load it once up front so a test's first render finds it, instead of racing its first transform.
beforeAll(loadSignedIn);

function app() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  );
}

// The panel is its own chunk (Shell.tsx). Load it once up front so a click shows it within the
// few ticks these tests wait, instead of racing the first transform of its modules.
beforeAll(() => import('./AskPanel'));

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
  setAskOpen(false);
  vi.restoreAllMocks();
});

type Posted = { message?: string; conversationId?: string; context?: unknown };
const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

/* mockApi, plus POST /api/agent/stream answering every run with "Reply n". */
function agentApi() {
  const api = mockApi({
    routes: { 'GET /api/agent/conversations': { body: { ok: true, conversations: [] } } },
  });
  const original = api.fetch.getMockImplementation() as typeof fetch;
  const bodies: Posted[] = [];
  api.fetch.mockImplementation(async (input, init) => {
    if (!String(input).endsWith('/agent/stream') || init?.method !== 'POST') {
      return original(input, init);
    }
    bodies.push(JSON.parse(String(init.body)) as Posted);
    const text = [
      frame('conversation', { id: 'chat-1', title: 'Hello' }),
      frame('delta', { text: `Reply ${bodies.length}` }),
      frame('done', {
        model: 'test-model',
        usage: { inputTokens: 1, outputTokens: 1 },
        pending: false,
      }),
    ].join('');
    return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
  });
  return { api, bodies };
}

async function mount(hash: string, opts: Parameters<typeof render>[1] = {}) {
  setLocation(hrefFor(hash));
  view = await render(app(), opts);
  await flush(8);
  return view;
}

const askButton = () =>
  Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
    (b) => b.textContent === 'Ask',
  );
const panel = () => document.querySelector<HTMLElement>('[role="dialog"]');
const field = () => getByRole(document.body, 'textbox', 'Message') as HTMLTextAreaElement;

async function openPanel() {
  await click(askButton() as HTMLButtonElement);
  await flush(4);
}

async function send(text: string) {
  await changeValue(field(), text);
  await press(field(), 'Enter');
  await flush(8);
}

describe('Ask panel', () => {
  it('opens from the topbar, sends the page as context, and keeps the thread when reopened', async () => {
    const { bodies } = agentApi();
    await mount('/tool-1');
    expect(panel()).toBeNull();
    await openPanel();
    expect(panel()?.textContent).toContain('Ask the assistant');
    expect(panel()?.textContent).toContain('About: the Tool 1 page');

    await send('What is here?');
    expect(bodies[0]).toMatchObject({
      message: 'What is here?',
      context: { path: '/tool-1', title: 'Tool 1' },
    });
    expect(panel()?.textContent).toContain('Reply 1');

    await press(field(), 'Escape');
    await flush(4);
    expect(panel()).toBeNull();
    await openPanel();
    expect(panel()?.textContent).toContain('Reply 1');

    // the next message goes on in the same saved chat
    await send('And then?');
    expect(bodies[1]).toMatchObject({ message: 'And then?', conversationId: 'chat-1' });

    // New chat starts again
    await click(getByRole(panel() as HTMLElement, 'button', 'New chat'));
    await flush(2);
    expect(queryByText(panel() as HTMLElement, 'Reply 1')).toBeNull();
  });

  it('is its own chunk: hovering or focusing Ask loads it without opening it, and the click opens it', async () => {
    agentApi();
    await mount('/tool-1');
    const button = askButton() as HTMLButtonElement;
    await act(async () => {
      button.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
      button.focus();
    });
    await flush(4);
    expect(panel()).toBeNull();
    await click(button);
    await flush(4);
    expect(panel()?.textContent).toContain('Ask the assistant');
  });

  it('opens with the a shortcut, and not while typing', async () => {
    agentApi();
    await mount('/');
    const input = document.createElement('input');
    document.body.append(input);
    await press(input, 'a');
    await flush(2);
    expect(panel()).toBeNull();
    input.remove();

    await press(document.body, 'a');
    await flush(4);
    expect(panel()).not.toBeNull();
  });

  it('carries the thing a page asked about, until "Ask generally" or closing', async () => {
    const { bodies } = agentApi();
    await mount('/');
    await act(async () => {
      askAbout({ kind: 'transaction', id: 'tx-9', label: 'Acme, transaction tx-9' });
    });
    await flush(4);
    expect(panel()?.textContent).toContain('About: Acme, transaction tx-9');
    expect(
      getByRole(panel() as HTMLElement, 'button', 'Tell me about this transaction'),
    ).not.toBeNull();

    await send('Is this normal?');
    expect(bodies[0]?.context).toEqual({
      path: '/',
      title: 'Home',
      selection: { kind: 'transaction', id: 'tx-9', label: 'Acme, transaction tx-9' },
    });

    await click(getByRole(panel() as HTMLElement, 'button', 'Ask generally'));
    await flush(2);
    await send('And overall?');
    expect(bodies[1]?.context).toEqual({ path: '/', title: 'Home' });
  });

  it('closes when the page changes', async () => {
    agentApi();
    await mount('/');
    await openPanel();
    expect(panel()).not.toBeNull();
    await act(async () => {
      navigate('/tool-1');
    });
    await flush(8);
    expect(panel()).toBeNull();
  });

  it('stays open when only the query string or the fragment changes (path routing)', async () => {
    agentApi();
    await mount('/tool-1');
    await openPanel();
    expect(panel()).not.toBeNull();
    await act(async () => {
      navigate('/tool-1?mode=compare');
    });
    await flush(8);
    expect(window.location.search).toBe('?mode=compare');
    expect(panel()).not.toBeNull();
    await act(async () => {
      navigate('/tool-1?mode=compare#results');
    });
    await flush(8);
    expect(panel()).not.toBeNull();
  });

  it('is not offered on the Assistant page', async () => {
    agentApi();
    await mount('/assistant');
    expect(askButton()).toBeUndefined();
    await press(document.body, 'a');
    await flush(2);
    expect(panel()).toBeNull();
  });
});

describe('a11y Ask panel', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`open with a reply · ${skin} · ${mode}`, async () => {
        agentApi();
        await mount('/', { skin, mode });
        await openPanel();
        await send('Hello');
        expect(panel()?.textContent).toContain('Reply 1');
        expect(formatViolations(await runAxe(document.body))).toBe('');
      }, 90_000);
    }
  }
});
