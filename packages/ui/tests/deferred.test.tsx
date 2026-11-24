// @vitest-environment jsdom
/* DeferredMenu and DeferredTooltip: the UI SDK part arrives on intent or idle, and until then a stand-in with the
   same markup does the job. `held()` holds the module back until the test lets it arrive. Once it has arrived the
   menu's own behaviour tests run against DeferredMenu too (pieces.test.tsx). */
import { act, type ReactNode } from 'react';
import { createRoot, hydrateRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { deferredModule, useDeferredModule } from '../src/components/deferred';
import { createDeferredMenu } from '../src/components/deferred-menu';
import { createDeferredTooltip } from '../src/components/deferred-tooltip';
import * as menuModule from '../src/components/menu';
import * as tooltipModule from '../src/components/tooltip';
import { Menu, Tooltip } from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const g = globalThis as { ResizeObserver?: unknown };
  g.ResizeObserver ??= ResizeObserverStub;
  const proto = Element.prototype as Partial<{
    hasPointerCapture: (id: number) => boolean;
    releasePointerCapture: (id: number) => void;
    setPointerCapture: (id: number) => void;
    scrollIntoView: () => void;
  }>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
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
  vi.useRealTimers();
});

const render = (node: ReactNode) => act(() => root.render(node));
const $ = <E extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as E;
const $doc = <E extends Element = HTMLElement>(sel: string) => document.querySelector<E>(sel);
const active = () => document.activeElement as HTMLElement;
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
const key = (el: Element, k: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  });
const pointer = (el: Element, type: string, button = 0) =>
  act(() => {
    const e = new MouseEvent(type, { bubbles: true, cancelable: true, button });
    Object.defineProperty(e, 'pointerType', { value: 'mouse' }); // jsdom has no PointerEvent
    el.dispatchEvent(e);
  });

/** A module that arrives when `arrive()` is called, not before. */
function held<M>(mod: M) {
  let release: () => void = () => {};
  const p = new Promise<M>((r) => {
    release = () => r(mod);
  });
  const m = deferredModule(() => p);
  return {
    m,
    arrive: async () => {
      release();
      await flush();
    },
  };
}

const ITEMS = [
  { id: 'u', label: 'Users', href: '#/users' },
  { id: 'r', label: 'Reports' },
  { id: 's', label: 'Sign out' },
];

describe('deferredModule', () => {
  it('fetches once, peeks once it has arrived, and retries after a failure', async () => {
    let calls = 0;
    let fail = true;
    const m = deferredModule(async () => {
      calls++;
      if (fail) throw new Error('offline');
      return { n: 7 };
    });
    expect(m.peek()).toBeUndefined();
    await expect(m.load()).rejects.toThrow('offline');
    fail = false;
    const [a, b] = await Promise.all([m.load(), m.load()]);
    expect(a).toBe(b);
    expect(calls).toBe(2);
    expect(m.peek()).toEqual({ n: 7 });
    await m.load();
    expect(calls).toBe(2);
  });
});

describe('useDeferredModule', () => {
  function Probe({ m }: { m: ReturnType<typeof deferredModule<{ n: number }>> }) {
    const { module, request } = useDeferredModule(m);
    return (
      <button type="button" onClick={request}>
        {module ? `n=${module.n}` : 'waiting'}
      </button>
    );
  }

  it('is undefined on the server and while hydrating, even when the module has already arrived, then follows', async () => {
    const m = deferredModule(async () => ({ n: 1 }));
    expect(renderToString(<Probe m={m} />)).toContain('waiting');
    await m.load();
    const html = renderToString(<Probe m={m} />);
    expect(html).toContain('waiting'); // the server never has it
    const box = document.createElement('div');
    document.body.append(box);
    box.innerHTML = html;
    let hydrated: Root | undefined;
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => {
      hydrated = hydrateRoot(box, <Probe m={m} />);
    });
    expect(errors).not.toHaveBeenCalled(); // no hydration mismatch
    errors.mockRestore();
    expect(box.textContent).toBe('n=1');
    act(() => hydrated?.unmount());
    box.remove();
  });

  it('waits for the idle timer, and fetches at once on request()', async () => {
    vi.useFakeTimers();
    const load = vi.fn<() => Promise<{ n: number }>>(async () => ({ n: 2 }));
    const m = deferredModule(load);
    render(<Probe m={m} />);
    expect(load).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(299);
    });
    expect(load).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(load).toHaveBeenCalledOnce();
    expect($('button').textContent).toBe('n=2');

    const m2 = deferredModule(async () => ({ n: 3 }));
    render(<Probe m={m2} />);
    act(() => $('button').click());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect($('button').textContent).toBe('n=3');
  });
});

/* The SDK's own ids and wiring, which a closed menu button may omit, are not part of the comparison. */
const scrub = (el: Element) =>
  el.outerHTML.replace(/ id="[^"]*"/g, '').replace(/ aria-controls="[^"]*"/g, '');

describe('the stand-in markup', () => {
  it('is the Menu trigger, wrapper included, with and without a label', async () => {
    const { m } = held(menuModule);
    const DeferredMenu = createDeferredMenu(m);
    for (const extra of [{}, { icon: 'user' as const, iconOnly: true, iconSize: 18 }]) {
      render(<Menu label="Admin" items={ITEMS} align="end" {...extra} />);
      const real = scrub($('.ui-menu-wrap'));
      render(<DeferredMenu label="Admin" items={ITEMS} align="end" {...extra} />);
      expect(scrub($('.ui-menu-wrap'))).toBe(real);
    }
  });

  it('is the Tooltip wrapper around the same child', async () => {
    const { m } = held(tooltipModule);
    const DeferredTooltip = createDeferredTooltip(m);
    const link = <a href="#/x">Home</a>;
    render(<Tooltip content="Home">{link}</Tooltip>);
    const wrap = $('.ui-tooltip-wrap');
    // the SDK adds its hidden tip and its own wiring on the child
    const real = scrub(wrap.querySelector('a') as Element)
      .replace(/ data-slot="[^"]*"/g, '')
      .replace(/ type="button"/g, '')
      .replace(/ aria-describedby="[^"]*"/g, '');
    const cls = wrap.className;
    render(<DeferredTooltip content="Home">{link}</DeferredTooltip>);
    expect($('.ui-tooltip-wrap').className).toBe(cls);
    expect(scrub($('.ui-tooltip-wrap a'))).toBe(real);
  });
});

describe('DeferredMenu before the UI SDK arrives', () => {
  const setup = () => {
    const h = held(menuModule);
    const DeferredMenu = createDeferredMenu(h.m);
    render(
      <>
        <DeferredMenu label="Admin" items={ITEMS} />
        <button type="button">After</button>
      </>,
    );
    return { ...h, trigger: $('button') };
  };

  it.each([
    ['Enter', 'Enter'],
    ['Space', ' '],
    ['ArrowDown', 'ArrowDown'],
  ])('%s opens it on arrival, on the first item', async (_n, k) => {
    const { trigger, arrive } = setup();
    act(() => trigger.focus());
    key(trigger, k);
    expect($doc('[role="menu"]')).toBeNull();
    await arrive();
    expect($doc('[role="menu"]')).not.toBeNull();
    expect(active().textContent).toBe('Users');
    key(active(), 'Escape');
    await flush();
    expect($doc('[role="menu"]')).toBeNull();
    expect(active()).toBe($('button'));
    expect(active().getAttribute('aria-haspopup')).toBe('menu');
  });

  it('a press opens it on arrival with focus on the menu, and Escape returns to the trigger', async () => {
    const { trigger, arrive } = setup();
    pointer(trigger, 'pointerdown');
    await arrive();
    expect($doc('[role="menu"]')).not.toBeNull();
    expect($('button').getAttribute('aria-expanded')).toBe('true');
    expect(active()).toBe($doc('[role="menu"]'));
    key(active(), 'Escape');
    await flush();
    expect($doc('[role="menu"]')).toBeNull();
    expect(active()).toBe($('button'));
  });

  it('a bare click (assistive tech) opens it on arrival', async () => {
    const { trigger, arrive } = setup();
    act(() => trigger.click());
    await arrive();
    expect($doc('[role="menu"]')).not.toBeNull();
  });

  it('a secondary-button press does not open it, and a plain stand-in stays closed', async () => {
    const { trigger, arrive } = setup();
    pointer(trigger, 'pointerdown', 2);
    await arrive();
    expect($doc('[role="menu"]')).toBeNull();
    expect($('button').getAttribute('aria-expanded')).toBe('false');
  });

  it('a focused stand-in keeps focus across the swap, and hover alone does not open', async () => {
    const { trigger, arrive } = setup();
    act(() => trigger.focus());
    expect(active()).toBe(trigger);
    await arrive();
    expect($('button')).not.toBe(trigger); // the SDK wraps it: a new element
    expect(active()).toBe($('button'));
    expect($doc('[role="menu"]')).toBeNull();
  });

  it('does not take focus when the stand-in had none', async () => {
    const { arrive } = setup();
    await arrive();
    expect(active()).toBe(document.body);
  });

  it('ArrowUp opens it on arrival, on the last item, as Menu does', async () => {
    const { trigger, arrive } = setup();
    act(() => trigger.focus());
    const up = new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true });
    act(() => {
      trigger.dispatchEvent(up);
    });
    expect(up.defaultPrevented).toBe(true); // the page does not scroll
    await arrive();
    expect($doc('[role="menu"]')).not.toBeNull();
    expect(active().textContent).toBe('Sign out');
  });

  it('a click whose fetch failed does not open the menu when a later hover loads it', async () => {
    let fail = true;
    const DeferredMenu = createDeferredMenu(
      deferredModule(async () => {
        if (fail) throw new Error('offline');
        return menuModule;
      }),
    );
    render(<DeferredMenu label="Admin" items={ITEMS} />);
    act(() => $('button').click());
    await flush();
    expect($doc('[role="menu"]')).toBeNull();
    fail = false;
    pointer($('button'), 'pointerover');
    await flush();
    expect($('button').getAttribute('aria-haspopup')).toBe('menu');
    expect($doc('[role="menu"]')).toBeNull(); // the old click is not what they want now
  });

  it('a key press, then focus moving away, then a late arrival leaves it closed', async () => {
    const { trigger, arrive } = setup();
    act(() => trigger.focus());
    key(trigger, 'ArrowDown');
    act(() => (host.querySelectorAll('button')[1] as HTMLElement).focus()); // Tab away: the stand-in blurs
    await arrive();
    expect($doc('[role="menu"]')).toBeNull();
    expect($('button').getAttribute('aria-expanded')).toBe('false');
  });

  it('a gesture older than 2 s when the UI SDK arrives is ignored', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { trigger, arrive } = setup();
    act(() => trigger.focus());
    key(trigger, 'ArrowDown');
    vi.setSystemTime(Date.now() + 2500);
    await arrive();
    expect($doc('[role="menu"]')).toBeNull();
  });

  it('a gesture under 2 s old still opens it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const { trigger, arrive } = setup();
    act(() => trigger.focus());
    key(trigger, 'ArrowDown');
    vi.setSystemTime(Date.now() + 1500);
    await arrive();
    expect($doc('[role="menu"]')).not.toBeNull();
  });

  it('asks for the module on hover, focus, press and key, not before', () => {
    const load = vi.fn<() => Promise<typeof menuModule>>(() => new Promise(() => {}));
    const DeferredMenu = createDeferredMenu(deferredModule(load));
    render(<DeferredMenu label="Admin" items={ITEMS} />);
    expect(load).not.toHaveBeenCalled();
    pointer($('button'), 'pointerover'); // React's onPointerEnter listens to pointerover
    expect(load).toHaveBeenCalledOnce(); // fetched at most once, however many times it is asked
    pointer($('button'), 'pointerdown');
    key($('button'), 'Tab');
    expect(load).toHaveBeenCalledOnce();
  });
});

describe('DeferredTooltip', () => {
  const setup = () => {
    const h = held(tooltipModule);
    const DeferredTooltip = createDeferredTooltip(h.m);
    render(
      <nav aria-label="Rail">
        <DeferredTooltip content="Security">
          <a href="#/security" aria-label="Security">
            icon
          </a>
        </DeferredTooltip>
      </nav>,
    );
    return { ...h, link: $<HTMLAnchorElement>('a') };
  };

  it('names the link by its own label before the tooltip arrives', () => {
    const { link } = setup();
    expect(link.getAttribute('aria-label')).toBe('Security');
    expect(link.hasAttribute('aria-describedby')).toBe(false);
    expect($doc('[role="tooltip"]:not([hidden])')).toBeNull();
  });

  it('a focused link keeps focus across the swap, and the tip then shows on focus', async () => {
    const { link, arrive } = setup();
    act(() => link.focus());
    expect($doc('[role="tooltip"]:not([hidden])')).toBeNull();
    await arrive();
    expect(active()).toBe($('a'));
    expect($('a')).not.toBe(link);
    await flush();
    expect($doc('[role="tooltip"]:not([hidden])')?.textContent).toBe('Security');
  });

  it('shows on keyboard focus after it has arrived', async () => {
    const { arrive } = setup();
    await arrive();
    expect($doc('[role="tooltip"]:not([hidden])')).toBeNull();
    act(() => $('a').focus());
    await flush();
    expect($doc('[role="tooltip"]:not([hidden])')?.textContent).toBe('Security');
    expect($('a').getAttribute('aria-describedby')).toBe(
      $doc('[role="tooltip"]:not([hidden])')?.id,
    );
  });

  it('a pointer held down on the child holds the swap, so its click still lands', async () => {
    const h = held(tooltipModule);
    const DeferredTooltip = createDeferredTooltip(h.m);
    const go = vi.fn<(e: Event) => void>((e) => e.preventDefault());
    document.addEventListener('click', go); // a click on a link that is gone never reaches the document
    render(
      <DeferredTooltip content="Security">
        <a href="#/security">Security</a>
      </DeferredTooltip>,
    );
    const link = $('a');
    pointer(link, 'pointerover'); // the pointer arrives first and asks for the UI SDK
    pointer(link, 'pointerdown');
    await h.arrive(); // the UI SDK arrives between pointerdown and pointerup
    expect($('a')).toBe(link); // the swap waits
    pointer(link, 'pointerup');
    act(() => link.click()); // the click that follows the pointerup
    expect(go).toHaveBeenCalledOnce();
    document.removeEventListener('click', go);
    await flush();
    expect($('a')).not.toBe(link); // and then it swaps
  });

  it('a cancelled pointer releases the swap', async () => {
    const h = held(tooltipModule);
    const DeferredTooltip = createDeferredTooltip(h.m);
    render(
      <DeferredTooltip content="Security">
        <a href="#/security">Security</a>
      </DeferredTooltip>,
    );
    const link = $('a');
    pointer(link, 'pointerover'); // the pointer arrives first and asks for the UI SDK
    pointer(link, 'pointerdown');
    await h.arrive();
    expect($('a')).toBe(link);
    pointer(document.body, 'pointercancel');
    await flush();
    expect($('a')).not.toBe(link);
  });

  it('asks for the module on hover and on focus', () => {
    const load = vi.fn<() => Promise<typeof tooltipModule>>(() => new Promise(() => {}));
    const DeferredTooltip = createDeferredTooltip(deferredModule(load));
    render(
      <DeferredTooltip content="Hi">
        <a href="#/x">x</a>
      </DeferredTooltip>,
    );
    expect(load).not.toHaveBeenCalled();
    act(() => $('a').focus());
    expect(load).toHaveBeenCalledOnce();
  });

  it('asks for the module when the pointer arrives', () => {
    const load = vi.fn<() => Promise<typeof tooltipModule>>(() => new Promise(() => {}));
    const DeferredTooltip = createDeferredTooltip(deferredModule(load));
    render(
      <DeferredTooltip content="Hi">
        <a href="#/x">x</a>
      </DeferredTooltip>,
    );
    pointer($('a'), 'pointerover'); // React's onPointerEnter listens to pointerover
    expect(load).toHaveBeenCalledOnce();
  });

  it('a defaultOpen tip does not wait for idle', async () => {
    const { m, arrive } = held(tooltipModule);
    const DeferredTooltip = createDeferredTooltip(m);
    render(
      <DeferredTooltip content="Shown" defaultOpen>
        <a href="#/x">x</a>
      </DeferredTooltip>,
    );
    await arrive();
    expect($doc('[role="tooltip"]:not([hidden])')?.textContent).toBe('Shown');
  });
});
