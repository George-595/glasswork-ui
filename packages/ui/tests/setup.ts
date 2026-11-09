/* Vitest setup for @apps/ui. jsdom reports the machine's core count and the kit reads it as a
   low-power signal (6 or fewer, effects/lowPower.ts), so pin it: a test must not behave
   differently on a small CI box. Node-environment tests have no navigator and need nothing. */
import { beforeEach } from 'vitest';

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
