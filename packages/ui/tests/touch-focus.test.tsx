// @vitest-environment jsdom
/* Phone behaviour the kit owns :
   1. nothing grabs focus on a touch screen: a focused field raises the keyboard over the
      buttons (a Sheet, a Dialog, a page's first field), so the container takes focus instead;
   2. bars over the bottom of the screen tell the page their height (`--ui-bottom-inset`), so
      focus scrolls clear of them and toasts rest above them;
   3. ConfirmDialog starts clean when it is reopened. */
import { act, type ReactNode, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BottomTabBar,
  BulkActionBar,
  ConfirmDialog,
  Dialog,
  FlowBar,
  Input,
  prefersTouch,
  SaveBar,
  Sheet,
  Toaster,
  toast,
  useInitialFocus,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let coarse = false;
function stubMedia() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: coarse && query.includes('pointer: coarse'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  coarse = false;
  stubMedia();
  // jsdom has no modal <dialog>. Like a browser without `autofocus` support on the dialog
  // itself: the first field is focused, which is what the kit must undo on a touch screen.
  const dlg = HTMLDialogElement.prototype as Partial<HTMLDialogElement>;
  dlg.showModal = function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
    this.querySelector<HTMLElement>('input, button, textarea, select')?.focus();
  };
  dlg.close = function (this: HTMLDialogElement) {
    if (!this.hasAttribute('open')) return;
    this.removeAttribute('open');
    setTimeout(() => this.dispatchEvent(new Event('close')), 0);
  };
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => toast.dismiss());
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty('--ui-bottom-inset');
});

const render = (node: ReactNode) => act(() => root.render(node));
const $ = <E extends Element = HTMLElement>(sel: string, within: ParentNode = document) =>
  within.querySelector(sel) as E;

describe('prefersTouch', () => {
  it('follows (pointer: coarse) and is false without matchMedia', () => {
    expect(prefersTouch()).toBe(false);
    coarse = true;
    expect(prefersTouch()).toBe(true);
    vi.stubGlobal('matchMedia', undefined);
    expect(prefersTouch()).toBe(false);
  });
});

describe('Sheet focus on open', () => {
  const sheet = () =>
    render(
      <Sheet open onOpenChange={() => {}} title="Take out" description="How many?">
        <Input aria-label="Quantity" inputMode="numeric" />
      </Sheet>,
    );

  it('with a mouse, the first field is focused', () => {
    sheet();
    expect(document.activeElement).toBe($('input[aria-label="Quantity"]'));
  });

  it('on a touch screen the quantity field is NOT focused: the sheet is, so no keyboard covers Take out', () => {
    coarse = true;
    sheet();
    expect(document.activeElement).not.toBe($('input[aria-label="Quantity"]'));
    expect(document.activeElement).toBe($('[role="dialog"]'));
  });
});

describe('Sheet focus on close', () => {
  function Harness({ open, keepOpener }: { open: boolean; keepOpener: boolean }) {
    const status = useRef<HTMLParagraphElement>(null);
    return (
      <>
        <p tabIndex={-1} ref={status}>
          3 items listed
        </p>
        {keepOpener && (
          <button type="button" id="opener">
            View
          </button>
        )}
        <Sheet
          open={open}
          onOpenChange={() => {}}
          title="Item"
          description="Details"
          fallbackFocus={() => status.current}
        >
          <button type="button">Remove</button>
        </Sheet>
      </>
    );
  }

  // Radix gives focus back a tick after the panel unmounts
  const settle = () => act(async () => new Promise((r) => setTimeout(r, 10)));

  it('gives focus back to what opened it, and to `fallbackFocus` when that is gone', async () => {
    render(<Harness open={false} keepOpener />);
    $<HTMLButtonElement>('#opener').focus();
    render(<Harness open keepOpener />);
    render(<Harness open={false} keepOpener />);
    await settle();
    expect(document.activeElement).toBe($('#opener'));

    $<HTMLButtonElement>('#opener').focus();
    render(<Harness open keepOpener />);
    // the row it was opened from is removed while the sheet is open
    render(<Harness open keepOpener={false} />);
    render(<Harness open={false} keepOpener={false} />);
    await settle();
    expect(document.activeElement?.textContent).toBe('3 items listed');
  });
});

describe('Sheet sticky footer and focus', () => {
  it('pads its own scroll box by the footer, so a focused field is not left under it', () => {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(84);
    render(
      <Sheet
        open
        onOpenChange={() => {}}
        title="Take out"
        description="How many?"
        stickyFooter
        footer={<button type="button">Take out</button>}
      >
        <Input aria-label="Quantity" />
      </Sheet>,
    );
    const content = $('[role="dialog"]');
    expect(content.style.getPropertyValue('--ui-sheet-footer-h')).toBe('84px');
    expect(content.className).toContain('scroll-pb-[calc(var(--ui-sheet-footer-h');
  });
});

describe('Dialog focus on open', () => {
  const dialog = () =>
    render(
      <Dialog open onClose={() => {}} title="Invite">
        <Input aria-label="Name" />
      </Dialog>,
    );

  it('with a mouse, showModal() focuses the first control', () => {
    dialog();
    expect(document.activeElement).toBe($('input[aria-label="Name"]'));
  });

  it('on a touch screen the title takes focus, not its first field (and autofocus does not stay)', () => {
    coarse = true;
    dialog();
    expect(document.activeElement).toBe($('.ui-dialog-title'));
    expect(document.activeElement).not.toBe($('input[aria-label="Name"]'));
    expect($('.ui-dialog-title').hasAttribute('autofocus')).toBe(false);
  });
});

describe('useInitialFocus', () => {
  function Page({ active = true }: { active?: boolean }) {
    const ref = useRef<HTMLInputElement>(null);
    useInitialFocus(ref, active);
    return <Input ref={ref} aria-label="Email" />;
  }
  it('focuses the field on mount with a mouse and leaves it alone on a touch screen', () => {
    render(<Page />);
    expect(document.activeElement).toBe($('input'));
    act(() => root.unmount());
    root = createRoot(host);
    coarse = true;
    (document.activeElement as HTMLElement | null)?.blur();
    render(<Page />);
    expect(document.activeElement).toBe(document.body);
  });

  it('waits for `active`', () => {
    render(<Page active={false} />);
    expect(document.activeElement).toBe(document.body);
    render(<Page active />);
    expect(document.activeElement).toBe($('input'));
  });
});

describe('ConfirmDialog reopened after a failure', () => {
  function Harness({ open, onClose }: { open: boolean; onClose: () => void }) {
    return (
      <ConfirmDialog
        open={open}
        onClose={onClose}
        title="Remove 2?"
        confirmLabel="Remove"
        onConfirm={() => Promise.reject(new Error('Could not change stock'))}
      />
    );
  }
  const click = (name: string) =>
    act(async () => {
      const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent === name);
      b?.click();
      await Promise.resolve();
    });

  it('fail, Cancel, reopen: no alert from the last attempt', async () => {
    let open = true;
    const onClose = vi.fn<() => void>(() => {
      open = false;
    });
    render(<Harness open={open} onClose={onClose} />);
    await click('Remove');
    expect($('[role="alert"]')?.textContent).toBe('Could not change stock');
    await click('Cancel');
    expect(onClose).toHaveBeenCalled();
    render(<Harness open={false} onClose={onClose} />);
    open = true;
    render(<Harness open onClose={onClose} />);
    expect($('[role="alert"]')).toBeNull();
  });

  it('its buttons are the standard size (48px on a touch screen), not sm', () => {
    render(<Harness open onClose={() => {}} />);
    for (const name of ['Cancel', 'Remove']) {
      const b = Array.from(document.querySelectorAll('button')).find((x) => x.textContent === name);
      expect(b?.dataset.size).toBe('md');
      expect(b?.className).toContain('pointer-coarse:min-h-12');
    }
  });
});

describe('bars over the bottom of the screen report their height', () => {
  const inset = () => document.documentElement.style.getPropertyValue('--ui-bottom-inset');
  /** jsdom has no layout: give the bars a height as a browser would. */
  const heights = (px: number) =>
    vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValue(new DOMRect(0, 0, 390, px));

  it('FlowBar sets --ui-bottom-inset while it is mounted and removes it after', () => {
    heights(108);
    render(<FlowBar primaryLabel="Add" onPrimary={() => {}} />);
    expect(inset()).toBe('108px');
    act(() => root.unmount());
    expect(inset()).toBe('');
    root = createRoot(host);
  });

  it('BottomTabBar reports its height too, and a pinned SaveBar adds its own', () => {
    heights(72);
    render(
      <>
        <BottomTabBar tabs={[{ id: 'a', label: 'A', icon: 'home', href: '#/' }]} current="a" />
        <SaveBar count={2} onSave={() => {}} onDiscard={() => {}} />
      </>,
    );
    expect(inset()).toBe('144px');
    render(
      <>
        <BottomTabBar tabs={[{ id: 'a', label: 'A', icon: 'home', href: '#/' }]} current="a" />
        <SaveBar count={0} onSave={() => {}} onDiscard={() => {}} />
      </>,
    );
    expect(inset()).toBe('72px');
  });

  it('a pinned BulkActionBar reports; an inline one does not', () => {
    heights(56);
    render(<BulkActionBar count={2} onClear={() => {}} />);
    expect(inset()).toBe('');
    render(<BulkActionBar count={2} onClear={() => {}} sticky />);
    expect(inset()).toBe('56px');
  });
});

describe('Toaster on a phone', () => {
  it('rests above the bars: its bottom reads --ui-bottom-inset, with the safe area when there is none', () => {
    render(<Toaster />);
    const viewport = $('.ui-toaster');
    expect(viewport.className).toContain('--ui-bottom-inset');
    expect(viewport.className).toContain('safe-area-inset-bottom');
  });

  it('Dismiss and the action are 48px targets on a touch screen', () => {
    render(<Toaster />);
    act(() => {
      toast.error('Could not change stock', { action: { label: 'Try again', onClick: () => {} } });
    });
    expect($('button[aria-label="Dismiss notification"]').className).toContain(
      'pointer-coarse:size-12',
    );
    const action = Array.from(document.querySelectorAll('button')).find(
      (b) => b.textContent === 'Try again',
    );
    expect(action?.className).toContain('pointer-coarse:min-h-12');
  });
});
