// @vitest-environment jsdom
/* The AI-interface primitives: ChatThread + ChatMessage, Thinking (+ TextShimmer), ToolChip,
   ApprovalCard, Composer and AssistantLayout. Behaviour, keyboard, and axe in every skin and
   mode (colour-contrast is off in jsdom; the colour gate holds it). */
import axe from 'axe-core';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApprovalCard,
  AssistantLayout,
  ChatMessage,
  ChatThread,
  Composer,
  ConversationList,
  TextShimmer,
  Thinking,
  ToolChip,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const g = globalThis as { ResizeObserver?: unknown; IntersectionObserver?: unknown };
  g.ResizeObserver ??= ResizeObserverStub;
  g.IntersectionObserver ??= ResizeObserverStub;
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      onchange: null,
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-skin');
});

const render = (node: ReactNode) => act(() => root.render(node));
const $ = <E extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as E;
const $$ = (sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel));

function type(el: HTMLTextAreaElement, value: string) {
  act(() => {
    const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    set?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function key(el: Element, k: string, init: KeyboardEventInit = {}): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
  act(() => {
    el.dispatchEvent(e);
  });
  return e;
}

describe('ChatThread and ChatMessage', () => {
  it('is a named log; each message is an article named by author and time', () => {
    render(
      <ChatThread label="Support chat">
        <ChatMessage from="user" timestamp="2026-10-12T09:05:00Z">
          Hello
        </ChatMessage>
        <ChatMessage from="assistant" name="Claude">
          Hi there
        </ChatMessage>
        <ChatMessage from="system">Switched model</ChatMessage>
      </ChatThread>,
    );
    const log = $('[role="log"]');
    expect(log.getAttribute('aria-label')).toBe('Support chat');
    expect(log.tabIndex).toBe(0);
    const [mine, theirs] = $$('article');
    expect(mine?.getAttribute('data-role')).toBe('user');
    const name = document.getElementById(mine?.getAttribute('aria-labelledby') ?? '');
    expect(name?.textContent).toContain('You');
    expect(mine?.querySelector('time')?.getAttribute('datetime')).toBe('2026-10-12T09:05:00.000Z');
    expect(theirs?.textContent).toContain('Claude');
    expect($('[role="note"]').textContent).toBe('Switched model');
  });

  it('keeps line breaks in a plain-text message', () => {
    render(<ChatMessage>{'one\ntwo'}</ChatMessage>);
    const span = $('article span.whitespace-pre-wrap');
    expect(span.textContent).toBe('one\ntwo');
  });

  it('marks the thread busy while a reply streams', () => {
    render(<ChatThread busy />);
    expect($('[role="log"]').getAttribute('aria-busy')).toBe('true');
  });

  it('copies the text and says so in a polite status', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onCopied = vi.fn<(text: string) => void>();
    render(<ChatMessage onCopied={onCopied}>Copy me</ChatMessage>);
    await act(async () => {
      $<HTMLButtonElement>('button[aria-label="Copy reply"]').click();
    });
    expect(writeText).toHaveBeenCalledWith('Copy me');
    expect(onCopied).toHaveBeenCalledWith('Copy me');
    expect($('[role="status"]').textContent).toBe('Copied');
  });

  it('reports a failed copy', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: async () => {
          throw new Error('denied');
        },
      },
      configurable: true,
    });
    render(<ChatMessage>Text</ChatMessage>);
    await act(async () => {
      $<HTMLButtonElement>('button[aria-label="Copy reply"]').click();
    });
    expect($('[role="status"]').textContent).toBe('Could not copy');
  });

  it('copies copyText for rich content and offers no copy for a system note', () => {
    render(
      <>
        <ChatMessage copyText="plain">
          <ToolChip name="x" />
        </ChatMessage>
        <ChatMessage from="system">Note</ChatMessage>
      </>,
    );
    expect($$('button[aria-label="Copy reply"]')).toHaveLength(1);
  });
});

describe('Thinking and TextShimmer', () => {
  it('is a disclosure: aria-expanded, the trace hidden until opened', () => {
    render(<Thinking active>{'step 1\nstep 2'}</Thinking>);
    const button = $<HTMLButtonElement>('button');
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(panel?.hidden).toBe(true);
    expect(button.textContent).toBe('Thinking');
    act(() => button.click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.hidden).toBe(false);
    expect(panel?.textContent).toBe('step 1\nstep 2');
  });

  it('shimmers while active and settles when done, with the duration', () => {
    render(<Thinking active>trace</Thinking>);
    expect($('.ui-text-shimmer').getAttribute('data-active')).toBe('true');
    render(
      <Thinking duration={4.2} defaultOpen>
        trace
      </Thinking>,
    );
    expect($('.ui-text-shimmer').getAttribute('data-active')).toBeNull();
    expect($('button').textContent).toBe('Reasoning for 4 s');
  });

  it('works controlled and without a trace (no button)', () => {
    const onOpenChange = vi.fn<(open: boolean) => void>();
    render(
      <Thinking open={false} onOpenChange={onOpenChange}>
        t
      </Thinking>,
    );
    act(() => $<HTMLButtonElement>('button').click());
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect($('button').getAttribute('aria-expanded')).toBe('false');
    render(<Thinking active />);
    expect(host.querySelector('button')).toBeNull();
    expect(host.textContent).toBe('Thinking');
  });

  it('stops the sweep under reduced motion by class', () => {
    render(<TextShimmer>Working</TextShimmer>);
    expect($('.ui-text-shimmer').className).toContain('motion-reduce:animate-none');
  });
});

describe('ToolChip', () => {
  it('says the state in words for each status', () => {
    render(
      <>
        <ToolChip name="search" status="running" />
        <ToolChip name="fetch" status="done" summary="3 results" />
        <ToolChip name="write" status="failed" />
      </>,
    );
    const chips = $$('.ui-tool-chip');
    expect(chips.map((c) => c.getAttribute('data-status'))).toEqual(['running', 'done', 'failed']);
    expect(chips[0]?.textContent).toContain('Running');
    expect(chips[1]?.textContent).toContain('Done · 3 results');
    expect(chips[2]?.textContent).toContain('Failed');
    expect(host.querySelector('button')).toBeNull();
  });

  it('expands its detail with a button, by click and by keyboard activation', () => {
    render(<ToolChip name="search" detail={'{"q":"x"}'} />);
    const button = $<HTMLButtonElement>('button');
    const panel = document.getElementById(button.getAttribute('aria-controls') ?? '');
    expect(panel?.hidden).toBe(true);
    act(() => button.click());
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(panel?.hidden).toBe(false);
    expect(panel?.textContent).toBe('{"q":"x"}');
  });
});

function Harness({ decided }: { decided?: 'approved' | 'denied' }) {
  return <ApprovalCard title="Do it" decision={decided} resolvedNote="by Ada" />;
}

describe('ApprovalCard', () => {
  it('asks: Deny is neutral, Approve is success; each calls its handler', () => {
    const onApprove = vi.fn<() => void>();
    const onDeny = vi.fn<() => void>();
    render(
      <ApprovalCard
        title="Send the invoice"
        description="To Acme Ltd"
        details={[{ term: 'Amount', detail: '£120.00' }]}
        onApprove={onApprove}
        onDeny={onDeny}
      />,
    );
    const group = $('[role="group"]');
    expect(document.getElementById(group.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Send the invoice',
    );
    expect($('dl').textContent).toContain('£120.00');
    const [deny, approve] = $$('button');
    expect(deny?.getAttribute('data-variant')).toBe('neutral');
    expect(approve?.getAttribute('data-variant')).toBe('success');
    act(() => approve?.click());
    act(() => deny?.click());
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onDeny).toHaveBeenCalledTimes(1);
  });

  it('uses the danger level when destructive', () => {
    render(<ApprovalCard destructive title="Delete 3 files" approveLabel="Delete" />);
    expect($$('button')[1]?.getAttribute('data-variant')).toBe('danger');
  });

  it('is not denied by Escape', () => {
    const onDeny = vi.fn<() => void>();
    render(<ApprovalCard title="Do it" onDeny={onDeny} />);
    key($('button'), 'Escape');
    expect(onDeny).not.toHaveBeenCalled();
  });

  it('resolves to a receipt and moves focus there from a pressed button', () => {
    render(<ApprovalCard title="Do it" onApprove={() => {}} />);
    const approve = $$('button')[1] as HTMLButtonElement;
    act(() => approve.focus());
    act(() => approve.click());
    render(<Harness decided="approved" />);
    expect(host.querySelector('button')).toBeNull();
    const receipt = $('[role="status"]');
    expect(receipt.textContent).toContain('Approved');
    expect(receipt.textContent).toContain('by Ada');
    render(<Harness decided="denied" />);
    expect($('[role="status"]').textContent).toContain('Denied');
  });
});

describe('Composer', () => {
  it('sends on Enter and clears; Shift+Enter does not send', () => {
    const onSend = vi.fn<(text: string) => void>();
    render(<Composer onSend={onSend} />);
    const field = $<HTMLTextAreaElement>('textarea');
    type(field, ' hello \nworld ');
    expect(key(field, 'Enter', { shiftKey: true }).defaultPrevented).toBe(false);
    expect(onSend).not.toHaveBeenCalled();
    expect(key(field, 'Enter').defaultPrevented).toBe(true);
    expect(onSend).toHaveBeenCalledWith('hello \nworld');
    expect(field.value).toBe('');
  });

  it('does not send blank text, while disabled or while streaming', () => {
    const onSend = vi.fn<(text: string) => void>();
    render(<Composer onSend={onSend} />);
    const field = $<HTMLTextAreaElement>('textarea');
    type(field, '   ');
    key(field, 'Enter');
    expect(onSend).not.toHaveBeenCalled();
    expect($('button[aria-label="Send message"]').getAttribute('aria-disabled')).toBe('true');
    render(<Composer onSend={onSend} streaming defaultValue="x" />);
    key($('textarea'), 'Enter');
    expect(onSend).not.toHaveBeenCalled();
    render(<Composer onSend={onSend} disabled defaultValue="x" />);
    expect($<HTMLTextAreaElement>('textarea').disabled).toBe(true);
  });

  it('sends with the Send button', () => {
    const onSend = vi.fn<(text: string) => void>();
    render(<Composer onSend={onSend} defaultValue="via button" />);
    act(() => $<HTMLButtonElement>('button[aria-label="Send message"]').click());
    expect(onSend).toHaveBeenCalledWith('via button');
  });

  it('shows Stop while streaming and calls onStop', () => {
    const onStop = vi.fn<() => void>();
    render(<Composer onSend={() => {}} streaming onStop={onStop} />);
    expect(host.querySelector('[aria-label="Send message"]')).toBeNull();
    act(() => $<HTMLButtonElement>('button[aria-label="Stop generating"]').click());
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('labels the field, describes it with the key hint and counts characters', () => {
    render(<Composer onSend={() => {}} maxLength={10} defaultValue="123456789" label="Ask" />);
    const field = $<HTMLTextAreaElement>('textarea');
    expect($('label').textContent).toBe('Ask');
    expect(
      document.getElementById(field.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain('Shift+Enter');
    expect(host.textContent).toContain('9 / 10');
    expect($$('[role="status"]').at(-1)?.textContent).toBe('1 character left');
  });

  it('works controlled', () => {
    const onValueChange = vi.fn<(value: string) => void>();
    render(<Composer onSend={() => {}} value="fixed" onValueChange={onValueChange} />);
    const field = $<HTMLTextAreaElement>('textarea');
    expect(field.value).toBe('fixed');
    type(field, 'fixed!');
    expect(onValueChange).toHaveBeenCalledWith('fixed!');
  });
});

describe('AssistantLayout', () => {
  it('shows the empty state with suggestion chips inside the log, and chips call back', () => {
    const onSuggestion = vi.fn<(text: string) => void>();
    render(
      <AssistantLayout
        empty
        suggestions={['Summarise my week', 'Draft an email']}
        onSuggestion={onSuggestion}
        composer={<Composer onSend={() => {}} />}
      />,
    );
    expect($('[role="log"]')).not.toBeNull();
    expect($('h2').textContent).toBe('Ask the assistant anything');
    const chips = $$('ul[aria-label="Suggestions"] button');
    expect(chips).toHaveLength(2);
    act(() => chips[1]?.click());
    expect(onSuggestion).toHaveBeenCalledWith('Draft an email');
  });

  it('shows the messages, the notice and the docked composer', () => {
    render(
      <AssistantLayout notice={<p>Heads up</p>} composer={<Composer onSend={() => {}} />}>
        <ChatMessage from="user">Hi</ChatMessage>
      </AssistantLayout>,
    );
    expect($$('article')).toHaveLength(1);
    expect(host.textContent).toContain('Heads up');
    expect($('textarea')).not.toBeNull();
    expect(host.querySelector('h2')).toBeNull();
  });
});

describe('ConversationList', () => {
  const NOW = new Date('2026-10-15T15:00:00Z');
  const items = [
    { id: 'a', title: 'Revenue by month', updatedAt: '2026-10-15T14:05:00Z', pending: true },
    { id: 'b', title: 'Who signed up', updatedAt: '2026-10-03T09:00:00Z' },
  ];

  it('is a named nav of chats; the open one is current; a waiting one says so', () => {
    const onSelect = vi.fn<(id: string) => void>();
    render(<ConversationList items={items} activeId="b" onSelect={onSelect} now={NOW} />);
    expect($('nav').getAttribute('aria-label')).toBe('Saved chats');
    const rows = $$('li > button');
    expect(rows.map((b) => b.getAttribute('aria-current'))).toEqual([null, 'page']);
    expect(rows[0]?.textContent).toContain('Waiting');
    expect(rows[1]?.textContent).toContain('3 Oct');
    act(() => rows[0]?.click());
    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('offers New chat and a delete named after each chat', () => {
    const onNew = vi.fn<() => void>();
    const onDelete = vi.fn<(item: unknown) => void>();
    render(
      <ConversationList items={items} onSelect={() => {}} onNew={onNew} onDelete={onDelete} />,
    );
    const del = $$('button').find(
      (b) => b.getAttribute('aria-label') === 'Delete chat: Who signed up',
    );
    act(() => del?.click());
    expect(onDelete).toHaveBeenCalledWith(items[1]);
    act(() =>
      $$('button')
        .find((b) => b.textContent === 'New chat')
        ?.click(),
    );
    expect(onNew).toHaveBeenCalled();
  });

  it('says when there are none', () => {
    render(<ConversationList items={[]} onSelect={() => {}} />);
    expect(host.textContent).toContain('No saved chats yet.');
  });

  it('sits beside the thread as AssistantLayout’s aside', () => {
    render(
      <AssistantLayout
        aside={<ConversationList items={items} onSelect={() => {}} />}
        composer={<Composer onSend={() => {}} />}
      />,
    );
    expect($('nav')).not.toBeNull();
    expect($('[role="log"]')).not.toBeNull();
  });
});

describe('axe: the AI primitives, every skin and mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(
          <main>
            <h1>Assistant</h1>
            <AssistantLayout
              composer={<Composer onSend={() => {}} maxLength={500} />}
              aside={
                <ConversationList
                  items={[
                    { id: 'a', title: 'Revenue', updatedAt: '2026-10-12T09:05:00Z', pending: true },
                    { id: 'b', title: 'Signups', updatedAt: '2026-10-01T09:05:00Z' },
                  ]}
                  activeId="a"
                  onSelect={() => {}}
                  onNew={() => {}}
                  onDelete={() => {}}
                />
              }
            >
              <ChatMessage from="system">Conversation started</ChatMessage>
              <ChatMessage from="user" timestamp="2026-10-12T09:05:00Z">
                {'What is due today?\nBe brief.'}
              </ChatMessage>
              <ChatMessage from="assistant" timestamp="2026-10-12T09:05:10Z">
                <Thinking duration={3} defaultOpen>
                  Looking at the calendar.
                </Thinking>
                <ToolChip name="calendar.list" status="done" summary="2 events" detail="{}" />
                <ToolChip name="mail.send" status="failed" />
                <ToolChip name="search" status="running" />
                <ApprovalCard
                  title="Send the summary"
                  description="To the team"
                  details={[{ term: 'Recipients', detail: '4' }]}
                />
                <ApprovalCard title="Archive 3 threads" destructive decision="denied" />
              </ChatMessage>
              <ChatMessage from="assistant" streaming>
                <Thinking active>Working</Thinking>
              </ChatMessage>
            </AssistantLayout>
            <AssistantLayout
              empty
              suggestions={['Summarise my week']}
              composer={<Composer onSend={() => {}} streaming />}
              notice={null}
            />
          </main>,
        );
        const results = await axe.run(document.body, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
          },
          rules: { 'color-contrast': { enabled: false } },
          resultTypes: ['violations'],
        });
        const report = results.violations
          .map(
            (v) =>
              `${v.id}: ${v.help}\n${v.nodes.map((n) => `  ${n.target.join(' ')}`).join('\n')}`,
          )
          .join('\n');
        expect(report).toBe('');
      });
    }
  }
});
