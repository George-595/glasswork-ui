import {
  createContext,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  api,
  apiPaths,
  type MeResponse,
  onUnauthenticated,
  type Role,
  type SessionUser,
  useInitialData,
} from '~/core/api';
import { navigate } from '~/core/router';
import { effectiveRole, viewAsOptions } from '~/core/utils';

/* AuthProvider — who is signed in, for the whole app. It asks GET /api/auth/me once on
   mount. Login and logout write the answer straight into state and win over any check
   still in flight. (Server-rendered, the first answer comes with the page and is not asked again.) The session can end on the server without the page knowing (a cookie
   expiry, say), so the answer is asked again whenever the window regains focus and
   whenever any API call answers 401. A failed check (network, 5xx) changes nothing
   once the user is signed in: only the server saying "nobody" signs them out.

   View as. `user.role` is the EFFECTIVE role: the server sends the role the session is treated
   as, so every screen, the navigation and every gate that reads `user.role` or `isAdmin` shows
   exactly what that role gets, with nothing to forget. `realRole` is the account's own, for the
   "View as" control and the banner only. */
export type AuthStatus = 'loading' | 'signed-out' | 'signed-in';

export interface AuthState {
  status: AuthStatus;
  user: SessionUser | null;
  /** The role the account really has (what "Switch back" returns to). Null when signed out. */
  realRole: Role | null;
  /** The lower role being viewed as, or null when the person is themself. */
  actingRole: Role | null;
  /** The roles this person may view as (admin: Editor, Viewer; editor: Viewer; viewer: none),
      from their REAL role. */
  viewAsOptions: readonly Role[];
  /** An admin, as the role they are treated as right now. */
  isAdmin: boolean;
  /** Throws ApiError (e.g. invalid_credentials) so the form can say why. */
  login(email: string, password: string): Promise<void>;
  /** Takes a user the server has just signed in (accepting an invitation, resetting a password):
      the cookie is already set, so this only records who it is. */
  adopt(user: SessionUser): void;
  /** Never throws: the page is signed out here whatever the network says. */
  logout(): Promise<void>;
  /** View the app as a role below the real one, or with null go back. The server then treats
      this session as that role; the app goes to Home, built for it. Throws ApiError (403
      `forbidden_role`) for a role that is not below the real one. */
  viewAs(role: Role | null): Promise<void>;
  /** Asks the server who is signed in now. */
  refresh(): Promise<void>;
}

type Session =
  | { status: 'loading' }
  | { status: 'signed-out' }
  | { status: 'signed-in'; user: SessionUser };

export const AuthContext = createContext<AuthState | null>(null);

function sameUser(a: SessionUser, b: SessionUser): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.email === b.email &&
    a.role === b.role &&
    (a.realRole ?? a.role) === (b.realRole ?? b.role) &&
    (a.actingRole ?? null) === (b.actingRole ?? null) &&
    (a.avatarUrl ?? null) === (b.avatarUrl ?? null)
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // A server render already asked who is signed in (core/api/initial.tsx): start from its answer,
  // so there is no 'loading' skeleton and no sign-in flash on the first screen.
  const initial = useInitialData()?.peek(apiPaths.me) as MeResponse | undefined;
  const [session, setSession] = useState<Session>(() =>
    initial === undefined
      ? { status: 'loading' }
      : initial.user
        ? { status: 'signed-in', user: initial.user }
        : { status: 'signed-out' },
  );
  const alreadyRead = useRef(initial !== undefined);
  // Each answer carries a number; an older reply that lands late is ignored.
  const latest = useRef(0);

  const refresh = useCallback(async () => {
    const turn = ++latest.current;
    let user: SessionUser | null;
    try {
      user = (await api.me()).user;
    } catch {
      if (turn !== latest.current) return;
      // Unreachable on first load: show the sign-in page. Later: keep the current state.
      setSession((s) => (s.status === 'loading' ? { status: 'signed-out' } : s));
      return;
    }
    if (turn !== latest.current) return;
    // The same answer keeps the same state, so a re-check does not re-render the app.
    setSession((s) => {
      if (!user) return s.status === 'signed-out' ? s : { status: 'signed-out' };
      return s.status === 'signed-in' && sameUser(s.user, user) ? s : { status: 'signed-in', user };
    });
  }, []);

  useEffect(() => {
    if (alreadyRead.current) alreadyRead.current = false;
    else void refresh();
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    const stop = onUnauthenticated(() => void refresh());
    return () => {
      window.removeEventListener('focus', onFocus);
      stop();
    };
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login({ email, password });
    ++latest.current; // the user's own action wins over any check still in flight
    setSession({ status: 'signed-in', user: res.user });
    // The sign-in form is gone: put focus at the top of the app, not on <body>.
    requestAnimationFrame(() => document.getElementById('main')?.focus());
  }, []);

  const adopt = useCallback((user: SessionUser) => {
    ++latest.current; // the server's own answer to the user's action wins over any check in flight
    setSession({ status: 'signed-in', user });
    requestAnimationFrame(() => document.getElementById('main')?.focus());
  }, []);

  const logout = useCallback(async () => {
    ++latest.current;
    try {
      await api.logout();
    } catch {
      // The cookie may still be set, but the user asked to leave: show signed out anyway.
    }
    ++latest.current; // a check that started during the sign-out must not sign them back in
    setSession({ status: 'signed-out' });
  }, []);

  const viewAs = useCallback(async (role: Role | null) => {
    const res = await api.viewAs(role);
    ++latest.current; // the person's own choice wins over any check still in flight
    setSession({ status: 'signed-in', user: res.user });
    // Home, built for the role now in force: the first thing that role sees
    navigate('/');
  }, []);

  const value = useMemo<AuthState>(() => {
    const signedIn = session.status === 'signed-in' ? session.user : null;
    const real = signedIn ? (signedIn.realRole ?? signedIn.role) : null;
    // Never higher than the real role, whatever a (stale or hand-made) answer says.
    const effective = signedIn && real ? effectiveRole(real, signedIn.role) : null;
    const acting = real && effective && effective !== real ? effective : null;
    // `user.role` is always the effective role, so code that reads it cannot show more than it should
    const user =
      signedIn && real && effective
        ? { ...signedIn, role: effective, realRole: real, actingRole: acting }
        : null;
    return {
      status: session.status,
      user,
      realRole: real,
      actingRole: acting,
      viewAsOptions: viewAsOptions(real),
      isAdmin: effective === 'admin',
      login,
      adopt,
      logout,
      viewAs,
      refresh,
    };
  }, [session, login, adopt, logout, viewAs, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
