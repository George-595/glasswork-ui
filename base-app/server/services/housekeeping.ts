import type { DbClient } from '../infra/db/types.ts';
import { type Logger, silentLogger } from '../infra/log/logger.ts';
import { createRepositories } from '../repositories/index.ts';
import { defineJob, type JobDefinition, type JobsService } from './jobs.ts';

/* The scheduled jobs that keep the tables small. Each is a no-payload job on a schedule (the
   scheduler's time-bucketed dedupe key means several instances run it once per interval).

   | job                  | every | does                                                     |
   | sweep_sessions       | 1h    | deletes expired sessions (replaced main.ts's setInterval) |
   | sweep_auth_tokens    | 1h    | deletes used and expired invite / reset tokens           |
   | prune_notifications  | 1d    | deletes READ notifications older than 90 days            |
   | prune_jobs           | 1d    | deletes finished jobs older than 14 days                 |
   | prune_emails         | 1d    | deletes outbound_emails older than 30 days               |
   | prune_audit_events   | 1d    | deletes security audit events older than 365 days        |

   The audit log is kept a year: far longer than any rate limit that reads it, and short enough
   that the admin page, which pages it, never has an ever-growing table behind it.

   `prune_jobs` is also the retention of job dedupe keys: a key is free again 14 days after its
   job last changed. An unread notification is never pruned. */

const DAY_MS = 86_400_000;
export const RETENTION = {
  notificationsDays: 90,
  jobsDays: 14,
  emailsDays: 30,
  auditDays: 365,
} as const;

export interface HousekeepingOptions {
  now?: () => Date;
  log?: Logger;
}

export function registerHousekeeping(
  jobs: JobsService,
  db: DbClient,
  opts: HousekeepingOptions = {},
): JobDefinition<undefined>[] {
  const now = opts.now ?? (() => new Date());
  const log = opts.log ?? silentLogger;
  const repos = createRepositories(db);
  const ago = (days: number): Date => new Date(now().getTime() - days * DAY_MS);

  const make = (
    kind: string,
    every: string,
    work: () => Promise<number>,
  ): JobDefinition<undefined> => {
    const def = defineJob<undefined>({
      kind,
      maxAttempts: 3,
      parse: () => undefined,
      run: async () => {
        const removed = await work();
        if (removed > 0) log.info('housekeeping', { job: kind, removed });
      },
    });
    jobs.register(def);
    jobs.schedule({ name: kind, every, job: def });
    return def;
  };

  return [
    make('sweep_sessions', '1h', () => repos.sessions.deleteExpired(now())),
    make('sweep_auth_tokens', '1h', () => repos.authTokens.deleteSpentOrExpired(now())),
    make('prune_notifications', '1d', () =>
      repos.notifications.deleteReadBefore(ago(RETENTION.notificationsDays)),
    ),
    make('prune_jobs', '1d', () => repos.jobs.deleteFinishedBefore(ago(RETENTION.jobsDays))),
    make('prune_emails', '1d', () =>
      repos.outboundEmails.deleteCreatedBefore(ago(RETENTION.emailsDays)),
    ),
    make('prune_audit_events', '1d', () =>
      repos.audit.deleteOccurredBefore(ago(RETENTION.auditDays)),
    ),
  ];
}
