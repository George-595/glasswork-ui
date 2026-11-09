/* Vitest setup for the web project (jsdom). Fills the gaps jsdom leaves and
   resets global state before every test, so tests can't leak into each other. */
import { beforeEach, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (!('ResizeObserver' in globalThis)) {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
}

// jsdom has no EventSource. This one never connects, so the app (RealtimeProvider) mounts quietly
// in page tests; a test that needs events passes its own `createEventSource` (see core/realtime).
if (!('EventSource' in globalThis)) {
  class EventSourceStub {
    addEventListener() {}
    removeEventListener() {}
    close() {}
  }
  (globalThis as { EventSource?: unknown }).EventSource = EventSourceStub;
}

// jsdom reports the machine's core count; the kit reads it as a low-power signal (6 or fewer),
// so pin it: a test must not behave differently on a small CI box.
Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });

Element.prototype.scrollIntoView ??= () => {};

// jsdom's <dialog> lacks showModal/close in some versions: toggle `open` instead.
function openDialog(this: HTMLDialogElement) {
  this.setAttribute('open', '');
}
function closeDialog(this: HTMLDialogElement) {
  this.removeAttribute('open');
  this.dispatchEvent(new Event('close'));
}
if (typeof HTMLDialogElement !== 'undefined') {
  const proto = HTMLDialogElement.prototype;
  proto.showModal ??= openDialog;
  proto.show ??= openDialog;
  proto.close ??= closeDialog;
}

beforeEach(() => {
  try {
    localStorage.clear();
  } catch {
    /* storage blocked: nothing to clear */
  }
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-skin');
  document.body.innerHTML = '';
  window.history.replaceState(null, '', '/');
  // the look is also kept in a cookie (@apps/ui theme/themeCookie.ts): forget it between tests
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
  // No network in tests. A test that needs fetch stubs it with vi.stubGlobal.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('fetch disabled in tests'))),
  );
});
