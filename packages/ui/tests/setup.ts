/* Vitest setup for @apps/ui. jsdom reports the machine's core count and the kit reads it as a
   low-power signal (6 or fewer, effects/lowPower.ts), so pin it: a test must not behave
   differently on a small CI box. Node-environment tests have no navigator and need nothing. */
import { beforeAll, beforeEach } from 'vitest';

// the look is also kept in a cookie (theme/themeCookie.ts): a test starts with none, as with empty storage
beforeEach(() => {
  if (typeof document === 'undefined') return;
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim();
    // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is not in jsdom
    if (name) document.cookie = `${name}=; Path=/; Max-Age=0`;
  }
});

if (typeof navigator !== 'undefined') {
  Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true });
}

// the Toaster fetches its UI SDK view after hydration (components/toaster.tsx); tests have it ready, so a toast shows as it always did
// (imported here, not at the top: a test file's vi.mock must be registered before the kit's sound modules load)
beforeAll(async () => {
  const { preloadToaster } = await import('../src/components/toaster');
  await preloadToaster();
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
