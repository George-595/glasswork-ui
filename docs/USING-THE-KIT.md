# Using the kit in an app

Every app built on Glasswork takes `@apps/ui` and `@apps/colors` the same way: a copy made by
`scripts/kit-sync.mjs`, never by hand. The copy records the glasswork-ui commit it came from
and the hash of every file, and the app's own check proves nothing in it was edited.

```text
┌─ glasswork-ui ──────────────┐   kit-sync    ┌─ an app ───────────────────────┐
│ packages/ui                 │ ────────────▶ │ vendor/ui      (exact copy)    │
│ packages/colors             │               │ vendor/colors  (exact copy)    │
│   fix or add here first     │               │ glasswork.json (commit+hashes) │
└─────────────────────────────┘               │ kit-check.mjs  (drift check)   │
                                              └────────────────────────────────┘
```

## Rules

1. **Change the kit here, never in an app.** A bug found in an app (a component, a layout piece,
   a colour) is fixed in glasswork-ui, merged, then synced to every app that uses it.
2. **Sync, do not copy.** `node ~/glasswork-ui/scripts/kit-sync.mjs <app>/<dir>/glasswork.json`
   from a clean, merged glasswork-ui `main`. Then `npm install` in the app and its checks.
3. **The app's checks include the drift check.** `node <dir>/kit-check.mjs` fails on any edited,
   extra or missing kit file.
4. **`local` is the exception list.** A file in glasswork.json's `local` is the app's own: kept on
   sync, skipped by the check. Every entry is a fork carried by hand, so keep it short and move
   generic work upstream.

## glasswork.json

```json
{
  "targets": { "ui": "ui", "colors": "colors" },
  "profile": "runtime",
  "local": []
}
```

- `targets`: where each package goes, relative to glasswork.json.
- `profile`: `runtime` copies what an app imports and ships (src, css, manifests, docs, notices);
  `full` copies the whole package, tests and scripts included (for an app that runs the kit's
  own tests).
- `local`: the app's own files inside the copy.

The sync fills in `upstream`, `commit` and `files`.

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
