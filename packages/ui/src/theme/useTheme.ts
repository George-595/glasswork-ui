import { useCallback, useContext, useEffect, useState } from 'react';
import {
  readStoredPrefs,
  readThemeCookie,
  SKINS,
  type Skin,
  THEMES,
  type Theme,
  type ThemeMode,
  type ThemePrefs,
  updateThemeCookie,
} from './themeCookie';
import { ThemeSeedContext } from './themeSeed';

/* useTheme — the light/dark mode and the skin, written to <html> as
   data-theme and data-skin (the attributes tokens.css and glass.css key on)
   and remembered in localStorage and in the `ui-theme` cookie (themeCookie.ts),
   which is what lets a server paint them. Extracted from the theme toggle in
   site/apps/web/src/trading/TradingApp.tsx.

   First visit: the mode follows the system (prefers-color-scheme), the skin
   is enterprise. Storage can be blocked (private mode), so every access is
   guarded and the hook still works without it.

   Server rendering. With a seed (the look the server painted: `useTheme(seed)`, or
   <ThemeSeedContext>), the first render starts from the seed instead of the browser, so hydration
   matches the server HTML; after mount the hook follows the device while the mode is 'system',
   and an older visitor whose choice lives only in localStorage is brought into step. Until the
   device has been asked, a seeded 'system' mode leaves <html data-theme> to the inline script in
   index.html, which already set it from matchMedia before first paint. */
export type { Skin, Theme, ThemeMode } from './themeCookie';
export { SKINS, THEMES } from './themeCookie';

const THEME_KEY = 'ui-theme';
const SKIN_KEY = 'ui-skin';

function read<T extends string>(key: string, allowed: readonly T[]): T | null {
  try {
    const v = window.localStorage.getItem(key);
    return v && (allowed as readonly string[]).includes(v) ? (v as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

function systemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

/* The browser's own record of the look: localStorage first (what every client has written),
   then the cookie (what survives cleared site storage). Null on the server. */
function stored(): Partial<ThemePrefs> {
  if (typeof window === 'undefined') return {};
  const fromCookie = readThemeCookie();
  const mode = read(THEME_KEY, THEMES) ?? (fromCookie ? fromCookie.mode : undefined);
  const skin = read(SKIN_KEY, SKINS) ?? fromCookie?.skin;
  return {
    ...(mode !== undefined ? { mode } : {}),
    ...(skin !== undefined ? { skin } : {}),
  };
}

export function initialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const mode = stored().mode;
  return mode === 'light' || mode === 'dark' ? mode : systemTheme();
}

export function initialSkin(): Skin {
  if (typeof window === 'undefined') return 'enterprise';
  return stored().skin ?? 'enterprise';
}

export function initialMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system';
  return stored().mode ?? 'system';
}

export function useTheme(seedProp?: ThemePrefs) {
  const fromContext = useContext(ThemeSeedContext);
  const seed = seedProp ?? fromContext;
  const [mode, setModeState] = useState<ThemeMode>(() => seed?.mode ?? initialMode());
  // 'system' mode: the device's answer. Seeded, it is the server's guess until the device is asked.
  const [system, setSystem] = useState<Theme>(() => seed?.resolved ?? systemTheme());
  const [checked, setChecked] = useState(() => seed === null);
  const theme: Theme = mode === 'system' ? system : mode;
  const [skin, setSkinState] = useState<Skin>(() => seed?.skin ?? initialSkin());

  // follow the device while the mode is 'system'
  useEffect(() => {
    if (mode !== 'system' || typeof window === 'undefined' || !window.matchMedia) {
      // oxlint-disable-next-line react/set-state-in-effect -- the device is asked once mounted
      setChecked(true);
      return;
    }
    const list = window.matchMedia('(prefers-color-scheme: light)');
    const on = () => setSystem(list.matches ? 'light' : 'dark');
    on();
    setChecked(true);
    list.addEventListener('change', on);
    return () => list.removeEventListener('change', on);
  }, [mode]);

  // A server painted this page from a cookie. A visitor from before the cookie existed has only
  // localStorage: adopt it once, so what is stored and what is shown agree.
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on mount
  useEffect(() => {
    if (seed === null || readThemeCookie() !== null) return;
    const old = readStoredPrefs();
    // oxlint-disable-next-line react/set-state-in-effect -- adopts what only this browser knows, once mounted
    if (old.mode !== undefined) setModeState(old.mode);
    if (old.skin !== undefined) setSkinState(old.skin);
  }, []);

  useEffect(() => {
    if (mode === 'system' && !checked) return;
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme, mode, checked]);
  useEffect(() => {
    document.documentElement.setAttribute('data-skin', skin);
  }, [skin]);
  // the cookie a server reads: kept in step with what is shown
  useEffect(() => {
    if (mode === 'system' && !checked) return;
    updateThemeCookie({ mode, skin, resolved: theme });
  }, [mode, skin, theme, checked]);

  const setTheme = useCallback((t: Theme) => {
    write(THEME_KEY, t);
    setModeState(t);
  }, []);
  const setMode = useCallback((m: ThemeMode) => {
    if (m === 'system') {
      try {
        window.localStorage.removeItem(THEME_KEY);
      } catch {
        /* storage unavailable */
      }
    } else write(THEME_KEY, m);
    setModeState(m);
  }, []);
  const setSkin = useCallback((s: Skin) => {
    write(SKIN_KEY, s);
    setSkinState(s);
  }, []);
  const toggleTheme = useCallback(() => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    write(THEME_KEY, next);
    setModeState(next);
  }, [theme]);

  return { theme, mode, setMode, setTheme, toggleTheme, skin, setSkin };
}
