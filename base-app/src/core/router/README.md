# core/router

Path routing with no dependency, on the History API. Routes are real paths: `/admin/users`, `/table?page=2`.

- `path.ts` (pure, except `navigate`): `normalizePath`, `hrefFor(to)` (the href of a link: `/table?q=1#x`), `navigate(to, { replace })` (`pushState` or
  `replaceState`, then an `app:navigate` event, because the History API fires none), `isAppHref` (a path on this site that is not `/api/…`).
- `location.tsx`: `usePath()` and `useSearch()` (`useSyncExternalStore` over `popstate` and `app:navigate`) and `<LocationProvider url>`, which supplies the
  request's address where there is no `window` (a server render) and to the first client render (hydration). `useHashPath` is the old name of `usePath`.
- `Link`: a real `<a href>`; a plain left click calls `navigate()`, a modified click, `target`, `download` or a file keeps the browser's behaviour.
- `links.ts`: `installLinkInterception()` (mounted by `App`) does the same for every other in-app anchor, such as the kit's sidebar and menus, so
  nothing has to wrap its links.
- `useUrlState(schema)` keeps typed state in the query (`/table?q=foo&status=paid,failed&page=2`): `param.string / number / list / oneOf / listOf`
  (`urlParams.ts`, pure) say how each value is read and written; a value equal to its default is left out; writes replace the history entry
  unless `{ push: true }`; parameters outside the schema, the path and the `#fragment` are kept. Define the schema at module level. The server reads
  the same query from the request, so a page can be rendered for it.
- `hashParam.ts`: one-time secrets in the **fragment** (`/reset-password#token=…`), which no server sees. `useHashSecret(name)` returns `null` on the server
  and the first render, then the value, and removes it from the address (`removeHashParam`, a `replaceState`).
- `legacy.ts`: `/#/table?x=1` becomes `/table?x=1` (a `token` moves into the fragment) at start-up; `index.html` runs a copy before anything is drawn,
  so a server renders the right page for an old link. `legacy.test.ts` runs both.

**May import:** nothing app-level. `react` only. **May be imported by:** `app/`, `core/ui`, `core/hooks` (`isAppHref`, `navigate`), pages.

Rules:
- The route table itself lives in `src/app/routes.ts`, never here. Adding a route never touches this folder.
- Nothing here reads `window` while rendering: the hooks take the server's address from `<LocationProvider>`.
