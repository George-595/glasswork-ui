/* Vitest setup for the web project (jsdom). Fills the gaps jsdom leaves and
   resets global state before every test, so tests can't leak into each other. */
import { preloadToaster } from '@apps/ui';
import { beforeAll, beforeEach, vi } from 'vitest';

/* The Toaster fetches its view with a dynamic import after the first render. A test that saves and then
   looks for the toast would race that import (it lost on a busy machine), so every file starts with the
   view already here, as preloadToaster's own comment intends. */
beforeAll(() => preloadToaster());

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
    // biome-ignore lint/suspicious/noDocumentCookie: jsdom has no Cookie Store API; this clears what themeCookie.ts wrote
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
  // No network in tests. A test that needs fetch stubs it with vi.stubGlobal.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new TypeError('fetch disabled in tests'))),
  );
});

/* What the UI SDK (@ui-sdk/react) needs from a browser that jsdom lacks: the popover API (its popups sit in the top
   layer), animations, layout reads and ResizeObserver. Assigned rather than `??=`: jsdom has some of them without the
   parts that matter. */
if (typeof document !== 'undefined') {
  HTMLElement.prototype.showPopover = function showPopover() {};
  HTMLElement.prototype.hidePopover = function hidePopover() {};
  Element.prototype.getAnimations = () => [];
  Element.prototype.scrollIntoView = function scrollIntoView() {};
  Element.prototype.checkVisibility = () => true;
  Element.prototype.getClientRects = () => [] as unknown as DOMRectList;
  document.elementFromPoint = () => null;
  document.elementsFromPoint = () => [];
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  document.head.append(
    Object.assign(document.createElement('style'), {
      textContent: '[popover] { display: block !important }',
    }),
  );
}
