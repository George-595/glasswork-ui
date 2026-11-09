# pages/admin

The admin area: five routes, all in the `admin` route group (the sidebar's second section).
Each one is a dense, table-or-form page built from the kit, with its changes made through real
admin-only endpoints, never local state alone.

- `users/`: **Users.** The kit `ListPage` over `useDataTable`: a search over name and email,
  Role and Status filters with counts, removable chips, a column picker and Export CSV. The name
  cell is an `Avatar` over name and email; clicking a row opens a `DetailSheet` with the user's fields and the
  same Change role / Suspend / Reactivate actions (none for yourself). Row actions (the kit `Menu`, "Actions for …"):
  - *Change role…* opens `ChangeRoleDialog` (the roles as `RadioCards`, each saying what it can do; the server's refusal is shown in the dialog);
  - *Suspend* asks first with `ConfirmDialog`; *Reactivate* and *Resend invite* run at once;
  - the signed-in admin's own row has no actions, because the server refuses them anyway.

  Rows can be selected; the bulk bar's *Suspend selected* confirms, skips users who are already
  suspended and yourself, and reports how many were done. All of it goes through
  `PATCH /api/users/:id` and `POST /api/users/:id/resend-invite` (`api.updateUser`,
  `api.resendInvite`), answers with `toast()`, and patches the page's copy of the list at once
  before a quiet re-fetch, so the filters, sort and page survive. *Invite user* (`InviteUserDialog`, the role chosen with `RadioCards`)
  keeps its validation and its 409 `email_taken` handling; success is a toast and the new user is
  put first.
- `audit-log/`: **Audit log.** One `ListPage` of events, newest first, 25 to a page; a row (its "Open …"
  button) opens a `DetailSheet` with a `DescriptionList` of the record and its raw JSON in a focusable
  `Code block`. The filters sit above the table: search (actor, action, target, IP), a *Date range*
  `DateRangePicker` (quick ranges Today / Last 7, 30 and 90 days, or two days on the calendar; "Clear" is all time;
  UK days, counting today, measured from when the page opened; it narrows the rows before the table sees them,
  so the facet counts follow it), Actor / Action / Outcome with counts, chips
  and Clear all. *Export CSV* writes the filtered events with every field. `logic.ts` still holds the pure part
  (day keys, the picker's quick ranges and `inDayRange`, filters, counts, grouping) and has its own tests; the page
  uses `AUDIT_RANGE_PRESETS`, `inDayRange` and `dayKey` from it.
- `mail/`: **Mail**, the outbox. A `ListPage` in the table's server (manual) mode: `GET /api/admin/emails` pages it, newest
  first. A row opens a `DetailSheet` with the fields and the email's plain-text body, whose links are clickable
  (`LinkedText`, new tab): in development (`MAIL_TRANSPORT=log`) this is the mailbox where an invite or reset
  link is followed. The HTML part never reaches the browser. In production it is the audit of what was sent.
- `jobs/`: **Jobs**, the queue. A `KpiRow` of counts by status, a status `SegmentedControl` (the server filters),
  a server-paged `ListPage`. A failed or dead job has **Retry** in its row menu and drawer
  (`POST /api/admin/jobs/:id/retry`, audited); payloads are never shown.
- `settings/`: **Settings**, in sections with a nav on the left (the kit's `SettingsLayout` and `SettingsSection`; a native select below 1024px). *General* (workspace name,
  maintenance mode), *Appearance* (the skin as two `ChoiceCard`s with a `SkinPreview`, colour mode as
  Light / Dark / System, and the glass backdrop as a `ChoiceCard` per scene from `BACKDROPS` and
  `PRESET_LABELS`; the cards are radio groups) and *Connections* (database ping and an LLM prompt, through
  `api` and `useApiAction`: the provider is a `RadioGroup`, the response length a `NumberField`, and the answer
  has a `CopyButton`).
  - Nothing is applied while you choose: the page keeps only the fields you touched (`edits`) next to
    the saved values, and the kit's `SaveBar` ("N unsaved settings · Discard · Save changes")
    appears while they differ. Save validates, sends the server-side fields in one `PUT /api/settings`
    (the workspace name, maintenance mode and its message, through `useSettings().save`; a refusal is shown
    on the field, anything else as a toast, and nothing local changes), then sets the skin, mode and backdrop
    through `useAppTheme()` / `useBackdrop()`, remembers "System" in `localStorage` (`admin-settings`), and toasts.
    "System" is resolved to light or dark at save time and remembered as System.
  - `useUnsavedGuard` asks before data is lost: `beforeunload` for closing or reloading the tab, and
    a capturing click listener for links to other pages of the app (`<a href="#/…">`, which is how
    the sidebar and user menu navigate), answered with a `ConfirmDialog`. It does **not** catch the
    browser's Back and Forward buttons or a script setting `location.hash`; the shell is untouched.

Data loads through `useApiQuery`: a `SkeletonTable` inside `LoadingRegion` while loading, `ErrorState`
with Retry on failure. Each folder's `index.ts` is `export { default } from './XPage';`. Pages import
only `~/core/ui`, `~/core/api`, `~/core/auth`, `~/core/hooks`, `~/core/utils` and their own folder, and
render through `<Page>`. They never import `~/data/fake` or `fixtures/`; tests may.

`toast()` needs a `<Toaster />` mounted once above the pages (the shell does that; the page tests
mount their own). Settings change the skin and mode through `useAppTheme()`, so `ThemeProvider` must
sit above them, and Users reads the signed-in admin from `useAuth()`, so `AuthProvider` does too.
Secrets never reach this folder: the LLM hint names environment variables, never values.

Tests sit beside each page: behaviour tests with `mockApi({ routes })` (Users keeps a tiny stateful
fake so a re-fetch agrees with a change), axe in all four skin × mode passes and again with each
dialog, menu or expanded row open.
