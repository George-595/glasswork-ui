import { Suspense, useEffect } from 'react';
import { useAuth } from '~/core/auth';
import { installLinkInterception, usePath } from '~/core/router';
import { AppRoot, Toaster } from '~/core/ui';
import LoginPage from '~/pages/login';
import { resolvePublicRoute } from './routes';
import { SignedInGate } from './SignedInGate';
import { AuthSkeleton } from './Skeletons';
import { screenFor } from './screens';

/* The app: the gate, and the one Toaster that every `toast()` call in the app shows through
   (mounted here so it survives sign-in, sign-out and page changes). */
export function App() {
  // The kit's navigation renders plain anchors with real hrefs; a plain click on any of them moves
  // within the app instead of reloading it (core/router/links.ts).
  useEffect(() => installLinkInterception(), []);
  return (
    <>
      <Gate />
      <Toaster />
    </>
  );
}

/* The gate. While the session is being read, a full-page loading skeleton; with nobody signed in,
   the sign-in page at any address (after signing in, the address the user first asked for shows).
   The public pages (accept invite, forgot and reset password) come before all of that. The
   signed-in app is its own file (SignedInGate.tsx), so this one holds only what a visitor who is
   not signed in needs. */
function Gate() {
  const { status } = useAuth();
  const path = usePath();
  // an emailed link (accept invite, reset password) or "forgot password": no shell, signed in or not
  const publicRoute = resolvePublicRoute(path);
  if (publicRoute) {
    return (
      <AppRoot>
        <Suspense fallback={<AuthSkeleton label="the page" />}>{screenFor(publicRoute)}</Suspense>
      </AppRoot>
    );
  }
  if (status === 'loading') {
    return (
      <AppRoot>
        <AuthSkeleton label="your session" />
      </AppRoot>
    );
  }
  if (status === 'signed-out') {
    return (
      <AppRoot>
        <LoginPage />
      </AppRoot>
    );
  }
  return <SignedInGate />;
}
