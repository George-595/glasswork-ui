import { normalizePath } from './path';

/* Addresses from before path routing lived in the hash: `/#/table?page=2`. This turns one into
   today's: `/table?page=2`. Emailed links carry a one-time `token`, and a token must never be
   sent to a server (it would sit in its logs), so it moves into the fragment, which a browser
   keeps to itself: `/#/reset-password?token=abc` becomes `/reset-password#token=abc`.
   index.html carries a copy of this in a few lines, run before anything is drawn, so a server
   renders the right page for an old link; keep the two in step (legacy.test.ts runs both). */

/** The path-form address for a legacy hash, or null when `hash` is not a legacy route address. */
export function legacyHashTarget(hash: string): string | null {
  if (!hash.startsWith('#/')) return null;
  const queryAt = hash.indexOf('?');
  const path = normalizePath(queryAt === -1 ? hash : hash.slice(0, queryAt));
  const query = new URLSearchParams(queryAt === -1 ? '' : hash.slice(queryAt + 1));
  const token = query.get('token');
  query.delete('token');
  const search = query.toString();
  return `${path}${search === '' ? '' : `?${search}`}${token === null ? '' : `#token=${encodeURIComponent(token)}`}`;
}

/** Rewrites a legacy address in the address bar (no new history entry). True when it did. */
export function upgradeLegacyHash(): boolean {
  const target = legacyHashTarget(window.location.hash);
  if (target === null) return false;
  window.history.replaceState(null, '', target);
  return true;
}
