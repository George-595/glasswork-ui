// @vitest-environment jsdom
/* Six pieces whose ideas came from EasyUI (rebuilt on the kit, none of its code): FunnelChart,
   LiveLineChart, toast.undo, OtpField, PullToRefresh and ProductTour. Behaviour and keyboard for
   each, the pure helpers, then an axe pass over all of them in every skin x mode (contrast is
   held by the token gate and the browser pass of `npm run check:a11y`). */
import axe from 'axe-core';
import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanCode } from '../src/components/inputs/otp-field';
import { clearMaterialMaps } from '../src/glass';
import {
  agoLabel,
  biggestDrop,
  ChartCard,
  FormField,
  FunnelChart,
  inWindow,
  LiveLineChart,
  type LivePoint,
  OtpField,
  ProductTour,
  PullToRefresh,
  placeCard,
  pullDistance,
  scrimPath,
  Toaster,
  toast,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const g = globalThis as { ResizeObserver?: unknown };
  g.ResizeObserver ??= ResizeObserverStub;
  const proto = Element.prototype as Partial<{ scrollIntoView: () => void }>;
  proto.scrollIntoView ??= () => {};
  // jsdom's <dialog> has no showModal/close in some versions
  const dlg = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;
  if (!dlg.showModal)
    dlg.showModal = function (this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
  if (!dlg.close)
    dlg.close = function (this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  clearMaterialMaps();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => toast.dismiss());
  act(() => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-skin');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function render(node: ReactNode) {
  act(() => root.render(node));
  return host;
}
const $ = <E extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as E;
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const click = (el: Element) => act(() => (el as HTMLElement).click());
const button = (name: string) =>
  $$('button').find((b) => b.textContent?.trim() === name) as HTMLButtonElement;
function key(el: Element | Document, k: string, init: KeyboardEventInit = {}) {
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  });
}
function type(el: HTMLInputElement, text: string) {
  act(() => {
    el.focus();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    set?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const wait = (ms = 0) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

const FUNNEL = [
  { label: 'Visited', value: 3000 },
  { label: 'Signed up', value: 1200 },
  { label: 'Added stock', value: 900 },
  { label: 'Handed out', value: 300 },
];

describe('FunnelChart', () => {
  it('reads as an ordered list of stages with counts and shares of the first', () => {
    render(<FunnelChart title="Volunteer sign-up" data={FUNNEL} />);
    const items = $$('ol.ui-funnel > li');
    expect(items).toHaveLength(4);
    expect($('ol.ui-funnel').getAttribute('aria-label')).toBe('Volunteer sign-up: stages');
    expect(items[1]?.textContent).toContain('1,200');
    expect(items[1]?.textContent).toContain('40% of Visited');
    // the step between says what happened, in words
    expect(items[1]?.textContent).toContain('40% went on · 1,800 dropped');
  });

  it('marks the biggest drop in words', () => {
    render(<FunnelChart title="Sign-up" data={FUNNEL} />);
    const marked = $$('ol.ui-funnel > li').filter((li) => li.textContent?.includes('Biggest drop'));
    expect(marked).toHaveLength(1);
    expect(marked[0]?.textContent).toContain('Handed out');
    expect(biggestDrop([3000, 1200, 900, 300])).toBe(3);
    expect(biggestDrop([10, 10, 12])).toBe(-1);
  });

  it('keeps its data in the table and says when there is nothing to draw', () => {
    render(<FunnelChart title="Sign-up" data={FUNNEL} />);
    const rows = $$('table tbody tr').map((r) => r.textContent);
    expect(rows[2]).toContain('75%');
    render(<FunnelChart title="Sign-up" data={[]} />);
    expect($('.ui-chart-empty')?.textContent).toBe('No data to show.');
  });
});

const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);
const feed = (n: number, from = 0): LivePoint[] =>
  Array.from({ length: n }, (_, i) => ({ t: T0 + (from + i) * 5000, value: 10 + ((i * 7) % 5) }));

describe('LiveLineChart', () => {
  it('keeps the window that ends at the newest reading, plus one to enter from the edge', () => {
    const { now, points } = inWindow(feed(30), 60_000);
    expect(now).toBe(T0 + 29 * 5000);
    expect(points[0]?.t).toBe(now - 65_000);
    expect(agoLabel(0)).toBe('now');
    expect(agoLabel(20_000)).toBe('20 s ago');
    expect(agoLabel(300_000)).toBe('5 min ago');
  });

  it('names the plot with the latest value and the range, and is not a live region', () => {
    render(<LiveLineChart title="Queue" points={feed(30)} timeZone="UTC" />);
    const img = $('svg[role="img"]');
    expect(img.getAttribute('aria-label')).toMatch(
      /^Queue: \d+ at 12:02:25; over the last 60 s, low 10, high 14$/,
    );
    expect(img.closest('[aria-live]')).toBeNull();
    expect($('.ui-live-state').textContent).toBe('Live');
    expect($$('table tbody tr').length).toBe(13);
  });

  it('pauses on request, holds the picture and counts what came in', () => {
    function Feed() {
      const [points, setPoints] = useState(feed(20));
      return (
        <>
          <LiveLineChart title="Queue" points={points} timeZone="UTC" />
          <button type="button" onClick={() => setPoints((p) => [...p, ...feed(2, p.length)])}>
            more
          </button>
        </>
      );
    }
    render(<Feed />);
    const pause = button('Pause updates');
    expect(pause.getAttribute('aria-pressed')).toBe('false');
    click(pause);
    expect(pause.getAttribute('aria-pressed')).toBe('true');
    const label = $('svg[role="img"]').getAttribute('aria-label');
    click(button('more'));
    expect($('svg[role="img"]').getAttribute('aria-label')).toBe(label);
    expect($('.ui-live-state').textContent).toBe('Paused · 2 new');
    click(pause);
    expect($('.ui-live-state').textContent).toBe('Live');
    expect($('svg[role="img"]').getAttribute('aria-label')).not.toBe(label);
  });

  it('waits for the first reading in words', () => {
    render(<LiveLineChart title="Queue" points={[]} />);
    expect($('.ui-chart-empty').textContent).toBe('Waiting for the first reading.');
  });
});

describe('toast.undo', () => {
  it('undoes from its button, once, and says so', async () => {
    const onUndo = vi.fn<() => void>();
    const onExpire = vi.fn<() => void>();
    render(<Toaster />);
    act(() => {
      toast.undo('Deleted "Bed frame"', { onUndo, onExpire });
    });
    await wait();
    expect($('.ui-toast-countdown')).not.toBeNull();
    click(button('Undo'));
    expect(onUndo).toHaveBeenCalledOnce();
    await wait(400);
    expect($$('.ui-toast').some((t) => t.textContent?.includes('Undone'))).toBe(true);
    act(() => toast.dismiss());
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('Ctrl+Z undoes the newest, but not from inside a text field', async () => {
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    render(
      <>
        <input aria-label="Notes" />
        <Toaster />
      </>,
    );
    act(() => {
      toast.undo('Moved A', { onUndo: first, undone: false });
      toast.undo('Moved B', { onUndo: second, undone: false });
    });
    await wait();
    key($('input[aria-label="Notes"]'), 'z', { ctrlKey: true });
    expect(second).not.toHaveBeenCalled();
    key(document.body, 'z', { ctrlKey: true });
    expect(second).toHaveBeenCalledOnce();
    expect(first).not.toHaveBeenCalled();
    await wait();
    key(document.body, 'z', { metaKey: true });
    expect(first).toHaveBeenCalledOnce();
  });

  it('runs onExpire once when it leaves without an undo', async () => {
    const onExpire = vi.fn<() => void>();
    render(<Toaster />);
    act(() => {
      toast.undo('Archived', { onUndo: () => {}, onExpire });
    });
    await wait();
    click($('[aria-label="Dismiss notification"]'));
    act(() => toast.dismiss());
    expect(onExpire).toHaveBeenCalledOnce();
  });
});

describe('OtpField', () => {
  it('cleans what is typed or pasted', () => {
    expect(cleanCode('12 34-56', 6)).toBe('123456');
    expect(cleanCode('1234567', 6)).toBe('123456');
    expect(cleanCode('ab-12c', 6, 'alphanumeric')).toBe('AB12C');
  });

  it('is one labelled text box that offers the texted code and finishes once', () => {
    const onComplete = vi.fn<(code: string) => void>();
    function Code() {
      const [v, setV] = useState('');
      return (
        <FormField label="Sign-in code" description="We sent it to your phone.">
          <OtpField value={v} onValueChange={setV} onComplete={onComplete} />
        </FormField>
      );
    }
    render(<Code />);
    const inputs = $$('input');
    expect(inputs).toHaveLength(1);
    const box = inputs[0] as HTMLInputElement;
    expect(box.getAttribute('autocomplete')).toBe('one-time-code');
    expect(box.getAttribute('inputmode')).toBe('numeric');
    expect($(`label[for="${box.id}"]`).textContent).toContain('Sign-in code');
    expect(box.getAttribute('aria-describedby')).toBeTruthy();
    type(box, '12 3');
    expect(box.value).toBe('123');
    expect($$('.ui-otp-box').map((b) => b.textContent)).toEqual(['1', '2', '3', '', '', '']);
    expect($$('.ui-otp-box')[3]?.hasAttribute('data-active')).toBe(true);
    type(box, '123456');
    expect(onComplete).toHaveBeenCalledWith('123456');
    // every box is drawing: assistive tech meets the one field
    expect($$('.ui-otp-box').every((b) => b.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});

describe('PullToRefresh', () => {
  it('resists and caps the pull', () => {
    expect(pullDistance(-10)).toBe(0);
    expect(pullDistance(100)).toBe(50);
    expect(pullDistance(1000)).toBe(128);
  });

  it('refreshes from a pull past the threshold, and says when it is done', async () => {
    let finish: () => void = () => {};
    const onRefresh = vi.fn<() => Promise<void>>(() => new Promise<void>((r) => (finish = r)));
    render(
      <PullToRefresh onRefresh={onRefresh}>
        <p>List</p>
      </PullToRefresh>,
    );
    const el = $('.ui-ptr');
    const touch = (name: string, y: number) =>
      act(() => {
        const e = new Event(name, { bubbles: true }) as Event & { touches: unknown };
        Object.defineProperty(e, 'touches', { value: name === 'touchend' ? [] : [{ clientY: y }] });
        el.dispatchEvent(e);
      });
    touch('touchstart', 100);
    touch('touchmove', 180);
    expect(el.getAttribute('data-phase')).toBe('pulling');
    touch('touchmove', 260);
    expect(el.getAttribute('data-phase')).toBe('armed');
    touch('touchend', 260);
    expect(onRefresh).toHaveBeenCalledOnce();
    expect($('.ui-ptr [role="status"]').textContent).toBe('Refreshing…');
    await act(async () => {
      finish();
      await Promise.resolve();
    });
    await wait();
    expect($('.ui-ptr [role="status"]').textContent).toBe('Updated');
    expect(el.getAttribute('data-phase')).toBe('idle');
  });

  it('a short pull springs back; the Refresh button does the same without a gesture', async () => {
    const onRefresh = vi.fn<() => Promise<void>>(async () => {
      throw new Error('offline');
    });
    render(
      <PullToRefresh onRefresh={onRefresh} label="Refresh stock">
        <p>List</p>
      </PullToRefresh>,
    );
    const el = $('.ui-ptr');
    act(() => {
      const e = new Event('touchstart') as Event & { touches: unknown };
      Object.defineProperty(e, 'touches', { value: [{ clientY: 0 }] });
      el.dispatchEvent(e);
    });
    act(() => {
      const e = new Event('touchend') as Event & { touches: unknown };
      Object.defineProperty(e, 'touches', { value: [] });
      el.dispatchEvent(e);
    });
    expect(onRefresh).not.toHaveBeenCalled();
    click(button('Refresh stock'));
    await wait();
    expect(onRefresh).toHaveBeenCalledOnce();
    expect($('.ui-ptr [role="status"]').textContent).toBe("Couldn't refresh");
  });
});

describe('ProductTour', () => {
  it('places the card below, above or in the middle, always on screen', () => {
    const view = { w: 1000, h: 800 };
    const card = { w: 300, h: 160 };
    expect(placeCard({ x: 100, y: 100, w: 200, h: 40 }, card, view)).toEqual({ x: 50, y: 152 });
    expect(placeCard({ x: 900, y: 700, w: 80, h: 40 }, card, view)).toEqual({ x: 684, y: 528 });
    expect(placeCard(null, card, view)).toEqual({ x: 350, y: 320 });
    expect(scrimPath({ w: 10, h: 10 }, null)).toBe('M0,0H10V10H0Z');
  });

  it('walks the steps with the buttons and arrows, focusing each title, and ends "done"', () => {
    const onClose = vi.fn<(reason: 'done' | 'skipped') => void>();
    const steps = [
      { target: '#new-stock', title: 'Add stock here', body: 'Scan a label or type it in.' },
      { target: '#missing', title: 'Hand out', body: 'From the Packs page.' },
      { title: 'That is it' },
    ];
    function Page() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" id="new-stock" onClick={() => setOpen(true)}>
            Start tour
          </button>
          <ProductTour
            steps={steps}
            open={open}
            onClose={(r) => {
              onClose(r);
              setOpen(false);
            }}
          />
        </>
      );
    }
    render(<Page />);
    const opener = button('Start tour');
    act(() => opener.focus());
    click(opener);
    const dialog = $('dialog.ui-tour');
    expect(dialog.hasAttribute('open')).toBe(true);
    expect(document.activeElement?.textContent).toBe('Add stock here');
    expect(dialog.getAttribute('aria-labelledby')).toBe(document.activeElement?.id);
    expect(dialog.textContent).toContain('Step 1 of 3');
    click(button('Next'));
    expect(dialog.textContent).toContain('Step 2 of 3');
    expect(document.activeElement?.textContent).toBe('Hand out');
    key(dialog, 'ArrowLeft');
    expect(dialog.textContent).toContain('Step 1 of 3');
    key(dialog, 'ArrowRight');
    key(dialog, 'ArrowRight');
    expect(button('Done')).toBeTruthy();
    click(button('Done'));
    expect(onClose).toHaveBeenCalledWith('done');
    expect(document.activeElement).toBe(opener);
  });

  it('Skip tour ends it "skipped"', () => {
    const onClose = vi.fn<(reason: 'done' | 'skipped') => void>();
    render(<ProductTour steps={[{ title: 'One' }, { title: 'Two' }]} open onClose={onClose} />);
    click(button('Skip tour'));
    expect(onClose).toHaveBeenCalledWith('skipped');
  });
});

function Everything() {
  const [code, setCode] = useState('12');
  return (
    <main>
      <h1>Kit additions</h1>
      <ChartCard title="Sign-up funnel">
        <FunnelChart title="Sign-up funnel" data={FUNNEL} />
      </ChartCard>
      <LiveLineChart title="Queue length" points={feed(20)} timeZone="UTC" />
      <FormField label="Sign-in code">
        <OtpField value={code} onValueChange={setCode} />
      </FormField>
      <PullToRefresh onRefresh={() => {}}>
        <p>Stock list</p>
      </PullToRefresh>
      <Toaster />
    </main>
  );
}

const AXE = {
  runOnly: {
    type: 'tag' as const,
    values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
  },
  rules: { 'color-contrast': { enabled: false } },
  resultTypes: ['violations' as const],
};
const report = (r: axe.AxeResults) =>
  r.violations
    .map((x) => `${x.id}: ${x.help}\n${x.nodes.map((nd) => `  ${nd.target.join(' ')}`).join('\n')}`)
    .join('\n');

describe('axe: the additions, every skin x mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(<Everything />);
        act(() => {
          toast.undo('Deleted "Bed frame"', { onUndo: () => {} });
        });
        await wait();
        expect(report(await axe.run(document.body, AXE))).toBe('');
      });
    }
  }
  it('the tour, open', async () => {
    render(
      <main>
        <h1>Tour</h1>
        <button type="button" id="x">
          Target
        </button>
        <ProductTour
          steps={[{ target: '#x', title: 'This', body: 'Does that.' }]}
          open
          onClose={() => {}}
        />
      </main>,
    );
    expect(report(await axe.run(document.body, AXE))).toBe('');
  });
});
