# src/pages/kit

`/kit`, for signed-in users: a living reference of every `@apps/ui` component in its states, and the place
the look of both skins and both modes is judged.

- `KitPage.tsx`: the page. A skin and mode switcher in the header (the shared `useAppTheme` state, so it
  matches the topbar), an in-page section nav (real anchors to this route, drawn with `buttonAttrs`, whose click scrolls and moves
  focus to the section's h2, because a bare `#id` href would be taken by the hash router), and the sections.
  The nav and the sections sit in a `PageGrid`; nothing here has CSS.
  Mounts its own `Toaster` only when the shell has none.
- `KitControls.tsx`: buttons (the matrix: every one of the eight levels in three sizes, then pressed, disabled,
  aria-disabled and icon-only, plus loading when the preview switch is on; each row is `data-level`), inputs and
  choices (through `FormField`), badges/avatars/small parts.
- `sections/KitAi.tsx`: the AI-interface section (conversation, thinking, tool chips, approvals, composer, assistant layout).
- `KitSurfaces.tsx`: cards and tiles, feedback states, overlays (each opened by a button, the product tour among them; the Toasts block includes `toast.undo`).
- `KitData.tsx`: DataTable with its toolbar, every chart in a `ChartCard`, effects.
- `sections/KitViz.tsx`: the data-visualisation section (activity heatmap, gauges, usage meters, treemap, timeline, funnel, a live line chart fed by a two-second timer from a fixed start, KPI count-up).
- `sections/KitSeaGlass.tsx`: the sea glass section (a small control centre of `SeaGlass` pieces on a `SeaGlassStage`, a Drawn as switch for Auto / Live / Still / Flat, and a status line saying what is showing and why).
- `sections/KitSounds.tsx`: the sounds section (one Button per interface sound that plays it, and a Switch bound to the Sounds setting).
- `KitParts.tsx`: `KitSection` (a kit `Section` with the anchor id) and `KitBlock` (a `Card` around a level-3 `Section`).
- `demo-data.ts`: static demo arrays. This is a component reference, not a data page, so it does not go
  through `core/api`; the data is fixed so the page never flakes.
- **May import:** `~/core/*`. **Imported by:** `src/app/routes.ts`, lazily.
- To show a new kit component: add a `KitBlock` to the matching section (or a new `KitSection` plus an entry in
  `SECTIONS` in `KitPage.tsx`), and the test's section list.
