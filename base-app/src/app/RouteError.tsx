import { useState } from 'react';
import { useOnline } from '~/core/hooks';
import { Button, Cluster, Notice, Text } from '~/core/ui';
import { isChunkLoadError } from './chunk-errors';
import { reloadApp } from './reload';

/* The screen shown when a page fails inside the shell. Two kinds of failure, in plain words:

   - the page's file could not be fetched (`isChunkLoadError`). Online, that is a new version of
     the app: re-importing the same address fails again, so the button reloads the whole app.
     Offline, it is a screen never opened before: Try again works once the connection is back.
   - anything else is a fault in the page: its message, and Try again.

   The browser's own wording ("Failed to fetch dynamically imported module: https://...") is for
   the log, never for the person using it. */
export function RouteError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const online = useOnline();
  // what the connection was like when the page failed, not now: a screen that failed offline
  // is retried, a screen that failed online is stale
  const [failedOffline] = useState(() => !navigator.onLine);

  if (!isChunkLoadError(error)) {
    return (
      <Notice tone="danger" title="This page could not be shown.">
        <Text size="small">{error.message}</Text>
        <Cluster>
          <Button variant="outline" size="sm" onClick={onRetry}>
            Try again
          </Button>
        </Cluster>
      </Notice>
    );
  }

  if (failedOffline) {
    return (
      <Notice tone="warning" title="This screen needs a connection to open the first time.">
        <Text size="small">
          {online
            ? 'You are back online. Tap Try again.'
            : 'Try again when you are back online. Screens you have already opened still work.'}
        </Text>
        <Cluster>
          <Button variant="outline" size="sm" disabled={!online} onClick={onRetry}>
            Try again
          </Button>
        </Cluster>
      </Notice>
    );
  }

  return (
    <Notice tone="info" title="The app has been updated.">
      <Text size="small">Reload to carry on.</Text>
      <Cluster>
        <Button variant="primary" size="xl" onClick={reloadApp}>
          Reload
        </Button>
      </Cluster>
    </Notice>
  );
}
