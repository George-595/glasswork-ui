import { type ThemePrefs, ThemeSeedContext, useTheme } from '@apps/ui';
import { createContext, type ReactNode, useContext } from 'react';

/* One theme state for the whole app. @apps/ui's useTheme() is a plain hook:
   two components calling it would hold two copies that drift apart (the
   topbar toggle and the Settings page, say). ThemeProvider calls it once and
   shares it; everything in the app reads it with useAppTheme().

   `seed` is the look the server painted from the `ui-theme` cookie (mode, skin, glass backdrop).
   The first render, on the server and again when the browser hydrates it, starts from the seed
   rather than from this browser's storage, so the page is drawn right from the first byte and
   hydration matches. Without a seed (a client-only app, a test) the browser is read as before. */
type ThemeState = ReturnType<typeof useTheme>;

const ThemeContext = createContext<ThemeState | null>(null);

function Inner({ children }: { children: ReactNode }) {
  const state = useTheme();
  return <ThemeContext.Provider value={state}>{children}</ThemeContext.Provider>;
}

export function ThemeProvider({ seed, children }: { seed?: ThemePrefs; children: ReactNode }) {
  return (
    <ThemeSeedContext.Provider value={seed ?? null}>
      <Inner>{children}</Inner>
    </ThemeSeedContext.Provider>
  );
}

export function useAppTheme(): ThemeState {
  const state = useContext(ThemeContext);
  if (!state) throw new Error('useAppTheme() needs <ThemeProvider> above it (see src/main.tsx).');
  return state;
}
