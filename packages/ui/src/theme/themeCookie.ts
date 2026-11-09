import type { BackgroundVariant } from '../effects/AnimatedBackground';
import { isShaderPreset, type ShaderPreset } from '../effects/shaders/presets';

/* The look the reader chose (mode, skin, glass backdrop), as one cookie, so a SERVER can paint
   the right theme into the first byte of HTML: no flash of the wrong skin, no flash of the wrong
   mode. localStorage stays as a mirror (older clients wrote only that; see useTheme).

     ui-theme=<mode>.<skin>.<backdrop>.<resolved>
     ui-theme=system.glass.tide.dark

   `resolved` is the light/dark the device last showed, so a server can render `system` mode
   right for a returning visitor; a first-time visitor gets dark and the page's inline script
   corrects it before paint (index.html). Every field is checked against a closed list on the way
   in, so a hand-made cookie can only ever select one of the known looks.

   Nothing in this file touches `window` or `document` at import time or on the server. */
export type Theme = 'light' | 'dark';
/** What the person chose: a fixed theme, or follow the device. */
export type ThemeMode = Theme | 'system';
export type Skin = 'enterprise' | 'glass';
export type Backdrop = BackgroundVariant | ShaderPreset;

export const THEMES: readonly Theme[] = ['light', 'dark'];
export const SKINS: readonly Skin[] = ['enterprise', 'glass'];
export const DEFAULT_BACKDROP: Backdrop = 'tide';

export function isBackdrop(value: unknown): value is Backdrop {
  return value === 'tide' || value === 'hive' || isShaderPreset(value);
}

/* The backdrops before Nov 2026 were 'aurora' and 'iridescence'. A reader who chose one keeps
   a backdrop of the same character (the soft wash, the full-bleed one), and the rest of their
   cookie (mode, skin) is not thrown away for an old name. */
const RENAMED_BACKDROPS: Readonly<Record<string, Backdrop>> = {
  aurora: 'tide',
  iridescence: 'hive',
};

/** A stored backdrop name, with the old names read as their successors. */
export function upgradeBackdrop(value: unknown): unknown {
  return typeof value === 'string' && value in RENAMED_BACKDROPS ? RENAMED_BACKDROPS[value] : value;
}

export const THEME_COOKIE = 'ui-theme';

export interface ThemePrefs {
  mode: ThemeMode;
  skin: Skin;
  backdrop: Backdrop;
  /** The light/dark in force when `mode` is 'system' (and equal to `mode` otherwise). */
  resolved: Theme;
}

export const DEFAULT_PREFS: ThemePrefs = {
  mode: 'system',
  skin: 'enterprise',
  backdrop: DEFAULT_BACKDROP,
  resolved: 'dark',
};

const isTheme = (v: unknown): v is Theme => v === 'light' || v === 'dark';
const isSkin = (v: unknown): v is Skin => v === 'enterprise' || v === 'glass';

/** The light/dark an app should draw for these preferences. */
export const themeOf = (prefs: ThemePrefs): Theme =>
  prefs.mode === 'system' ? prefs.resolved : prefs.mode;

/** The cookie's value for these preferences. */
export function serializeThemePrefs(prefs: ThemePrefs): string {
  return `${prefs.mode}.${prefs.skin}.${prefs.backdrop}.${prefs.resolved}`;
}

/** A cookie value to preferences, or null when it is not one of ours. */
export function parseThemeValue(value: string | undefined): ThemePrefs | null {
  if (!value) return null;
  const [mode, skin, stored, resolved, ...rest] = value.split('.');
  const backdrop = upgradeBackdrop(stored);
  if (rest.length > 0) return null;
  if (!(mode === 'system' || isTheme(mode))) return null;
  if (!isSkin(skin) || !isBackdrop(backdrop) || !isTheme(resolved)) return null;
  return { mode, skin, backdrop, resolved: mode === 'system' ? resolved : mode };
}

/** The `ui-theme` cookie in a Cookie request header (or document.cookie), or null. */
export function parseThemeCookie(cookieHeader: string | undefined): ThemePrefs | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const at = part.indexOf('=');
    if (at === -1) continue;
    if (part.slice(0, at).trim() === THEME_COOKIE) {
      return parseThemeValue(part.slice(at + 1).trim());
    }
  }
  return null;
}

/** Preferences for a request: the cookie, else the defaults. */
export function themeFromCookie(cookieHeader: string | undefined): ThemePrefs {
  return parseThemeCookie(cookieHeader) ?? DEFAULT_PREFS;
}

/* What an older client left in localStorage (`ui-theme` is 'light' or 'dark', absent for
   'system'; `ui-skin`; `ui-backdrop`). Read only to bring a returning visitor's cookie into step. */
export function readStoredPrefs(): Partial<ThemePrefs> {
  const out: Partial<ThemePrefs> = {};
  try {
    const mode = window.localStorage.getItem('ui-theme');
    out.mode = isTheme(mode) ? mode : 'system';
    if (isTheme(mode)) out.resolved = mode;
    const skin = window.localStorage.getItem('ui-skin');
    if (isSkin(skin)) out.skin = skin;
    const backdrop = upgradeBackdrop(window.localStorage.getItem('ui-backdrop'));
    if (isBackdrop(backdrop)) out.backdrop = backdrop;
  } catch {
    /* storage blocked */
  }
  return out;
}

/** The cookie in this browser, or null (none, or no document: the server). */
export function readThemeCookie(): ThemePrefs | null {
  if (typeof document === 'undefined') return null;
  try {
    return parseThemeCookie(document.cookie);
  } catch {
    return null;
  }
}

/** Writes the cookie (a year, this site, readable by scripts: the server only needs to read it). */
export function writeThemeCookie(prefs: ThemePrefs): void {
  if (typeof document === 'undefined') return;
  try {
    const secure = typeof location !== 'undefined' && location.protocol === 'https:';
    document.cookie = `${THEME_COOKIE}=${serializeThemePrefs(prefs)}; Path=/; Max-Age=31536000; SameSite=Lax${secure ? '; Secure' : ''}`;
  } catch {
    /* cookies blocked: the choice still lives in localStorage and in this page */
  }
}

/** Changes some fields of the stored cookie (or of the defaults when there is none). */
export function updateThemeCookie(patch: Partial<ThemePrefs>): void {
  const base = readThemeCookie() ?? { ...DEFAULT_PREFS, ...readStoredPrefs() };
  const next = { ...base, ...patch };
  writeThemeCookie({ ...next, resolved: next.mode === 'system' ? next.resolved : next.mode });
}
