import { parseSse } from '~/core/utils';
import type {
  AcceptInviteBody,
  AcceptInviteResponse,
  AccountResponse,
  AccountSessionsResponse,
  ActionRunResponse,
  ActionsResponse,
  ActivityResponse,
  AgentApprovalPart,
  AgentConversation,
  AgentConversationResponse,
  AgentConversationsResponse,
  AgentEventConversation,
  AgentEventDone,
  AgentRunBody,
  AgentToolPart,
  AuditLogResponse,
  AvatarResponse,
  BroadcastNotificationBody,
  BroadcastNotificationResponse,
  CategoriesResponse,
  ChangePasswordBody,
  ChangePasswordResponse,
  DbPingResponse,
  EmailResponse,
  EmailsResponse,
  ForgotPasswordBody,
  ForgotPasswordResponse,
  HealthResponse,
  InviteInfoResponse,
  InviteUserBody,
  InviteUserResponse,
  JobStatus,
  JobsResponse,
  KpisResponse,
  LlmCompleteBody,
  LlmCompleteResponse,
  LlmStreamDelta,
  LlmStreamDone,
  LlmStreamError,
  LoginBody,
  LoginResponse,
  LogoutResponse,
  MarkAllReadResponse,
  MarkReadResponse,
  MeResponse,
  NotificationPreferencesResponse,
  NotificationsResponse,
  ResendInviteResponse,
  ResetPasswordBody,
  ResetPasswordResponse,
  RetryJobResponse,
  RevenueResponse,
  RevokeOtherSessionsResponse,
  RevokeSessionResponse,
  Role,
  SettingsResponse,
  SignupsResponse,
  SpendByStatusResponse,
  TestNotificationResponse,
  TransactionDetailResponse,
  TransactionsPageResponse,
  TransactionsQuery,
  TransactionsResponse,
  UnreadCountResponse,
  UpdateAccountBody,
  UpdateAccountResponse,
  UpdateNotificationPreferencesBody,
  UpdateSettingsBody,
  UpdateSettingsResponse,
  UpdateUserBody,
  UpdateUserResponse,
  UsersResponse,
  ViewAsResponse,
  ViewsResponse,
} from '../../../shared/api';
import {
  ApiError,
  apiDelete,
  apiGet,
  apiPatch,
  apiPost,
  apiPostStream,
  apiPut,
  apiPutFile,
} from './client';

/* The wire form of a table-mode query (see TransactionsQuery). Always names at
   least `page`, because any parameter is what switches the server to table mode. */
export function transactionsQueryString(params: TransactionsQuery): string {
  const sp = new URLSearchParams();
  sp.set('page', String(params.page ?? 1));
  if (params.pageSize !== undefined) sp.set('pageSize', String(params.pageSize));
  if (params.sort && params.sort.length > 0) sp.set('sort', params.sort.join(','));
  if (params.q) sp.set('q', params.q);
  if (params.status && params.status.length > 0) sp.set('status', params.status.join(','));
  if (params.category && params.category.length > 0) sp.set('category', params.category.join(','));
  if (params.from) sp.set('from', params.from);
  if (params.before) sp.set('before', params.before);
  return `?${sp.toString()}`;
}

/* The path of each GET a server render can answer ahead of the browser (a route's `prefetch`,
   app/routes.ts), relative to the API base. The `api` functions below and the pages' cache keys
   (`fromServer(apiPaths.kpis(30), …)`) both come from here, so they cannot drift apart. */
export const apiPaths = {
  me: '/auth/me',
  settings: '/settings',
  transactions: '/transactions',
  transactionsPage: (params: TransactionsQuery = {}): `/${string}` =>
    `/transactions${transactionsQueryString(params)}`,
  activity: '/activity',
  kpis: (days?: 7 | 30 | 90): `/${string}` =>
    days === undefined ? '/metrics/kpis' : `/metrics/kpis?days=${days}`,
  revenue: (days: 7 | 30 | 60 | 90 = 90, compare = false): `/${string}` =>
    `/metrics/revenue?days=${days}${compare ? '&compare=1' : ''}`,
  categories: '/metrics/categories',
} as const;

/* One function per server route. Paths are relative to config.apiBase ('/api').
   The auth level of each route is listed in shared/api.ts. */
export const api = {
  health: (): Promise<HealthResponse> => apiGet('/health'),
  dbPing: (): Promise<DbPingResponse> => apiGet('/db/ping'),

  me: (): Promise<MeResponse> => apiGet(apiPaths.me),
  login: (body: LoginBody): Promise<LoginResponse> => apiPost('/auth/login', body),
  logout: (): Promise<LogoutResponse> => apiPost('/auth/logout', {}),
  /** View the app as a role below the real one, or with null go back (signed-in users). */
  viewAs: (role: Role | null): Promise<ViewAsResponse> => apiPost('/auth/view-as', { role }),
  /** Who an invitation is for (public). 400 invalid_token for any bad, used or expired link. */
  inviteInfo: (token: string): Promise<InviteInfoResponse> =>
    apiGet(`/auth/invite/${encodeURIComponent(token)}`),
  /** Sets name and password, activates the account and signs in (public). */
  acceptInvite: (body: AcceptInviteBody): Promise<AcceptInviteResponse> =>
    apiPost('/auth/accept-invite', body),
  /** Always succeeds (202) whether or not the address has an account (public). */
  forgotPassword: (body: ForgotPasswordBody): Promise<ForgotPasswordResponse> =>
    apiPost('/auth/forgot-password', body),
  /** Sets a new password from an emailed link and signs in (public). */
  resetPassword: (body: ResetPasswordBody): Promise<ResetPasswordResponse> =>
    apiPost('/auth/reset-password', body),

  account: (): Promise<AccountResponse> => apiGet('/account'),
  updateAccount: (body: UpdateAccountBody): Promise<UpdateAccountResponse> =>
    apiPatch('/account', body),
  changePassword: (body: ChangePasswordBody): Promise<ChangePasswordResponse> =>
    apiPost('/account/password', body),
  accountSessions: (): Promise<AccountSessionsResponse> => apiGet('/account/sessions'),
  revokeSession: (id: string): Promise<RevokeSessionResponse> =>
    apiDelete(`/account/sessions/${encodeURIComponent(id)}`),
  revokeOtherSessions: (): Promise<RevokeOtherSessionsResponse> =>
    apiPost('/account/sessions/revoke-others', {}),
  /** Sends the image as the raw request body; the server checks the bytes. */
  uploadAvatar: (file: File): Promise<AvatarResponse> => apiPutFile('/account/avatar', file),
  removeAvatar: (): Promise<AvatarResponse> => apiDelete('/account/avatar'),

  transactions: (): Promise<TransactionsResponse> => apiGet(apiPaths.transactions),
  /** Table mode: one filtered, sorted page with facet counts. */
  transactionsPage: (params: TransactionsQuery = {}): Promise<TransactionsPageResponse> =>
    apiGet(apiPaths.transactionsPage(params)),
  transaction: (id: string): Promise<TransactionDetailResponse> =>
    apiGet(`/transactions/${encodeURIComponent(id)}`),
  activity: (): Promise<ActivityResponse> => apiGet(apiPaths.activity),
  /** With `days`, every figure is measured over that range against the one before it. */
  kpis: (days?: 7 | 30 | 90): Promise<KpisResponse> => apiGet(apiPaths.kpis(days)),
  /** `compare` adds `previousRevenue`: the same number of days just before. */
  revenue: (days: 7 | 30 | 60 | 90 = 90, compare = false): Promise<RevenueResponse> =>
    apiGet(apiPaths.revenue(days, compare)),
  categories: (): Promise<CategoriesResponse> => apiGet(apiPaths.categories),
  signups: (): Promise<SignupsResponse> => apiGet('/metrics/signups'),
  spendByStatus: (): Promise<SpendByStatusResponse> => apiGet('/metrics/spend-by-status'),

  users: (): Promise<UsersResponse> => apiGet('/users'),
  inviteUser: (body: InviteUserBody): Promise<InviteUserResponse> => apiPost('/users', body),
  updateUser: (id: string, body: UpdateUserBody): Promise<UpdateUserResponse> =>
    apiPatch(`/users/${encodeURIComponent(id)}`, body),
  resendInvite: (id: string): Promise<ResendInviteResponse> =>
    apiPost(`/users/${encodeURIComponent(id)}/resend-invite`, {}),
  auditLog: (): Promise<AuditLogResponse> => apiGet('/audit-log'),

  /** The settings this viewer may see (public ones, plus admin-only for an admin). */
  settings: (): Promise<SettingsResponse> => apiGet(apiPaths.settings),
  /** Admin: change some settings. 400 invalid_setting names the key in the message. */
  updateSettings: (body: UpdateSettingsBody): Promise<UpdateSettingsResponse> =>
    apiPut('/settings', body),

  /** Admin: the outbox, newest first. */
  emails: (page = 1, pageSize = 25): Promise<EmailsResponse> =>
    apiGet(`/admin/emails?page=${page}&pageSize=${pageSize}`),
  email: (id: string): Promise<EmailResponse> => apiGet(`/admin/emails/${encodeURIComponent(id)}`),
  /** Admin: the job queue, newest first, optionally one status. */
  jobs: (
    params: { status?: JobStatus; page?: number; pageSize?: number } = {},
  ): Promise<JobsResponse> => {
    const sp = new URLSearchParams();
    if (params.status) sp.set('status', params.status);
    sp.set('page', String(params.page ?? 1));
    sp.set('pageSize', String(params.pageSize ?? 25));
    return apiGet(`/admin/jobs?${sp.toString()}`);
  },
  retryJob: (id: string): Promise<RetryJobResponse> =>
    apiPost(`/admin/jobs/${encodeURIComponent(id)}/retry`, {}),
  /** The caller's notifications, newest first. `cursor` is the previous page's `nextCursor`. */
  notifications: (
    query: { cursor?: string | null; unreadOnly?: boolean; limit?: number } = {},
  ): Promise<NotificationsResponse> => {
    const sp = new URLSearchParams();
    if (query.cursor) sp.set('cursor', query.cursor);
    if (query.unreadOnly) sp.set('unread', '1');
    if (query.limit !== undefined) sp.set('limit', String(query.limit));
    const qs = sp.toString();
    return apiGet(`/notifications${qs ? `?${qs}` : ''}`);
  },
  unreadCount: (): Promise<UnreadCountResponse> => apiGet('/notifications/unread-count'),
  markNotificationRead: (id: string): Promise<MarkReadResponse> =>
    apiPost(`/notifications/${encodeURIComponent(id)}/read`, {}),
  markAllNotificationsRead: (): Promise<MarkAllReadResponse> =>
    apiPost('/notifications/read-all', {}),
  notificationPreferences: (): Promise<NotificationPreferencesResponse> =>
    apiGet('/notifications/preferences'),
  saveNotificationPreferences: (
    body: UpdateNotificationPreferencesBody,
  ): Promise<NotificationPreferencesResponse> => apiPut('/notifications/preferences', body),
  /** Admin: a test notification to yourself. */
  sendTestNotification: (): Promise<TestNotificationResponse> =>
    apiPost('/admin/notifications/test', {}),
  /** Admin: a system notification to every active user. */
  broadcastNotification: (
    body: BroadcastNotificationBody,
  ): Promise<BroadcastNotificationResponse> => apiPost('/admin/notifications/broadcast', body),

  /** `signal` lets the caller stop a reply it no longer wants (the server then drops the paid call). */
  llmComplete: (
    body: LlmCompleteBody,
    init?: { signal?: AbortSignal },
  ): Promise<LlmCompleteResponse> => apiPost('/llm/complete', body, init),
  /** The same call answered as it is written: `onDelta` gets each piece of text, the promise
      resolves with the closing `done` event. A failure is an ApiError (`error` events carry the
      server's code, e.g. llm_not_configured). Aborting `signal` rejects with the abort error. */
  llmStream: (body: LlmCompleteBody, handlers: LlmStreamHandlers): Promise<LlmStreamDone> =>
    streamLlm(body, handlers),

  /** One assistant run (a message, or the answer to an approval). The handlers get the chat,
      the reply text, tool chips and approval cards as they happen; the promise resolves with
      `done` (whose `pending` says it stopped for an approval). Failures as llmStream. */
  agentStream: (body: AgentRunBody, handlers: AgentStreamHandlers): Promise<AgentEventDone> =>
    streamAgent(body, handlers),
  /** The caller's saved chats, newest first. */
  conversations: (): Promise<AgentConversationsResponse> => apiGet('/agent/conversations'),
  conversation: (id: string): Promise<AgentConversationResponse> =>
    apiGet(`/agent/conversations/${encodeURIComponent(id)}`),
  renameConversation: (
    id: string,
    title: string,
  ): Promise<{ ok: true; conversation: AgentConversation }> =>
    apiPatch(`/agent/conversations/${encodeURIComponent(id)}`, { title }),
  deleteConversation: (id: string): Promise<{ ok: true }> =>
    apiDelete(`/agent/conversations/${encodeURIComponent(id)}`),
  /** The actions the caller may run (the assistant gets the same list as tools). */
  actions: (): Promise<ActionsResponse> => apiGet('/actions'),
  /** Runs one action as the caller; the server checks the role and the input. */
  runAction: (name: string, input: unknown): Promise<ActionRunResponse> =>
    apiPost(`/actions/${encodeURIComponent(name)}`, { input }),
  /** The caller's saved views, each drawn fresh from the database. */
  views: (): Promise<ViewsResponse> => apiGet('/views'),
};

export interface AgentStreamHandlers {
  onConversation?: (c: AgentEventConversation) => void;
  onDelta?: (text: string) => void;
  onTool?: (part: AgentToolPart) => void;
  onApproval?: (part: AgentApprovalPart) => void;
  signal?: AbortSignal;
}

async function streamAgent(
  body: AgentRunBody,
  handlers: AgentStreamHandlers,
): Promise<AgentEventDone> {
  const { signal } = handlers;
  const stream = await apiPostStream('/agent/stream', body, signal ? { signal } : undefined);
  let done: AgentEventDone | undefined;
  try {
    for await (const event of parseSse(stream)) {
      const data = parseData(event.data);
      if (event.event === 'conversation') {
        handlers.onConversation?.(data as AgentEventConversation);
      } else if (event.event === 'delta') {
        const { text } = data as { text?: unknown };
        if (typeof text === 'string' && text !== '') handlers.onDelta?.(text);
      } else if (event.event === 'tool') {
        handlers.onTool?.(data as AgentToolPart);
      } else if (event.event === 'approval') {
        handlers.onApproval?.(data as AgentApprovalPart);
      } else if (event.event === 'done') {
        done = data as AgentEventDone;
      } else if (event.event === 'error') {
        const failure = data as Partial<LlmStreamError>;
        throw new ApiError(
          502,
          typeof failure.code === 'string' ? failure.code : 'stream_error',
          typeof failure.message === 'string' ? failure.message : 'The reply failed.',
        );
      }
    }
  } catch (err) {
    if (err instanceof ApiError || signal?.aborted) throw err;
    throw new ApiError(0, 'network', 'The connection dropped while the reply was arriving.');
  }
  if (!done) {
    throw new ApiError(0, 'stream_ended', 'The connection closed before the reply finished.');
  }
  return done;
}

export interface LlmStreamHandlers {
  onDelta: (text: string) => void;
  signal?: AbortSignal;
}

async function streamLlm(
  body: LlmCompleteBody,
  handlers: LlmStreamHandlers,
): Promise<LlmStreamDone> {
  const { signal, onDelta } = handlers;
  const stream = await apiPostStream('/llm/stream', body, signal ? { signal } : undefined);
  let done: LlmStreamDone | undefined;
  try {
    for await (const event of parseSse(stream)) {
      const data = parseData(event.data);
      if (event.event === 'delta') {
        const { text } = data as Partial<LlmStreamDelta>;
        if (typeof text === 'string' && text !== '') onDelta(text);
      } else if (event.event === 'done') {
        done = data as LlmStreamDone;
      } else if (event.event === 'error') {
        const failure = data as Partial<LlmStreamError>;
        throw new ApiError(
          502,
          typeof failure.code === 'string' ? failure.code : 'stream_error',
          typeof failure.message === 'string' ? failure.message : 'The reply failed.',
        );
      }
    }
  } catch (err) {
    if (err instanceof ApiError || signal?.aborted) throw err;
    throw new ApiError(0, 'network', 'The connection dropped while the reply was arriving.');
  }
  if (!done) {
    throw new ApiError(0, 'stream_ended', 'The connection closed before the reply finished.');
  }
  return done;
}

function parseData(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
