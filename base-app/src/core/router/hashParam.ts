import { useEffect, useRef, useState } from 'react';

/* One-time secrets in the address, like the `token` of an emailed link: `/reset-password#token=…`.
   They live in the FRAGMENT, which a browser never sends to a server or in a Referer header, so
   the token is never in a server log and a server render never sees it. Reading one and then
   removing it from the address keeps it out of the history entry, the address bar and any
   screenshot. Removal uses replaceState, which fires nothing, so the page that read the token
   stays mounted.

   An old link (`#/reset-password?token=…`) is turned into this form at start-up
   (legacy.ts); the reader below also understands it, for a hash it is handed directly. */

/* The parameters in a hash: '#token=x' or the legacy '#/route?token=x'. A hash that is neither
   ('#main', a skip link) has none. */
function paramsOf(hash: string): URLSearchParams {
  if (hash.startsWith('#/')) {
    const at = hash.indexOf('?');
    return new URLSearchParams(at === -1 ? '' : hash.slice(at + 1));
  }
  return new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
}

/** The parameter's value in the current fragment, or '' when absent. Reads `window`: call it in an
    effect or an event handler, never while rendering (the server has no fragment). */
export function readHashParam(name: string, hash: string = window.location.hash): string {
  return paramsOf(hash).get(name) ?? '';
}

/** Takes the parameter out of the address, replacing the history entry. Other parameters stay. */
export function removeHashParam(name: string): void {
  const hash = window.location.hash;
  const legacy = hash.startsWith('#/');
  const query = paramsOf(hash);
  if (!query.has(name)) return;
  query.delete(name);
  const rest = query.toString();
  let next = '';
  if (legacy) {
    const at = hash.indexOf('?');
    next = `${hash.slice(0, at)}${rest === '' ? '' : `?${rest}`}`;
  } else if (rest !== '') {
    next = `#${rest}`;
  }
  window.history.replaceState(
    window.history.state,
    '',
    `${window.location.pathname}${window.location.search}${next}`,
  );
}

/** A one-time secret from the fragment, for a screen opened from an emailed link.
    Returns null on the server and for the browser's first (hydrating) render, then the secret
    (or '' when the address has none): a server never sees a fragment, so the first render cannot
    depend on it. The secret is taken out of the address bar and history as soon as it is read, and
    is kept for the life of the screen (it survives React's development double-mount). */
export function useHashSecret(name: string): string | null {
  const read = useRef<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: read once, on mount
  useEffect(() => {
    if (read.current === null) {
      read.current = readHashParam(name);
      removeHashParam(name);
    }
    setSecret(read.current);
  }, []);
  return secret;
}
