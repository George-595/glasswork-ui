# src/pages

One folder per page. A page is the content of one route; the shell in `src/app/` decides which
one shows.

- Folder name = route id (`home`, `table`, `admin/users`). Its `index.ts` is exactly
  `export { default } from './XPage';`.
- Every page renders through `<Page title=…>` from `~/core/ui`, which owns the single `<h1>`.
- **May import:** `~/core/*` (UI from `~/core/ui`, routing from `~/core/router`, formatting from
  `~/core/utils`, API from `~/core/api`) and `~/data/fake`.
- **Never imports:** `app/`, another page, `@apps/ui` directly, or anything under `server/`.
- **Imported by:** `src/app/routes.ts` through lazy `import()`. The one exception is a page's `query.ts` (or similar): a small module with no components that builds the
  API call the page makes first, which the route's `prefetch` imports so a server render asks for exactly what the page will (ENGINEERING §15).
- Pages render on a server too: no `window`, `document` or storage while rendering; see ENGINEERING §15.
- Each page ships with a test next to it and is covered by the shell's axe gate in
  `src/app/a11y.test.tsx`.

The signed-out pages (`accept-invite`, `forgot-password`, `reset-password`; `PUBLIC_ROUTES`) render through
`AuthScreen`, not `Page`, and have no shell. `account` is a normal signed-in page in the `account` route group.

What the two dashboard pages are made of (so a new page can copy the pattern):

- **`home`**: a greeting (the clock is a `now` prop, so tests fix it) and a 7/30/90-day
  `SegmentedControl` that drives the KPIs and the revenue chart; `KpiTile` row; revenue and
  spend in `ChartCard`s (revenue has a dashed "previous period" line); a recent-activity feed
  (a real list; "View all" and the invite action are admin-only); quick actions. A
  `ShaderAccent` glows behind the greeting in the glass skin only.
- **`graphs`**: the same `KpiTile` row; every chart in a `ChartCard` (the card owns the
  loading, error and "Show data table" states): revenue as an area chart with its own range
  control (30/60/90, one fetch per range), sign-ups, spend by category (horizontal bars),
  spend by category stacked by status (`/api/metrics/spend-by-status`) and the donut share.
- **`assistant`**: `/assistant`, a chat with `POST /api/llm/complete` built from the kit's AI primitives. Replies are plain
  text; a 503 `llm_not_configured` shows how to set a key and "Show example conversation" renders a fixed sample (see its README).
- **`maintenance`**: the "We'll be back soon" page a non-admin gets while maintenance mode is on (rendered by `App`, no shell).
- **`notifications`**: `/notifications`, tabs Inbox and Preferences (`?tab=preferences`). The inbox is the kit's
  `NotificationList` grouped by day with an All/Unread filter, "Load more" along the server's cursor, mark one or all
  read, live additions from the event stream and, for admins, "Send me a test". Preferences is one card per kind
  with an in-app and an email `Switch`, a `SaveBar` for the draft, and the security in-app switch locked on.
- Chart cards use `ChartCard`'s own `loading`/`error`/`empty` props; KPI rows and feeds use
  `QueryView`.
