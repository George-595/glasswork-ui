import type { ReactElement } from 'react';
import { lazyResolved } from '~/core/lazy';
import { isChunkLoadError, reloadForNewVersion } from './chunk-errors';
import {
  NOT_FOUND_ROUTE,
  type PageModule,
  PUBLIC_ROUTES,
  type PublicRouteDef,
  ROUTES,
  type RouteDef,
} from './routes';

/* A page's file. If the browser cannot fetch it while online, a new version of the app was
   deployed since this page was opened and the file it names is gone: reload once to get the new
   one (chunk-errors.ts). The promise then never settles, so the skeleton stays up for the moment
   the reload takes instead of flashing an error. Everything else rejects as it came. */
function loadRoute(r: RouteDef | PublicRouteDef): Promise<PageModule> {
  return r.load().catch((error: unknown) => {
    if (isChunkLoadError(error) && reloadForNewVersion()) return new Promise<PageModule>(() => {});
    throw error;
  });
}

/* One lazy component per route, made once at load: a re-render must not remount the page.
   A page's module is only fetched when its route first renders, unless the first screen's file
   was loaded ahead (`loadScreen`, from prefetch.ts: the server before it renders, the browser
   before it hydrates), in which case the page is drawn in place with no Suspense fallback
   (core/lazy). */
const makeScreen = (r: RouteDef | PublicRouteDef) => {
  let ready: PageModule['ready'];
  const { Component, load } = lazyResolved<object>(() =>
    loadRoute(r).then((module) => {
      ready = module.ready;
      return module;
    }),
  );
  return { element: <Component key={r.id} />, load, ready: () => ready?.() };
};
const SCREENS = new Map(
  [...ROUTES, NOT_FOUND_ROUTE, ...PUBLIC_ROUTES].map((r) => [r.id, makeScreen(r)]),
);

/* React.lazy remembers a failed import, so "Try again" after a failed chunk load
   (offline, or a redeploy that changed the file names) needs a fresh lazy. */
export function reloadScreen(route: RouteDef): void {
  SCREENS.set(route.id, makeScreen(route));
}

export function screenFor(route: RouteDef | PublicRouteDef): ReactElement {
  const screen = SCREENS.get(route.id);
  if (!screen) throw new Error(`No screen registered for route "${route.id}".`);
  return screen.element;
}

/** Fetches a page's file and its own lazy parts (`ready`) so `screenFor`'s element draws at once. */
export async function loadScreen(
  route: Pick<RouteDef | PublicRouteDef, 'id' | 'load'>,
): Promise<void> {
  const screen = SCREENS.get(route.id);
  if (!screen) {
    await route.load();
    return;
  }
  await screen.load();
  await screen.ready();
}
