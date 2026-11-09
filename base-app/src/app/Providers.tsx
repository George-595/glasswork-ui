import type { InitialData } from '~/core/api';
import { InitialDataProvider } from '~/core/api';
import { AuthProvider } from '~/core/auth';
import { LocationProvider } from '~/core/router';
import { SettingsProvider } from '~/core/settings';
import { type ThemePrefs, ThemeProvider } from '~/core/ui';
import { App } from './App';

/* The whole tree the app is: what main.tsx hydrates and entry-server.tsx renders, built in one place
   so the two cannot differ (a difference is a hydration mismatch).

   - `url`: the address (path and query) - where there is no `window`, and for hydration, which has
     to start from the address the server rendered;
   - `data`: the answers a server render prefetched (core/api/initial.tsx), which also say who is
     signed in and what the settings are;
   - `theme`: the look the server painted from the `ui-theme` cookie (core/ui/theme.tsx); absent in a
     client-only app, which reads the browser's own storage. */
export function Providers({
  url,
  data,
  theme,
}: {
  url: string;
  data: InitialData;
  theme?: ThemePrefs;
}) {
  return (
    <LocationProvider url={url}>
      <InitialDataProvider data={data}>
        <ThemeProvider {...(theme ? { seed: theme } : {})}>
          <AuthProvider>
            <SettingsProvider>
              <App />
            </SettingsProvider>
          </AuthProvider>
        </ThemeProvider>
      </InitialDataProvider>
    </LocationProvider>
  );
}
