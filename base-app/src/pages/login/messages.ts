import { ApiError } from '~/core/api';

/* The words for a refused or failed sign-in The server never says which of the email and
   the password was wrong, and neither do we. */
export const WRONG_PASSWORD = "That email or password isn't right.";
export const TOO_MANY = 'Too many attempts. Please wait 15 minutes and try again.';
export const OFFLINE = "You're offline. Connect to the internet and try again.";
export const UNREACHABLE = "We couldn't reach the server. Check your connection and try again.";
export const FALLBACK = "Sign in didn't work. Please try again.";

export function signInMessage(err: unknown, online: boolean): string {
  if (!(err instanceof ApiError)) return FALLBACK;
  if (err.code === 'invalid_credentials') return WRONG_PASSWORD;
  if (err.status === 429 || err.code === 'rate_limited') return TOO_MANY;
  if (err.status === 0 || err.code === 'network') return online ? UNREACHABLE : OFFLINE;
  // 5xx and anything else: the server's own words, which are written for people
  return err.message || FALLBACK;
}
