// @vitest-environment jsdom
/* The generation reveal (src/effects/generate): when it plays, that it always hands the real
   element back as it was, and that a page never loses content to it. jsdom has no layout, so
   the drawing itself is checked in the browser (the kit page's Replay); here, the contract. */
import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { enoughShowing } from '../src/effects/generate/useGenerate';
import { ChartCard, Generate, generate, skipAllGenerations, useGenerate } from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let reduce = false;
beforeAll(() => {
  class ObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const g = globalThis as { ResizeObserver?: unknown };
  g.ResizeObserver ??= ObserverStub;
  window.matchMedia = ((query: string) => ({
    matches: reduce && query.includes('reduce'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
});

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.useFakeTimers();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  reduce = false;
});

/** Gives an element a layout box, as a browser would. */
function sized(el: Element, w = 400, h = 240) {
  el.getBoundingClientRect = () => new DOMRect(0, 0, w, h);
}

describe('generate()', () => {
  it('under reduced motion fades the element in and restores its own inline styles', async () => {
    reduce = true;
    const el = document.createElement('div');
    el.style.opacity = '0.9';
    document.body.append(el);
    const done = vi.fn<(el: HTMLElement) => void>();
    const run = generate(el, { onDone: done });
    expect(el.style.opacity).toBe('0');
    expect(el.getAttribute('data-generating')).toBe('skeleton');
    expect(el.hasAttribute('inert')).toBe(true); // its buttons cannot be focused or pressed until it is shown
    vi.advanceTimersByTime(500);
    await run.finished;
    expect(el.hasAttribute('inert')).toBe(false);
    expect(el.style.opacity).toBe('0.9');
    expect(el.hasAttribute('data-generating')).toBe(false);
    expect(done).toHaveBeenCalledWith(el);
    el.remove();
  });

  it('skipAllGenerations and the ui:generate-skip event show every element at once', async () => {
    const a = document.createElement('div');
    const b = document.createElement('div');
    document.body.append(a, b);
    const ra = generate(a);
    const rb = generate(b, { delay: 400 });
    expect(a.style.opacity).toBe('0');
    skipAllGenerations();
    await ra.finished;
    expect(a.style.opacity).toBe('');
    window.dispatchEvent(new Event('ui:generate-skip'));
    await rb.finished;
    expect(b.style.opacity).toBe('');
    expect(document.querySelector('.ui-gen')).toBeNull();
    a.remove();
    b.remove();
  });

  it('a second run on the same element cancels the first', async () => {
    const el = document.createElement('div');
    document.body.append(el);
    const first = generate(el, { delay: 1000 });
    const second = generate(el, { delay: 1000 });
    await first.finished; // resolved by the cancel
    second.cancel();
    await second.finished;
    expect(el.style.opacity).toBe('');
    el.remove();
  });
});

describe('generate() render ascii', () => {
  /** A 2D context that draws nothing and records the glyphs it is asked for. */
  function fakeCanvas() {
    const glyphs: string[] = [];
    const ctx = new Proxy(
      {
        fillText: (s: string) => glyphs.push(s),
        getImageData: (_x: number, _y: number, w: number, h: number) => ({
          data: new Uint8ClampedArray(w * h * 4),
        }),
        createLinearGradient: () => ({ addColorStop() {} }),
      } as Record<string, unknown>,
      { get: (o, k) => (k in o ? o[k as string] : () => {}), set: () => true },
    );
    const spy = vi
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
    return { glyphs, spy };
  }

  it.each(['plot', 'frost'] as const)(
    '%s draws the element in glyphs, then hands it back as it was',
    async (render) => {
      const { glyphs, spy } = fakeCanvas();
      // jsdom lays nothing out: the text's one line box
      const proto = Range.prototype as unknown as { getClientRects?: () => DOMRect[] };
      proto.getClientRects = () => [new DOMRect(14, 14, 70, 14)];
      const el = document.createElement('div');
      el.innerHTML = '<p>Revenue</p>';
      document.body.append(el);
      sized(el, 280, 120);
      sized(el.firstElementChild as Element, 100, 20);
      el.style.opacity = '0.9';
      const run = generate(el, { render, duration: 2400 });
      for (let i = 0; i < 90; i++) vi.advanceTimersByTime(16); // mid-run
      expect(document.querySelector('.ui-gen-ascii')).not.toBeNull();
      expect(glyphs.join('')).toContain('R'); // its own text, letter by letter
      vi.advanceTimersByTime(3000);
      await run.finished;
      expect(el.style.opacity).toBe('0.9');
      expect(el.style.clipPath).toBe('');
      expect(document.querySelector('.ui-gen')).toBeNull();
      spy.mockRestore();
      delete proto.getClientRects;
      el.remove();
    },
  );

  it('with no 2D canvas, shows the element at once', async () => {
    const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const el = document.createElement('div');
    document.body.append(el);
    sized(el);
    const run = generate(el, { render: 'ascii' });
    vi.advanceTimersByTime(50);
    await run.finished;
    expect(el.style.opacity).toBe('');
    expect(el.hasAttribute('data-generating')).toBe(false);
    spy.mockRestore();
    warn.mockRestore();
    el.remove();
  });
});

function Probe({
  ready,
  onMount,
  inView = false,
}: {
  ready: boolean;
  onMount?: boolean;
  inView?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useGenerate(ref, ready, { onMount, inView });
  return (
    <div
      ref={(el) => {
        ref.current = el;
        if (el) sized(el);
      }}
      data-testid="probe"
    >
      content
    </div>
  );
}

/* A target five screens tall can never be 20% visible, so waiting for 20% of it left the
   Activity feed at opacity 0 on a phone. The bar is 20% of the target or of the screen,
   whichever is smaller. */
describe('useGenerate on a target taller than the screen', () => {
  const SCREEN = 844;
  const TALL = SCREEN * 6;
  let seen: { cb: IntersectionObserverCallback; options?: IntersectionObserverInit }[] = [];
  beforeEach(() => {
    seen = [];
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
          seen.push({ cb, options });
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  const entry = (showing: number) =>
    ({
      isIntersecting: showing > 0,
      intersectionRatio: showing / TALL,
      intersectionRect: { height: showing },
      boundingClientRect: { height: TALL },
      rootBounds: { height: SCREEN },
    }) as unknown as IntersectionObserverEntry;

  function Tall() {
    const ref = useRef<HTMLDivElement>(null);
    useGenerate(ref, true, { onMount: true });
    return (
      <div
        ref={(el) => {
          ref.current = el;
          if (el) sized(el, 390, TALL);
        }}
        data-testid="tall"
      >
        feed
      </div>
    );
  }
  const tall = () => host.querySelector<HTMLElement>('[data-testid="tall"]');
  /* The drawing code is a file of its own (useGenerate.ts): a start waits for it, then for two frames. */
  const notify = async (showing: number) => {
    await act(async () => {
      const last = seen[seen.length - 1];
      last?.cb([entry(showing)], {} as IntersectionObserver);
      await vi.dynamicImportSettled();
      vi.advanceTimersByTime(100);
    });
  };

  it('observes in fine steps, so a tall target is called back as it scrolls in', () => {
    act(() => root.render(<Tall />));
    const threshold = seen[0]?.options?.threshold;
    expect(Array.isArray(threshold) && threshold.length).toBeGreaterThan(50);
  });

  it('is hidden while only a sliver shows, then plays with no scrolling once the first screen is in', async () => {
    act(() => root.render(<Tall />));
    expect(tall()?.style.opacity).toBe('0');
    await notify(40); // a sliver: under a fifth of the screen
    expect(tall()?.hasAttribute('data-generate-pending')).toBe(true);
    // the whole screen of the feed showing is under 17% of the feed: the old 20%-of-itself bar never passed
    expect(SCREEN / TALL).toBeLessThan(0.2);
    await notify(SCREEN);
    expect(tall()?.hasAttribute('data-generate-pending')).toBe(false);
    expect(tall()?.style.opacity).not.toBe('0');
  });

  it('a short target still needs a fifth of itself', () => {
    const e = {
      isIntersecting: true,
      intersectionRect: { height: 20 },
      boundingClientRect: { height: 240 },
      rootBounds: { height: SCREEN },
    } as unknown as IntersectionObserverEntry;
    expect(enoughShowing(e)).toBe(false);
    expect(
      enoughShowing({ ...e, intersectionRect: { height: 60 } } as IntersectionObserverEntry),
    ).toBe(true);
  });
});

describe('useGenerate', () => {
  const probe = () => host.querySelector<HTMLElement>('[data-testid="probe"]');

  it('does not play for content that was there from the first render', () => {
    act(() => root.render(<Probe ready />));
    expect(probe()?.style.opacity).toBe('');
    expect(probe()?.hasAttribute('data-generate-pending')).toBe(false);
  });

  it('plays when the content arrives after a loading state, and unmounting shows it', () => {
    act(() => root.render(<Probe ready={false} />));
    act(() => root.render(<Probe ready />));
    expect(probe()?.style.opacity).toBe('0'); // hidden until its drawing starts
    act(() => root.render(<Probe ready={false} />));
    expect(probe()?.style.opacity).toBe('');
  });

  it('keeps hidden content out of reach: inert while pending, reachable once shown', () => {
    act(() => root.render(<Probe ready onMount />));
    expect(probe()?.hasAttribute('inert')).toBe(true); // a keyboard cannot tab onto what cannot be seen
    act(() => window.dispatchEvent(new Event('ui:generate-skip')));
    expect(probe()?.hasAttribute('inert')).toBe(false);
  });

  it('onMount plays on the first render', () => {
    act(() => root.render(<Probe ready onMount />));
    expect(probe()?.style.opacity).toBe('0');
    act(() => window.dispatchEvent(new Event('ui:generate-skip')));
    expect(probe()?.style.opacity).toBe('');
  });

  it('plays only for an element in view when its content lands; one below the fold is shown as it is', () => {
    let report: (visible: boolean) => void = () => {};
    class Seen {
      constructor(cb: IntersectionObserverCallback) {
        report = (isIntersecting) =>
          cb(
            [{ isIntersecting } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
      }
      observe() {}
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', Seen);
    act(() => root.render(<Probe ready={false} inView />));
    act(() => root.render(<Probe ready inView />));
    expect(probe()?.style.opacity).toBe('0'); // held while it is checked
    act(() => report(false)); // below the fold
    expect(probe()?.style.opacity).toBe(''); // shown as it is
    expect(probe()?.hasAttribute('data-generate-pending')).toBe(false);
    // the observer reported once and is done; a later loading state arms it afresh, in view this time
    act(() => root.render(<Probe ready={false} inView />));
    act(() => root.render(<Probe ready inView />));
    act(() => report(true)); // in view
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(probe()?.style.opacity).not.toBe('');
    vi.unstubAllGlobals();
  });

  it('a zero-size element (not laid out) is shown as it is', () => {
    act(() => root.render(<Generate>here</Generate>));
    const box = host.querySelector<HTMLElement>('.ui-generate');
    expect(box?.textContent).toBe('here');
    expect(box?.style.opacity).toBe('');
  });

  it('ChartCard keeps its chart readable through the loading → data change', () => {
    act(() =>
      root.render(
        <ChartCard title="Revenue" loading>
          <p>chart</p>
        </ChartCard>,
      ),
    );
    act(() =>
      root.render(
        <ChartCard title="Revenue">
          <p>chart</p>
        </ChartCard>,
      ),
    );
    expect(host.textContent).toContain('chart');
    expect(host.querySelector('[role="group"]')?.getAttribute('style') ?? '').not.toContain(
      'opacity: 0',
    );
  });
});
