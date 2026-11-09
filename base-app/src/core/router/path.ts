/* Path routing helpers (the History API). Routes are real paths: '/admin/users'. Pure except
   navigate(), which is the one place the address changes. */

/** The custom event every in-app address change announces itself with (pushState and
    replaceState fire none of their own). `popstate` covers Back and Forward. */
export const NAVIGATE_EVENT = 'app:navigate';

/* '' -> '/'; '/a/b/?x=1#f' -> '/a/b'; 'a' -> '/a'. Always a leading '/', never a trailing one.
   The pre-path hash form ('#/a/b?x=1') is read too, so an old link or a stored address still
   resolves to its route. */
export function normalizePath(input: string): string {
  const withoutHash = input.startsWith('#') ? input.slice(1) : input;
  const pathOnly = (withoutHash.split('#')[0] ?? '').split('?')[0] ?? '';
  const trimmed = pathOnly.replace(/\/+$/, '');
  const absolute = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return absolute === '' || absolute === '/' ? '/' : absolute;
}

/* '/table?x=1#top' -> { path: '/table', search: '?x=1', hash: '#top' }, each part normalised. */
export function splitTarget(to: string): { path: string; search: string; hash: string } {
  const legacy = to.startsWith('#/');
  const text = legacy ? to.slice(1) : to;
  const hashAt = legacy ? -1 : text.indexOf('#');
  const hash = hashAt === -1 ? '' : text.slice(hashAt);
  const beforeHash = hashAt === -1 ? text : text.slice(0, hashAt);
  const queryAt = beforeHash.indexOf('?');
  const search = queryAt === -1 ? '' : beforeHash.slice(queryAt);
  return {
    path: normalizePath(queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt)),
    search: search === '?' ? '' : search,
    hash: hash === '#' ? '' : hash,
  };
}

/* '/table' -> '/table'; 'table/?q=1#x' -> '/table?q=1#x'. The address a link to `to` carries. */
export function hrefFor(to: string): string {
  const { path, search, hash } = splitTarget(to);
  return `${path}${search}${hash}`;
}

/** Links that are not pages of this app (files, API calls) and so are never handled by the router. */
const NOT_APP = ['/api/'];

/** Whether `href` (an anchor's attribute) is a page of this app, that is: a path on this site. */
export function isAppHref(href: string): boolean {
  if (!href.startsWith('/') || href.startsWith('//')) return false;
  return !NOT_APP.some((prefix) => href.startsWith(prefix));
}

/** Goes to a page of the app. `replace` swaps the current history entry (redirects), so Back does
    not bounce. Going to the address already showing changes nothing. */
export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const next = hrefFor(to);
  const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (next === current) return;
  if (opts.replace) window.history.replaceState(null, '', next);
  else window.history.pushState(null, '', next);
  window.dispatchEvent(new Event(NAVIGATE_EVENT));
}
