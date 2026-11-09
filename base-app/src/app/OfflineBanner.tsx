import { useOnline } from '~/core/hooks';
import { Banner } from '~/core/ui';

/* The one offline notice, in the shell's `banner` slot under the top bar on every screen. It
   follows the browser's online and offline events and clears itself. A screen adds only what is
   true of that screen ("Showing the list from 10:42"), never its own "You're offline". */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <Banner tone="warning" title="You're offline." data-offline-banner="">
      You can still look at what is on screen. Changes need a connection.
    </Banner>
  );
}
