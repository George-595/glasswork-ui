import { useCallback, useMemo } from 'react';
import { useSearch } from './location';
import { NAVIGATE_EVENT } from './path';
import { buildSearch, readParams, type UrlSchema, type UrlValues } from './urlParams';

export interface SetUrlStateOptions {
  /** Add a history entry (Back returns to the previous state) instead of replacing it. */
  push?: boolean;
}
type Patch<S extends UrlSchema> = Partial<UrlValues<S>>;
export type SetUrlState<S extends UrlSchema> = (
  next: Patch<S> | ((current: UrlValues<S>) => Patch<S>),
  opts?: SetUrlStateOptions,
) => void;

/* State that lives in the address's query ('/table?q=foo&page=2'), so a view can
   be bookmarked, shared and survives a reload - and a server can render it, since the
   query is part of the request.
   - `schema` says which parameters there are (see `param` in urlParams.ts):
     each has a default, and a value equal to it is left out of the URL.
   - Writes replace the current history entry by default, so typing in a search
     box does not fill the Back button; pass { push: true } for a real step.
   - A write composes with the URL as it is now (not as last rendered), so two
     calls in one tick both land. Parameters outside the schema are kept, and so
     is the path and any #fragment.
   - replaceState fires no event, so a write announces itself (`app:navigate`); every
     hook on the page (and usePath, which ignores the query) sees it.
   Define `schema` at module level: it is read on every render. */
export function useUrlState<S extends UrlSchema>(
  schema: S,
): readonly [UrlValues<S>, SetUrlState<S>] {
  const search = useSearch();
  // The memo is keyed on the query text, so the same URL gives the same object
  // (and arrays) every render: safe as an effect or query key dependency.
  const values = useMemo(() => readParams(schema, search), [schema, search]);

  const set = useCallback<SetUrlState<S>>(
    (next, opts = {}) => {
      const current = window.location.search;
      const patch = typeof next === 'function' ? next(readParams(schema, current)) : next;
      const target = buildSearch(schema, current, patch);
      if (target === current) return;
      const url = `${window.location.pathname}${target}${window.location.hash}`;
      if (opts.push) window.history.pushState(null, '', url);
      else window.history.replaceState(null, '', url);
      window.dispatchEvent(new Event(NAVIGATE_EVENT));
    },
    [schema],
  );

  return [values, set] as const;
}
