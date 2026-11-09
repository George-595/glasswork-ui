import '@apps/ui/styles.css';
import favicon from '@apps/colors/favicon.svg';
import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { InitialData, type MeResponse } from '~/core/api';
import { NAVIGATE_EVENT, upgradeLegacyHash } from '~/core/router';
import { installPreloadRecovery } from './app/chunk-errors';
import { Providers } from './app/Providers';
import { loadInitialRoute, preloadInitialRoute } from './app/prefetch';
import { readInitialState } from './initial-state';

/* The browser's entry. A server render (entry-server.tsx) sends the page already drawn, with the
   data it was drawn from embedded in it (initial-state.ts); this takes that page over:

   1. an old `#/table` address is turned into `/table` (it is normally already, by index.html's
      inline script, before the server drew anything);
   2. the first screen's file is fetched BEFORE React starts, so the first client render finds the
      page ready instead of its loading skeleton, which would not match the server's HTML;
   3. `hydrateRoot` attaches to the existing markup (the same tree, from the same data and the same
      address: app/Providers.tsx).

   A page that was NOT server-rendered (a static host, `vite preview`) has no embedded data and is
   drawn from scratch, as a single-page app. */

// the icon is generated from the colour roles (@apps/colors), so it ships as a built asset
document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', favicon);

// A deploy while this page is open renames every screen's file: reload once rather than strand
// the person on an error (app/chunk-errors.ts).
installPreloadRecovery();

upgradeLegacyHash();

const container = document.getElementById('root');
if (!container) throw new Error('index.html has no #root element.');

async function start(root: HTMLElement): Promise<void> {
  const state = readInitialState();
  const url = `${window.location.pathname}${window.location.search}`;

  if (!state) {
    // Start fetching the first screen now, in parallel with the session read.
    preloadInitialRoute(window.location.pathname);
    createRoot(root).render(
      <StrictMode>
        <Providers url={url} data={new InitialData()} />
      </StrictMode>,
    );
    return;
  }

  const data = new InitialData(state.queries, state.now);
  // The embedded answers are for the first screen only: the first move to another page (or
  // a change of the address) ends them, so an old answer is never drawn later.
  const expire = () => data.expire();
  window.addEventListener('popstate', expire, { once: true });
  window.addEventListener(NAVIGATE_EVENT, expire, { once: true });

  const me = state.queries['/auth/me'] as MeResponse | undefined;
  await loadInitialRoute(window.location.pathname, me?.user != null);
  hydrateRoot(
    root,
    <StrictMode>
      <Providers url={url} data={data} theme={state.theme} />
    </StrictMode>,
  );
}

void start(container);
