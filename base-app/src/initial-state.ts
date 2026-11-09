import type { ThemePrefs } from '~/core/ui';

/* What a server render embeds in the page for the browser to start from, as one JSON document in
   `<script type="application/json" id="__INITIAL_DATA__">` (server/infra/http/ssr.ts writes it,
   with `<`, `>`, `&`, U+2028 and U+2029 escaped; main.tsx reads it before hydrating):

   - `theme`: the look the server painted, from the reader's `ui-theme` cookie;
   - `queries`: the answers to the GET calls made for this request, by API path, as the signed-in
     person's own API calls would have answered them: '/auth/me', '/settings' and the route's
     `prefetch` paths (core/api/initial.tsx). Nothing is in here that those calls would not say;
   - `now`: the instant the server drew the page, so a screen that shows the time agrees with it. */
export interface InitialState {
  theme: ThemePrefs;
  queries: Record<string, unknown>;
  now: string;
}

export const INITIAL_DATA_ID = '__INITIAL_DATA__';

/** The embedded state, or null when the page was not server-rendered (a static host, a test). */
export function readInitialState(doc: Document = document): InitialState | null {
  const text = doc.getElementById(INITIAL_DATA_ID)?.textContent;
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as Partial<InitialState> | null;
    if (!parsed || typeof parsed !== 'object' || !parsed.theme || !parsed.queries) return null;
    return {
      theme: parsed.theme,
      queries: parsed.queries,
      now: typeof parsed.now === 'string' ? parsed.now : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}
