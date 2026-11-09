// @vitest-environment jsdom
/* Which sound each kit component plays, and when: only for a person's action, never on mount.
   Sounds are observed through the `ui:sound` event, so no audio is involved. */
import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  Checkbox,
  Composer,
  Dialog,
  SegmentedControl,
  Sheet,
  Switch,
  Tabs,
  Toaster,
  toast,
} from '../src/index';
import { resetSoundEngine } from '../src/sound/engine';
import { resetSoundStore } from '../src/sound/store';

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
  const dlg = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;
  dlg.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  dlg.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    setTimeout(() => this.dispatchEvent(new Event('close')), 0);
  };
});

let host: HTMLDivElement;
let root: Root;
const heard: string[] = [];
const onSound = (e: Event) => heard.push((e as CustomEvent<{ name: string }>).detail.name);

beforeEach(() => {
  // the throttle is per sound and by the clock: step it past 60 ms between actions
  vi.useFakeTimers({ toFake: ['Date'] });
  localStorage.clear();
  resetSoundStore();
  resetSoundEngine();
  heard.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  window.addEventListener('ui:sound', onSound);
});
afterEach(() => {
  window.removeEventListener('ui:sound', onSound);
  act(() => toast.dismiss());
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
});

function render(node: ReactNode) {
  act(() => root.render(node));
}
/** A person acts: move past the throttle, then do it. */
function act60(fn: () => void) {
  vi.setSystemTime(Date.now() + 100);
  act(fn);
}
const $ = <E extends Element = HTMLElement>(sel: string) =>
  (host.querySelector(sel) ?? document.querySelector(sel)) as E;

describe("kit sounds on a person's action", () => {
  it('Switch: toggle-on, then toggle-off; none on mount', () => {
    function S() {
      const [on, setOn] = useState(false);
      return <Switch label="Alerts" checked={on} onCheckedChange={setOn} />;
    }
    render(<S />);
    expect(heard).toEqual([]);
    act60(() => $('[role="switch"]').click());
    act60(() => $('[role="switch"]').click());
    expect(heard).toEqual(['toggle-on', 'toggle-off']);
  });

  it('Checkbox: tick on change, with and without a label', () => {
    render(
      <>
        <Checkbox aria-label="Bare" />
        <Checkbox label="Labelled" />
      </>,
    );
    expect(heard).toEqual([]);
    const boxes = host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    act60(() => boxes[0]?.click());
    act60(() => boxes[1]?.click());
    expect(heard).toEqual(['tick', 'tick']);
  });

  it("Checkbox still calls the caller's onChange", () => {
    const onChange = vi.fn<() => void>();
    render(<Checkbox aria-label="x" onChange={onChange} />);
    act60(() => $<HTMLInputElement>('input').click());
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('SegmentedControl: tick when the value changes, not for the same one', () => {
    render(
      <SegmentedControl
        label="Range"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />,
    );
    expect(heard).toEqual([]);
    const items = host.querySelectorAll<HTMLElement>('button');
    act60(() => items[0]?.click()); // already chosen
    expect(heard).toEqual([]);
    act60(() => items[1]?.click());
    expect(heard).toEqual(['tick']);
  });

  it('Tabs: tick when the tab changes', () => {
    render(
      <Tabs
        label="Sections"
        tabs={[
          { id: 'one', label: 'One', content: 'First' },
          { id: 'two', label: 'Two', content: 'Second' },
        ]}
      />,
    );
    expect(heard).toEqual([]);
    const tabs = host.querySelectorAll<HTMLElement>('[role="tab"]');
    act60(() => {
      tabs[1]?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    });
    expect(heard).toEqual(['tick']);
  });

  it('Dialog: open then close; nothing on first mount, even when it starts open', () => {
    function D({ start }: { start: boolean }) {
      const [open, setOpen] = useState(start);
      return (
        <>
          <button type="button" id="go" onClick={() => setOpen((o) => !o)}>
            Toggle
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="Hello" />
        </>
      );
    }
    render(<D start />);
    expect(heard).toEqual([]);
    act60(() => $('#go').click());
    act60(() => $('#go').click());
    expect(heard).toEqual(['close', 'open']);
  });

  it('Sheet: open then close; nothing on first mount', () => {
    function S() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button type="button" id="go" onClick={() => setOpen((o) => !o)}>
            Toggle
          </button>
          <Sheet open={open} onOpenChange={setOpen} title="Details" description="About it" />
        </>
      );
    }
    render(<S />);
    expect(heard).toEqual([]);
    act60(() => $('#go').click());
    expect(heard).toEqual(['open']);
    act60(() => $('#go').click());
    expect(heard).toEqual(['open', 'close']);
  });

  it('toast: success, error, info and the default each play their sound', () => {
    render(<Toaster />);
    expect(heard).toEqual([]);
    act60(() => void toast.success('Saved'));
    act60(() => void toast.error('Failed'));
    act60(() => void toast.info('Note'));
    act60(() => void toast('Plain'));
    expect(heard).toEqual(['success', 'error', 'notify', 'notify']);
  });

  it('Composer: send when a message goes, nothing for an empty one', () => {
    const onSend = vi.fn<(text: string) => void>();
    render(<Composer onSend={onSend} label="Message" />);
    const field = $<HTMLTextAreaElement>('textarea');
    act60(() => {
      $<HTMLFormElement>('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(heard).toEqual([]);
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(field, 'Hello');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act60(() => {
      $<HTMLFormElement>('form').dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true }),
      );
    });
    expect(onSend).toHaveBeenCalledWith('Hello');
    expect(heard).toEqual(['send']);
  });

  it('Button: silent by default, plays its sound prop when pressed', () => {
    render(
      <>
        <Button id="plain">Plain</Button>
        <Button id="loud" sound="success">
          Loud
        </Button>
      </>,
    );
    act60(() => $('#plain').click());
    expect(heard).toEqual([]);
    act60(() => $('#loud').click());
    expect(heard).toEqual(['success']);
  });

  it('plays nothing on hover or focus', () => {
    render(
      <>
        <Button sound="success">Loud</Button>
        <Switch label="S" checked={false} onCheckedChange={() => {}} />
      </>,
    );
    act60(() => {
      for (const el of host.querySelectorAll('button')) {
        el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        el.dispatchEvent(new PointerEvent('pointerenter'));
        el.focus();
      }
    });
    expect(heard).toEqual([]);
  });

  it('plays nothing when Sounds is off', () => {
    localStorage.setItem('ui-sounds', 'off');
    render(<Button sound="success">Loud</Button>);
    act60(() => $('button').click());
    expect(heard).toEqual([]);
  });
});
