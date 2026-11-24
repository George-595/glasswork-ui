// @vitest-environment jsdom
/* The Toaster facade (components/toaster.tsx): the store is always there, the UI SDK view is fetched after
   hydration. These tests load a fresh copy of the modules (the test setup has preloaded the shared one), so
   the view really is absent when the toast is pushed. */
import { act } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_REFRACTION } from '../src/glass/LiquidGlass';
import { materials } from '../src/glass/optics';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function fresh() {
  vi.resetModules();
  const store = await import('../src/components/toast-store');
  const facade = await import('../src/components/toaster');
  return { toast: store.toast, Toaster: facade.Toaster, preloadToaster: facade.preloadToaster };
}

let host: HTMLElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => {
  host.remove();
  vi.restoreAllMocks();
});

describe('Toaster facade', () => {
  it('renders nothing on the server and on the first client render', async () => {
    const { Toaster, toast } = await fresh();
    toast('Waiting');
    expect(renderToString(<Toaster />)).toBe('');
    const root = createRoot(host);
    // the first render happens inside act; effects have not fetched the view yet
    let firstHtml = '';
    function Probe() {
      return <Toaster />;
    }
    await act(async () => {
      root.render(<Probe />);
      firstHtml = host.innerHTML;
    });
    expect(firstHtml).toBe('');
    await act(async () => root.unmount());
  });

  it('shows a toast pushed before the view loads, when it arrives', async () => {
    const { Toaster, toast } = await fresh();
    const root = createRoot(host);
    await act(async () => root.render(<Toaster />));
    expect(document.body.textContent).not.toContain('Saved early');
    await act(async () => {
      toast.success('Saved early');
      // the fetch of the view resolves within a few ticks
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(document.body.textContent).toContain('Saved early');
    await act(async () => root.unmount());
  });

  it('undoes an undo toast pushed before the view loaded with Ctrl+Z', async () => {
    const { Toaster, toast } = await fresh();
    const onUndo = vi.fn<() => void>();
    toast.undo('Deleted', { onUndo });
    const root = createRoot(host);
    await act(async () => {
      root.render(<Toaster />);
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(document.body.textContent).toContain('Deleted');
    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
      );
    });
    expect(onUndo).toHaveBeenCalledTimes(1);
    await act(async () => root.unmount());
  });

  it('retries the fetch on the next push (the Toaster’s own subscription) and then shows both toasts', async () => {
    vi.resetModules();
    const gate = { works: false, attempts: 0 };
    vi.doMock('../src/components/toast', async (importActual) => {
      gate.attempts += 1;
      if (!gate.works) throw new Error('the chunk could not be fetched');
      return importActual();
    });
    const store = await import('../src/components/toast-store');
    const { Toaster } = await import('../src/components/toaster');
    const root = createRoot(host);
    await act(async () => {
      root.render(<Toaster />);
    });
    await act(async () => {
      store.toast('First');
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(gate.attempts).toBe(1);
    expect(document.body.textContent).not.toContain('First');
    // two pushes in one tick are one import, not two
    gate.works = true;
    await act(async () => {
      store.toast('Second');
      store.toast('Third');
      await new Promise((r) => setTimeout(r, 100));
    });
    expect(gate.attempts).toBe(2);
    for (const t of ['First', 'Second', 'Third']) expect(document.body.textContent).toContain(t);
    vi.doUnmock('../src/components/toast');
    await act(async () => root.unmount());
  });

  it('keeps its own expiry when the view cannot be fetched: onExpire runs once, and the toast leaves', async () => {
    vi.resetModules();
    vi.doMock('../src/components/toast', () => {
      throw new Error('the chunk could not be fetched');
    });
    const store = await import('../src/components/toast-store');
    const { Toaster } = await import('../src/components/toaster');
    const onExpire = vi.fn<() => void>();
    const root = createRoot(host);
    await act(async () => {
      root.render(<Toaster />);
    });
    await act(async () => {
      store.toast.undo('Deleted', { onUndo: () => {}, onExpire, duration: 80 });
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(onExpire).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(store.snapshot()).toEqual([]);
    vi.doUnmock('../src/components/toast');
    await act(async () => root.unmount());
  });

  it('hydrates without a mismatch when the view has already been fetched', async () => {
    const { Toaster, preloadToaster } = await fresh();
    await preloadToaster();
    host.innerHTML = renderToString(<Toaster />);
    expect(host.innerHTML).toBe('');
    const recoverable = vi.fn<(error: unknown) => void>();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => {
      root = hydrateRoot(host, <Toaster />, { onRecoverableError: recoverable });
    });
    expect(recoverable).not.toHaveBeenCalled();
    // after hydration the loaded view is mounted (its viewport exists)
    expect(document.querySelector('.ui-toaster')).not.toBeNull();
    await act(async () => root?.unmount());
  });
});

describe('LiquidGlass default refraction', () => {
  it('equals the material table (the hook does not import the optics)', () => {
    expect(DEFAULT_REFRACTION).toBe(materials.regular.refraction);
  });
});
