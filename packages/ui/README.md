# @apps/ui

This is the shared UI package for every app under `apps/`. It holds React components on the
tokens and the colour roles of `@apps/colors`. It has two skins, **enterprise** and **glass**, and each comes in light
and dark. Every component is gated at WCAG 2.2 AA.

- **Colour:** every colour is a role from `@apps/colors` ([`../colors/README.md`](../colors/README.md)).
  This package writes no colour values; a component uses `bg-surface`, `text-fg-muted`,
  `bg-primary hover:bg-primary-hover active:bg-primary-active`… or `cssVar('role')`.
- **Styling:** Tailwind v4 recipes inside the component (cva / `cn`). CSS is only for what
  Tailwind cannot say: keyframes, the liquid-glass filter layers, the forced-colours /
  reduced-motion / reduced-transparency rules and the reset.

## Use

```tsx
import '@apps/ui/styles.css';
import { Button, Card, SectionNav, ThemeToggle, useTheme } from '@apps/ui';

function App() {
  const { theme, toggleTheme, skin, setSkin } = useTheme();
  return <div className="ui-app">…</div>;
}
```

`.ui-app` gives the page its colour, its type and the skin's backdrop. The fonts fall back to
system stacks; load Geist in the app if you want it.

## Theme and skin contract

| Attribute on `<html>` | Values | Absent means |
|---|---|---|
| `data-theme` | `light`, `dark` | follow `prefers-color-scheme` |
| `data-skin` | `enterprise`, `glass` | enterprise |

`useTheme()` writes both attributes and remembers them. Colours do not live here:

| Where | Holds |
|---|---|
| `@apps/colors` (`colors.css`, `theme.css`) | every colour: the roles per skin × mode and their Tailwind utilities. Imported first by `src/styles/index.css`. |
| `src/styles/tokens.css` | non-colour tokens: type, radii, spacing, motion, elevation shapes. No colours. |
| `src/styles/glass.css` | the glass material (blur, saturation, filter layers); its colours are roles. |
| `src/styles/components.css`, `controls.css` | only what Tailwind cannot express: the forced-colours / reduced-motion / reduced-transparency rules, keyframes, filter layers. The app frame (`AppShell`) and the charts have no stylesheet: they are Tailwind recipes on roles. |

To change a colour, edit `packages/colors/src/roles.ts` and rebuild (`@apps/colors`'s
contrast gate must pass). To add a skin, add a theme keyed `<skin>-light` / `<skin>-dark`
there, then the skin's material here and a pass in the a11y gate.

The glass skin replicates Glass HQ's Liquid Glass "regular" material in CSS (MIT; see
`THIRD_PARTY_NOTICES.md`) and refracts in Chromium through the ported LiquidGlass (src/glass).
Three things fall back to solid surfaces:
`prefers-reduced-transparency`, `forced-colors`, and a browser without `backdrop-filter`.

### Performance and the low-power signal

Glass is built to be cheap on a phone. Blur is spent only on fixed chrome (`--chrome-filter`);
cards, tiles and controls are translucent fills with no backdrop filter (`--surface-filter` and
`--scrim-filter` are `none`); refraction needs a fine pointer; the animated background and the
sea glass stage draw on demand; the Liquid Glass maps are made in a Web Worker. One signal
switches the rest, `useLowPower()` / `isLowPower()` (`src/effects/lowPower.ts`), true for a
coarse pointer, `deviceMemory <= 4`, `hardwareConcurrency <= 6`, Save-Data, reduced motion or
transparency, a remembered sea glass fallback, or a page that lagged on a recent load (three
long animation frames over 100 ms in its first 5 s, remembered for a day). `AppRoot` mirrors it
on `<html data-power="low">` and takes `power="low" | "normal" | "auto"` to force it.

| On low power | What changes |
|---|---|
| `AnimatedBackground`, `ShaderBackdrop` | one still frame (the CSS gradient for the shader); never a loop. Fine-pointer devices animate at 30 fps, holding while the page scrolls |
| `LiquidGlass`, `Card`, tiles | the plain translucent fill, no SVG filter, no maps. `Card` has `lens` (default off) |
| `generate()` / `useGenerate` / `ChartCard` | a 200 ms fade under reduced motion, Save-Data or a forced `power="low"`; otherwise every reveal plays on every device (one shared scheduler, settled glyphs drawn once, builds queued one per frame), only for what is in view when its data lands, 30 fps, canvas at most 1.5x |
| `SeaGlassStage` | starts `still` (reason `low-power`), no 5 s lag probe; the engine stops its loop when nothing moves; canvas at most 1.5x (1.25 on touch) |
| `Sheet`, `Dialog`, `CommandPalette`, `Toast` | the solid role, no blur |

`npm run check:perf:glass -w @apps/base-app` keeps this honest on a phone profile.

## Skins

One class string has to look right in four passes (enterprise and glass, each light and dark).
It does that by writing roles, never values, so a new component follows one recipe and the
skin does the rest.

| Concern | Enterprise (calm) | Glass (liquid) | Role / token to write |
|---|---|---|---|
| Surface | solid | translucent fill and the rim; blur only on fixed chrome (`glass-chrome`: top bar, sidebar, sheet and dialog panels, menus, popovers, tooltips); refraction only on a fine pointer | `bg-surface` (card), `bg-raised` (menu, popover), `bg-overlay` (dialog); chrome adds `glass-chrome`; content never gets a backdrop filter (ENGINEERING §5); wrap a floating panel in `LiquidGlass` |
| Border | hairline | hairline, darker than the pale page in light so it never vanishes | `border-border`, `border-border-strong`; controls `border-border-input` (3:1) |
| Elevation | restrained shadow | the same ladder, one step higher for cards, plus the specular rim | `--elev-0` flat, `--elev-1` resting, `--elev-2` lifted (menu, popover, tooltip), `--elev-3` overlays that cover content (dialog, sheet, toast); a card uses `--elev-card` |
| Motion | the same in both skins | the same | `--dur-fast` hover and press, `--dur-base` toggles and exits, `--dur-slow` entrances; `--ease-out` arriving, `--ease-in` leaving, `--ease-in-out` travelling, `--ease-spring` a small overshoot |
| Scrim | `scrim` | `scrim` only: it dims, it does not blur | `bg-scrim` |
| Focus | two-layer `--ring` (box-shadow) in the `focus` role | the same, it carries its own page-coloured gap | `focus-visible:[box-shadow:var(--ring)]`; inside a clipped or scrolling box, `--ring-inset` |

The recipe for a new component:

1. Surface, border and shadow come from the roles and elevation tokens above, never from a
   literal colour or shadow. Do not write a `glass:` rule for a thing a role already switches.
2. Interactive parts give feedback for every state: hover (`hover:bg-hover`, or the level's
   `-hover` role), `focus-visible` (`--ring`), pressed (`active:` with the `-active` role),
   `disabled` (`disabled`, `disabled-fg`, `disabled-border`; flat, no sheen), selected or
   checked (a fill and a heavier weight, not colour alone), invalid (`danger` boundary and a
   2px one).
3. Control heights are `sm` 32, `md` 36, `lg` 40, with a 24px minimum target; radius is
   `--r-sm` (`--r-md` on large). A bar of mixed controls (a table toolbar) uses one size.
   **On a touch screen (`pointer: coarse`) every control is at least 48px** (a `link` Button
   44, the most an inline link can grow): write `pointer-coarse:min-h-12` (or `size-12`) on
   the control, or give it an invisible `::before` tap area as Checkbox and Radio do. The
   gate enforces it, see Phones below.
4. Every duration and curve is a token; `motion-reduce:` removes transitions and the tokens go
   to 0ms under `prefers-reduced-motion`.
5. Glass effects read roles and effects that the solid fallbacks in `@apps/colors` reset, so
   `prefers-reduced-transparency`, `forced-colors` and a browser without `backdrop-filter`
   get plain surfaces for free. Never add a raw `backdrop-filter` or translucent colour, and
   never a backdrop filter on content that scrolls (ENGINEERING §5, performance).
6. Forced colours: box-shadow is dropped, so boundaries come from `border` (set to `CanvasText`
   for the component's `ui-*` hook in the `forced-colors` block of `components.css`), and focus
   is drawn by the global `:focus-visible` outline there.
7. Contrast: text 4.5:1, boundaries and state 3:1, in every pass. A new role pair goes in
   `CHECKS` in `packages/colors/src/gate.ts`; it needs no browser. The axe gate then confirms
   it in the page.

## Core components

Pages are made of these and nothing else (ENGINEERING §13): no page CSS, no margins, no
colour classes. Spacing is the scale by name (`1` 4px · `2` 8 · `3` 12 · `4` 16 · `5` 24 ·
`6` 32 · `7` 48 · `8` 64); every layout piece lets its children shrink, so wide content never
widens the page. Props that take a `Responsive<T>` accept a value or `{ base, sm, md, lg, xl }`.

| Component | Does | Example |
|---|---|---|
| `Stack` | children in a column; `gap`, `align`, `justify`, `as` | `<Stack gap={5}>…</Stack>` |
| `Cluster` | a wrapping row; `gap`, `justify`, `align`, `nowrap` | `<Cluster justify="between"><Title/><Spacer/><Button>Export</Button></Cluster>` |
| `Grid`, `GridItem` | equal tracks; `cols` or `minItemWidth` (auto-fit); items `span` / `rowSpan` | `<Grid cols={{ base: 1, md: 2, xl: 4 }}><KpiTile …/></Grid>` |
| `PageGrid` | dashboard splits `'2-1' \| '1-1' \| '1-2' \| '3-1' \| 'sidebar' \| 'sidebar-start'`, stacked below `stackBelow` (default `lg`) | `<PageGrid layout="2-1"><Chart/><Side/></PageGrid>` |
| `Section` | a titled region: `<section aria-labelledby>`, `title`, `description`, `actions`, `level` (default 2) | `<Section title="Orders" actions={<Button size="sm">Export</Button>}>…</Section>` |
| `Spacer` | takes the free room in a Cluster | see Cluster |
| `Show` | shows its children only `from` a width up or `below` one (`display: contents`, no box of its own): `<Show from="lg"><SkinSwitch/></Show>`. For room-saving only: what CSS hides is out of the tab order |
| `Heading` | a real `h1`–`h4` (`level`); `size` (`display`, 1–4) only changes the look | `<Heading level={1}>Dashboard</Heading>` |
| `Text` | body copy: `size` `display \| body \| small \| label \| mono \| title` (`display` is a big figure that is not a heading), `weight` `medium \| semibold`, `preserveLines`, `tone` `default \| muted \| subtle \| brand \| success \| warning \| danger \| info \| up \| down` | `<Text tone="muted" size="small">Last 30 days</Text>` |
| `Eyebrow` | the small uppercase label above a title or figure | `<Eyebrow>Revenue</Eyebrow>` |
| `Num` | tabular figures, `mono`, `tone` | `<Num mono tone="up">+4.2%</Num>` |
| `Code` | inline code, or `block` (a focusable `pre`) | `<Code>npm test</Code>` |
| `Card`, `Panel` | `fullHeight` fills its grid cell; `variant` `surface \| raised \| sunken \| outline`, `padding` `none \| sm \| md \| lg`; `Panel` pads (md) and spaces its children (`gap`) | `<Panel variant="raised"><Eyebrow>Cash</Eyebrow><Num mono>£12,400</Num></Panel>` |

Tones are meanings that map to text roles (`muted` → `fg-muted`, `danger` → `danger`), never
colours. Type comes from the `--t-*` font tokens through `Heading` and `Text` (a token is a
`font` shorthand, so it is only ever used whole).

## Patterns

Whole-page compositions of the core components, in `src/patterns/` (one file each; tested in
`tests/patterns.test.tsx`, with axe on a composed list page, settings page, dashboard and
sign-in page in every skin and mode). A base-app page is a thin composition of these plus its
own data; if a page needs a screen shape that is not here, add the pattern here.

| Pattern | Does |
|---|---|
| `PageHeader`, `PageLayout` | breadcrumbs, eyebrow, the page's one `h1`, description, `actions`, `toolbar`; `PageLayout` adds the spaced body. `titleHidden` keeps the `h1` for assistive tech only, when the body shows the title (a `StatusPage`). An app's `Page` wraps `PageLayout` and only sets `document.title` |
| `ListPage` | the list screen: `actions`, a toolbar card (`search`, facets, filter chips, `columnToggle`, `densityToggle`, `toolbarActions`, `filters`), `bulkActions`, the table + `TablePagination`, `loading` / `busy` / `error` / `empty`, and a `detail` slot. Takes the `useDataTable` api as `table`; it re-implements no table logic |
| `DetailSheet`, `DetailSection` | a record drawer: title, `subtitle`, `badges`, `summary`, `actions`; body sections (`items` become a `DescriptionList`); `loading` / `error` with `renderLoading` / `renderError`; `children` may be a function that runs only when ready |
| `KpiRow` | `items` (KpiTile props) in a 1 / 2 / 4 column grid; `loading` draws skeletons in a `LoadingRegion`, `error` an `ErrorState` |
| `ChartGrid`, `ChartGridItem` | 1 column on a phone, 12 tracks from 768px; items `span` `wide \| half \| third \| two-thirds` |
| `FeedList`, `FeedItem` | a real `<ul>` of activity: `avatar` or `icon`, `title`, `meta`, `trailing`, and one link / button around the row (`href`, `onClick`, or `linkAs` + `linkProps` for a router link) |
| `Timeline`, `TimelineItem` | One thing's sequence: an `<ol>` joined by a spine, each event with a status dot (`tone`: neutral, info, success, warning, danger). The dot has its own glyph and the status is also read as a word ("Completed: …"), so colour is never the cue. Use `FeedList` for rows to open. |
| `ActionList`, `ActionItem` | quick actions, a real `<ul>`: `icon`, `title`, `description`, chevron, same targets as FeedItem |
| `SettingsLayout`, `SettingsSection` | a section nav (sticky `<nav>` of buttons with `aria-current` from 1024px, a native `<select>` below) beside the content; controlled or not; `SettingsSection` is a Card with an `h2`, help and `actions` |
| `SaveBar` | sticky "N unsaved changes - Discard - Save"; hidden at 0; a polite status line is always mounted; `saving` makes Save `aria-disabled` |
| `PullToRefresh` | Drag a list down from its top to fetch it again (idea from EasyUI, none of its code). `onRefresh` (a promise holds "Refreshing…"), `threshold`, `label`. Passive touch listeners, one transform per move; the page's own overscroll is contained while mounted. A real Refresh button too (`button="always" \| "focus" \| false`), since a drag is not everyone's (WCAG 2.5.1, 2.1.1); a polite status line says Refreshing… / Updated. |
| `ProductTour` | A first-visit walk-through (idea from EasyUI, none of its code): each `step` dims the page except its `target` (selector or function; none or missing gives a centred card), scrolls it into view and shows Step N of M, title, body, Skip tour / Back / Next. A modal native `<dialog>`: inert page, Esc skips, arrows step, focus moves to each step's title and returns at the end; docks at the bottom on a phone. `onClose('done' \| 'skipped')`; remembering it was seen is the app's job. |
| `FormSection`, `FormField`, `FormGrid`, `FormActions` | `FormField` wires `id`, `aria-describedby` (description, then error), `aria-invalid` and `aria-required` to its single child (or a render prop), with the error in a polite live region; `FormGrid` is 1 or 2 columns; `FormActions` end-aligns buttons, primary last |
| `AuthLayout` | the sign-in shell as the page's `<main id="main">`: enterprise is a brand panel beside the form from 1024px, glass is one centred glass card over `backdrop`; slots `brand`, `aside`, `title` (the `h1`), `description`, `notice`, `form`, `footer` |
| `StatusPage` | a whole-page 404 / 403 / 500: `code`, `icon`, `title`, `description`, `primaryAction`, `secondaryAction`, decorative `backdrop` |
| `ChoiceCard`, `SkinPreview`, `BackdropSwatch` | one option of a radio group drawn as a card with a picture: a native radio stretched over the card, the chosen one has the selected fill, the brand border and a check. Wrap the group in a `Grid role="radiogroup" aria-label`. `SkinPreview` (a tiny app in each skin) and `BackdropSwatch` (a still of each glass scene, from the `backdrop` roles) are the ready-made pictures |
| `PageHero` | the greeting strip under a page header: `title`, `subtitle`, `actions` (a range control); a quiet `ShaderAccent` behind it in the glass skin. A paragraph, not a heading (the `h1` is the PageHeader's) |
| `ToolLayout` | inputs (sticky from 1024px, inside a Panel) and results, stacked on a phone; `announce` makes results a polite live region |

```tsx
const table = useDataTable({ columns, rows, rowKey });
<PageLayout title="Users" actions={<Button>Invite</Button>}>
  <ListPage table={table} caption="Users" search selectable
    loading={q.loading} error={q.error && { what: 'users', error: q.error, onRetry: q.reload }}
    detail={<DetailSheet open={!!id} onOpenChange={close} title={user?.name}>…</DetailSheet>} />
</PageLayout>
```

Patterns use roles and the layout props only, and switch skins in CSS (`glass:` variants), so
the markup, the tab order and the tests are the same in both skins. Use the Button levels in
ENGINEERING §5: one `primary` per view, and `FormActions` / `SaveBar` put it last.

## Components

| Export | Notes |
|---|---|
| `Button`, `buttonAttrs` | Levels (`variant`), the eight: `primary` (the main action), `secondary` (indigo wash), `neutral` (the plain button), `outline`, `ghost`, `link`, `danger` and `success`. Aliases that still resolve: `destructive` is `danger`, `accent-outline` is `secondary`; each has rest, hover, pressed, selected, disabled and focus states from `@apps/colors` (the table is in ENGINEERING §5). Sizes: sm, md, lg and icon. The minimum target is 24px. |
| `Card` and its parts | `CardTitle as="h2…h6"` fits the title into the page outline. |
| `Notice` | An inline message with a tone (`danger`, `warning`, `info`, `success`): boundary in the tone's role, an icon and the words. `danger`/`warning` are `role="alert"`, the others `status`. Takes a ref and `tabIndex={-1}` to move focus to it after a failed submit. Not for a failed load (that is `ErrorState`). |
| `PasswordInput` | An `Input` with a Show / Hide toggle (`aria-pressed`, the name changes, focus and value are kept). Works inside a `FormField`. |
| `Badge` | `variant` is a status tone: success, warning, danger, info, brand, neutral, up, down; `appearance` is soft, outline or solid. Aliases: default, accent, warn, solid. |
| `Input`, `Label` | Every input needs a visible `Label`, and `htmlFor` is required. |
| `NativeSelect` | Uses the native listbox; prefer it for forms. |
| `Checkbox` | A native input. `label` renders the label row, and `indeterminate` gives the mixed state. |
| `Separator` | Decorative unless `decorative={false}`. |
| `Dialog` | The native `<dialog>` with `showModal()`, which gives the focus trap, closing on Esc and an inert page. It closes on a scrim click and returns focus to the opener. |
| `PromptDialog` | An accessible replacement for `window.prompt()`. |
| `StatTile` | Shows direction with an arrow and words for screen readers, not colour alone (WCAG 1.4.1). |
| `PanelHeader` | Its title is a real heading; set the level with `level`. |
| `ErrorBoundary` | Shows a `role="alert"` card or a custom `fallback`. |
| `useTheme`, `ThemeToggle`, `SkinSelect` | Set the mode and the skin. |
| `SectionNav`, `SectionDef`, `matchSection` | Navigation driven by the section registry, with `aria-current="page"` on the current link. Runs horizontally or vertically. |
| `Icon` | Inline SVG icons. They are decorative unless given `label`. |
| `AppRoot`, `PageEnter` | `AppRoot` is the `.ui-app` root (page colour, type, skin backdrop) every app wraps itself in, so a page never writes the class; `PageEnter` is the soft fade-and-rise a routed page plays on mount (key it by route; off under reduced motion). |
| `AppShell`, `Sidebar`, `Topbar` | The app frame. It has a skip link to `<main id="main">` and labelled navs for each sidebar group. From 768px up, the sidebar collapses to an icon rail (each icon gets a `Tooltip` with its name; the link text stays in the DOM, visually hidden) and remembers that in localStorage, or the app owns it with `collapsed` / `onCollapsedChange` (so a shortcut can flip it). Below 768px it becomes a drawer opened from the top bar's menu button: opening it makes the page inert, and Esc closes it and returns focus to the menu button. `Topbar`'s `title` may be a short trail (`Admin / Users`); the page's own `<h1>` stays the heading. `SectionNav` takes `tooltips` for the same rail case. |
| `CommandPalette`, `CommandPaletteButton` | The ⌘K / Ctrl+K command palette: a modal dialog (Radix) holding the WAI-ARIA combobox + listbox pattern. The input is the combobox (`aria-expanded`, `aria-activedescendant`), options sit in labelled `role=group`s. ArrowUp/Down (wrapping), Home/End, Enter and Esc work from the input; Esc returns focus to whatever opened it. The filter needs every typed word in a command's label, group or keywords; a polite status line gives the count or the empty message. Controlled (`open` / `onOpenChange`); listens for ⌘K / Ctrl+K itself unless `shortcut={false}`; `recentKey` remembers the last four commands in localStorage and lists them first. `CommandItem` = `{ id, label, group?, keywords?, icon?, shortcut?, onSelect }`. `CommandPaletteButton` is the visible "Search… ⌘K" button (`Kbd` chips; icon only under 640px). `filterCommands` and `isMacLike` are exported. Glass: the raised glass material over a blurred scrim. |
| `DataTable` | A real `<table>` with a caption. Sortable headers are buttons, and the sorted header carries `aria-sort`. Paging has a live "Page x of y" line, and selection has a select-all checkbox that shows a mixed state. A wide table scrolls inside a focusable region. It is also the batteries-included layout of the table system below (search, facets, chips, column toggle, density, bulk bar, row actions, CSV); its old props are unchanged. |
| `Popover` | A button that opens a small non-modal panel of controls (shadcn Popover on Radix): Esc returns focus to the button, Tab moves on through the panel and out, focus leaving it closes it. `label` names the panel. A glass surface in the glass skin. |
| `Tabs` | The APG tabs pattern: roving tabindex, the arrow keys, Home and End, and focusable panels. |
| `Menu` | The APG menu button pattern: arrow keys, Home, End and type-ahead. Esc returns focus to the button, and a click outside closes the menu. Items can be buttons or links. |
| `Switch` | A native checkbox with `role="switch"`. |
| `Tooltip` | Hint text that appears on hover and keyboard focus, wired up with `aria-describedby`. It meets WCAG 1.4.13: Esc dismisses it, and the pointer can move onto it without it closing. Never put a control's only name in a tooltip. |
| `LineChart`, `AreaChart`, `BarChart`, `DonutChart`, `Sparkline` | Drawn with `@tanstack/charts`. Each chart is one `role="img"` with a summary in its name, a `<figcaption>` and a visually hidden data table. Series are told apart by dash pattern, marker shape, bar fill pattern or number, not by colour alone. The `chart-1`…`chart-8` roles are at least 3:1 against the background in every skin and mode. A chart with no data says so in words (`emptyMessage`). |
| `LineChart` / `AreaChart` | `area` (`true` or `'stacked'`) adds a token-coloured gradient fill; `AreaChart` is the same chart with it on (`stacked` piles the series). A series with `variant: 'comparison'` is the "previous period": thinner, dashed, no markers, never stacked. ISO-date x values read as "2 Sept" (or "Sept 26" over a year or more) and the axis shows only as many labels as there is room for (about 72px each); pass `xFormat` to override. Keyboard: Tab to the chart, then Left/Right/Home/End move the shared crosshair and its aria-hidden readout. |
| `BarChart` | `orientation="horizontal"` is for category lists (labels left, value at the bar end). `series` (instead of `data`) draws several series, `layout="grouped"` (default) or `"stacked"`; series differ by fill pattern (solid, hatch, dots, cross-hatch, stripes) in the bars, legend and table order. `valueFormat`, `valueLabels`. Crowded category labels are thinned, never overlapped. |
| Legend | On a multi-series `LineChart`/`BarChart` the legend is a row of `<button aria-pressed>` toggles: a hidden series leaves the drawing and the readout but never the data table, and the last visible series cannot be hidden. |
| `ChartFailure` | what a `ChartCard`'s `error` slot holds: "Couldn’t load <what>." and Retry (the card supplies the alert role; `ErrorState` would nest a second one). |
| `ChatThread`, `ChatMessage` | The conversation. `ChatThread` is a named `role="log"` (an implicit polite live region, so a new assistant message is announced without moving focus), focusable so the keyboard can scroll it, `busy` sets `aria-busy`; it sticks to the bottom until the reader scrolls up, then offers "Jump to latest". `ChatMessage` takes `from` `user \| assistant \| system`, `name`, `timestamp` (a real `<time>`), plain-text children with their line breaks kept (rich children such as `Thinking`, `ToolChip`, `ApprovalCard` also work), and a copy button that says "Copied" in a polite status (`copyText` when the content is not a string). |
| `Thinking`, `TextShimmer` | A folded reasoning trace: a disclosure button (`aria-expanded`, `aria-controls`) whose label shimmers while `active` and settles to "Reasoning for 4 s". `TextShimmer` is the shimmer on its own (CSS only, on the `ui-fx-shiny` keyframes; plain muted text under reduced motion and forced colours). |
| `ToolChip` | One tool call as a compact chip: icon, name and the state in words (Running, Done, Failed), `summary`, and a `detail` that opens under it (then the chip is a disclosure button). Failed takes the danger boundary. |
| `ApprovalCard` | The agent asks before it acts: `title`, `description`, `details` (term/detail pairs), Deny (`neutral`) and Approve (`success`, or `danger` with `destructive`). With `decision` the buttons give way to a `role="status"` receipt and focus moves to it. Esc does not deny. |
| `Composer` | The box you write in: an auto-growing textarea (`maxRows`) and a round button. Enter sends, Shift+Enter adds a line (not while an IME is composing); blank text, `disabled` and `streaming` send nothing. The button is Stop (`onStop`) while `streaming`. A key hint is the field's description; `maxLength` adds a counter and a polite "N characters left" near the limit. Controlled or uncontrolled. |
| `AssistantLayout` | An assistant screen: the `ChatThread` fills the room above a docked composer, with a `notice` slot between them. `empty` puts an `EmptyState` with `suggestions` chips (`onSuggestion`) in the thread, which stays mounted so the first reply is announced. `aside` puts a side column (a `ConversationList`) beside the thread from `md`, above it below. |
| `ConversationList` | Saved chats beside an assistant: a "New chat" button and the chats as a named `nav` of full-width buttons (the open one `aria-current`), a "Waiting" badge on a chat with an approval pending, a time ("14:05" today, "3 Oct" before) and, with `onDelete`, a delete button named after the chat. |
| `ChartCard` | A `Card` (glass in the glass skin) around a chart: `title`, `eyebrow`, `description`, an `actions` slot for range controls, a `footer`, and a "Show data table" `Switch` that turns the chart's own table from visually hidden to visible (a labelled, focusable scroll region with its caption), so there is one table, not two. `loading` shows an `aria-busy` skeleton that announces "Loading <title>", `error` shows your node in a `role="alert"`, `empty` replaces the chart with a message. |
| `Sparkline` | `area` and `dot` (both default on) and `tone`: `'accent'`, or `'auto'` for green/red by trend, where the label also says "up" or "down" so direction never rests on colour. |
| `ActivityHeatmap` | A calendar of counts: a square per day, a column per week, five steps of the `heat-0..4` roles. `days` (`{date, count}`), `unit`, `thresholds`, `weekStartsOn`, `onSelectDate`. An ARIA grid with one tab stop: arrows move a day / a week, Home/End the row, Ctrl+Home/End the range; every cell is named ("Mon, 3 Aug 2026: 4 transactions") and 24px; a readout line follows focus. Its data table (ChartCard's switch) lists every day. |
| `FunnelChart` | How many reached each stage (idea from EasyUI, none of its code): centred `chart-1` bars in an `<ol>`, each with its count and share of the first, and between stages "40% went on · 1,800 dropped"; the biggest drop gets a warning Badge in words (`showBiggestDrop`). Its data table adds share of first and of previous. |
| `LiveLineChart` | One value as it changes over the last `windowMs` (idea from EasyUI, none of its code). The app passes `points`; "now" is the newest reading, so it draws the same anywhere. New readings glide in with one CSS transform (steps under reduced motion). `Pause updates` (`aria-pressed`, controlled with `paused`) holds the picture and counts what arrived (WCAG 2.2.2). The plot is one `role="img"` named with the latest value and the window's low and high, not a live region. |
| `Gauge` | One value on a half-circle dial, reading like `Meter` (`low` / `high` / `optimum` give a good / caution / poor tone in the success / warning / danger roles, written as a word under the figure). `role="meter"`; ticks mark the regions. |
| `UsageMeter` | Several parts of one total against a limit (`segments`, `limit`, `warnAt`): patterned segments, a legend with values and shares, and "Almost full" / "Over limit" in words with an icon. Use `Meter` for one value. |
| `Treemap` | Parts of a whole as squarified areas (`data`, `valueFormat`): pattern fills, a name on a solid chip when it fits (hidden otherwise), a list with one tab stop (arrows, Home, End) and a readout line. One level. |
| `FlowDiagram` | Boxes and arrows for a process (`nodes`, `edges` with optional labels, `direction` right or down): steps layered by their longest path from a start, a loop back drawn without moving a step, starts edged in brand, every arrow label on a solid chip. A left-to-right diagram too wide for its box turns top-to-bottom (no sideways scroll). One `img` named by its title, plus a visually hidden ordered list of "A, then B (label)". |
| `NotificationBell` | An icon button named "Notifications, 3 unread" with a count badge (`9+` from ten, gone at zero), opening the kit `Popover`: a header with "Mark all as read" (`aria-disabled` at zero), a `NotificationList`, "View all" (`viewAllHref`, or `renderLink` for a router link), `loading` skeletons and an `error` with Retry. Esc closes and returns focus to the bell. A rise in `unreadCount` rings the badge once (CSS, off under reduced motion; `pulse={false}` stops it) and is announced in a polite status line. Props only: `items`, `unreadCount`, `onOpenChange`, `onMarkRead(id)`, `onMarkAllRead`, `onSelect(item)`, `group`, `now`. |
| `NotificationList`, `NotificationItem` | A `<ul>` of `{ id, title, body?, createdAt, readAt?, tone?, icon? }`. Each row is a select button (title, body clamped to two lines, a `<time>` in relative en-GB words) plus "Mark as read: <title>" while unread. Unread is a dot, a bold title, a brand edge and the sr-only word "Unread", never colour alone. Up / Down / Home / End walk the rows. `group` splits under Today / Yesterday / Earlier (`groupNotifications` is exported). Empty: "You're all caught up". |
| `SessionList` | Sign-in sessions as rows: `describeUserAgent` gives "Chrome on macOS", then the IP and "Last active 3 hours ago"; the current session has a "This device" badge and no Sign out; others have "Sign out <device>, <ip>" and the list has "Sign out all other sessions". Both ask first in `ConfirmDialog` (destructive; an async `onRevoke` / `onRevokeOthers` that rejects stays open and says why). `loading` and `error` states. |
| `AvatarPicker` | The kit `Avatar` (initials fallback), "Change photo" (png, jpeg, webp; `validateAvatarFile` refuses a wrong type or a file over `maxBytes`, default 2 MB, in words), a preview before saving with "Save photo" / "Cancel", "Remove" while `src` is set, `uploading` with a `Progress` bar (`progress`, 0-100), and the server's `error`. When an upload ends without an error the preview clears and focus returns to Change photo. |
| `PasswordStrength` | A `role="meter"` of four segments, the word (Weak, Fair, Good, Strong) and one hint, from `scorePassword` (length first, then variety; common and repeated passwords are Weak). It never blocks. The announcement waits `debounceMs` after typing stops and is a polite status. `requirements` adds a checklist read as "met" / "not met". |
| `Banner` | A full-width announcement bar for the top of the shell: `tone` info / warning / danger (a rule under the bar and an icon, plus the words), `title`, one `action`, `onDismiss`. `danger` is `role="alert"`, the others `status`. Not a `Notice`: that is a boxed message beside the thing it is about, with no action or dismiss. |
| `formatRelativeTime`, `useNow` | "just now", "5 minutes ago", "yesterday", "3 days ago", then "1 Aug 2026" (en-GB, pure; `now` is a parameter). Components take a `now` prop and otherwise tick once a minute. |
| `EmptyState` | An icon, a heading, a line of help and an action slot; sizes sm and md. Content, not an alert. |
| `ErrorState`, `LoadingRegion` | Moved from base-app. `ErrorState` is a `role="alert"` with a Retry; `error` is `unknown` and read structurally (`message`, `code`, `status`, `errorId`), so the kit needs no app type. `LoadingRegion` is a busy group named "Loading …" with a polite status. |
| `Delta` | A ratio as an arrow and words ("up +4.2%"), never colour alone. `format` overrides the en-GB default. |
| `KpiTile`, `KpiTile.Skeleton` | One KPI: label, a figure that rolls in like an odometer (RollingNumber; `countUp={false}` shows it at once), `delta` or `previous` through Delta, an optional Sparkline `trend`, `footnote`, `icon`. `href` or `onClick` makes the label a stretched link or button over the whole tile. `loading` gives a same-size skeleton. Glass adds PointerLight: a faint pool of light under the pointer, the rim catching it, one sheen on arrival. `StatTile` stays for plain figures. |
| `SegmentedControl` | A named radio group on Radix ToggleGroup: arrow keys move and choose, Home and End jump. A pill slides under the choice; it stops under reduced motion. Sizes sm and md. |
| `Toaster`, `toast()` | Mount `Toaster` once; call `toast()`, `toast.success()`, `toast.error()`, `toast.info()` from anywhere. Polite live region (errors assertive and sticky), pause on hover and focus, swipe, at most three shown, an action button, and an icon plus a spoken word per variant. `toast.undo(title, { onUndo, onExpire })` keeps the toast eight seconds with an Undo button and a countdown bar that pauses with it; Ctrl/Cmd+Z undoes the newest (not in a text field), and "Undone" follows. |
| `Sheet` | A side panel (right, left or bottom) on Radix Dialog: title and description required, a Close button, a focus trap, Esc closes, focus returns to the opener. The slide stops under reduced motion. |
| `Slider` | Radix Slider with a visible label (`hideLabel` keeps it for assistive tech when a text box beside it says the same), `formatValue` for aria-valuetext, min, max, step and optional ticks. |
| `Avatar`, `AvatarGroup` | Initials on a name-derived colour (initials stay `fg` on a faint wash, so they clear 4.5:1) or an image that falls back to the initials. The group is a list with a "+N" chip. |
| `Kbd` | A keyboard key chip, a real `<kbd>`. |
| `Breadcrumbs` | `nav aria-label="Breadcrumb"`, an ordered list, `aria-current="page"` on the last item, decorative separators. |
| `Progress`, `Meter` | `Progress` is `role="progressbar"` (indeterminate when `value` is omitted). `Meter` is `role="meter"` with low, high and optimum deciding a tone that is also written as a word ("Good", "Caution", "Poor"). |
| `ConfirmDialog` | A Dialog for "are you sure": `destructive` uses the `danger` button level, an async `onConfirm` shows a pending state (nothing dismisses it) and a rejection stays open with the reason. |
| `DescriptionList` | A `<dl>` of term/detail pairs in one or two columns, for detail drawers. |
| `Calendar` | One month on an APG date grid (`role="grid"`, one tab stop). Arrows move by day and week, Page Up / Down by month (Shift: year), Home / End to the week's ends. `mode="single"` (`value`, `onValueChange`) or `mode="range"` (`range`, `onRangeChange`; a click before the start swaps them). `min` / `max`, `today` marker (`aria-current="date"`), Intl names (en-GB, Monday first). A day is an ISO string `YYYY-MM-DD`; picked days wear the selected look (`bg-selected`, brand border). |
| `DatePicker`, `DateRangePicker` | A field-shaped button that opens a Popover holding the Calendar; focus lands on the chosen day, Esc returns to the button. `presets` are quick picks (`DateRangePicker` defaults to Last 7 / 30 / 90 days, `false` hides them); `clearable`; `size="sm"` and `fit` for a toolbar; `portal={false}` inside a modal `<dialog>`. Wrap in `FormField`. |
| `Combobox` | Typeahead single choice, the WAI-ARIA 1.2 combobox (`aria-activedescendant`, a listbox focus never enters, a polite match count). `options` = `{ value, label, description?, disabled? }`. The list sits in place, so it works inside a dialog. |
| `MultiSelect`, `TagInput` | Chips in a field, each with a "Remove X" button; Backspace in the empty box removes the last. `MultiSelect` picks from a list (listbox stays open between picks); `TagInput` takes free text (Enter / comma add, paste splits, `validate`, `max`, duplicates refused with the reason). Added and removed chips are announced. |
| `NumberField` | An ARIA spinbutton with −/+ buttons: Up / Down step, Page Up / Down `largeStep`, Home / End to `min` / `max`; formats and parses by locale (`formatOptions`: currency, percent), clamps on blur, float-safe steps. `prefix` / `suffix` are decorative units. |
| `RadioGroup`, `RadioCards` | Native radios in a `<fieldset role="radiogroup">` named by `legend` (the browser gives the roving focus). `RadioCards` draws each option as a card (title, description, `icon`) in the selected look; `description` and `error` are wired with `aria-describedby`. Not for pictures (use `ChoiceCard`) or 2–4 short labels in a row (`SegmentedControl`). |
| `FileDropzone` | Drop files or browse: the zone is the label of a real hidden `<input type="file">`. `accept`, `maxSize`, `maxFiles`, `multiple`; refused files are named with the reason in an alert; chosen files listed with "Remove X". Controlled (`files`, `onFilesChange`). |
| `InlineEdit` | Text that becomes a text box on click / Enter. Enter saves, Esc cancels, blur saves, `validate` can refuse with a message; focus returns to the button; the result is announced. |
| `CopyButton` | Copies `text` (Clipboard API, `execCommand` fallback); the label swaps to "Copied" and a polite status says so (or "Couldn't copy"; `onError`). `iconOnly` keeps its `label` as the name. |
| `HoldToConfirm` | Commits after a press-and-hold (`duration`, a fill grows; reduced motion drops the fill and the label says "Keep holding…"). Keyboard: hold Space / Enter, or press twice (the first arms it). For an action whose consequence is already on screen; use `ConfirmDialog` when people must read first. |
| `OtpField` | A one-time code drawn as one box per character over ONE real `<input>` (idea from EasyUI, none of its code): `autocomplete="one-time-code"`, paste, password managers, Backspace and screen readers all work. `length` (6), `mode` numeric / alphanumeric, `onComplete`. Wrap in `FormField`; boxes are 40px, 48px on touch. |

## Tables

`DataTable` is made of a headless hook and parts you can lay out yourself
(`src/components/data-table/`). Use `DataTable` for the usual table; use the pieces when a page
needs its own layout, its state in the URL, or a server behind it.

| Piece | What it is |
|---|---|
| `useDataTable(options)` | The state and the derived rows: sort (ordered keys; `sortBy(key, additive)`), `search`, facets with counts, paging, selection, hidden columns, density, expanded rows. It renders nothing. |
| `DataTableView` | The `<table>`: caption, sortable headers, sticky header, selection column, expandable rows, clickable rows, row actions, footer cells, `loading`, `empty`. |
| `DataTableToolbar` | A layout row (a `<fieldset>` with a hidden legend): children on the left, `actions` on the right, wrapping on a narrow screen. |
| `TableSearch` | A labelled search field with a clear button; `debounce` defaults to 200 ms. The debounce lives here, the hook takes the settled value. |
| `FacetFilter` | "Status · 2": a Popover of checkboxes with counts. A count is the rows that pass every other filter, so it says what ticking would leave. |
| `FilterChips` | Removable chips for the search and each facet value, and "Clear all". |
| `ColumnToggle`, `DensityToggle` | Show or hide `hideable` columns (never the last); compact / normal / comfortable rows. |
| `TablePagination` | "Showing a–b of n", "Rows per page", first / previous / next / last (`aria-disabled`, so focus stays), and a polite "Page x of y" line. |
| `BulkActionBar` | A named region that appears while rows are selected: "N selected", your buttons, "Clear selection". |
| `sortRows`, `filterRows`, `facetCounts`, `toCsv`, `downloadCsv` | The pure helpers behind the hook. `downloadCsv(filename, columns, rows, { save })` takes an injectable sink; without a browser it does nothing. |

Columns add optional fields to `Column<T>`: `searchable` / `searchValue`, `facet` /
`filterValue` / `facetLabel` / `facetOptions`, `hideable`, `defaultHidden`, `footer(rows)`
(totals over the filtered rows, not the page) and `csv(row)`.

```tsx
const table = useDataTable({
  columns, rows, rowKey: (o) => o.id,
  initialState: { pageSize: 25, sort: [{ key: 'total', dir: 'desc' }] },
});
const status = table.facets.find((f) => f.key === 'status');

<DataTableToolbar actions={<ColumnToggle table={table} />}>
  <TableSearch value={table.search} onChange={table.setSearch} />
  {status && <FacetFilter facet={status} />}
</DataTableToolbar>
<FilterChips filters={table.activeFilters} onClearAll={table.clearFilters} />
<BulkActionBar count={table.selection.count} onClear={table.selection.clear}>
  <Button size="sm">Archive</Button>
</BulkActionBar>
<DataTableView table={table} caption="Orders" selectable stickyHeader
  onRowClick={open} rowActions={(o) => [{ id: 'edit', label: 'Edit' }]} />
<TablePagination table={table} pageSizeSelect />
```

- **Sorting:** click sorts by that column alone (ascending, then descending); **Shift+click**
  adds it as a further key, flips it, then drops it. `aria-sort` is on every sorted header, and
  with several keys each button also says its place ("sort priority 2").
- **State:** every key (`sort`, `search`, `facets`, `pageIndex`, `pageSize`, `selected`,
  `hidden`, `density`, `expanded`) is uncontrolled with `initialState`, or controlled with
  `state` (any subset) and `onStateChange(patch, next)`, so a page can mirror it to the URL.
- **Server-driven:** `manual: { rowCount }` stops the hook sorting, filtering and paging
  `rows`; it only reports state changes (and keeps the page and selection when the rows
  change). Give facet columns `facetOptions` (the hook cannot count what it does not have).
- **Clickable rows:** the row is not a tab stop. The first cell's content becomes a button, or
  `rowOpenButton` adds a trailing "Open" button (use it when the first cell holds a link). A
  mouse click anywhere on the row opens it too, except on a control inside the row.
- **Row actions** use the kit `Menu`, named "Actions for <row>". **Selection** is per row key and
  survives filtering; the header checkbox selects every row that passes the filters
  (`selectScope="page"` for the page only). A selected row gets a `brand` bar, not a wash, which
  would pull Badge text under 4.5:1.
- **CSV** is RFC 4180. Text cells that start with `=`, `+`, `-` or `@` get a leading `'` so a
  spreadsheet does not run them as formulas.

## Generation reveal

`generate(el, options)` (`src/effects/generate/`, the kit's own) plays "an agent is building
this" over an element as it arrives. The default look, `draft`, is a drafting table: a faint
sheet of guide lines, hairline construction lines from the main edges, a pen in the brand
colour walking the outline and then every box in reading order, dimension lines whose figures
count up, crop marks on the main parts, text as bars growing line by line and, with
`traceSvg`, a chart's own marks drawn stroke by stroke. The real element then develops in
through a soft circle growing from its centre, a faint ring of light on its front, while the
drawing dissolves ahead of it. `skeleton-texts` adds a spec sheet typed out from what was
measured (or from `code`) beside the element where the page has room, and a step line
(`steps`, then `done`) under it. Reduced motion gets a 200ms fade; the overlay is
`aria-hidden`, takes no input and uses role colours only (`effects.css`). One
requestAnimationFrame loop drives every run and builds at most one overlay a frame.

- `useGenerate(ref, ready, options)` plays it when `ready` turns true after a loading state
  (never for content that was there from the first render), staggers elements that start
  together, waits until an element below the fold scrolls in, and with `each` plays it on
  every child in turn.
- `<Generate play>` is a box whose content is drawn in on mount.
- `render: 'ascii'` (`ascii.ts`, our own) rebuilds the element in monospace glyphs on a canvas
  instead: its box outlines, its real text letter by letter, and a chart's own marks
  rasterised and read back as glyphs (slopes as `/` and `\`, bars and areas in a density
  ramp). The look follows `<html data-skin>`. Enterprise gets `plot`, a pen plotter: graph
  paper and rulers, then a pen draws every outline, the series left to right and the labels in
  reading order, in wet ink that dries, before the real UI feeds in a row at a time. Glass gets
  `frost`: a mist of glyphs creeps in from the edges, the card crystallises out of it (frame,
  data, labels, each cell morphing `·░▒` into its glyph), then a band of light wipes the real
  UI in sharp, leaving a few droplets. `plot` or `frost` picks one look whatever the skin. ChartCard (`generate` prop),
  KpiRow and `QueryView generate` use `ascii`. `draft` (the default for `generate()`) is the
  drafting table above.
- Built in: **ChartCard** (the card and its chart's marks, when its data arrives),
  **KpiRow** (each tile in turn), and base-app's `QueryView generate`.
- `skipAllGenerations()` or `window.dispatchEvent(new Event('ui:generate-skip'))` shows
  everything at once (the axe scans do this before they measure).

Use it for a result arriving, not for UI that appears often (menus, rows, route changes):
those use a skeleton and a plain reveal.

## Shader backdrops

`ShaderBackdrop` puts a WebGPU scene from the [`shaders`](https://github.com/shader-effects-inc/shaders)
package (MIT) behind the glass skin; `ShaderAccent` is a small bounded version behind a card or
hero. Both are decorative and calm, and the enterprise skin never renders one.

```tsx
<ShaderBackdrop preset="mesh" intensity={0.6} fallback="animated" />

<div className="ui-shader-host">   {/* position: relative; isolation: isolate */}
  <ShaderAccent preset="aurora-noise" />
  …hero…
</div>
```

| Preset | Package component | Looks like |
|---|---|---|
| `mesh` | `MeshGradient` | a slow drifting colour field |
| `liquid-metal` | `LiquidMetal` | soft metallic flow, tinted rather than chrome |
| `aurora-noise` | `SimplexNoise` | a soft cloud of two tints |
| `glass-caustics` | `Ripples` | wide, soft rings, like light through glass |

Colours come from the tokens at runtime (the `canvas` and `chart-1`…`chart-3` roles), mixed toward the page colour
and re-read when the skin or mode changes; `intensity` (0–1) sets how much colour they carry.

`ShaderHero` is the host and the accent in one: a centred, bordered panel with a `ShaderAccent` behind its children (`active` switches the accent on, e.g. in the glass skin only). `PointerLight` takes `surface` to draw its own card surface. `RollingNumber` is the odometer figure on its own: every digit a reel that spins up and settles, left to right, announcing only the final value.

**Guards.** Each is a promise the tests hold:

- *Feature detection.* The package loads only after `navigator.gpu.requestAdapter()` returns an
  adapter. Without one, or if it rejects, or if the scene throws or reports the GPU unusable,
  `fallback` applies: `'animated'` (default) is the kit's `AnimatedBackground`, `'static'` the token
  gradient. Nothing throws and nothing is blank.
- *Reduced motion:* the static gradient, no GPU. *Reduced transparency or forced colours:* the
  plain page colour.
- *One GPU context per page.* The first `ShaderBackdrop` owns it. A second one, or a
  `ShaderAccent` while a backdrop is live, draws its static gradient. A backdrop outranks an
  accent, which takes the context back when the backdrop goes.
- *Pause.* The scene is unmounted while the tab is hidden or the element is off screen.
- *Contrast.* The scene is tinted toward `canvas`, faded to `--ui-shader-opacity` and covered by a
  `--ui-shader-scrim` layer (`effects.css`), so text sitting straight on the page keeps 4.5:1 over
  the busiest frame. If a preset ever needs more, raise the scrim.
- The package's telemetry is switched off, and it loads lazily (its own chunk), so apps that
  never choose a shader do not download it.

**Picking one.** `AppShell`'s `background` prop takes `'tide' | 'hive' | ShaderPreset |
false`. Left unset, it follows the reader's saved choice: `const [backdrop, setBackdrop] =
useBackdrop()` (stored in `localStorage` under `ui-backdrop`, survives storage being blocked;
default `'tide'`; names saved before Nov 2026, `'aurora'` and `'iridescence'`, read as `'tide'` and `'hive'`). `BACKDROPS` lists the six values and `PRESET_LABELS` names the shader
presets, for a Settings picker.

## Sea glass

`SeaGlassStage` is sunlit paper (moonlit in dark mode) and one WebGL canvas that draws every
`SeaGlass` on it as a frosted glass pebble with a coloured shadow (adapted from
[Blueemi/sea-glass-demo](https://github.com/Blueemi/sea-glass-demo), MIT). The pieces are
ordinary elements, so text, focus and screen readers never touch the canvas. Hover lifts a
piece, pressing sinks it, the pointer nudges the sun; nothing is drawn while nothing moves.

```tsx
<SeaGlassStage variant="panel">
  <SeaGlass tint="periwinkle" shape="pill" grow>Search</SeaGlass>
  <SeaGlass as="button" type="button" tint={on ? 'aqua' : 'clear'} aria-pressed={on}>Wi-Fi</SeaGlass>
</SeaGlassStage>
```

- `tint`: `clear`, `coral`, `orchid`, `periwinkle`, `aqua`, `seafoam`, `amber` (the roles
  `seaglass-0`…`seaglass-6`; the gate measures `fg` and `fg-muted` on each, and links on clear).
  `shape`: `pill`, `tile`, `card`, `circle`, `square`. `pad`, `thickness`, `grow`, `block`,
  `justify`; `lit` a steady glow, `pulse` a pulsing one (work in progress); `bare` keeps the box
  but draws no glass (an unselected tab in a bar). A piece inside a piece rests on it.
- The stage: `paper={false}` for a transparent canvas over any surface (Composer), `variant=
  'panel'` for a framed block inside a page, `as="main"` for a whole page (AuthLayout).
- In the kit: `AuthLayout seaGlass` and `Composer seaGlass` (base-app turns both on in the
  glass skin only).

**Views and the lag fallback.** `onViewChange(view, reason)` says what is showing and why:

| View | When | What |
|---|---|---|
| `live` | the default | the animation loop |
| `still` | reduced motion, or the device lagged | one drawn frame, redrawn when the layout changes |
| `flat` | reduced transparency, forced colours, no WebGL, far too slow, another stage holds the context | no GPU; each piece paints its role fill with a soft shadow |

For the first five seconds a live stage times every frame (ignoring the first 1.5 s). A median
over 40 ms or a p90 over 70 ms stops the animation (`still`); a median over 120 ms, or fewer
than eight frames, releases the GPU (`flat`). After that a rolling 90-frame window keeps
watching and drops to `still` if the device slows down later. A fallback is remembered for a
day in `localStorage` (`ui:seaglass:verdict`), so the next load skips the laggy five seconds;
`forgetSeaGlassVerdict()` clears it. `mode` forces a view (the kit page's switch).

**One WebGL context per page.** A stage shares the guard with `AnimatedBackground` and goes
ahead of it while on screen, so the glass skin's backdrop holds its static gradient meanwhile and
takes the context back when the stage leaves. Use sea glass for a few calm surfaces (sign-in,
the composer, a showcase), never for dashboards, tables or charts.

## Sounds

Quiet interface sounds, in `src/sound/`. The kit plays them itself, so a page never calls
`playSound` for a kit component:

| Sound | Plays when |
|---|---|
| `tick` | a Checkbox changes, a SegmentedControl or Tabs value changes |
| `toggle-on`, `toggle-off` | a Switch turns on or off (`toggle-on` also confirms turning Sounds on) |
| `open`, `close` | a Sheet or Dialog (so ConfirmDialog and PromptDialog) opens or closes after mounting |
| `send` | the Composer sends a message |
| `success`, `error`, `notify` | `toast.success`, `toast.error`, `toast.info` and plain `toast()` (`notify` for both of the last two) |
| `reply`, `approval` | an app's own: base-app plays them when an assistant run finishes (`approval` if it waits for a decision) |

A `Button` plays one only if given `sound="…"`. Use `playSound(name)` yourself for an action the kit
does not own.

**The rules.** A sound answers something a person did: never hover or focus, never page load
(nothing is fetched or decoded until the first pointer or key press after sounds are on, then all
of it at once, `primeSounds()`). They are on by default and a person can turn them off:
`useSoundEnabled()` / `setSoundEnabled(on)` / `soundEnabled()` read and write one switch per device
(`localStorage` `ui-sounds`, safe when storage is blocked; the server renders it on). The engine
does nothing on the server, in a hidden tab or without Web Audio, plays one sound at most once
per 60 ms, and swallows every error. Whenever a sound would play it also dispatches a `ui:sound`
event on `window` (`detail.name`), so tests and e2e can see sounds without audio.

**Where they come from.** The eleven WAVs in `src/sound/assets/` (mono, 24 kHz, 3 to 33 kB each, levels
baked in: touches quiet, chimes louder) are rendered offline from [earshot](https://github.com/Leonxlnx/earshot)'s
sound bank (MIT; synthesised in code, no recordings) by `scripts/render-sounds.py`, which says how to run it.
Nothing in the build or at run time needs earshot or Python: the app ships the files, imported as
hashed asset URLs (`?no-inline`) so they add no JavaScript. See `THIRD_PARTY_NOTICES.md`.

## Checks

Every check runs locally; there is no CI. Run them from `apps/`, where the root config lives:

```sh
npm run check                          # biome check + oxlint (root config)
npm run typecheck --workspace @apps/ui # tsc, strict (self-contained; same options as base-app/tsconfig.base.json)
npm run test --workspace @apps/ui      # vitest + jsdom: the behaviour behind each a11y fix, and the token contrast pairs in every pass (tests/skins-tokens.test.ts, no browser)
npm run check:a11y --workspace @apps/ui  # axe-core WCAG 2.2 AA, every skin × mode
```

The package keeps no lint, format or devDependency config of its own: oxlint, biome,
typescript, vitest, jsdom and axe-core all hoist from the `apps/` root.

`check:a11y` renders `fixture/Showcase.tsx` and scans it in headless Chrome through Stagehand,
the repo's only browser tool. It runs the same axe tags as `site/e2e`, across six passes:

- enterprise, dark and light;
- glass, dark and light;
- glass, dark and light, with the backdrop at its worst point under the translucent surfaces.

Every pass also opens and scans each modal dialog. `A11Y_VERBOSE=1` lists the nodes axe leaves
as needs-review:

- text over the glass gradient, which the worst-case passes then measure;
- the aria-hidden direction arrows;
- the translucent glass dialogs over the page. Their fill is 0.92 dark and 0.90 light, over the
  scrim. When you add a component, add it to the
showcase too.

## Phone-first additions (from Furniture Friends, 2026-10-15)

Built for phone-first scan flows, tested in
`tests/phone-kit.test.tsx` (behaviour plus axe in every skin and mode):

- `BottomTabBar` (`src/nav`) and AppShell's `bottomNav` slot: the phone's navigation under 768px, fixed above the safe area,
  `aria-current="page"` plus an indicator bar, optional needs-attention dot whose words join the link's name. With it, the
  topbar drops its drawer button and `<main>` is padded. `Sidebar` groups take an optional `icon`.
- `Photo`, `PhotoCapture`, `StepList`, `FlowBar` (`src/patterns`).
- `Button size="xl"` (56px, the one primary action of a flow); md, lg and icon grow to 48px under `pointer: coarse`.
- Icons: camera, image, package, bed, gift, truck, trash, map-pin, share, undo, rotate-ccw, scan, tag, download, filter,
  copy, external-link, wifi-off, eye, eye-off (Lucide paths, ISC).

Integration round 1 (tested in `tests/touch-kit.test.tsx`):

- Touch targets under `pointer: coarse`: `Input`, `Textarea`, `NativeSelect`, `PasswordInput`, the `NumberField` box
  (and its steppers, 40px) and `Toggle` grow to 48px (sm 44px) with 16px text (iOS does not zoom a 16px field); an
  icon-only `Menu` trigger is a 48px square (24px with a mouse).
- `Card interactive`: pointer cursor, hover edge and a focus-within ring for a card that is one big tap target.
- `Sheet footerLayout="stretch"` (each button an equal share of the row) and `stickyFooter` (pinned while the body scrolls).
- `BulkActionBar sticky`: pinned above the phone tab bar (`--bottom-nav-h`) and the safe area. It must be a direct child
  of the tall page for the pin to hold all the way down the list.
- `RadioCards phoneColumns={2}`: two columns on a phone for a long list of short labels.
- `ToggleGroup wrap`: filter chips that wrap onto more rows.
- `KpiRow errorStyle="quiet"`: a failed load is one muted line, "Couldn't load ... Retry", not the alert.
- `shaders` is pinned at 4.0.2 (the newest 7-day-old release; 4.0.4 passes quarantine on 2026-10-16).

Integration round 2 (tested in `tests/phone-home.test.tsx`, `tests/touch-kit.test.tsx`, `tests/generate.test.tsx`):

- `ActionTiles` / `ActionTile` (`src/patterns`): a phone's home, a few big actions that share the screen
  between the top bar and the tab bar, on one symmetric sea glass stage. `FillHeight` (`src/components/layout`)
  is the column that measures the room left under it; `IconCircle` is the round tinted icon at a tile's head.
- `SeaGlassStage symmetric`: the pebbles are lit from straight above instead of the upper left, so a tile
  and its shadow are the same on the left as on the right (the engine takes the same option).
- `PhotoCapture galleryStyle="quiet"`: the gallery button as a text-weight link beside the camera button.
- `Topbar brand`: a node shown left of the title under 768px (the app's mark and name on a phone); from 768px
  the sidebar carries the brand. `Topbar variant="flow"` with a `leading` slot is a full-screen task's header.
- `AppShell bottomNav` takes a `BottomTabBar`; `Menu iconSize` sizes the trigger glyph of an icon-only menu.
- `KpiTile` counts a whole number up as a whole number (no "1.434" on its way to 2); charts label whole-number
  data with whole-number ticks (`niceTicks(min, max, count, integer)`), so a chart of counts never shows 0.25.
- `Card interactive`, 44px top-bar icon buttons, and `pointer: coarse` sizes on fields, toasts, checkbox and radio.
- `useGenerate` waits for 20% of the target or of the screen, whichever is less (`enoughShowing`), and a
  target is `inert` while it is hidden or half drawn, so a keyboard user cannot tab onto a button that cannot
  be seen yet.

## Phones

The app is used on phones, outdoors, by people who are not always steady with a touch screen.
The kit owns these, so a page never has to:

| Rule | Where | Proved by |
|---|---|---|
| Every control is at least 48px with `pointer: coarse` | each component's `pointer-coarse:` classes | `scripts/touch-targets.mjs`, run by `npm run check:a11y`: a Chrome that reports `pointer: coarse` at 390px measures every visible control in the showcase (a label that wraps a switch or checkbox, a stretched `::before` / `::after`, a field shell count as the target; `KNOWN_GAPS` lists, with reasons, the controls no app page uses yet) |
| Nothing grabs focus on a touch screen | `Sheet` and `Dialog` focus themselves (the title), not their first field; `useInitialFocus(ref, active)` is the page's mount-time `focus()`; `prefersTouch()` is the test | `tests/touch-focus.test.tsx` |
| Focus is never left under a bar (WCAG 2.4.11) | bars over the bottom of the screen (`BottomTabBar`, `FlowBar`, a pinned `BulkActionBar` or `SaveBar`) report their height as `--ui-bottom-inset` on `<html>` (`src/lib/bottom-inset.ts`); `components.css` turns it into `scroll-padding-bottom`, and the top bar into `scroll-padding-top`; a `Sheet` with a sticky footer pads its own scroll box | `tests/touch-focus.test.tsx`, and by hand in a 390px Chrome |
| A toast never covers the next action | `Toaster` rests above `--ui-bottom-inset`; its Dismiss button is 48px on touch | `tests/touch-focus.test.tsx` |
| A reveal starts when a screen of it shows | `useGenerate` waits for 20% of the target or of the screen, whichever is less, so a tall feed is never left at opacity 0 | `tests/generate.test.tsx` |
| A photo's corner is on a solid chip | `Photo` `corner` sits on `surface-solid`, so no picture decides the contrast of a badge, a button or a checkbox | `tests/touch-kit.test.tsx`; the showcase puts a badge, a button and a checkbox on it for axe |
