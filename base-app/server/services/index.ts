import { withAfterCommit } from '../infra/db/after-commit.ts';
import type { DbClient } from '../infra/db/types.ts';
import type { LlmClient, LlmProvider } from '../infra/llm/types.ts';
import { type Logger, silentLogger } from '../infra/log/logger.ts';
import { createLogTransport } from '../infra/mail/log.ts';
import type { MailTransport } from '../infra/mail/types.ts';
import type { FileStorage } from '../infra/storage/index.ts';
import { createAccountService } from './account.ts';
import { createActions } from './actions/catalog.ts';
import { createActionRegistry } from './actions/define.ts';
import { createAgentService } from './agent.ts';
import { createAuthService } from './auth.ts';
import { type CredentialsDeps, createCredentialsService } from './credentials.ts';
import { createDataService } from './data.ts';
import { createEventsService, createRealtimeHub, type EventBus } from './events.ts';
import { createFilesService } from './files.ts';
import { registerHousekeeping } from './housekeeping.ts';
import { createJobsService, type JobsOptions } from './jobs.ts';
import { createLlmService } from './llm.ts';
import { createNotificationsService } from './notifications.ts';
import { createOutbox } from './outbox.ts';
import type { Notifier, Outbox, StreamDisconnector } from './platform-deps.ts';
import { createSettingsService, type Publish } from './settings.ts';
import { createTokenService } from './tokens.ts';
import { createViewsService } from './views.ts';

export { LlmError, type LlmMessage, type LlmProvider } from '../infra/llm/types.ts';
export { ServiceError, type ServiceErrorKind } from './errors.ts';
export type { RealtimeHub } from './events.ts';
export { AVATAR_MAX_BYTES, IMAGE_TYPES } from './files.ts';
export type { EmailMessage, EmailTemplate } from './outbox.ts';
export { hashPassword, verifyPassword } from './passwords.ts';
export type { Notifier, Outbox, StreamDisconnector } from './platform-deps.ts';
export { type SeedReport, seedIfEmpty } from './seed.ts';
export type { Publish } from './settings.ts';

/* Every service over one database and one LLM factory. main.ts builds this
   once; the routes close over it.

   The database is wrapped once here so every service's db.transaction() supports
   afterCommit(tx, hook) (infra/db/after-commit.ts). The platform services are built first and
   handed to the ones that use them: the outbox (mail, queued as a job in the caller's
   transaction), the notifier (in-app notifications, pushed after commit) and the realtime hub
   (live events; a service that ends a session closes its streams through it). `wrap` lets a
   test observe or replace those three collaborators without rebuilding the graph. */
export function createServices(deps: {
  db: DbClient;
  sessionTtlHours: number;
  llm: { defaultProvider: LlmProvider; getClient: (provider: LlmProvider) => LlmClient };
  /** Where uploaded bytes go (the local disk in main.ts). */
  storage: FileStorage;
  /** Email: the transport, the From header and the base URL links are built on. Without it
      (tests) mail goes to a log transport that writes nothing. */
  mail?: { transport: MailTransport; from: string; appBaseUrl: string };
  /** Overrides where settings events go; by default they ride the realtime hub. */
  publish?: Publish;
  /** Job runner knobs (poll interval, concurrency, lease...) and the clock. */
  jobs?: JobsOptions;
  log?: Logger;
  /** Tests: observe or replace the outbox, the notifier and the stream disconnector. */
  wrap?: {
    outbox?: (real: Outbox) => Outbox;
    notifier?: (real: Notifier) => Notifier;
    streams?: (real: StreamDisconnector) => StreamDisconnector;
  };
  /** The transport between server processes; the in-memory bus when omitted. */
  eventBus?: EventBus;
  /** Where hub and after-commit hook failures go. */
  onError?: (err: unknown) => void;
  /** Streams per user and how often open streams re-check their session (tests turn these down). */
  realtime?: { maxConnectionsPerUser?: number; revalidateMs?: number };
  /** Tests only: the forgot-password floor and the credential rate limits. */
  credentialTuning?: Pick<CredentialsDeps, 'forgotMinMs' | 'limits' | 'sleep'>;
}) {
  const log = deps.log ?? silentLogger;
  const onError = deps.onError ?? (() => {});
  const db = withAfterCommit(deps.db, onError);
  const mail = deps.mail ?? {
    transport: createLogTransport(silentLogger),
    from: 'Base app <no-reply@localhost>',
    appBaseUrl: 'http://localhost:5173',
  };
  const appBaseUrl = mail.appBaseUrl;
  const now = deps.jobs?.now ? { now: deps.jobs.now } : {};

  const realtime = createRealtimeHub({
    ...(deps.eventBus ? { bus: deps.eventBus } : {}),
    ...deps.realtime,
    onError,
  });
  const publish: Publish =
    deps.publish ??
    ((target, event, data) =>
      target === '*' ? realtime.broadcast(event, data) : realtime.publish(target, event, data));

  const settings = createSettingsService(db, { publish, ...now });
  const jobs = createJobsService(db, { log, ...deps.jobs });
  registerHousekeeping(jobs, db, { log, ...now });
  const realOutbox = createOutbox(db, {
    jobs,
    transport: mail.transport,
    from: mail.from,
    appBaseUrl,
    workspaceName: (tx) => settings.workspaceName(tx),
    ...now,
  });
  const outbox = deps.wrap?.outbox?.(realOutbox) ?? realOutbox;
  const notifications = createNotificationsService(db, { publisher: realtime, outbox, appBaseUrl });
  const notifier = deps.wrap?.notifier?.(notifications) ?? notifications;
  const streams = deps.wrap?.streams?.(realtime) ?? realtime;

  const tokens = createTokenService();
  const auth = createAuthService(db, {
    sessionTtlHours: deps.sessionTtlHours,
    notifier,
    onViewAs: (sessionId, role, actingRole) => realtime.setSessionRole(sessionId, role, actingRole),
  });
  const data = createDataService(db, { notifier, realtime, tokens, appBaseUrl, outbox, streams });
  const views = createViewsService(db, {
    data,
    publish: (userId, event, payload) => realtime.publish(userId, event, payload),
    ...now,
  });
  const actions = createActionRegistry(createActions({ data, views }));
  const llm = createLlmService(deps.llm);
  const agent = createAgentService({ db, llm, actions });
  return {
    auth,
    data,
    views,
    actions,
    llm,
    agent,
    credentials: createCredentialsService({
      db,
      tokens,
      startSession: auth.startSession,
      appBaseUrl,
      outbox,
      notifier,
      streams,
      ...deps.credentialTuning,
    }),
    account: createAccountService({ db, outbox, notifier, streams }),
    files: createFilesService(db, { storage: deps.storage }),
    settings,
    jobs,
    outbox: realOutbox,
    notifications,
    realtime,
    events: createEventsService(db, {
      hub: realtime,
      authenticate: (token) => auth.authenticate(token),
    }),
  };
}
export type Services = ReturnType<typeof createServices>;
