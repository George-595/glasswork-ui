import { isAppHref } from '~/core/router';
import {
  NOT_FOUND_ROUTE,
  type PublicRouteDef,
  ROUTES,
  type RouteDef,
  resolvePublicRoute,
  resolveRoute,
} from './routes';
import { loadSignedIn } from './SignedInGate';
import { loadScreen } from './screens';

/* Fetching a page's file before the person asks for it. Every page is its own file (so the first
   screen is small), which on a slow connection means a wait for each new screen. Three ways to
   hide it:
   - `preloadInitialRoute`: the page the address names, fetched while the session is still read;
   - `prefetchWhenIdle`: after sign-in, the rest, one at a time when the device is idle, so
     navigating works offline once they are cached;
   - `installIntentPrefetch`: the page behind a link, from the first touch of it.
   A failed prefetch is silent: the real load that follows fails (and recovers) on its own. */
/* Through loadScreen, so a prefetched page (and anything its `ready` loads) is drawn at once when
   the person gets there, with no skeleton (lazyResolved). */
type Loadable = Pick<RouteDef | PublicRouteDef, 'id' | 'load'>;

function fetchPage(route: Loadable): Promise<void> {
  return loadScreen(route).then(
    () => undefined,
    () => undefined,
  );
}

/** Fetches what the first screen is drawn from and settles when it has arrived (never rejects): the
    page the address names and, for someone signed in, the signed-in app around it (SignedInGate.tsx).
    A browser that hydrates server HTML awaits this before it hydrates, so the first client render
    finds both ready instead of their loading screens, and matches the server's markup. The server
    awaits it before rendering too, so the page is sent drawn rather than as a fallback and a swap.
    A signed-out viewer is shown the sign-in page, which is not a lazy file, unless the address is a
    public page, and needs neither. */
export function loadInitialRoute(path: string, signedIn: boolean): Promise<unknown> {
  const publicRoute = resolvePublicRoute(path);
  const route = publicRoute ?? (signedIn ? resolveRoute(path) : undefined);
  return Promise.all([
    route ? loadScreen(route).catch(() => undefined) : undefined,
    signedIn && !publicRoute ? loadSignedIn() : undefined,
  ]);
}

/** Starts fetching the page for the first address, in parallel with the session read. */
export function preloadInitialRoute(path: string): void {
  void fetchPage(resolvePublicRoute(path) ?? resolveRoute(path));
}

/** The pages worth fetching after sign-in: those this person may open, in route-table order. */
export function routesToPrefetch(isAdmin: boolean): RouteDef[] {
  return ROUTES.filter((r) => r.requires !== 'admin' || isAdmin);
}

export interface PrefetchDeps {
  /** Resolves when the first screen has settled. */
  settle: () => Promise<void>;
  /** Resolves when the device has nothing else to do. */
  idle: () => Promise<void>;
  /** True when the person asked their browser to save data. */
  saveData: () => boolean;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const prefetchDefaults: PrefetchDeps = {
  settle: () => wait(2000),
  // Safari has no requestIdleCallback: a short pause stands in
  idle: () =>
    new Promise<void>((resolve) => {
      if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(() => resolve(), { timeout: 5000 });
      } else {
        setTimeout(resolve, 300);
      }
    }),
  saveData: () => {
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } })
      .connection;
    return connection?.saveData === true;
  },
};

/** Fetches `routes` one at a time while the device is idle. Returns the cancel function (call it
    when the person signs out or the screen unmounts). Nothing is fetched on Data Saver. */
export function prefetchWhenIdle(
  routes: readonly Loadable[],
  overrides: Partial<PrefetchDeps> = {},
): () => void {
  const deps = { ...prefetchDefaults, ...overrides };
  let cancelled = false;
  void (async () => {
    if (deps.saveData()) return;
    await deps.settle();
    for (const route of routes) {
      if (cancelled) return;
      await deps.idle();
      if (cancelled) return;
      await fetchPage(route);
    }
  })();
  return () => {
    cancelled = true;
  };
}

function onPointerDown(event: Event): void {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const href = target.closest('a[href]')?.getAttribute('href');
  if (!href || !isAppHref(href)) return;
  const route = resolveRoute(href);
  if (route !== NOT_FOUND_ROUTE) void fetchPage(route);
}

/** From the first touch of a link, fetch its page: the finger takes 100 ms or more to lift.
    Returns the remover. */
export function installIntentPrefetch(doc: Document = document): () => void {
  doc.addEventListener('pointerdown', onPointerDown, { capture: true, passive: true });
  return () => doc.removeEventListener('pointerdown', onPointerDown, { capture: true });
}
