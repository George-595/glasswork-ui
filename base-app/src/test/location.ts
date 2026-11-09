import { hrefFor } from '~/core/router';

/* The address bar in a test. The app routes by path (core/router), so a test that opens a page
   "at" an address sets it here before mounting, and reads it back to see where the app went.
   `setLocation` takes a path and query ('/table?page=2'); the old hash form ('#/table') is
   accepted too and means the same route. No event is fired: set it before the first render. */
export function setLocation(to: string): void {
  window.history.replaceState(null, '', hrefFor(to));
}

/** Path, query and fragment, as the address bar shows them after the origin ('/table?page=2'). */
export function locationNow(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}
