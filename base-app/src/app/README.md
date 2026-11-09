# src/app

The shell: the route table, the frame around every page, and the choice of which page shows.

- `routes.ts`: `ROUTES`, `NOT_FOUND_ROUTE`, `REDIRECTS` and `resolveRoute`. Admin routes carry `requires: 'admin'`. A route may declare
  `prefetch: (url) => string[]`, the GET API paths its page makes first, which a server render answers ahead of the browser (ENGINEERING §15).
  The `account` group (the Account page) is a signed-in route reached from the user menu and the palette, not
  the sidebar. `PUBLIC_ROUTES` (`/accept-invite`, `/forgot-password`, `/reset-password`) are pages with no
  shell and no role: the gate renders one in place of the sign-in page whenever the address is its path,
  signed in or not (`resolvePublicRoute`).
- `App.tsx`: the auth gate. Loading shows a skeleton, signed-out shows the login page (`~/pages/login`),
  signed-in shows the shell. It holds only what a signed-out visitor needs: the signed-in app is
  `SignedIn.tsx`, a file of its own that `SignedInGate.tsx` loads (the browser and the server fetch it
  before rendering for someone signed in, so the shell is drawn in place and hydration matches; after a
  fresh sign-in the loading screen shows while it arrives). `screens.tsx` holds the lazy page per route (`lazyResolved`: drawn in place when `loadScreen` fetched it ahead, which `loadInitialRoute` does on the server and before hydrating).
  `SignedIn.tsx` (the file `SignedInGate.tsx` loads): reads the path, renders the page lazily in an error boundary,
  focuses `#main` and scrolls to the top on change (Back does not restore the old position: an address
  change does not say whether it was a link or Back), fades the new page in (the kit's `PageEnter`, off under
  reduced motion), and shows `~/pages/not-authorised` for a non-admin on an admin route.
  `App` also mounts the one `<Toaster />`, so `toast()` works from anywhere.
- **A page whose file is gone** (`chunk-errors.ts`, `reload.ts`, `RouteError.tsx`, `Skeletons.tsx`): every page
  is its own file, and a deploy renames them all. `App.tsx` wraps each lazy load in `loadRoute`: a failed
  `import()` while online reloads the app once (never twice in a minute, never offline; the skeleton stays up
  meanwhile), and `main.tsx` does the same for Vite's `vite:preloadError`. When no reload is allowed the
  error boundary shows `RouteError`: plain words and a Reload button ("The app has been updated"), or "needs a
  connection the first time" with Try again when it failed offline. `PageSkeleton` and `AuthSkeleton` stand in
  while a file loads, in the layout of the screen, so nothing jumps.
- **Prefetch** (`prefetch.ts`): the first screen is fetched while the session is read, the rest one at a time
  when the device is idle after sign-in (not on Data Saver), and a link's page from the first touch of it.
- **Offline** (`OfflineBanner.tsx`): the one offline notice, in the shell's `banner` slot. A screen adds only
  what is true of that screen, never its own "You're offline".
- **View as** (`ViewAsBanner.tsx`, `UserMenu.tsx`): an admin may view the app as an editor or a viewer, an editor
  as a viewer. The server enforces it (`acting_role` on the session; every role check reads the effective
  role), the user menu offers it, and the banner on every screen, the maintenance page included, is the one-tap
  way back. `user.role` is always the effective role; `useAuth().realRole` is the account's own.
- **Feature switches** (`~/core/config` `appFeatures`): `notifications: false` removes the bell, the
  Notifications route and its menu and command entries for everyone.
- **Maintenance mode** (`useSettings()`): a non-admin gets `~/pages/maintenance` (a `StatusPage`, "We'll be back soon", the
  admin's message, Check again, Sign out) in place of the shell; an admin keeps the shell and sees a warning `Banner`
  at the top of it linking to the settings. The sidebar brand is the server's workspace name.
- `Shell.tsx`: the sidebar and topbar frame. The sidebar collapses to an icon rail (kept in
  localStorage `app-sidebar-collapsed`) and is a drawer under 768px. The topbar: the page name (or
  `Admin / Users`) on the left; on the right the "Search… ⌘K" button, the API status, the
  appearance group (a labelled "Theme" `SegmentedControl` for the skin, hidden under 1024px, and the
  light/dark toggle), the Admin menu (admins only), the notification bell (`NotificationsMenu.tsx`) and the user menu. `UserMenu.tsx` shows an
  `Avatar` and holds Sign out. No CSS lives here: the root is the kit's `AppRoot`, the loading gate is
  light/dark toggle), the Admin menu (admins only) and the user menu. `UserMenu.tsx` shows an
  `Avatar` (the user's photo when they have one) and holds Account and Sign out. No CSS lives here: the root is the kit's `AppRoot`, the loading gate is
  `AuthLayout`, the crash fallback is a `Notice`, the room-saving hides are `Show`, and the shortcut help is a
  `DescriptionList` (ENGINEERING §13).
- **Ask panel** (`AskPanel.tsx`): the topbar's Ask button (sparkles; not on the Assistant page) or `a` opens
  the assistant in a right `Sheet` over the page. Every message sends `context: { path, title }` for the
  page, plus `selection` when a page opened it about one thing with `askAbout({ kind, id, label })`
  (`~/core/agent`; the table's transaction drawer has "Ask about this"). A badge shows that subject and
  "Ask generally" drops it. The chat lives in the shell, so closing and reopening keeps it; it is saved
  like any other ("All chats" opens the Assistant page). A page change closes the panel.
- **Command palette** (`⌘K` / `Ctrl+K`, or the Search button): `commands.ts` builds the commands from
  `ROUTES` (filtered by role), the skins, light/dark, the glass backdrops (`BACKDROPS`; choosing one
  also switches to Glass, since it only shows there) and Sign out. A new route appears with no edit.
- **Keyboard shortcuts** (`shortcuts.ts`, listener mounted by `Shell`): `g h` Home, `g t` Table, `g g`
  Graphs (the second key within 1s), `[` toggles the sidebar, `a` opens the Ask panel, `?` opens `ShortcutsHelp.tsx`. They never
  fire in an input, textarea, select or contenteditable, with a modifier held, or while a dialog is
  open. Change `GO_KEYS` and the help and palette hints follow; the help's rows are in `ShortcutsHelp.tsx`.
- **Document title:** set by `Page` (`core/ui`) as "<title> · <app name>", not by the shell, so it is
  testable on a page alone and covers the sign-in and not-found pages too.
- **Notifications:** `App` mounts `RealtimeProvider` and `NotificationsProvider` around the signed-in shell only.
  `NotificationsMenu.tsx` is the bell: the count from the shared store, the list fetched when the panel opens (and
  kept current by live events while open), a row marks itself read and follows its link, "View all" goes to
  `/notifications`. The user menu also lists Notifications.
- **Server rendering** (`Providers.tsx`, `../entry-server.tsx`, `../main.tsx`, `../initial-state.ts`): `Providers` is the whole tree (location, initial
  data, theme seed, auth, settings, `App`) and the one thing both the server render and the browser's `hydrateRoot` build. `App` also installs the
  click handler that turns a plain click on any in-app anchor (the kit's sidebar, menus, tab bars) into `navigate()`. `prefetch.ts`'s
  `loadInitialRoute` is awaited before hydration so the first client render finds the page ready. See ENGINEERING §15.
- **To add a page:** a folder under `src/pages/` with `index.ts`, then one line in `ROUTES` (and `prefetch` if it has data to show at once).
- `REDIRECTS` sends old addresses (`/admin`) to a real page: the server with a 302, the browser by rewriting the address bar. Old `#/…` links are
  rewritten at start-up (`core/router/legacy.ts`, and a copy in `index.html`).
- **May import:** `~/core/*`, `~/pages/*` (lazily through the route table; `login` and `not-authorised` directly) and `./`. **Imported by:** `main.tsx` only.
