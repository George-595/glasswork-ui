# CLAUDE.md

Glasswork UI: a React component kit and the app template built on it.

**Before editing anything, read [`ENGINEERING.md`](ENGINEERING.md).** Then read the `README.md` of
the folder you are in. (These documents were written inside the author's own monorepo, where this
workspace is the `apps/` folder: wherever they say `apps/`, read the repo root.)

| Path | What |
|---|---|
| `packages/colors/` | `@apps/colors`: every colour (palette, semantic roles per skin × mode, generated CSS + Tailwind theme, the contrast gate). **No colour is written anywhere else** |
| `packages/ui/` | `@apps/ui`: the components, tokens, the enterprise and glass skins, light/dark |
| `base-app/` | the template app (React + Vite client, Node API server, SQLite/MySQL/Postgres, Anthropic + Gemini) |
| `scripts/demo/` | the README's demo film (`record.mjs`) |

Commands, from the repo root: `npm install`, `npm run dev`, `npm run verify` (biome + oxlint +
the colour, page and craft checks + the 7-day dependency quarantine + typecheck + tests + axe +
the bundle budget).

**Colours and pages.** Colours are roles from `@apps/colors` only (`bg-surface`, `text-fg`,
`bg-primary hover:bg-primary-hover`, or `cssVar('role')`): no hex, `rgb()`, `oklch()`,
`color-mix()` or named colour. Pages in `base-app` compose `@apps/ui` kit components and nothing
else: no `.css`, no inline `style`, no arbitrary Tailwind values. If the kit lacks something, add
it to the kit. `npm run check` enforces both; ENGINEERING §5, §13, §14.

Lint is oxlint, formatting is biome. Do not add ESLint or Prettier.
