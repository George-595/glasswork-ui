import type { DbExecutor } from '../infra/db/types.ts';
import { agentRepository, savedViewsRepository } from './agent.ts';
import { appSettingsRepository } from './app-settings.ts';
import { authTokensRepository } from './auth-tokens.ts';
import { filesRepository } from './files.ts';
import { jobsRepository } from './jobs.ts';
import { metricsRepository } from './metrics.ts';
import { notificationsRepository } from './notifications.ts';
import { outboundEmailsRepository } from './outbound-emails.ts';
import { activityRepository, auditRepository, transactionsRepository } from './records.ts';
import { sessionsRepository } from './sessions.ts';
import { usersRepository } from './users.ts';

/* Every repository over one executor (the client, or a transaction's tx). */
export function createRepositories(db: DbExecutor) {
  return {
    users: usersRepository(db),
    sessions: sessionsRepository(db),
    authTokens: authTokensRepository(db),
    transactions: transactionsRepository(db),
    audit: auditRepository(db),
    activity: activityRepository(db),
    metrics: metricsRepository(db),
    notifications: notificationsRepository(db),
    jobs: jobsRepository(db),
    outboundEmails: outboundEmailsRepository(db),
    appSettings: appSettingsRepository(db),
    files: filesRepository(db),
    agent: agentRepository(db),
    savedViews: savedViewsRepository(db),
  };
}
export type Repositories = ReturnType<typeof createRepositories>;
