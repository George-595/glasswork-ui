import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  api,
  apiPaths,
  onMaintenance,
  type SettingsResponse,
  type SettingsValues,
  type UpdateSettingsBody,
  useInitialData,
} from '~/core/api';
import { AuthContext } from '~/core/auth';
import { config } from '~/core/config';

/* SettingsProvider — the server-side settings (workspace name, maintenance mode), for the whole
   app. Per-viewer look-and-feel (skin, mode, backdrop) is NOT here: that stays in the browser.

   It reads GET /api/settings once the user is signed in, and again
   - whenever the window regains focus,
   - whenever any call answers 503 `maintenance` (the server switched it on under us), and
   - after `save` (the answer carries the stored values).
   Settings changed by an admin elsewhere reach a signed-in browser through those, and through the
   realtime `settings` event once the app listens for it (call `refresh()` from it).
   A failed read changes nothing: the last good values stay.

   Without a provider (a page rendered alone in a test) `useSettings()` returns the defaults, and
   `save` goes straight to the API. */
export interface SettingsState {
  status: 'idle' | 'ready' | 'error';
  /** What the shell calls the app. Falls back to VITE_APP_NAME until the server has answered. */
  workspaceName: string;
  maintenance: { enabled: boolean; message: string };
  /** Every setting the server sent for this viewer. */
  values: Partial<SettingsValues>;
  refresh(): Promise<void>;
  /** Admin only. Rejects with an ApiError (400 invalid_setting names the setting). */
  save(patch: UpdateSettingsBody): Promise<void>;
}

const DEFAULTS = {
  workspaceName: config.appName,
  maintenance: { enabled: false, message: '' },
};

export const SettingsContext = createContext<SettingsState | null>(null);

const FALLBACK: SettingsState = {
  status: 'idle',
  ...DEFAULTS,
  values: {},
  refresh: async () => {},
  save: async (patch) => {
    await api.updateSettings(patch);
  },
};

export function useSettings(): SettingsState {
  return useContext(SettingsContext) ?? FALLBACK;
}

function derive(values: Partial<SettingsValues>) {
  return {
    workspaceName: values['workspace.name'] ?? DEFAULTS.workspaceName,
    maintenance: {
      enabled: values['maintenance.enabled'] ?? false,
      message: values['maintenance.message'] ?? '',
    },
  };
}

const SIGNED_OUT = { status: 'idle', values: {} } as const;

export function SettingsProvider({ children }: { children: ReactNode }) {
  const auth = useContext(AuthContext);
  // Without an AuthProvider (a page test) there is nobody to wait for.
  const signedIn = auth ? auth.status === 'signed-in' : true;
  // A server render already read them (core/api/initial.tsx): the first screen is drawn with
  // the real workspace name and maintenance state, and they are not asked for again at mount.
  const initial = useInitialData()?.peek(apiPaths.settings) as SettingsResponse | undefined;
  const [state, setState] = useState<{
    status: SettingsState['status'];
    values: Partial<SettingsValues>;
  }>(() =>
    initial === undefined
      ? { status: 'idle', values: {} }
      : { status: 'ready', values: initial.settings },
  );
  const alreadyRead = useRef(initial !== undefined);
  // Each read takes a number; an older answer that lands late is ignored.
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const turn = ++latest.current;
    let values: Partial<SettingsValues>;
    try {
      values = (await api.settings()).settings;
    } catch {
      if (turn !== latest.current) return;
      // A failed read changes nothing once something has been read.
      setState((s) => (s.status === 'ready' ? s : { ...s, status: 'error' }));
      return;
    }
    if (turn !== latest.current) return;
    setState({ status: 'ready', values });
  }, []);

  const save = useCallback(async (patch: UpdateSettingsBody) => {
    const res = await api.updateSettings(patch);
    ++latest.current;
    setState({ status: 'ready', values: res.settings });
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    if (alreadyRead.current) alreadyRead.current = false;
    else void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    const stop = onMaintenance(() => void refresh());
    return () => {
      window.removeEventListener('focus', onFocus);
      stop();
    };
  }, [signedIn, refresh]);

  // Signed out: nothing is known, whatever was read for the last user.
  const shown = signedIn ? state : SIGNED_OUT;
  const value = useMemo<SettingsState>(
    () => ({ status: shown.status, values: shown.values, ...derive(shown.values), refresh, save }),
    [shown, refresh, save],
  );
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}
