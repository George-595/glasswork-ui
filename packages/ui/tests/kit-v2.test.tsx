// @vitest-environment jsdom
/* Kit v2: behaviour of the states, inputs, overlays and data-display
   components added in one round (EmptyState, ErrorState, LoadingRegion, Delta,
   SegmentedControl, Toaster, Sheet, Slider, Avatar, AvatarGroup, Kbd,
   Breadcrumbs, Progress, Meter, ConfirmDialog, DescriptionList, KpiTile), plus
   an axe pass over all of them in every skin x mode.

   jsdom has no layout, so axe's colour-contrast rule is off here (as in
   base-app's runAxe); contrast is held by the token gate and the browser pass
   of `npm run check:a11y`, which renders the same components from the Showcase. */
import axe from 'axe-core';
import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMaterialMaps } from '../src/glass';
import {
  Avatar,
  AvatarGroup,
  Breadcrumbs,
  Button,
  ConfirmDialog,
  Delta,
  DescriptionList,
  EmptyState,
  ErrorState,
  initialsOf,
  Kbd,
  KpiTile,
  LoadingRegion,
  Meter,
  meterTone,
  Progress,
  SegmentedControl,
  Sheet,
  Skeleton,
  Slider,
  Toaster,
  toast,
  toneOf,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/* What Radix needs from a browser that jsdom lacks. */
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
  // jsdom has no modal <dialog>: open/close it and fire `close`, as a browser does
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
});

function render(node: ReactNode) {
  act(() => root.render(node));
  return host;
}
const $ = <E extends Element = HTMLElement>(sel: string) => host.querySelector(sel) as E;
const $$ = (sel: string) => Array.from(host.querySelectorAll<HTMLElement>(sel));
/* Radix portals toasts and sheets to <body>, outside the host */
const $doc = <E extends Element = HTMLElement>(sel: string) => document.querySelector<E>(sel);
const $$doc = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
function key(el: Element, k: string, init: KeyboardEventInit = {}) {
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  });
}
const click = (el: HTMLElement) => act(() => el.click());
/** Run deferred work (roving focus, focus return, promises). */
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
  });
const active = () => document.activeElement as HTMLElement;
const nameOf = (el: Element) => {
  const by = el.getAttribute('aria-labelledby');
  if (by) return document.getElementById(by)?.textContent ?? '';
  return el.getAttribute('aria-label') ?? el.textContent ?? '';
};

describe('EmptyState', () => {
  it('has a real heading, a description and an action slot, in two sizes', () => {
    render(
      <EmptyState
        icon="search"
        title="No results"
        description="Try another filter."
        action={<Button>Clear filters</Button>}
        as="h2"
      />,
    );
    expect($('h2')?.textContent).toBe('No results');
    expect($('.ui-empty-state-description')?.textContent).toBe('Try another filter.');
    expect($('.ui-empty-state-action button')?.textContent).toBe('Clear filters');
    expect($('.ui-empty-state-icon')?.getAttribute('aria-hidden')).toBe('true');
    expect($('.ui-empty-state')?.getAttribute('data-size')).toBe('md');
    render(<EmptyState title="Nothing" size="sm" className="x" />);
    expect($('.ui-empty-state')?.getAttribute('data-size')).toBe('sm');
    expect($('.ui-empty-state')?.classList.contains('x')).toBe(true);
  });
});

describe('ErrorState and LoadingRegion', () => {
  it('is an alert with the failure in words and a Retry that keeps focus on #main', () => {
    const retry = vi.fn<() => void>();
    const main = document.createElement('main');
    main.id = 'main';
    main.tabIndex = -1;
    document.body.append(main);
    render(<ErrorState what="orders" error={{ message: 'Boom', status: 500 }} onRetry={retry} />);
    const alert = $('[role="alert"]');
    expect(alert.textContent).toContain('Couldn’t load orders.');
    expect(alert.textContent).toContain('Boom');
    click($('button'));
    expect(retry).toHaveBeenCalledOnce();
    expect(document.activeElement).toBe(main);
    main.remove();
  });

  it('reads code, status and errorId structurally, with no Retry when not allowed', () => {
    const e = render(
      <ErrorState
        what="users"
        error={{ code: 'forbidden', status: 403, message: 'x', errorId: 'ab12' }}
        onRetry={() => {}}
      />,
    );
    expect(e.textContent).toContain('Your account is not allowed to see this.');
    expect(e.textContent).toContain('Reference: ab12');
    expect(e.querySelector('button')).toBeNull();
    render(<ErrorState what="users" error={{ code: 'unauthenticated', status: 401 }} />);
    expect(host.textContent).toContain('Your session has ended. Sign in again.');
    render(<ErrorState what="users" error={new Error('plain')} />);
    expect(host.textContent).toContain('plain');
    render(<ErrorState what="users" error={42} />);
    expect(host.textContent).toContain('Something went wrong.');
  });

  it('LoadingRegion is a busy group named "Loading …" with a polite status', () => {
    render(
      <LoadingRegion label="orders">
        <Skeleton />
      </LoadingRegion>,
    );
    const group = $('[role="group"]');
    expect(group.getAttribute('aria-busy')).toBe('true');
    expect(group.getAttribute('aria-label')).toBe('Loading orders');
    expect($('[role="status"]')?.textContent).toBe('Loading orders…');
  });
});

describe('Delta', () => {
  it('says up, down and no change in words, not colour alone', () => {
    render(<Delta ratio={0.042} />);
    expect(host.textContent).toContain('up');
    expect(host.textContent).toContain('+4.2%');
    expect($('.ui-delta')?.getAttribute('data-direction')).toBe('up');
    render(<Delta ratio={-0.031} />);
    expect(host.textContent).toContain('down');
    expect(host.textContent).toContain('−3.1%');
    render(<Delta ratio={-0.0004} />);
    expect(host.textContent).toContain('no change');
    render(<Delta ratio={null} />);
    expect($('.ui-delta')?.getAttribute('data-direction')).toBe('flat');
  });

  it('takes a custom format', () => {
    render(<Delta ratio={0.5} format={(r) => `${r * 100} points`} />);
    expect(host.textContent).toContain('50 points');
  });
});

describe('SegmentedControl', () => {
  const OPTS = [
    { value: '7', label: '7 days' },
    { value: '30', label: '30 days' },
    { value: '90', label: '90 days' },
  ];
  function Controlled({ spy }: { spy?: (v: string) => void }) {
    const [v, setV] = useState('7');
    return (
      <SegmentedControl
        label="Range"
        options={OPTS}
        value={v}
        onValueChange={(n) => {
          setV(n);
          spy?.(n);
        }}
      />
    );
  }

  it('is a named radio group; one segment is checked and in the tab order', () => {
    render(<Controlled />);
    expect($('[role="radiogroup"]').getAttribute('aria-label')).toBe('Range');
    const radios = $$('[role="radio"]');
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
    // one tab stop: the group, which hands focus to the checked segment
    const group = $('[role="radiogroup"]');
    expect(group.tabIndex).toBe(0);
    act(() => group.focus());
    expect(active()).toBe(radios[0]);
  });

  it('arrow keys move focus and choose, wrap, and Home/End jump', async () => {
    const spy = vi.fn<(v: string) => void>();
    render(<Controlled spy={spy} />);
    act(() => $$('[role="radio"]')[0]?.focus());
    key(active(), 'ArrowRight');
    await flush();
    expect(active().textContent).toBe('30 days');
    expect(spy).toHaveBeenLastCalledWith('30');
    expect(active().getAttribute('aria-checked')).toBe('true');
    key(active(), 'End');
    await flush();
    expect(active().textContent).toBe('90 days');
    key(active(), 'ArrowRight'); // wraps
    await flush();
    expect(active().textContent).toBe('7 days');
    expect(spy).toHaveBeenLastCalledWith('7');
  });

  it('a click chooses, and clicking the chosen segment keeps it chosen', () => {
    const spy = vi.fn<(v: string) => void>();
    render(<Controlled spy={spy} />);
    click($$('[role="radio"]')[2] as HTMLElement);
    expect(spy).toHaveBeenCalledWith('90');
    click($$('[role="radio"]')[2] as HTMLElement);
    expect(
      $$('[role="radio"]').filter((r) => r.getAttribute('aria-checked') === 'true'),
    ).toHaveLength(1);
  });

  it('works uncontrolled, skips disabled segments and stretches when asked', () => {
    render(
      <SegmentedControl
        label="View"
        defaultValue="b"
        size="sm"
        fullWidth
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
          { value: 'c', label: 'C', disabled: true },
        ]}
      />,
    );
    expect($('.ui-segmented').getAttribute('data-size')).toBe('sm');
    expect($$('[role="radio"]')[1]?.getAttribute('aria-checked')).toBe('true');
    expect(($$('[role="radio"]')[2] as HTMLButtonElement).disabled).toBe(true);
    click($$('[role="radio"]')[0] as HTMLElement);
    expect($$('[role="radio"]')[0]?.getAttribute('aria-checked')).toBe('true');
  });

  it('its sliding pill is decorative and switches off under reduced motion', () => {
    class RO {
      cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
      }
      observe() {
        this.cb();
      }
      unobserve() {}
      disconnect() {}
    }
    vi.stubGlobal('ResizeObserver', RO);
    render(<Controlled />);
    // jsdom has no layout, so every box is 0 wide; the pill still mounts, decorative
    const pill = $('.ui-segmented-pill');
    expect(pill?.getAttribute('aria-hidden')).toBe('true');
    expect(pill?.className).toContain('motion-reduce:transition-none');
    vi.unstubAllGlobals();
  });
});

describe('Toaster and toast()', () => {
  it('shows a toast with its text, announces it politely and dismisses it', async () => {
    render(<Toaster />);
    act(() => {
      toast.success('Saved', { description: 'Your changes are live.' });
    });
    await flush();
    const region = $doc('[aria-label^="Notifications"]');
    expect(region).not.toBeNull();
    const item = $doc('.ui-toast');
    expect(item?.textContent).toContain('Saved');
    expect(item?.textContent).toContain('Your changes are live.');
    // the variant is a word too, not only an icon and a colour
    expect(item?.textContent).toContain('Success:');
    expect(item?.getAttribute('data-variant')).toBe('success');
    // Radix mirrors it into a polite live region (a frame or two later)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 100));
    });
    const live = $$doc('[role="status"][aria-live="polite"]');
    expect(live.some((l) => l.textContent?.includes('Saved'))).toBe(true);
    click($doc('[aria-label="Dismiss notification"]') as HTMLElement);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect($doc('.ui-toast')).toBeNull();
  });

  it('errors are assertive and stay until dismissed; actions fire', async () => {
    const undo = vi.fn<() => void>();
    render(<Toaster />);
    act(() => {
      toast.error('Could not send', { action: { label: 'Retry', onClick: undo } });
    });
    await flush();
    expect($$doc('[role="status"][aria-live="assertive"]').length).toBeGreaterThan(0);
    expect($doc('.ui-toast')?.textContent).toContain('Error:');
    const retry = $$doc('.ui-toast button').find((b) => b.textContent === 'Retry') as HTMLElement;
    click(retry);
    expect(undo).toHaveBeenCalledOnce();
  });

  it('auto-dismisses after its duration', async () => {
    render(<Toaster />);
    act(() => {
      toast('Heads up', { duration: 60 });
    });
    await flush();
    expect($doc('.ui-toast')).not.toBeNull();
    // poll rather than sleep a fixed time: the exit animation runs late on a busy machine
    for (let waited = 0; $doc('.ui-toast') && waited < 5000; waited += 100) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });
    }
    expect($doc('.ui-toast')).toBeNull();
  });

  it('stacks at most three: the oldest leaves when a fourth arrives', async () => {
    render(<Toaster />);
    act(() => {
      toast('One', { duration: Number.POSITIVE_INFINITY });
      toast('Two', { duration: Number.POSITIVE_INFINITY });
      toast('Three', { duration: Number.POSITIVE_INFINITY });
      toast.info('Four', { duration: Number.POSITIVE_INFINITY });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    const titles = $$doc('.ui-toast').map((t) => t.textContent ?? '');
    expect(titles).toHaveLength(3);
    expect(titles.some((t) => t.includes('One'))).toBe(false);
    expect(titles.some((t) => t.includes('Four'))).toBe(true);
  });
});

describe('Sheet', () => {
  function Host({ side }: { side?: 'right' | 'left' | 'bottom' }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" id="opener" onClick={() => setOpen(true)}>
          Open details
        </button>
        <Sheet
          open={open}
          onOpenChange={setOpen}
          side={side}
          title="Order 1001"
          description="Everything about this order."
          footer={<Button size="sm">Save</Button>}
        >
          <input aria-label="Note" />
        </Sheet>
      </>
    );
  }

  it('opens as a labelled modal dialog, traps focus, and closes on Escape returning focus', async () => {
    render(<Host />);
    const opener = $('#opener');
    act(() => opener.focus());
    click(opener);
    await flush();
    const dialog = $doc('[role="dialog"]') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(nameOf(dialog)).toBe('Order 1001');
    expect(
      document.getElementById(dialog.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toBe('Everything about this order.');
    expect(dialog.getAttribute('data-side')).toBe('right');
    expect(dialog.contains(active())).toBe(true);
    // Tab from the last control wraps inside; focus never reaches the page behind
    for (let i = 0; i < 6; i++) {
      key(active(), 'Tab');
      await flush();
      expect(dialog.contains(active()) || active() === document.body).toBe(true);
    }
    expect(active()).not.toBe(opener);
    key(active(), 'Escape');
    await flush();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect($doc('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('has a labelled Close button, and sides left and bottom', async () => {
    render(<Host side="bottom" />);
    click($('#opener'));
    await flush();
    const dialog = $doc('[role="dialog"]') as HTMLElement;
    expect(dialog.getAttribute('data-side')).toBe('bottom');
    click(dialog.querySelector('button[aria-label="Close"]') as HTMLElement);
    await flush();
    expect($doc('[role="dialog"]')).toBeNull();
  });
});

describe('Slider', () => {
  it('is a named slider; arrow keys, Home and End change the value', () => {
    const spy = vi.fn<(v: number) => void>();
    render(
      <Slider
        label="Volume"
        defaultValue={50}
        min={0}
        max={100}
        step={5}
        onValueChange={spy}
        formatValue={(v) => `${v} percent`}
      />,
    );
    const thumb = $('[role="slider"]');
    expect(nameOf(thumb)).toBe('Volume');
    expect(thumb.getAttribute('aria-valuenow')).toBe('50');
    expect(thumb.getAttribute('aria-valuetext')).toBe('50 percent');
    act(() => thumb.focus());
    key(thumb, 'ArrowRight');
    expect(spy).toHaveBeenLastCalledWith(55);
    expect(thumb.getAttribute('aria-valuetext')).toBe('55 percent');
    key(thumb, 'ArrowLeft');
    key(thumb, 'ArrowLeft');
    expect(spy).toHaveBeenLastCalledWith(45);
    key(thumb, 'Home');
    expect(thumb.getAttribute('aria-valuenow')).toBe('0');
    key(thumb, 'End');
    expect(thumb.getAttribute('aria-valuenow')).toBe('100');
    expect(host.textContent).toContain('100 percent');
  });

  it('draws ticks only when asked, and is controllable and disableable', () => {
    render(<Slider label="Level" value={2} min={0} max={4} ticks onValueChange={() => {}} />);
    expect($$('.ui-slider-ticks > span')).toHaveLength(5);
    expect($('.ui-slider-ticks').getAttribute('aria-hidden')).toBe('true');
    render(<Slider label="Level" value={2} min={0} max={4} disabled />);
    expect($('.ui-slider-ticks')).toBeNull();
    expect($('[role="slider"]').getAttribute('data-disabled')).not.toBeNull();
  });
});

describe('Avatar and AvatarGroup', () => {
  it('shows initials, named by the full name, with a stable colour per name', () => {
    render(<Avatar name="Ada Lovelace" />);
    const a = $('.ui-avatar');
    expect(a.getAttribute('role')).toBe('img');
    expect(a.getAttribute('aria-label')).toBe('Ada Lovelace');
    expect(a.textContent).toBe('AL');
    expect(initialsOf('Brook')).toBe('B');
    expect(initialsOf('  ')).toBe('?');
    expect(initialsOf('Jean-Luc van der Berg')).toBe('JB');
    expect(toneOf('Ada Lovelace')).toBe(toneOf('  ada lovelace '));
    const tones = new Set(['Ada', 'Brook', 'Cato', 'Dee', 'Eli', 'Fay', 'Gil'].map(toneOf));
    expect(tones.size).toBeGreaterThan(1);
    // initials are ink on a faint wash of the colour, so they clear 4.5:1 in every skin
    expect(a.className).toContain('text-fg');
    expect(a.className).toMatch(/bg-avatar-\d border-avatar-\d-edge/);
  });

  it('uses the image with the name as alt, and falls back to initials when it fails', () => {
    render(<Avatar name="Ada Lovelace" src="/ada.png" size="lg" />);
    const img = $<HTMLImageElement>('img');
    expect(img.alt).toBe('Ada Lovelace');
    expect($('.ui-avatar').hasAttribute('role')).toBe(false);
    act(() => {
      img.dispatchEvent(new Event('error'));
    });
    expect($('img')).toBeNull();
    expect($('.ui-avatar').textContent).toBe('AL');
  });

  it('AvatarGroup is a list that folds extras into a "+N" chip with a spoken name', () => {
    const people = ['Ada L', 'Brook M', 'Cato N', 'Dee O', 'Eli P', 'Fay Q'].map((name) => ({
      name,
    }));
    render(<AvatarGroup people={people} max={3} label="Reviewers" />);
    const list = $('ul');
    expect(list.getAttribute('aria-label')).toBe('Reviewers');
    expect($$('li')).toHaveLength(4);
    const more = $('.ui-avatar-more');
    expect(more.getAttribute('aria-label')).toBe('and 3 more');
    expect(more.textContent).toBe('+3');
    render(<AvatarGroup people={people.slice(0, 2)} max={3} />);
    expect($('.ui-avatar-more')).toBeNull();
  });
});

describe('Kbd', () => {
  it('is a real <kbd> and passes className and aria through', () => {
    render(
      <Kbd className="x" aria-label="Command">
        ⌘
      </Kbd>,
    );
    const k = $('kbd');
    expect(k.classList.contains('ui-kbd')).toBe(true);
    expect(k.classList.contains('x')).toBe(true);
    expect(k.getAttribute('aria-label')).toBe('Command');
  });
});

describe('Breadcrumbs', () => {
  it('is a labelled nav with an ordered list, aria-current on the last item and hidden separators', () => {
    render(
      <Breadcrumbs
        items={[
          { label: 'Home', href: '#/' },
          { label: 'Orders', href: '#/orders' },
          { label: 'Order 1001' },
        ]}
      />,
    );
    const nav = $('nav');
    expect(nav.getAttribute('aria-label')).toBe('Breadcrumb');
    expect($$('nav ol > li')).toHaveLength(3);
    expect($$('a').map((a) => a.textContent)).toEqual(['Home', 'Orders']);
    const current = $('[aria-current="page"]');
    expect(current.textContent).toBe('Order 1001');
    expect(current.tagName).toBe('SPAN');
    expect($$('.ui-breadcrumb-sep')).toHaveLength(2);
    expect($$('.ui-breadcrumb-sep').every((s) => s.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    );
  });

  it('takes a custom nav label', () => {
    render(<Breadcrumbs label="You are here" items={[{ label: 'Only' }]} />);
    expect($('nav').getAttribute('aria-label')).toBe('You are here');
    expect($('[aria-current="page"]').textContent).toBe('Only');
  });
});

describe('Progress and Meter', () => {
  it('Progress is a named progressbar with the value as a number and as text', () => {
    render(<Progress label="Uploading" value={40} />);
    const bar = $('[role="progressbar"]');
    expect(bar.getAttribute('aria-label')).toBe('Uploading');
    expect(bar.getAttribute('aria-valuenow')).toBe('40');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    expect(bar.getAttribute('aria-valuetext')).toBe('40%');
    expect(host.textContent).toContain('40%');
    expect(($('.ui-progress-fill') as HTMLElement).style.width).toBe('40%');
  });

  it('Progress with no value is indeterminate: no aria-valuenow', () => {
    render(<Progress label="Working" />);
    const bar = $('[role="progressbar"]');
    expect(bar.hasAttribute('aria-valuenow')).toBe(false);
    expect(bar.getAttribute('data-state')).toBe('indeterminate');
    expect($('.ui-progress-fill').className).toContain('motion-safe:animate-');
  });

  it('meterTone follows the HTML <meter> low / high / optimum rules', () => {
    const r = { min: 0, max: 100, low: 30, high: 70 };
    expect(meterTone(50, { ...r, optimum: 50 })).toBe('good');
    expect(meterTone(20, { ...r, optimum: 10 })).toBe('good'); // lower is better
    expect(meterTone(50, { ...r, optimum: 10 })).toBe('caution');
    expect(meterTone(90, { ...r, optimum: 10 })).toBe('poor');
    expect(meterTone(90, { ...r, optimum: 90 })).toBe('good');
    expect(meterTone(50, { min: 0, max: 100 })).toBe('neutral');
  });

  it('Meter is role="meter", with the tone written as a word, not colour alone', () => {
    render(
      <Meter
        label="Disk used"
        value={92}
        low={50}
        high={80}
        optimum={20}
        formatValue={(v) => `${v} GB`}
      />,
    );
    const m = $('[role="meter"]');
    expect(m.getAttribute('aria-label')).toBe('Disk used');
    expect(m.getAttribute('aria-valuenow')).toBe('92');
    expect(m.getAttribute('data-tone')).toBe('poor');
    expect(m.getAttribute('aria-valuetext')).toBe('92 GB, Poor');
    expect(host.textContent).toContain('Poor');
    render(<Meter label="Score" value={150} max={100} />);
    expect($('[role="meter"]').getAttribute('aria-valuenow')).toBe('100'); // clamped
    expect($('[role="meter"]').getAttribute('aria-valuetext')).toBe('100');
  });
});

describe('ConfirmDialog', () => {
  function Host({
    onConfirm,
    destructive,
  }: {
    onConfirm: () => void | Promise<void>;
    destructive?: boolean;
  }) {
    const [open, setOpen] = useState(true);
    return (
      <ConfirmDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Delete order?"
        description="This cannot be undone."
        confirmLabel="Delete"
        destructive={destructive}
        onConfirm={onConfirm}
      />
    );
  }
  const confirmBtn = () =>
    $$('dialog button').find(
      (b) => b.textContent !== 'Cancel' && !b.getAttribute('aria-label'),
    ) as HTMLButtonElement;

  it('renders a titled dialog; destructive turns the confirm button red', () => {
    render(<Host onConfirm={() => {}} destructive />);
    const dialog = $<HTMLDialogElement>('dialog');
    expect(nameOf(dialog)).toBe('Delete order?');
    expect(confirmBtn().getAttribute('data-variant')).toBe('danger');
    expect(confirmBtn().textContent).toBe('Delete');
  });

  it('shows a pending state while an async onConfirm runs, then closes', async () => {
    let finish: () => void = () => {};
    const work = new Promise<void>((r) => {
      finish = r;
    });
    const onConfirm = vi.fn<() => Promise<void>>(() => work);
    render(<Host onConfirm={onConfirm} />);
    click(confirmBtn());
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(confirmBtn().getAttribute('aria-busy')).toBe('true');
    expect(confirmBtn().getAttribute('aria-disabled')).toBe('true');
    expect(confirmBtn().textContent).toBe('Working…');
    expect(
      $$('dialog button')
        .find((b) => b.textContent === 'Cancel')
        ?.hasAttribute('disabled'),
    ).toBe(true);
    click(confirmBtn()); // a second press does not run it again
    expect(onConfirm).toHaveBeenCalledOnce();
    await act(async () => {
      finish();
      await work;
    });
    await flush();
    expect($<HTMLDialogElement>('dialog').open).toBe(false);
  });

  it('stays open and says why when onConfirm rejects', async () => {
    render(
      <Host
        onConfirm={async () => {
          throw new Error('Server said no');
        }}
      />,
    );
    click(confirmBtn());
    await flush();
    expect($<HTMLDialogElement>('dialog').open).toBe(true);
    expect($('dialog [role="alert"]').textContent).toBe('Server said no');
    expect(confirmBtn().getAttribute('aria-busy')).toBeNull();
  });

  it('Cancel closes without confirming', async () => {
    const onConfirm = vi.fn<() => void>();
    render(<Host onConfirm={onConfirm} />);
    click($$('dialog button').find((b) => b.textContent === 'Cancel') as HTMLElement);
    await flush();
    expect(onConfirm).not.toHaveBeenCalled();
    expect($<HTMLDialogElement>('dialog').open).toBe(false);
  });
});

describe('DescriptionList', () => {
  it('is a dl of term/detail pairs, one or two columns', () => {
    render(
      <DescriptionList
        columns={2}
        items={[
          { term: 'Status', detail: 'Active' },
          { term: 'Owner', detail: 'Ada' },
        ]}
      />,
    );
    const dl = $('dl');
    expect(dl.getAttribute('data-columns')).toBe('2');
    expect($$('dl dt').map((t) => t.textContent)).toEqual(['Status', 'Owner']);
    expect($$('dl dd').map((t) => t.textContent)).toEqual(['Active', 'Ada']);
    expect($$('dl > div')).toHaveLength(2);
    render(<DescriptionList items={[{ term: 'A', detail: 'B' }]} className="x" />);
    expect($('dl').getAttribute('data-columns')).toBe('1');
    expect($('dl').classList.contains('x')).toBe(true);
  });
});

describe('KpiTile', () => {
  it('shows label, the final value, and a delta worked out from `previous`, in words', () => {
    render(<KpiTile label="Revenue" value={1050} previous={1000} />);
    expect($('.ui-kpi-label').textContent).toBe('Revenue');
    expect($('.ui-kpi-value').textContent).toContain('1,050');
    expect($('.ui-kpi-change').textContent).toContain('up');
    expect($('.ui-kpi-change').textContent).toContain('+5.0%');
  });

  it('takes an explicit ratio, a custom format, a label for the change and a footnote', () => {
    render(
      <KpiTile
        label="Churn"
        value={0.032}
        format={(n) => `${(n * 100).toFixed(1)}%`}
        delta={-0.15}
        deltaLabel="vs last month"
        footnote="Rolling 30 days"
        icon="users"
      />,
    );
    expect($('.ui-kpi-value').textContent).toContain('3.2%');
    expect($('.ui-kpi-change').textContent).toContain('down');
    expect($('.ui-kpi-change').textContent).toContain('−15.0%');
    expect($('.ui-kpi-change').textContent).toContain('vs last month');
    expect($('.ui-kpi-footnote').textContent).toBe('Rolling 30 days');
    expect($('.ui-kpi-icon').getAttribute('aria-hidden')).toBe('true');
  });

  it('accepts a ReactNode value and draws a trend through the kit Sparkline', async () => {
    render(<KpiTile label="Plan" value={<b>Pro</b>} trend={[1, 3, 2, 5]} />);
    expect($('.ui-kpi-value b').textContent).toBe('Pro');
    // the sparkline is a file of its own (the chart library): the tile holds its place meanwhile
    expect($('.ui-kpi-trend')).not.toBeNull();
    await act(async () => {
      await vi.dynamicImportSettled();
    });
    const spark = $('svg.ui-sparkline');
    expect(spark.getAttribute('role')).toBe('img');
    expect(spark.getAttribute('aria-label')).toContain('Plan trend');
    expect($('.ui-kpi-change')).toBeNull();
  });

  it('is a plain, non-interactive tile by default', () => {
    render(<KpiTile label="Orders" value={12} />);
    expect($('a')).toBeNull();
    expect($('button')).toBeNull();
    expect($('.ui-kpi').hasAttribute('data-interactive')).toBe(false);
  });

  it('with href, the label is the link and it covers the whole tile', () => {
    render(<KpiTile label="Orders" value={12} href="#/orders" delta={0.1} />);
    const link = $<HTMLAnchorElement>('a');
    expect(link.getAttribute('href')).toBe('#/orders');
    expect(link.textContent).toBe('Orders');
    expect(link.className).toContain('after:absolute');
    expect(link.className).toContain('after:inset-0');
    expect($('.ui-kpi').getAttribute('data-interactive')).toBe('true');
    // the figures are not inside the link
    expect(link.closest('.ui-kpi-value')).toBeNull();
    expect($$('a')).toHaveLength(1);
  });

  it('with onClick, the label is a real button', () => {
    const spy = vi.fn<() => void>();
    render(<KpiTile label="Orders" value={12} onClick={spy} />);
    const btn = $<HTMLButtonElement>('button');
    expect(btn.type).toBe('button');
    click(btn);
    expect(spy).toHaveBeenCalledOnce();
    expect($('a')).toBeNull();
  });

  it('loading renders a same-size skeleton with a spoken status; KpiTile.Skeleton is aria-hidden shapes', () => {
    render(<KpiTile label="Revenue" value={1} loading />);
    expect($('.ui-kpi-skeleton').getAttribute('aria-busy')).toBe('true');
    expect($('.ui-kpi-skeleton .ui-sr-only').textContent).toBe('Loading Revenue…');
    expect($('.ui-kpi-value')).toBeNull();
    render(<KpiTile.Skeleton />);
    expect($('.ui-kpi-skeleton .ui-sr-only')).toBeNull();
    expect($$('.ui-skeleton').length).toBeGreaterThan(2);
  });

  it('counts a whole number up through whole numbers only (never "1.434" on the way to 2)', () => {
    vi.useFakeTimers();
    render(<KpiTile label="Delivered" value={2} />);
    const digits = $('.ui-fx-countup-digits');
    const seen = new Set<string>();
    for (let i = 0; i < 120; i++) {
      act(() => {
        vi.advanceTimersByTime(16);
      });
      seen.add(digits.textContent ?? '');
    }
    expect([...seen].every((t) => /^\d+$/.test(t))).toBe(true);
    expect(digits.textContent).toBe('2');
    // a figure with decimals keeps them, and large ones are grouped
    render(<KpiTile label="Rate" value={12.5} countUp={false} />);
    expect($('.ui-kpi-value').textContent).toBe('12.5');
    render(<KpiTile label="Big" value={18647} countUp={false} />);
    expect($('.ui-kpi-value').textContent).toBe('18,647');
  });

  it('has the decorative glare and spotlight layers, which stay out of the accessibility tree', () => {
    render(<KpiTile label="Orders" value={12} />);
    expect($$('.ui-kpi-fx')).toHaveLength(2);
    expect($('.ui-kpi-fx').getAttribute('data-motion')).toBeDefined();
  });
});

/* ---- axe, every skin x mode ---------------------------------------------- */
const noop = () => {};

function Everything() {
  return (
    <main>
      <h1>Kit v2</h1>
      <EmptyState
        icon="search"
        title="No results"
        description="Try another filter."
        action={<Button>Clear</Button>}
      />
      <EmptyState size="sm" title="Nothing yet" />
      <ErrorState
        what="orders"
        error={{ message: 'Boom', status: 500, errorId: 'x1' }}
        onRetry={noop}
      />
      <LoadingRegion label="orders">
        <Skeleton height={20} />
      </LoadingRegion>
      <p>
        <Delta ratio={0.042} /> <Delta ratio={-0.03} /> <Delta ratio={null} />
      </p>
      <SegmentedControl
        label="Range"
        defaultValue="30"
        options={[
          { value: '7', label: '7 days' },
          { value: '30', label: '30 days' },
          { value: '90', label: '90 days', disabled: true },
        ]}
      />
      <SegmentedControl
        label="Size"
        size="sm"
        defaultValue="a"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
      />
      <Slider
        label="Volume"
        defaultValue={40}
        ticks
        min={0}
        max={100}
        step={10}
        formatValue={(v) => `${v}%`}
      />
      <Slider label="Locked" defaultValue={10} disabled />
      <p>
        <Avatar name="Ada Lovelace" /> <Avatar name="Brook Mills" size="xs" />{' '}
        <Avatar name="Cato Nolan" size="lg" />
      </p>
      <AvatarGroup
        people={['Ada L', 'Brook M', 'Cato N', 'Dee O', 'Eli P'].map((name) => ({ name }))}
        max={3}
        label="Reviewers"
      />
      <p>
        Press <Kbd>Esc</Kbd> or <Kbd aria-label="Command">⌘</Kbd>
        <Kbd>K</Kbd>
      </p>
      <Breadcrumbs
        items={[
          { label: 'Home', href: '#/' },
          { label: 'Orders', href: '#/orders' },
          { label: 'Order 1001' },
        ]}
      />
      <Progress label="Uploading" value={64} />
      <Progress label="Working" />
      <Meter
        label="Disk used"
        value={72}
        low={50}
        high={80}
        optimum={20}
        formatValue={(v) => `${v} GB`}
      />
      <Meter label="Score" value={40} />
      <DescriptionList
        columns={2}
        items={[
          { term: 'Status', detail: 'Active' },
          { term: 'Owner', detail: 'Ada' },
        ]}
      />
      <section aria-label="Key figures" style={{ display: 'grid', gap: 12 }}>
        <KpiTile
          label="Revenue"
          value={48210}
          previous={44000}
          trend={[3, 5, 4, 8, 7, 9]}
          footnote="Last 12 weeks"
          icon="chart"
        />
        <KpiTile label="Orders" value={12} href="#/orders" delta={-0.02} />
        <KpiTile label="Refunds" value={3} onClick={noop} delta={null} />
        <KpiTile label="Loading one" value={0} loading />
        <KpiTile.Skeleton />
      </section>
      <Toaster />
      <Sheet open onOpenChange={noop} title="Order 1001" description="Everything about this order.">
        <DescriptionList items={[{ term: 'Total', detail: '£120' }]} />
      </Sheet>
      <ConfirmDialog
        open
        onClose={noop}
        title="Delete order?"
        description="This cannot be undone."
        destructive
        onConfirm={noop}
      />
    </main>
  );
}

describe('axe: WCAG 2.2 AA structure, every skin and mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(<Everything />);
        act(() => {
          toast.info('Heads up', {
            description: 'Something happened.',
            duration: Number.POSITIVE_INFINITY,
          });
          toast.success('Saved');
        });
        await flush();
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
              `${v.id}: ${v.help}\n${v.nodes.map((n) => `  ${n.target.join(' ')} ${n.failureSummary ?? ''}`).join('\n')}`,
          )
          .join('\n');
        expect(report).toBe('');
      });
    }
  }
});
