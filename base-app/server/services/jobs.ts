import type {
  AuditEvent,
  JobStatus,
  JobSummary,
  JobsResponse,
  SessionUser,
} from '../../shared/api.ts';
import type { DbClient, DbExecutor } from '../infra/db/types.ts';
import { type Logger, silentLogger } from '../infra/log/logger.ts';
import { newId } from '../lib/ids.ts';
import { createRepositories } from '../repositories/index.ts';
import type { JobRecord } from '../repositories/jobs.ts';
import { ServiceError } from './errors.ts';

/* The job queue: durable background work in the application's own database.

   WRITING. `enqueue(tx, kind, payload, opts)` inserts a `jobs` row through the caller's
   transaction, so a job exists if and only if the change that wanted it committed (the
   transactional outbox: an email is never sent for a rolled-back invite, and never lost for a
   committed one). `dedupeKey` makes a second enqueue with the same key a no-op; it returns
   false then. The key is unique for as long as the row lives, which is the retention below.

   RUNNING. A runner polls (default every second; an enqueue in this process wakes it after a
   beat, which is after the caller's commit on every driver). Each tick it (1) returns jobs a
   crashed process left `running` past the lease to the queue, (2) asks which jobs are due,
   (3) claims each with one atomic UPDATE (so any number of processes can run this and a job
   still runs once at a time), and (4) runs the registered handler with a timeout. Success marks
   it `succeeded`. A thrown error records `last_error` and reschedules with exponential backoff
   and jitter, up to `maxAttempts` (`dead` after that; an admin can retry it). A
   PermanentJobError, an unknown kind or an unparseable payload ends it as `failed` at once:
   trying again cannot help. Delivery is at least once, so handlers must be idempotent.

   SCHEDULING. `schedule({ name, every, job })` enqueues a recurring job. The dedupe key holds
   the time bucket (`schedule:<name>:<bucket>`), so several instances ticking in the same
   bucket enqueue it once between them.

   RETENTION. Succeeded, failed and dead jobs are deleted 14 days after they last changed (a
   scheduled job, services/housekeeping.ts). That is also how long a dedupe key blocks a repeat
   of itself; scheduler keys carry their bucket, so they never collide with an old one.

   Time and randomness are injected (`now`, `random`) so tests drive a fake clock. */

export const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_POLL_MS = 1_000;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_LEASE_MS = 5 * 60_000;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_WAKE_DELAY_MS = 25;
const BACKOFF_BASE_MS = 10_000;
const BACKOFF_CAP_MS = 60 * 60_000;
const RECOVER_EVERY_MS = 30_000;
const MAX_ERROR_CHARS = 1_000;

/** Throw this from a handler when trying again cannot help (a bad address, a missing row). */
export class PermanentJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PermanentJobError';
  }
}

export interface JobContext {
  jobId: string;
  kind: string;
  /** 1 for the first run. */
  attempt: number;
  maxAttempts: number;
  /** Aborted when the handler's timeout passes. */
  signal: AbortSignal;
  now: () => Date;
}

export interface JobDefinition<P> {
  kind: string;
  /** Turns the stored JSON into the handler's typed payload; throws if it is malformed. */
  parse: (raw: unknown) => P;
  run: (payload: P, ctx: JobContext) => Promise<void>;
  /** Called once when the queue ends the job for good (`failed` or `dead`), however that
      happened: a thrown error, a timeout on the last attempt, or a worker that kept dying. The
      place to move whatever the job was looking after into its own final state. Its errors are
      logged, never thrown. Not called for a payload that will not parse. */
  onGiveUp?: (payload: P, error: string) => Promise<void>;
  maxAttempts?: number;
  timeoutMs?: number;
}

/** Declares a job kind with a typed payload; pass the result to `register` and `enqueueJob`. */
export function defineJob<P>(def: JobDefinition<P>): JobDefinition<P> {
  return def;
}

export interface EnqueueOptions {
  /** Not before this time. Default: now. */
  runAt?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
}

export interface ScheduledJob {
  /** Names the schedule; part of the dedupe key. */
  name: string;
  /** '30s', '5m', '1h', '1d'. */
  every: string;
  job: JobDefinition<undefined>;
}

export interface JobsOptions {
  now?: () => Date;
  /** In [0, 1). Default Math.random. */
  random?: () => number;
  workerId?: string;
  pollMs?: number;
  concurrency?: number;
  /** A job `running` for longer than this is taken to belong to a crashed process. */
  leaseMs?: number;
  /** Default handler timeout; a definition can set its own. Keep it under `leaseMs`. */
  timeoutMs?: number;
  /** After an in-process enqueue, how long to wait before polling. */
  wakeDelayMs?: number;
  log?: Logger;
}

const UNITS: Record<string, number> = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 };

/** '90s' | '5m' | '1h' | '1d' as milliseconds. */
export function parseEvery(every: string): number {
  const m = /^(\d{1,6})([smhd])$/.exec(every);
  const ms = m ? Number(m[1]) * (UNITS[m[2] ?? ''] ?? 0) : 0;
  if (ms < 1_000)
    throw new Error(`Invalid schedule interval "${every}" (use e.g. 30s, 5m, 1h, 1d).`);
  return ms;
}

/** The delay before attempt N+1 after attempt N failed: base * 2^(N-1), capped, with "equal
    jitter" (half fixed, half random) so a burst of failures does not retry in lockstep. */
export function backoffMs(attempt: number, random: () => number): number {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** Math.max(0, attempt - 1));
  return Math.round(ceiling / 2 + (ceiling / 2) * random());
}

const toSummary = (j: JobRecord): JobSummary => ({
  id: j.id,
  kind: j.kind,
  status: j.status,
  attempts: j.attempts,
  maxAttempts: j.maxAttempts,
  runAt: j.runAt,
  lastError: j.lastError,
  dedupeKey: j.dedupeKey,
  createdAt: j.createdAt,
  updatedAt: j.updatedAt,
});

const message = (err: unknown): string =>
  (err instanceof Error ? err.message : 'Non-Error thrown').slice(0, MAX_ERROR_CHARS);

export function createJobsService(db: DbClient, opts: JobsOptions = {}) {
  const now = opts.now ?? (() => new Date());
  const random = opts.random ?? Math.random;
  const workerId = opts.workerId ?? `worker-${newId().slice(-12)}`;
  const pollMs = opts.pollMs ?? DEFAULT_POLL_MS;
  const concurrency = opts.concurrency ?? DEFAULT_CONCURRENCY;
  const leaseMs = opts.leaseMs ?? DEFAULT_LEASE_MS;
  const defaultTimeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const wakeDelayMs = opts.wakeDelayMs ?? DEFAULT_WAKE_DELAY_MS;
  const log = opts.log ?? silentLogger;
  const repos = createRepositories(db);

  const handlers = new Map<string, JobDefinition<unknown>>();
  const schedules: { name: string; everyMs: number; job: JobDefinition<undefined> }[] = [];
  const scheduledBucket = new Map<string, number>();
  const inflight = new Set<Promise<void>>();
  let started = false;
  let stopping = false;
  let ticking = false;
  let again = false;
  let lastRecover = Number.NEGATIVE_INFINITY;
  let pollTimer: NodeJS.Timeout | undefined;
  let wakeTimer: NodeJS.Timeout | undefined;

  /* This worker's lease ran out and the job went back to the queue (and maybe to another
     worker) before the outcome was written: the row belongs to that newer run now. */
  function lostLease(job: JobRecord): void {
    log.warn('job outcome dropped: its lease had run out', {
      jobId: job.id,
      kind: job.kind,
      attempt: job.attempts,
    });
  }

  async function gaveUp(job: JobRecord, error: string): Promise<void> {
    const def = handlers.get(job.kind);
    if (!def?.onGiveUp) return;
    let payload: unknown;
    try {
      payload = def.parse(JSON.parse(job.payload));
    } catch {
      return; // nothing typed to hand over
    }
    try {
      await def.onGiveUp(payload, error);
    } catch (err) {
      log.error('a job’s give-up hook failed', {
        jobId: job.id,
        kind: job.kind,
        error: message(err),
      });
    }
  }

  async function finish(job: JobRecord, error: unknown, permanent: boolean): Promise<void> {
    const at = now();
    const text = message(error);
    const lease = { workerId, attempt: job.attempts };
    if (permanent) {
      if (!(await repos.jobs.fail(job.id, lease, text, 'failed', at))) return lostLease(job);
      log.warn('job failed permanently', { jobId: job.id, kind: job.kind, error: text });
      await gaveUp(job, text);
    } else if (job.attempts >= job.maxAttempts) {
      if (!(await repos.jobs.fail(job.id, lease, text, 'dead', at))) return lostLease(job);
      log.error('job is dead', {
        jobId: job.id,
        kind: job.kind,
        attempts: job.attempts,
        error: text,
      });
      await gaveUp(job, text);
    } else {
      const delay = backoffMs(job.attempts, random);
      if (!(await repos.jobs.requeue(job.id, lease, text, new Date(at.getTime() + delay), at)))
        return lostLease(job);
      log.warn('job failed, will retry', {
        jobId: job.id,
        kind: job.kind,
        attempt: job.attempts,
        retryInMs: delay,
        error: text,
      });
    }
  }

  async function execute(id: string): Promise<void> {
    const job = await repos.jobs.byId(id);
    if (!job) return;
    const def = handlers.get(job.kind);
    if (!def) {
      await finish(job, new Error(`No handler is registered for "${job.kind}".`), true);
      return;
    }
    // A lease that expired is counted as an attempt; a job that keeps killing its worker stops.
    if (job.attempts > job.maxAttempts) {
      await finish(job, new Error('Gave up: the worker running it kept dying.'), false);
      return;
    }
    let payload: unknown;
    try {
      payload = def.parse(JSON.parse(job.payload));
    } catch (err) {
      await finish(job, new Error(`Invalid payload: ${message(err)}`), true);
      return;
    }
    const timeoutMs = def.timeoutMs ?? defaultTimeoutMs;
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timedOut = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        const err = new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s.`);
        controller.abort(err);
        reject(err);
      }, timeoutMs);
    });
    try {
      await Promise.race([
        def.run(payload, {
          jobId: job.id,
          kind: job.kind,
          attempt: job.attempts,
          maxAttempts: job.maxAttempts,
          signal: controller.signal,
          now,
        }),
        timedOut,
      ]);
      if (!(await repos.jobs.complete(job.id, { workerId, attempt: job.attempts }, now())))
        lostLease(job);
    } catch (err) {
      await finish(job, err, err instanceof PermanentJobError);
    } finally {
      clearTimeout(timer);
    }
  }

  function launch(id: string): void {
    const p: Promise<void> = execute(id)
      .catch((err: unknown) => {
        // The database failed while recording the outcome. The row stays `running` and the
        // lease brings it back; there is nothing better to do than say so.
        log.error('could not record a job result', { jobId: id, error: message(err) });
      })
      .finally(() => {
        inflight.delete(p);
        if (started && !stopping) wake();
      });
    inflight.add(p);
  }

  async function enqueueSchedules(): Promise<void> {
    const at = now();
    for (const s of schedules) {
      const bucket = Math.floor(at.getTime() / s.everyMs);
      if (scheduledBucket.get(s.name) === bucket) continue;
      // Every instance computes the same key for the same bucket; the unique index lets one win.
      await repos.jobs.enqueue({
        id: newId(),
        kind: s.job.kind,
        payload: '{}',
        runAt: at,
        maxAttempts: s.job.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
        dedupeKey: `schedule:${s.name}:${bucket}`,
        now: at,
      });
      scheduledBucket.set(s.name, bucket);
    }
  }

  async function tickOnce(): Promise<number> {
    const at = now();
    if (at.getTime() - lastRecover >= RECOVER_EVERY_MS) {
      lastRecover = at.getTime();
      const released = await repos.jobs.releaseStale(new Date(at.getTime() - leaseMs), at);
      if (released > 0) log.warn('returned jobs from a lost worker to the queue', { released });
    }
    await enqueueSchedules();
    const free = concurrency - inflight.size;
    if (free <= 0) return 0;
    let startedNow = 0;
    for (const id of await repos.jobs.dueIds(now(), free)) {
      if (stopping) break; // stop() was called mid-pass: claim nothing more
      if (await repos.jobs.claim(id, workerId, now())) {
        launch(id);
        startedNow += 1;
      }
    }
    return startedNow;
  }

  /** One polling pass: recover, schedule, claim what is due and start it. Resolves when the
      jobs are STARTED (use `idle()` to wait for them to finish). Returns how many it started.
      Overlapping calls are folded into one more pass. */
  async function tick(): Promise<number> {
    if (stopping) return 0;
    if (ticking) {
      again = true;
      return 0;
    }
    ticking = true;
    let total = 0;
    try {
      do {
        again = false;
        total += await tickOnce();
      } while (again && !stopping);
    } finally {
      ticking = false;
    }
    return total;
  }

  function wake(): void {
    if (!started || stopping || wakeTimer) return;
    wakeTimer = setTimeout(() => {
      wakeTimer = undefined;
      void tick().catch((err: unknown) => log.warn('job poll failed', { error: message(err) }));
    }, wakeDelayMs);
    wakeTimer.unref();
  }

  function schedulePoll(): void {
    if (!started || stopping) return;
    pollTimer = setTimeout(() => {
      tick()
        .catch((err: unknown) => log.warn('job poll failed', { error: message(err) }))
        .finally(schedulePoll);
    }, pollMs);
    pollTimer.unref();
  }

  /** Adds a job inside the caller's transaction. Returns false when `dedupeKey` already
      exists (nothing was added). */
  async function enqueue(
    tx: DbExecutor,
    kind: string,
    payload: unknown,
    options: EnqueueOptions = {},
  ): Promise<boolean> {
    const at = now();
    const def = handlers.get(kind);
    const added = await createRepositories(tx).jobs.enqueue({
      id: newId(),
      kind,
      payload: JSON.stringify(payload ?? {}),
      runAt: options.runAt ?? at,
      maxAttempts: options.maxAttempts ?? def?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
      dedupeKey: options.dedupeKey ?? null,
      now: at,
    });
    if (added) wake();
    return added;
  }

  async function idle(): Promise<void> {
    while (inflight.size > 0) await Promise.allSettled(inflight);
  }

  return {
    /** Registers the handler for a kind. One handler per kind. */
    register<P>(def: JobDefinition<P>): void {
      if (handlers.has(def.kind))
        throw new Error(`A handler for "${def.kind}" is already registered.`);
      handlers.set(def.kind, def as JobDefinition<unknown>);
    },

    enqueue,

    /** `enqueue` with the payload type checked against the definition. */
    enqueueJob<P>(
      tx: DbExecutor,
      def: JobDefinition<P>,
      payload: P,
      options: EnqueueOptions = {},
    ): Promise<boolean> {
      return enqueue(tx, def.kind, payload, {
        ...(def.maxAttempts !== undefined ? { maxAttempts: def.maxAttempts } : {}),
        ...options,
      });
    },

    /** Declares a recurring job (a no-payload definition). Call before `start`. */
    schedule(entry: ScheduledJob): void {
      if (schedules.some((s) => s.name === entry.name)) {
        throw new Error(`A schedule named "${entry.name}" already exists.`);
      }
      schedules.push({ name: entry.name, everyMs: parseEvery(entry.every), job: entry.job });
    },

    tick,
    idle,

    /** Starts polling. Safe to call once. */
    start(): void {
      if (started) return;
      started = true;
      stopping = false;
      void tick().catch((err: unknown) => log.warn('job poll failed', { error: message(err) }));
      schedulePoll();
    },

    /** Stops claiming and waits up to `graceMs` for running jobs to finish. A job still
        running after that stays `running` and is returned to the queue by the lease. */
    async stop(graceMs = 10_000): Promise<{ abandoned: number }> {
      stopping = true;
      clearTimeout(pollTimer);
      clearTimeout(wakeTimer);
      wakeTimer = undefined;
      let timer: NodeJS.Timeout | undefined;
      const grace = new Promise<void>((resolve) => {
        timer = setTimeout(resolve, graceMs);
      });
      await Promise.race([idle(), grace]);
      clearTimeout(timer);
      started = false;
      return { abandoned: inflight.size };
    },

    // ---- the admin Jobs page ----

    async list(
      query: { status?: string; page?: number; pageSize?: number } = {},
    ): Promise<Omit<JobsResponse, 'ok'>> {
      const status = query.status;
      const valid: readonly string[] = ['queued', 'running', 'succeeded', 'failed', 'dead'];
      if (status !== undefined && !valid.includes(status)) {
        throw new ServiceError(
          'invalid',
          'invalid_status',
          `Unknown status "${status.slice(0, 20)}".`,
          'status',
        );
      }
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 25;
      if (!Number.isInteger(page) || page < 1 || page > 100_000) {
        throw new ServiceError(
          'invalid',
          'invalid_page',
          '"page" must be a whole number from 1.',
          'page',
        );
      }
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new ServiceError(
          'invalid',
          'invalid_page_size',
          '"pageSize" must be 1 to 100.',
          'pageSize',
        );
      }
      const counts = await repos.jobs.countByStatus();
      const total = status
        ? counts[status as JobStatus]
        : Object.values(counts).reduce((a, b) => a + b, 0);
      const rows = await repos.jobs.page({
        ...(status ? { status: status as JobStatus } : {}),
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      return { jobs: rows.map(toSummary), total, page, pageSize, counts };
    },

    /** Puts a failed or dead job back in the queue for a fresh set of attempts. Audited. */
    async retry(id: string, actor: SessionUser, ip: string): Promise<JobSummary> {
      const job = await db.transaction(async (tx) => {
        const r = createRepositories(tx);
        const existing = await r.jobs.byId(id);
        if (!existing) throw new ServiceError('not_found', 'job_not_found', 'No such job.');
        const at = now();
        if (!(await r.jobs.retry(id, at))) {
          throw new ServiceError(
            'conflict',
            'job_not_retryable',
            'Only a failed or dead job can be retried.',
          );
        }
        await r.audit.insert({
          id: newId(),
          at: at.toISOString(),
          actorUserId: actor.id,
          actor: actor.name,
          action: 'job.retry' satisfies AuditEvent['action'],
          target: `${existing.kind} ${existing.id}`,
          ip,
          outcome: 'success',
        });
        return await r.jobs.byId(id);
      });
      wake();
      if (!job) throw new ServiceError('not_found', 'job_not_found', 'No such job.');
      return toSummary(job);
    },
  };
}
export type JobsService = ReturnType<typeof createJobsService>;
