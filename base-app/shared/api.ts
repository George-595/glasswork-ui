/* The wire contract between src/ (client) and server/. Type-only: this file
   imports nothing and emits nothing (server/shared-boundary.test.ts enforces it).
   Change it and both sides must follow.

   Auth levels (enforced on the server, mirrored by the client's guards):
     public — GET /api/health, POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me,
              GET /api/auth/invite/:token, POST /api/auth/accept-invite,
              POST /api/auth/forgot-password, POST /api/auth/reset-password
     user   — any signed-in user: POST /api/auth/view-as (held to the REAL role by the service), transactions (+ /:id), activity, metrics/*, llm/complete, llm/stream,
              GET /api/settings (the public settings), notifications (+ unread-count, :id/read,
              read-all, preferences), events (the SSE stream), account (GET/PATCH /api/account,
              POST /api/account/password, GET/DELETE /api/account/sessions[/:id],
              POST /api/account/sessions/revoke-others, PUT/DELETE /api/account/avatar),
              GET /api/files/:id
     admin  — role 'admin' only: users (+ PATCH /:id, POST /:id/resend-invite), audit-log, db/ping,
              PUT /api/settings, admin/emails (+ /:id), admin/jobs (+ POST /:id/retry),
              admin/notifications/test, admin/notifications/broadcast
   401 { code: 'unauthenticated' } when no valid session; 403 { code: 'forbidden' } when the
   role is too low. A 500 carries an errorId that matches the server's log line. */

// ---- envelope ----
export type ApiErrorBody = {
  ok: false;
  error: {
    code: string;
    message: string;
    errorId?: string;
    /** Facts the client can use to recover (what was looked for, the quantity now held). */
    details?: Record<string, unknown>;
  };
};

// ---- platform ----
export type HealthResponse = { ok: true; service: 'base-app-api'; uptimeSec: number; time: string };
export type DbPingResponse = {
  ok: true;
  driver: 'sqlite' | 'postgres' | 'mysql';
  latencyMs: number;
};

// ---- auth ----
export type Role = 'admin' | 'editor' | 'viewer';
export type SessionUser = {
  id: string;
  name: string;
  email: string;
  /** The EFFECTIVE role: the lower role this session views as, else the account's own. Every
      role check, on the server and in the client, reads this one. */
  role: Role;
  /** The account's own role (View as). Absent in fixtures: then it is `role`. */
  realRole?: Role;
  /** The role in force; the same as `role`. Absent in fixtures. */
  effectiveRole?: Role;
  /** The lower role this session views as, or null (View as). Absent in fixtures. */
  actingRole?: Role | null;
  /** `/api/files/<id>` while the user has a picture, null without one. Absent in fixtures. */
  avatarUrl?: string | null;
};
/** POST /api/auth/view-as { role }: view the app as a role below your real one, or with null go
    back. Open to any signed-in person: the server holds it to the REAL role (403
    `forbidden_role`), so a viewer can only ever send null. Returns the person as the session now
    sees them (`role` is the effective role). Audited under the real person's id. */
export type ViewAsBody = { role: Role | null };
export type ViewAsResponse = { ok: true; user: SessionUser };
/** POST /api/auth/login. Sets the httpOnly session cookie. 401 invalid_credentials on failure. */
export type LoginBody = { email: string; password: string };
export type LoginResponse = { ok: true; user: SessionUser };
/** Development only (a production server never sends it): who to sign in as. `password` is
    the fixed, public dev credential when it is in use, or null when ADMIN_PASSWORD in
    apps/base-app/.env overrides it (that value is never sent). */
export type DevSignInHint = { adminEmail: string; password: string | null };
/** GET /api/auth/me. `user` is null when signed out (still 200). */
export type MeResponse = { ok: true; user: SessionUser | null; devSignIn?: DevSignInHint };
/** POST /api/auth/logout. Clears the cookie; always 200. */
export type LogoutResponse = { ok: true };

// ---- sign-in flows (public) ----
/** GET /api/auth/invite/:token. Who an invitation is for, so the page can greet them. Spends
    nothing. 400 `invalid_token` ("This link is invalid or has expired.") for an unknown,
    used, expired or revoked token: the cases are not told apart. */
export type InviteInfoResponse = { ok: true; invite: { name: string; email: string } };
/** POST /api/auth/accept-invite. Sets the name and password, activates the account, spends the
    token and signs the person in (the session cookie is set). 400 `invalid_token`, or a
    password-policy code (`password_too_short`, `password_too_long`, `password_common`,
    `password_repeated`, `password_contains_email`; `field: password`) or `invalid_name`. */
export type AcceptInviteBody = { token: string; name: string; password: string };
export type AcceptInviteResponse = { ok: true; user: SessionUser };
/** POST /api/auth/forgot-password. ALWAYS 202 with this body, whether or not the email has an
    account; only an active account is sent a link. 429 when the email or the address asks too
    often (the same for every email). */
export type ForgotPasswordBody = { email: string };
export type ForgotPasswordResponse = { ok: true };
/** POST /api/auth/reset-password. Sets the password, spends the token, signs out every other
    session and signs the person in fresh (cookie set). Errors as for accept-invite. */
export type ResetPasswordBody = { token: string; password: string };
export type ResetPasswordResponse = { ok: true; user: SessionUser };

// ---- account (the signed-in user, about themself only) ----
export type AccountProfile = {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl: string | null;
};
/** GET /api/account (user). */
export type AccountResponse = { ok: true; account: AccountProfile };
/** PATCH /api/account (user). Name only (1 to 200 characters). 400 `invalid_name`. */
export type UpdateAccountBody = { name: string };
export type UpdateAccountResponse = { ok: true; account: AccountProfile };
/** POST /api/account/password (user). 400 `incorrect_password` (field `currentPassword`),
    `password_unchanged` or a password-policy code (field `newPassword`); 429 after repeated
    wrong current passwords. Signs out every OTHER session; this one stays signed in. */
export type ChangePasswordBody = { currentPassword: string; newPassword: string };
export type ChangePasswordResponse = { ok: true };
/** One sign-in. The token hash never leaves the server. */
export type AccountSession = {
  id: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  /** The session this request was made with. */
  current: boolean;
};
/** GET /api/account/sessions (user). Live sessions only, newest first. */
export type AccountSessionsResponse = { ok: true; sessions: AccountSession[] };
/** DELETE /api/account/sessions/:id (user). 404 `session_not_found` unless it is the caller's own, live session. */
export type RevokeSessionResponse = { ok: true };
/** POST /api/account/sessions/revoke-others (user). `revoked` is how many were ended. */
export type RevokeOtherSessionsResponse = { ok: true; revoked: number };
/** PUT /api/account/avatar (user). The body is the raw image (Content-Type png, jpeg or webp;
    the bytes must really be that type); at most 2 MB. 413 `file_too_large`, 415
    `unsupported_image`, 400 `empty_body`. DELETE removes the picture. */
export type AvatarResponse = { ok: true; avatarUrl: string | null };

// ---- domain records ----
export type UserStatus = 'active' | 'invited' | 'suspended';
export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: UserStatus;
  team: string;
  createdAt: string;
  lastActiveAt: string;
  /** `/api/files/<id>` while the user has a picture, null without one. Absent in fixtures. */
  avatarUrl?: string | null;
};

export type Category = 'Software' | 'Hardware' | 'Services' | 'Travel' | 'Office';
export type TransactionStatus = 'paid' | 'pending' | 'failed' | 'refunded';
export type Transaction = {
  id: string;
  date: string /* ISO timestamp */;
  customer: string;
  description: string;
  category: Category;
  amountMinor: number;
  currency: 'GBP';
  status: TransactionStatus;
};

export type MetricPoint = { date: string /* YYYY-MM-DD */; value: number };
export type Kpi = {
  id: 'revenue' | 'active-users' | 'conversion' | 'open-tickets';
  label: string;
  value: number;
  previous: number;
  unit: 'money' | 'count' | 'percent';
  trend: readonly number[] /* 12 points for the sparkline */;
};

export type AuditAction =
  | 'login'
  | 'logout'
  | 'user.invite'
  | 'user.resend_invite'
  | 'user.accept_invite'
  | 'user.role'
  | 'user.suspend'
  | 'user.reactivate'
  | 'job.retry'
  | 'settings.update'
  | 'notification.broadcast'
  | 'password.forgot'
  | 'password.reset'
  | 'password.change'
  | 'session.revoke'
  | 'profile.update'
  | 'file.upload'
  | 'file.delete'
  | 'export'
  | 'view_as.start'
  | 'view_as.end';
export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: AuditAction;
  target: string;
  ip: string;
  outcome: 'success' | 'failure';
};

export type ActivityItem = {
  id: string;
  at: string;
  actor: string;
  summary: string;
  kind: 'payment' | 'signup' | 'ticket' | 'deploy';
};

export type LabelValue = { label: string; value: number };

// ---- data routes ----
/** GET /api/transactions (user) with no query. Everything, newest first. */
export type TransactionsResponse = { ok: true; transactions: Transaction[] };

/** The columns GET /api/transactions can sort by (a whitelist; the SQL never sees raw input). */
export type TransactionSortKey =
  | 'date'
  | 'customer'
  | 'description'
  | 'category'
  | 'amount'
  | 'status';

/** The query of GET /api/transactions in table mode. Any one of these switches it on.
    Wire form: `?page=2&pageSize=25&sort=-date,customer&q=acme&status=paid,failed&category=Travel`
    (`status` and `category` may be repeated or comma-separated; a `-` prefix on a sort key
    means descending). Defaults: page 1, pageSize 25, sort `-date`. Ties break on id. */
export type TransactionsQuery = {
  page?: number;
  pageSize?: number;
  /** Keys in order, each optionally `-` prefixed, e.g. ['-date', 'customer']. */
  sort?: readonly string[];
  /** Case-insensitive match on customer or description. */
  q?: string;
  status?: readonly TransactionStatus[];
  category?: readonly Category[];
  /** Only transactions at or after this instant (an ISO 8601 timestamp or date). */
  from?: string;
  /** Only transactions strictly before this instant: the end of the last day wanted. */
  before?: string;
};
/** How many rows each value would give under the other filters (a facet's own filter is
    left out, so ticking "paid" does not zero "failed"). Every known value is present. */
export type TransactionFacets = {
  status: Record<TransactionStatus, number>;
  category: Record<Category, number>;
};
/** GET /api/transactions in table mode. `total` counts every row matching all filters. */
export type TransactionsPageResponse = {
  ok: true;
  transactions: Transaction[];
  total: number;
  page: number;
  pageSize: number;
  facets: TransactionFacets;
};
/** GET /api/transactions/:id (user). 404 `transaction_not_found`. `related` is the same
    customer's other transactions, newest first (at most 5); `relatedCount` is all of them. */
export type TransactionDetailResponse = {
  ok: true;
  transaction: Transaction;
  relatedCount: number;
  related: Transaction[];
};
/** GET /api/activity (user). Newest first, 8 items. */
export type ActivityResponse = { ok: true; activity: ActivityItem[] };
/** GET /api/metrics/kpis (user). With `?days=7|30|90` every figure is measured over that
    range against the same length before it (see server/services/kpi-range.ts); without it,
    the stored 30-day figures. */
export type KpisResponse = { ok: true; kpis: Kpi[] };
/** GET /api/metrics/revenue?days=7|30|60|90 (user). Values in pence, oldest first. With
    `&compare=1`, `previousRevenue` is the revenue of the same number of days just before
    (oldest first; shorter, or empty, when the stored history does not reach back that far). */
export type RevenueResponse = {
  ok: true;
  revenue: MetricPoint[];
  costs: MetricPoint[];
  previousRevenue?: MetricPoint[];
};
/** GET /api/metrics/categories (user). Sum of amountMinor per category (SQL GROUP BY). */
export type CategoriesResponse = { ok: true; categories: LabelValue[] };
/** GET /api/metrics/signups (user). 12 months, oldest first, label like "Oct 25". */
export type SignupsResponse = { ok: true; signups: LabelValue[] };
/** GET /api/metrics/spend-by-status (user). Spend per category, split by transaction status
    (SQL GROUP BY category, status). One entry per status, each with every category in the
    order of `categories`, zero where there is none. */
export type SpendByStatusResponse = {
  ok: true;
  breakdown: { status: TransactionStatus; data: LabelValue[] }[];
};
/** GET /api/users (admin). */
export type UsersResponse = { ok: true; users: User[] };
/** POST /api/users (admin). Creates an invited user (no password). 409 email_taken. */
export type InviteUserBody = { name: string; email: string; role: Role; sendWelcome: boolean };
export type InviteUserResponse = { ok: true; user: User };
/** PATCH /api/users/:id (admin). Send `role`, `status` or both. `status` may only be
    'suspended' (from active or invited) or 'active' (a suspended user coming back: it
    lands on 'invited' instead when the person never set a password). An admin cannot change
    their own role or suspend themself (409 cannot_modify_self) and the last active admin
    cannot be demoted or suspended (409 last_admin). 404 user_not_found, 400 invalid_*. */
export type UpdateUserBody = { role?: Role; status?: 'active' | 'suspended' };
export type UpdateUserResponse = { ok: true; user: User };
/** POST /api/users/:id/resend-invite (admin). Only for status 'invited' (409 not_invited). */
export type ResendInviteResponse = { ok: true; user: User };
/** GET /api/audit-log (admin). Newest first. */
export type AuditLogResponse = { ok: true; events: AuditEvent[] };

// ---- settings and maintenance ----
/** Every server-side setting and the type of its value. `visibility` (public: every signed-in
    user; admin: admins only) is in the server's registry (services/settings.ts). */
export type SettingsValues = {
  'workspace.name': string;
  'maintenance.enabled': boolean;
  'maintenance.message': string;
};
export type SettingKey = keyof SettingsValues;
/** GET /api/settings (user). The public settings; an admin also gets the admin-only ones.
    Every key the caller may see is present (the default when never set). */
export type SettingsResponse = { ok: true; settings: Partial<SettingsValues> };
/** PUT /api/settings (admin). Send the keys to change; others are untouched. 400
    `invalid_setting` (unknown key or a bad value; `field` is the key) . Audited as
    `settings.update`, and published to every signed-in user as the `settings` realtime event
    (its data is the same `settings` object). */
export type UpdateSettingsBody = Partial<SettingsValues>;
export type UpdateSettingsResponse = { ok: true; settings: Partial<SettingsValues> };
/** While `maintenance.enabled` is on, every /api request from a non-admin except /api/auth/*,
    /api/settings and /api/health answers 503 with this code. */
export type MaintenanceErrorCode = 'maintenance';

// ---- mail and jobs (admin) ----
export type EmailStatus = 'queued' | 'sent' | 'failed';
export type EmailSummary = {
  id: string;
  to: string;
  subject: string;
  template: string;
  status: EmailStatus;
  /** The transport that was configured when it was queued ('log' | 'resend'). */
  provider: string;
  createdAt: string;
  sentAt: string | null;
};
export type EmailDetail = EmailSummary & {
  /** The plain-text body, links included. The HTML part is never sent over the wire. */
  bodyText: string;
  providerMessageId: string | null;
  /** Why it failed (safe text: a status and the provider's error name). */
  error: string | null;
};
/** GET /api/admin/emails?page=1&pageSize=25 (admin). Newest first. */
export type EmailsResponse = {
  ok: true;
  emails: EmailSummary[];
  total: number;
  page: number;
  pageSize: number;
};
/** GET /api/admin/emails/:id (admin). 404 `email_not_found`. */
export type EmailResponse = { ok: true; email: EmailDetail };

export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';
export type JobSummary = {
  id: string;
  kind: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  /** The last error text of a failed attempt (server-side text, admins only). */
  lastError: string | null;
  dedupeKey: string | null;
  createdAt: string;
  updatedAt: string;
};
/** GET /api/admin/jobs?status=failed&page=1&pageSize=25 (admin). Newest run time first;
    `counts` is every status's total, whatever the filter. */
export type JobsResponse = {
  ok: true;
  jobs: JobSummary[];
  total: number;
  page: number;
  pageSize: number;
  counts: Record<JobStatus, number>;
};
/** POST /api/admin/jobs/:id/retry (admin). Only a failed or dead job (409 `job_not_retryable`);
    404 `job_not_found`. Audited as `job.retry`. */
export type RetryJobResponse = { ok: true; job: JobSummary };

// ---- llm ----
export type WireLlmProvider = 'anthropic' | 'gemini';
export type WireLlmMessage = { role: 'user' | 'assistant'; content: string };
export type LlmCompleteBody = {
  provider?: WireLlmProvider;
  system?: string;
  prompt?: string;
  messages?: WireLlmMessage[];
  maxTokens?: number;
};
export type LlmCompleteResponse = {
  ok: true;
  text: string;
  provider: WireLlmProvider;
  model: string;
  stopReason: string;
};

/** POST /api/llm/stream (user). Same body and limits as /api/llm/complete; the answer is a
    server-sent event stream (`text/event-stream`), not JSON: any number of `delta` events,
    then exactly one `done` or `error`. Failures before the stream starts (bad body 400, not
    signed in 401, rate limit 429) are the ordinary JSON error envelope. Each event's `data`
    is one line of JSON. */
export type LlmStreamBody = LlmCompleteBody;
/** `event: delta` — the next piece of the reply, to append. */
export type LlmStreamDelta = { text: string };
/** `event: done` — the reply is complete. */
export type LlmStreamDone = {
  provider: WireLlmProvider;
  model: string;
  stopReason?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};
/** `event: error` — the reply failed (possibly after some deltas). `code` is one of
    llm_not_configured, refusal, timeout, upstream_error, internal_error; `message` is safe to
    show (never provider text); `errorId` matches the server log line. */
export type LlmStreamError = { code: string; message: string; errorId: string };

// ---- the agent: actions, visuals, saved chats and saved views ----
/** How a visual's numbers read. `gbp` values are pounds (not pence). */
export type ValueFormat = 'gbp' | 'number' | 'percent';
export type VisualSeries = { name: string; points: { x: string; y: number }[] };
/** What the assistant can show in a chat (and pin as a saved view), drawn with kit components. */
export type AgentVisual =
  | {
      kind: 'chart';
      chart: 'line' | 'area' | 'bar' | 'donut';
      title: string;
      description?: string;
      format: ValueFormat;
      series: VisualSeries[];
    }
  | {
      kind: 'kpis';
      title?: string;
      tiles: {
        label: string;
        value: number;
        format: ValueFormat;
        change?: number;
        hint?: string;
      }[];
    }
  | {
      kind: 'table';
      title: string;
      description?: string;
      columns: { key: string; label: string; format?: ValueFormat | 'text' | 'date' }[];
      rows: Record<string, string | number | null>[];
    }
  | {
      kind: 'diagram';
      title: string;
      description?: string;
      direction: 'right' | 'down';
      nodes: { id: string; label: string; detail?: string }[];
      edges: { from: string; to: string; label?: string }[];
    }
  | { kind: 'link'; label: string; path: string; description?: string };
/** The show_* actions whose input can be saved as a view. */
export type VisualTool = 'show_chart' | 'show_kpis' | 'show_table' | 'show_diagram';

/** What the person is looking at, sent with a message so "this one" means something. */
export type AgentContext = {
  path: string;
  title?: string;
  selection?: { kind: string; id: string; label?: string };
};
export type AgentRunBody = {
  /** Omit to start a new conversation. */
  conversationId?: string;
  message?: string;
  /** The answer to a pending approval (instead of, or before, a message). */
  decision?: { callId: string; approve: boolean };
  context?: AgentContext;
  provider?: WireLlmProvider;
};
export type AgentToolStatus = 'running' | 'done' | 'failed' | 'denied';
export type AgentToolPart = {
  type: 'tool';
  callId: string;
  name: string;
  /** The action's human name ("Search transactions"). */
  title: string;
  status: AgentToolStatus;
  summary?: string;
  visual?: AgentVisual;
  /** For a show_* tool: its input, which "Pin to Views" saves as the view's spec. */
  input?: Record<string, unknown>;
};
export type AgentApprovalPart = {
  type: 'approval';
  callId: string;
  name: string;
  title: string;
  description?: string;
  details: { term: string; detail: string }[];
  destructive: boolean;
  decision?: 'approved' | 'denied';
};
export type AgentPart = { type: 'text'; text: string } | AgentToolPart | AgentApprovalPart;
export type AgentMessage = {
  id: string;
  from: 'user' | 'assistant';
  at: string;
  parts: AgentPart[];
  model?: string;
  /** The person pressed Stop while this reply was arriving. */
  stopped?: boolean;
};
export type AgentConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** An action is waiting for the person's approval. */
  pending: boolean;
};
/* The agent's server-sent events, in order: `conversation` once, then any mix of `delta`
   (reply text), `tool` (an action started or finished) and `approval` (an action that waits
   for the person), then one `done` or `error`. */
export type AgentEventConversation = { id: string; title: string };
export type AgentEventDelta = { text: string };
export type AgentEventDone = {
  model?: string;
  usage: { inputTokens: number; outputTokens: number };
  /** The run stopped to wait for an approval. */
  pending: boolean;
};
export type AgentConversationsResponse = { ok: true; conversations: AgentConversation[] };
export type AgentConversationResponse = {
  ok: true;
  conversation: AgentConversation;
  messages: AgentMessage[];
};
export type RenameConversationBody = { title: string };
export type AgentActionInfo = {
  name: string;
  title: string;
  description: string;
  effect: 'read' | 'visual' | 'write';
  confirm: boolean;
};
export type ActionsResponse = { ok: true; actions: AgentActionInfo[] };
export type ActionRunBody = { input: unknown };
export type ActionRunResponse = {
  ok: true;
  result: unknown;
  summary?: string;
  visual?: AgentVisual;
};
export type SavedView = {
  id: string;
  title: string;
  tool: VisualTool;
  createdAt: string;
  /** Drawn from the database as it is now; null when the view could not be drawn. */
  visual: AgentVisual | null;
  error?: string;
};
export type ViewsResponse = { ok: true; views: SavedView[] };

// ---- notifications and the realtime stream ----
/** The kinds of notification. A user chooses per kind whether it reaches them in the app and by email. */
export type NotificationKind = 'account' | 'security' | 'team' | 'system';
export type Notification = {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string | null;
  /** An in-app path ("/admin/users"), or null. */
  link: string | null;
  createdAt: string;
  /** Null = unread. */
  readAt: string | null;
};
/** GET /api/notifications (user). Newest first, only the caller's. `?unread=1` keeps the unread ones;
    `?cursor=` is the previous page's `nextCursor` (keyset pagination on (created_at, id), so
    nothing is skipped or repeated when new ones arrive); `?limit=` 1..50, default 20.
    `nextCursor` is null on the last page. 400 invalid_cursor / invalid_limit. */
export type NotificationsResponse = {
  ok: true;
  notifications: Notification[];
  nextCursor: string | null;
};
/** GET /api/notifications/unread-count (user). */
export type UnreadCountResponse = { ok: true; unreadCount: number };
/** POST /api/notifications/:id/read (user). Idempotent. 404 notification_not_found for an id that
    is not the caller's (another user's id looks the same as a missing one). */
export type MarkReadResponse = { ok: true; unreadCount: number };
/** POST /api/notifications/read-all (user). `marked` is how many were unread. */
export type MarkAllReadResponse = { ok: true; marked: number; unreadCount: number };
export type NotificationPreference = {
  kind: NotificationKind;
  label: string;
  description: string;
  inApp: boolean;
  email: boolean;
  /** True when in-app cannot be turned off (security). */
  inAppLocked: boolean;
};
/** GET /api/notifications/preferences (user): every kind, with defaults filled in. */
export type NotificationPreferencesResponse = { ok: true; preferences: NotificationPreference[] };
/** PUT /api/notifications/preferences (user). Any subset of kinds. 400 invalid_preferences,
    400 preference_locked (security in-app off). Answers with the full list. */
export type UpdateNotificationPreferencesBody = {
  preferences: { kind: NotificationKind; inApp: boolean; email: boolean }[];
};
/** POST /api/admin/notifications/test (admin): a system notification to the caller. */
export type TestNotificationResponse = { ok: true };
/** POST /api/admin/notifications/broadcast (admin): a system notification to every active user. Audited. */
export type BroadcastNotificationBody = { title: string; body?: string };
export type BroadcastNotificationResponse = { ok: true; recipients: number };

/** GET /api/events (user): a server-sent event stream (text/event-stream), the browser's EventSource.
    Events (each `data` is one line of JSON; `id` counts up within a server process):
    - `ready` {time}: the stream is open.
    - `notification` {notification, unreadCount}: a new in-app notification for the caller.
    - `notifications.read` {unreadCount}: the caller read some elsewhere (another tab).
    Nothing is replayed after a reconnect: the client refetches what it shows. */
export type RealtimeReady = { time: string };
export type RealtimeNotification = { notification: Notification; unreadCount: number };
export type RealtimeNotificationsRead = { unreadCount: number };
