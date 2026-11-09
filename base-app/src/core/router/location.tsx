import { createContext, type ReactNode, useContext, useSyncExternalStore } from 'react';
import { NAVIGATE_EVENT, normalizePath } from './path';

/* Where the app is. Three readers of one thing:
   - `usePath()`: the normalised pathname ('/admin/users');
   - `useSearch()`: the query string, '?q=foo' or '' (useUrlState builds on it);
   - `<LocationProvider url>`: the address to use where there is no `window` - a server render -
     and for hydration, which must start from the address the server rendered.
   Every reader is a useSyncExternalStore over `popstate` (Back, Forward) and `app:navigate`
   (navigate() and useUrlState announce themselves, pushState and replaceState do not). */
const LocationContext = createContext<string | null>(null);

/** `url` is the request's path and query ('/table?page=2'). */
export function LocationProvider({ url, children }: { url: string; children: ReactNode }) {
  return <LocationContext.Provider value={url}>{children}</LocationContext.Provider>;
}

export function subscribeToLocation(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange);
  window.addEventListener(NAVIGATE_EVENT, onChange);
  return () => {
    window.removeEventListener('popstate', onChange);
    window.removeEventListener(NAVIGATE_EVENT, onChange);
  };
}

function searchOf(url: string): string {
  const hashAt = url.indexOf('#');
  const noHash = hashAt === -1 ? url : url.slice(0, hashAt);
  const at = noHash.indexOf('?');
  const search = at === -1 ? '' : noHash.slice(at);
  return search === '?' ? '' : search;
}

/** The current normalised route. On the server, the request's. */
export function usePath(): string {
  const url = useContext(LocationContext) ?? '/';
  return useSyncExternalStore(
    subscribeToLocation,
    () => normalizePath(window.location.pathname),
    () => normalizePath(url),
  );
}

/** The current query string with its '?', or ''. On the server, the request's. */
export function useSearch(): string {
  const url = useContext(LocationContext) ?? '/';
  return useSyncExternalStore(
    subscribeToLocation,
    () => window.location.search,
    () => searchOf(url),
  );
}

/** The name routes were read by while they lived in the hash. */
export const useHashPath = usePath;
