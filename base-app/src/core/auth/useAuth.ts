import { useContext } from 'react';
import { AuthContext, type AuthState } from './AuthProvider';

/* The current session and the sign-in, sign-out and refresh actions. Needs <AuthProvider> above it. */
export function useAuth(): AuthState {
  const state = useContext(AuthContext);
  if (!state) throw new Error('useAuth() needs <AuthProvider> above it (see src/main.tsx).');
  return state;
}
