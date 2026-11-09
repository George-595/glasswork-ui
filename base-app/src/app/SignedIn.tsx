import { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '~/core/auth';
import { NotificationsProvider } from '~/core/notifications';
import { RealtimeProvider } from '~/core/realtime';
import { navigate, normalizePath, usePath } from '~/core/router';
import { useSettings } from '~/core/settings';
import { AppRoot, ErrorBoundary, PageEnter } from '~/core/ui';
import MaintenancePage from '~/pages/maintenance';
import NotAuthorisedPage from '~/pages/not-authorised';
import { installIntentPrefetch, prefetchWhenIdle, routesToPrefetch } from './prefetch';
import { RouteError } from './RouteError';
import { REDIRECTS, resolveRoute } from './routes';
import { Shell } from './Shell';
import { PageSkeleton } from './Skeletons';
import { reloadScreen, screenFor } from './screens';
import { ViewAsBanner } from './ViewAsBanner';

/* Everything a signed-in person sees: the live connections, the shell around the page, the page.
   It is its own file (SignedInGate.tsx loads it) so that the sign-in page - the first thing a
   signed-out visitor meets - does not download the shell, its menus and the popovers behind them. */
export function SignedIn() {
  return (
    <RealtimeProvider>
      <NotificationsProvider>
        <SignedInApp />
      </NotificationsProvider>
    </RealtimeProvider>
  );
}

function SignedInApp() {
  const { isAdmin, user } = useAuth();
  const { maintenance } = useSettings();
  const path = usePath();
  const route = resolveRoute(path);
  const redirect = REDIRECTS[normalizePath(path)];
  const previous = useRef(path);
  const [attempt, setAttempt] = useState(0);

  // Once someone is signed in, fetch the screens they may open while the device is idle, and the
  // one behind a link from the first touch of it (prefetch.ts).
  useEffect(() => prefetchWhenIdle(routesToPrefetch(isAdmin)), [isAdmin]);
  useEffect(() => installIntentPrefetch(), []);

  // An old address moves to its new one in the address bar too.
  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect]);

  // Moving to another page puts focus at the top of the page, so a keyboard user
  // hears the new page rather than staying on the link they just used, and scrolls to
  // the top (the document scrolls, not <main>). Going Back does not restore the old
  // scroll position: an address change does not say whether it was a link or Back.
  useEffect(() => {
    if (previous.current === path) return;
    previous.current = path;
    document.getElementById('main')?.focus({ preventScroll: true });
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }, [path]);

  // Maintenance mode: everyone but an admin gets the "back soon" page, with no shell around it.
  if (maintenance.enabled && !isAdmin) {
    return (
      <AppRoot>
        <ViewAsBanner />
        <main id="main" tabIndex={-1}>
          <MaintenancePage />
        </main>
      </AppRoot>
    );
  }

  // An admin route for a signed-in non-admin: the shell stays, the page says it is not allowed.
  const forbidden = route.requires === 'admin' && !isAdmin;

  return (
    <AppRoot>
      <Shell route={route}>
        {/* keyed by route: a new page mounts a fresh wrapper, which plays the soft entrance
            (off under prefers-reduced-motion). The role is in the key too: viewing as another
            role rebuilds the page for it, so nothing fetched as the old role lingers */}
        <PageEnter key={`${route.id}:${user?.role}`}>
          <ErrorBoundary
            key={`${route.id}#${attempt}`}
            name={route.title}
            onError={(error) => console.error(`The ${route.id} page failed to load.`, error)}
            fallback={(error) => (
              <RouteError
                error={error}
                onRetry={() => {
                  reloadScreen(route);
                  setAttempt((n) => n + 1);
                }}
              />
            )}
          >
            {forbidden ? (
              <NotAuthorisedPage />
            ) : (
              <Suspense fallback={<PageSkeleton />}>{screenFor(route)}</Suspense>
            )}
          </ErrorBoundary>
        </PageEnter>
      </Shell>
    </AppRoot>
  );
}
