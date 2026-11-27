# Using the kit in an app

Every app built on Glasswork installs `@apps/ui` and `@apps/colors` as packages, pinned to one
released version. Nothing is copied into the app: a kit change reaches an app only when that app
bumps its pin, so one change can never break every app at once.

```text
┌─ glasswork-ui ───────────────────┐  kit-release  ┌─ releases/ (in this repo) ──┐
│ packages/ui, packages/colors     │ ────────────▶ │ apps-ui-1.0.0.tgz           │
│   fix or add here first          │               │ apps-colors-1.0.0.tgz       │
└──────────────────────────────────┘               └──────────────┬──────────────┘
                                                                   │ npm install (pinned URL,
                                                                   ▼ sha512 in the lockfile)
                                                   ┌─ an app ────────────────────┐
                                                   │ node_modules/@apps/ui       │
                                                   │ node_modules/@apps/colors   │
                                                   └─────────────────────────────┘
```

## Rules

1. **Change the kit here, never in an app.** A bug found in an app is fixed in glasswork-ui and
   merged, then each app that wants it bumps its pin.
2. **Every change to what an app ships is a new version.** Raise `version` in both
   `packages/ui/package.json` and `packages/colors/package.json` (they move together), run
   `node scripts/kit-release.mjs`, and commit the two new tarballs in `releases/` with the change.
   A released tarball is never overwritten; `npm run check` (`kit-release.mjs --check`) fails if
   the packages differ from their current release.
3. **An app pins an exact release** in its `package.json`:

   ```json
   "@apps/colors": "https://raw.githubusercontent.com/George-595/glasswork-ui/main/releases/apps-colors-1.0.0.tgz",
   "@apps/ui": "https://raw.githubusercontent.com/George-595/glasswork-ui/main/releases/apps-ui-1.0.0.tgz"
   ```

   To update, change the version in both lines and run `npm install`. The lockfile records each
   tarball's sha512, so the bytes cannot change under the app. Railway, Vercel and Docker builds
   fetch it like any other dependency: the repo is public, no token is needed.
4. **No cooldown for the kit.** The 7-day release-age rule is for outside packages. Glasswork
   UI is internal, so its releases are exempt (George, 27 Nov 2026); `check:deps` accepts a
   Glasswork release URL as an exact pin. Its own dependencies (React, motion, …) still follow
   the rule.
5. **Releasing costs no Actions minutes.** It is done from a session and lands by pull request;
   no workflow and no registry account is involved.

## An app's own extensions

An app that needs a piece the kit does not have, and that is not generic enough to go upstream,
keeps it in its own small workspace package (george595.dev's `packages/site-ui`) and builds it on
the kit's public exports. Kit internals it needs (`cn`, `useReducedMotion`, …) import from
`@apps/ui/src/<path>.ts`; that path is not a stable API, so a kit bump may need those imports
fixed.

## Tailwind

The kit's `styles.css` already tells Tailwind to scan the kit's own sources, wherever it is
installed. An app's CSS adds `@source` for its own folders only.

## The app frame

Apps do not build their own layout pieces. `AppShell` carries them:

| Need | Prop or component |
|---|---|
| Sidebar, or none for a one-page app | `sidebar` (optional) |
| Way back to the hub | `home={{ href }}`: sidebar foot and first breadcrumb |
| Where you are | `breadcrumbs` |
| Pull to refresh | `onRefresh` |
| A live activity | `live={<LiveIsland … />}` |
| Back to top | on by default (`backToTop`) |
| The page's main action | `<Fab label="Add" />`, anywhere in the page |
| Any other floating button | `<Floating order={n}>` |

Everything that floats lives in one stack in the bottom-right corner: it never overlaps itself,
sits above the phone's tab bar and any save bar, clears the safe area, and toasts stack above it.
An app without `AppShell` renders `<FloatingStack>` once near its root.
