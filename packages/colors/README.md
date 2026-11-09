# @apps/colors

Every colour in `apps/`, in one place. A **palette** (`src/palette.ts`: graphite neutrals, one
azure accent, status hues) is given jobs by **roles** (`src/roles.ts`): a role says what a
colour is *for*, and each of the four themes (enterprise and glass, each light and dark) gives
every role a value. Components write the role name and never ask which skin or mode is on.

**The look.** Graphite neutrals carry the interface. The main action (`primary`) is ink:
near-black in light, near-white in dark. One azure accent marks links, the focus ring,
selection and the `secondary` level; nothing else is a hue except status, market and chart
colours.

**The rule (ENGINEERING §5, §14).** No hex, `rgb()`, `hsl()`, `oklch()`, `oklab()`,
`color-mix()` or named colour anywhere in `apps/` outside this package. `transparent` and
`currentColor` are keywords, not colours, and are allowed. `npm run check` fails otherwise
(`scripts/check-colours.mjs`).

## Using a role

```tsx
<div className="bg-surface text-fg border border-border-strong">…</div>
<button className="bg-primary text-on-primary hover:bg-primary-hover active:bg-primary-active" />
<svg stroke={cssVar('chart-1')} />   // code that must hand a colour to a canvas or SVG
```

- Tailwind: every role is a colour utility of the same name (`bg-surface`, `text-fg-muted`,
  `border-border-strong`, `ring-focus`, `fill-chart-3`). `theme.css` wipes Tailwind's stock
  palette, so `bg-red-500` and `text-white` do not exist.
- JS: `cssVar('chart-1')` returns `var(--chart-1)`, never a value, so skin and mode keep
  working. Never read a role's value to compute another colour: add a role instead.
- Selected rows are never washed (a wash pulls coloured cell text under 4.5:1): a table row
  shows selection with a `brand` bar and its checkbox. `selected` is for controls (a pressed
  toggle, the chosen segment).

## The roles

### Surfaces: what things sit on

| Role | Use it for | Never for |
|---|---|---|
| `canvas` | the page background | a card or panel |
| `surface` | cards, panels, table bodies (translucent in glass) | text or a border |
| `surface-solid` | a surface that must be opaque in both skins (avatar base, popover body) | a normal card |
| `raised` | things lifted above a surface: menus, popovers, tooltips | the page |
| `sunken` | wells, code blocks, the track of a progress bar, table header rows | a button |
| `overlay` | dialogs and sheets | a card |
| `bar` | the top bar, sidebar and sticky bars | content |
| `scrim` | the dimmer behind a modal | anything visible as content |
| `hover` | a hovered row or item | selection |
| `pressed` | a pressed row or item | hover |
| `selected` | a chosen control (toggle on, current segment) | a selected table row |

### Text: what words are drawn in

| Role | Use it for | Never for |
|---|---|---|
| `fg` | body and headings | de-emphasised text |
| `fg-muted` | secondary text, captions, table headers | the only copy of important text |
| `fg-subtle` | hints, placeholders, timestamps (still 4.5:1) | disabled controls |
| `fg-disabled` | disabled text (exempt from contrast) | anything enabled |

### Lines: edges and focus

| Role | Use it for | Never for |
|---|---|---|
| `border` | the default hairline around cards and panels | form controls (they need 3:1) |
| `border-subtle` | dividers inside a surface | the outline of a control |
| `border-strong` | emphasised dividers, the edge of a floating panel | a focus ring |
| `border-input` | the boundary of inputs, checkboxes, switches (3:1) | decoration |
| `focus` | the focus ring colour (3:1) | a fill |

### Actions: every button level

Each level has a rest colour, `-hover`, `-active` (pressed) and a foreground `on-*`. States
for `selected`, `disabled` and focus come from `selected`, the three `disabled*` roles and
`focus`.

| Level (`Button` variant) | Roles | Use it for |
|---|---|---|
| `primary` | `primary`, `primary-hover`, `primary-active`, `on-primary` | the one main action of a view (Save, Sign in) |
| `secondary` | `secondary`, `secondary-hover`, `secondary-active`, `on-secondary` | an important action that is not the main one (Export, Invite) |
| `neutral` | `neutral`, `neutral-hover`, `neutral-active`, `neutral-border`, `on-neutral` | the default everyday button (Cancel, Filters) |
| `outline` | `outline-border`, `outline-hover`, `outline-active`, `on-outline` | low emphasis in a dense row |
| `ghost` | `ghost-hover`, `ghost-active`, `on-ghost` | toolbars, icon buttons, menu triggers |
| `link` | `link`, `link-hover` | an action that reads as inline text |
| `danger` | `danger-solid`, `-hover`, `-active`, `on-danger` | destroys or removes (always confirmed) |
| `success` | `success-solid`, `-hover`, `-active`, `on-success` | confirms a positive, final step (Approve, Publish) |
| disabled (any level) | `disabled`, `disabled-fg`, `disabled-border` | any button that cannot be used now |

One `primary` per view. A button never borrows another level's colours to look different:
add a level here and to `Button` if one is truly missing.

### Status: messages and states

`x` is text and an icon colour that reads on `canvas`/`surface` and on its own `x-soft` wash.
`x-soft` is the wash behind a badge or alert.

| Role | Use it for | Never for |
|---|---|---|
| `success`, `success-soft` | saved, healthy, done | a gain on a market figure (use `up`) |
| `warning`, `warning-soft` | needs attention, caution | errors |
| `danger`, `danger-soft` | errors, failures, destructive text | a destructive button fill (`danger-solid`) |
| `info`, `info-soft` | neutral notices | success |
| `brand`, `brand-soft` | the accent as text or a wash: a selected-row bar, a badge | a button fill (`primary`) |

### Market: gains and losses

| Role | Use it for | Never for |
|---|---|---|
| `up`, `up-soft` | a gain, with an arrow and words | success messages |
| `down`, `down-soft` | a loss, with an arrow and words | error messages |
| `flat` | no change | disabled |

Colour never carries meaning alone: pair `up`/`down` with an arrow and words.

### Data: chart series

`chart-1` … `chart-8`: categorical series, each at least 3:1 on `canvas` and `surface`.
Tell series apart by more than colour (dash, marker, pattern). Never use them for status.

### Ramp: heat

`heat-0` (an empty cell, outlined by the chart) and `heat-1` … `heat-4`, one azure hue in four steps; the four
filled steps are each at least 3:1 on `canvas` and `surface`. For counts per cell (ActivityHeatmap), never for status.

### Identity

`avatar-1` … `avatar-6` are a soft fill and `avatar-N-edge` an edge per hue. Initials are
`fg`, so they keep contrast whatever the hue.

### Sea glass

The `SeaGlass` material in `@apps/ui` (frosted glass pebbles on paper). `seaglass-paper` is the
paper; `seaglass-sun` and `seaglass-sky` are the colours of the direct and the ambient light,
which the shader scales and never paints as a fill. `seaglass-0` is clear glass (an "off"
piece) and `seaglass-1` … `seaglass-6` are coral, orchid, periwinkle, aqua, seafoam and amber.
The values are the same in both skins: pale glass in sunlight for light mode, deep glass under a
cool moon for dark mode. Each tint is also the flat fill a piece falls back to without a GPU, so
the gate measures `fg` and `fg-muted` on the paper and on every tint, and links on clear glass.

### Effects

`shadow-sm/md/lg/inset`, `glass-rim`, `sheen`, `highlight`, `shine`, `glare`, `spotlight`,
`grid-dot`, `app-backdrop`: values that carry colour but are not one colour (shadows,
gradients, materials). They become CSS custom properties of the same name and are used
through the kit's elevation and material tokens, never directly in a page.

## Add or change a colour

1. A new job for a colour is a new **role**: append it to `ROLES` in `src/roles.ts` (in its
   group) and give it a value in all four themes (`enterprise-light`, `enterprise-dark`,
   `glass-light`, `glass-dark`). A new swatch goes in `src/palette.ts`. Never reuse a role
   for a different job.
2. If a pair of roles is ever drawn together (text on a surface, a button state), add it to
   `CHECKS` in `src/gate.ts`.
3. Run `npm run build --workspace @apps/colors`. The gate measures every pair in all four
   themes (glass against the worst point of its backdrop) and refuses to write the CSS if one
   fails; fix the value, not the gate.
4. Add the role to the tables above (README is the "use it for / never for" source of truth).

## How the gate works

`src/gate.ts` lists what sits on what (`CHECKS`): text on every surface, text on hover /
pressed / selected washes, links and status text on their own wash, every button state's
foreground on its fill, input boundaries and the focus colour (3:1), and chart series (3:1).
Translucent glass surfaces are composited over the canvas plus the backdrop wash at its peak.
Disabled roles are exempt (WCAG 1.4.3). `tests/colors.test.ts` also checks that every theme defines every role,
that every role is a palette colour, and that the generated CSS defines every role in all four
blocks (glass fallbacks last) and maps each to a Tailwind utility.

## Generated files (do not edit or format)

| File | Holds |
|---|---|
| `css/colors.css` | every role and effect as a CSS custom property, per skin × mode, plus the forced-colours and reduced-transparency fallbacks |
| `css/theme.css` | the Tailwind v4 `@theme` that maps each role to a colour utility and wipes the stock palette |

`npm run build --workspace @apps/colors` writes them; `npm run check:colors` (part of
`npm run check`) fails when they differ from the source. They are not hand-edited and biome
does not format them.

## Checks

| Command (from `apps/`) | Does |
|---|---|
| `npm run check:colours` | `scripts/check-colours.mjs`: no hand-rolled colour anywhere in `apps/` |
| `npm run check:colors --workspace @apps/colors` | generated CSS is current and the contrast gate passes |
| `npm test --workspace @apps/colors` | the package's tests |
