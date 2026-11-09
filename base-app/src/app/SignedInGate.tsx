import { lazy, Suspense, useState } from 'react';
import { AppRoot } from '~/core/ui';
import { AuthSkeleton } from './Skeletons';

/* The signed-in app is a file of its own (SignedIn.tsx: the shell, its menus, the live
   connections), so a signed-out visitor, who is shown only the sign-in page, never downloads it.

   Someone who IS signed in needs it for the first paint. The server draws it and the browser
   hydrates it, so the browser fetches the file BEFORE it hydrates (`loadSignedIn`, awaited by
   main.tsx through prefetch.ts's `loadInitialRoute`; the server awaits it too, entry-server.tsx)
   and the first render finds it already there and draws the shell at once, the same markup the
   server sent. When it is not there yet - someone has just signed in on the sign-in page - the
   page shows the loading screen while it arrives. */
type SignedInModule = typeof import('./SignedIn');
let loaded: SignedInModule | undefined;

/** Fetches the signed-in app (once; later calls get the same promise). Never rejects. */
export function loadSignedIn(): Promise<unknown> {
  return import('./SignedIn').then(
    (module) => {
      loaded = module;
    },
    () => undefined,
  );
}

const LazySignedIn = lazy(() => import('./SignedIn').then((m) => ({ default: m.SignedIn })));

/** The signed-in app, drawn at once if it has been loaded, else behind the loading screen. The
    choice is made once, when this mounts: it must not swap one for the other afterwards, which
    would remount the shell and lose the open panels. */
export function SignedInGate() {
  const [ready] = useState(() => loaded);
  if (ready) return <ready.SignedIn />;
  return (
    <Suspense
      fallback={
        <AppRoot>
          <AuthSkeleton label="your workspace" />
        </AppRoot>
      }
    >
      <LazySignedIn />
    </Suspense>
  );
}
