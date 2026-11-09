import { renderToPipeableStream } from 'react-dom/server';
import { InitialData } from '~/core/api';
import { config } from '~/core/config';
import { normalizePath } from '~/core/router';
import { type ThemePrefs, themeFromCookie, themeOf } from '~/core/ui';
import { Providers } from './app/Providers';
import { loadInitialRoute } from './app/prefetch';
import { NOT_FOUND_ROUTE, REDIRECTS, resolvePublicRoute, resolveRoute } from './app/routes';
import type { InitialState } from './initial-state';

/* The server half of the app: what server/infra/http/ssr.ts loads (from dist/server in
   production, through Vite in development) to answer a page request. It owns everything that
   needs the app's own code - the route table, the providers, React - so the Node server stays
   free of `src/` (ENGINEERING §2): the server calls the functions below and gets strings and a
   stream back.

   A request goes: the server reads the session and the settings in process (the same code the
   API runs), asks `prefetchPaths` which API calls this page makes first, answers them the same
   way, then calls `render` with all of it. The browser is sent the same answers in the page, so
   it hydrates (main.tsx) from exactly what was drawn. */

/** The signed-in person, as far as routing needs to know. */
export interface Viewer {
  role: string;
}

/** The API calls (paths relative to the API base) the page for `url` makes on its first render,
    for this viewer. None for a signed-out viewer (they see the sign-in page), a public page, a
    page they may not open, or a route that declares no `prefetch`. */
export function prefetchPaths(url: string, viewer: Viewer | null): string[] {
  if (!viewer) return [];
  const address = new URL(url, 'http://app.invalid');
  const path = normalizePath(address.pathname);
  if (resolvePublicRoute(path)) return [];
  const route = resolveRoute(path);
  if (route.requires === 'admin' && viewer.role !== 'admin') return [];
  return [...(route.prefetch?.(address) ?? [])];
}

/** The HTTP status the page for `url` is sent with. A signed-out viewer always gets the sign-in
    page (200): it does not say which addresses exist. */
export function statusFor(
  url: string,
  viewer: Viewer | null,
  settings: { maintenance: boolean },
): number {
  if (!viewer) return 200;
  const path = normalizePath(new URL(url, 'http://app.invalid').pathname);
  if (resolvePublicRoute(path)) return 200;
  if (viewer.role !== 'admin' && settings.maintenance) return 503;
  const route = resolveRoute(path);
  if (route === NOT_FOUND_ROUTE) return 404;
  if (route.requires === 'admin' && viewer.role !== 'admin') return 403;
  return 200;
}

/** The address a request for `url` should move to, or null. (An old short address, '/admin'.) */
export function redirectFor(url: string): string | null {
  const address = new URL(url, 'http://app.invalid');
  const target = REDIRECTS[normalizePath(address.pathname)];
  return target ? `${target}${address.search}` : null;
}

/** The <title> before the page sets its own: the route's name and the app's. */
export function titleFor(url: string, viewer: Viewer | null): string {
  if (!viewer) return `Sign in · ${config.appName}`;
  const path = normalizePath(new URL(url, 'http://app.invalid').pathname);
  const route = resolvePublicRoute(path) ?? resolveRoute(path);
  return `${route.title} · ${config.appName}`;
}

/** The attributes of <html> for a request: the look the reader's cookie names. */
export function htmlAttributes(cookie: string | undefined): Record<string, string> {
  const prefs: ThemePrefs = themeFromCookie(cookie);
  return {
    'data-theme': themeOf(prefs),
    'data-skin': prefs.skin,
    // 'system' is settled by the device: index.html's inline script re-checks it before paint
    'data-theme-mode': prefs.mode,
  };
}

/** The state the page is drawn from and sent with (initial-state.ts): the look the reader's
    cookie names, the API answers the server collected, and the instant. */
export function initialState(
  cookie: string | undefined,
  queries: Record<string, unknown>,
  now: string,
): InitialState {
  return { theme: themeFromCookie(cookie), queries, now };
}

export interface RenderInput {
  /** The request's path and query ('/table?page=2'). */
  url: string;
  /** What goes to the browser too (see initial-state.ts). */
  state: InitialState;
  /** The CSP nonce for the inline scripts React streams in (server/infra/http/ssr.ts). */
  nonce?: string;
}

/** Where the markup goes: a Node writable stream (the response, or a stream in front of it). */
export type Sink = Parameters<ReturnType<typeof renderToPipeableStream>['pipe']>[0];

export interface Rendered {
  /** Streams the page's markup into `out` (and ends it). */
  pipe(out: Sink): void;
  /** Gives up on what has not arrived yet (a slow section) and sends what there is. */
  abort(): void;
}

/** Starts rendering and settles when the shell is ready to send: everything outside the
    Suspense boundaries (the frame, the first screen's skeleton) has been drawn. What is still
    waiting - a lazy page, a section with data to come - streams in behind it. Rejects when the
    shell itself cannot be drawn; the server then answers 500. */
export async function render({ url, state, nonce }: RenderInput): Promise<Rendered> {
  // The signed-in app's file and the page's are loaded before React starts, as the browser does
  // before it hydrates (main.tsx), so the shell is drawn in place (SignedInGate.tsx) rather than
  // behind a loading screen.
  const me = state.queries['/auth/me'] as { user?: unknown } | undefined;
  await loadInitialRoute(new URL(url, 'http://app.invalid').pathname, me?.user != null);
  return new Promise((resolve, reject) => {
    const data = new InitialData(state.queries, state.now);
    const stream = renderToPipeableStream(<Providers url={url} data={data} theme={state.theme} />, {
      ...(nonce ? { nonce } : {}),
      // React moves a finished boundary larger than 12.8 kB out of line (a hidden copy and a script
      // that swaps it in) even when it completed before anything was sent. The page is that big, and
      // it is complete, so keep it in place: only a section still waiting streams in behind a fallback.
      progressiveChunkSize: 1 << 30,
      onShellReady() {
        resolve({ pipe: (out) => stream.pipe(out), abort: () => stream.abort() });
      },
      onShellError: reject,
      onError(error) {
        console.error(
          JSON.stringify({ level: 'error', msg: 'render failed', detail: String(error) }),
        );
      },
    });
  });
}
