/* oxlint-disable no-eval -- the test runs the page's own inline scripts, as a browser would */
/* Hydration: the browser's first render must be the markup the server sent, or React throws the
   server's work away (and says so). This takes the HTML the real server sends - made by
   scripts/ssr-pages.mjs in a plain Node process, where there is no `window` - puts it in jsdom,
   finishes the stream the way a browser does, hydrates it exactly as main.tsx does, and fails on
   any mismatch React reports.

   One page per route and visitor, plus the looks that draw differently (glass, dark). */
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { InitialData, type MeResponse } from '~/core/api';
import { readInitialState } from '~/initial-state';
import { type PageCase, serverPages } from '~/test/ssr-pages.node';
import { Providers } from './Providers';
import { loadInitialRoute } from './prefetch';

type Case = PageCase;

const ROUTES = [
  '/',
  '/table',
  '/table?page=2&size=10&status=paid&sort=-amount',
  '/table?mode=browser',
  '/tool-1',
  '/graphs',
  '/assistant',
  '/views',
  '/notifications',
  '/kit',
  '/account',
  '/admin/users',
  '/admin/settings',
  '/admin/mail',
  '/admin/jobs',
  '/admin/audit-log',
  '/no/such/page',
];

const CASES: Case[] = [
  { id: 'signed out /', url: '/', as: 'out' },
  { id: 'signed out /table', url: '/table', as: 'out' },
  { id: 'signed out /forgot-password', url: '/forgot-password', as: 'out' },
  { id: 'signed out /reset-password', url: '/reset-password', as: 'out' },
  { id: 'signed out /accept-invite', url: '/accept-invite', as: 'out' },
  { id: 'viewer /', url: '/', as: 'viewer' },
  { id: 'viewer /admin/users', url: '/admin/users', as: 'viewer' },
  ...ROUTES.map((url): Case => ({ id: `admin ${url}`, url, as: 'admin' })),
  // the looks: a returning visitor's cookie, and the device's own answer for 'system'
  ...['/', '/kit', '/table'].map(
    (url): Case => ({
      id: `admin ${url} (glass, dark)`,
      url,
      as: 'admin',
      cookie: 'ui-theme=dark.glass.mesh.dark',
    }),
  ),
  {
    id: 'admin / (system, light)',
    url: '/',
    as: 'admin',
    cookie: 'ui-theme=system.glass.aurora.light',
  },
  {
    id: 'viewer / (enterprise, light)',
    url: '/',
    as: 'viewer',
    cookie: 'ui-theme=light.enterprise.aurora.light',
  },
];

let pages: Record<string, { status: number; html: string }>;

beforeAll(() => {
  pages = serverPages(CASES);
}, 200_000);

let unmount: (() => void) | undefined;
afterEach(() => {
  unmount?.();
  unmount = undefined;
  document.documentElement.removeAttribute('data-theme-mode');
});

/* Puts the server's HTML in the document and runs its inline scripts in order: React's own, which
   swap each finished section in for its loading fallback. jsdom does not run scripts that arrive
   as markup, so this is the part of the browser's job done by hand. */
function load(html: string, url: string, cookie: string | undefined) {
  // React's stream runtime keeps its state in globals ($RC, $RS, ...): each page starts clean
  for (const key of Object.keys(globalThis)) {
    if (key.startsWith('$R')) delete (globalThis as Record<string, unknown>)[key];
  }
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  for (const { name, value } of Array.from(parsed.documentElement.attributes)) {
    document.documentElement.setAttribute(name, value);
  }
  document.body.innerHTML = parsed.body.innerHTML;
  window.history.replaceState(null, '', url);
  if (cookie) document.cookie = `${cookie}; Path=/`;
  for (const script of Array.from(document.body.querySelectorAll('script'))) {
    const type = script.getAttribute('type');
    if (!script.src && (type === null || type === 'text/javascript') && script.textContent) {
      // biome-ignore lint/security/noGlobalEval: the page's own inline scripts
      (0, eval)(script.textContent);
    }
  }
}

describe('hydrating what the server sends', () => {
  it.each(CASES)('$id', async ({ id, url, cookie }) => {
    const page = pages[id];
    if (!page) throw new Error(`no page for ${id}`);
    load(page.html, url, cookie);

    const state = readInitialState(document);
    expect(state, 'the page embeds its initial state').not.toBeNull();
    if (!state) return;
    const root = document.getElementById('root') as HTMLElement;
    const before = root.innerHTML;
    expect(before.length).toBeGreaterThan(200);

    const recoverable: unknown[] = [];
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    const data = new InitialData(state.queries, state.now);
    const me = state.queries['/auth/me'] as MeResponse | undefined;
    await loadInitialRoute(window.location.pathname, me?.user != null);

    await act(async () => {
      const hydrated = hydrateRoot(
        root,
        <Providers
          url={`${window.location.pathname}${window.location.search}`}
          data={data}
          theme={state.theme}
        />,
        { onRecoverableError: (error) => recoverable.push(error) },
      );
      unmount = () => hydrated.unmount();
    });
    // let the effects (theme, focus, the session re-check) and the lazy page settle
    for (let i = 0; i < 4; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0));
      });
    }

    const messages = [
      ...recoverable.map((e) => String(e)),
      ...errors.mock.calls.map((c) => c.map(String).join(' ')),
    ].filter((m) => !/act\(|not wrapped in act/i.test(m));
    errors.mockRestore();
    expect(messages, `${id}: React reported a hydration problem`).toEqual([]);

    // hydration adopted the server's markup: the DOM was not rebuilt, and has one heading
    expect(
      Array.from(root.querySelectorAll('h1')).map((h) => h.textContent),
      `${id}: headings`,
    ).toHaveLength(1);
    expect(root.innerHTML.length).toBeGreaterThan(before.length / 2);
  });
});
