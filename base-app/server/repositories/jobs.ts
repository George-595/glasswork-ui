import type { DbExecutor } from '../infra/db/types.ts';

/* SQL for the job queue. A worker's loop is: dueIds -> claim (atomic) -> run -> complete /
   requeue / fail. The retry policy, backoff and what a job does are the service's.

   `claim` is the whole concurrency story: one UPDATE that only matches a row still 'queued',
   so of two workers racing for the same id exactly one sees rowsAffected = 1. That is true
   on SQLite, Postgres and MySQL alike (MySQL reports matched rows, not changed rows).

   The lifecycle, and the only writes that move a job:

     queued ──claim──▶ running ──complete──▶ succeeded
                        │ ──requeue──▶ queued
                        │ ──fail──▶ failed | dead ──retry──▶ queued
                        └─(lease ran out) releaseStale──▶ queued

   Every write out of `running` is guarded by the lease that claimed it (the worker and the
   attempt number): a worker whose lease ran out, and whose job another worker has since
   claimed, gets false back and changes nothing, so a late answer never overwrites a newer run. */
export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';

export interface JobRecord {
  id: string;
  kind: string;
  /** JSON text, as stored. */
  payload: string;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  runAt: string;
  lockedAt: string | null;
  lockedBy: string | null;
  lastError: string | null;
  dedupeKey: string | null;
  createdAt: string;
  updatedAt: string;
}

type JobRow = {
  id: string;
  kind: string;
  payload: string;
  status: string;
  attempts: number | string;
  max_attempts: number | string;
  run_at: string;
  locked_at: string | null;
  locked_by: string | null;
  last_error: string | null;
  dedupe_key: string | null;
  created_at: string;
  updated_at: string;
};

const COLUMNS =
  'id, kind, payload, status, attempts, max_attempts, run_at, locked_at, locked_by, last_error, dedupe_key, created_at, updated_at';

const toJob = (r: JobRow): JobRecord => ({
  id: r.id,
  kind: r.kind,
  payload: r.payload,
  status: r.status as JobStatus,
  attempts: Number(r.attempts),
  maxAttempts: Number(r.max_attempts),
  runAt: r.run_at,
  lockedAt: r.locked_at,
  lockedBy: r.locked_by,
  lastError: r.last_error,
  dedupeKey: r.dedupe_key,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

/** Who holds a running job: the worker that claimed it and the attempt it claimed. */
export interface Lease {
  workerId: string;
  attempt: number;
}

const HELD = `WHERE id = ? AND status = 'running' AND locked_by = ? AND attempts = ?`;

export interface NewJob {
  id: string;
  kind: string;
  payload: string;
  runAt: Date;
  maxAttempts: number;
  /** Two jobs with the same key never both exist: the second enqueue is ignored. */
  dedupeKey?: string | null;
  now: Date;
}

export function jobsRepository(db: DbExecutor) {
  return {
    /** Adds a job. With a dedupe key that already exists, nothing is written and it returns
        false (never throws, and does not poison a Postgres transaction). */
    async enqueue(j: NewJob): Promise<boolean> {
      const key = j.dedupeKey ?? null;
      // The conflict clause is the one place the dialects differ. Each ignores ONLY a clash
      // on a unique key, never other errors (which `INSERT OR IGNORE` / `INSERT IGNORE` would hide).
      const onConflict =
        key === null
          ? ''
          : db.driver === 'mysql'
            ? ' ON DUPLICATE KEY UPDATE dedupe_key = dedupe_key'
            : ' ON CONFLICT (dedupe_key) DO NOTHING';
      await db.execute(
        `INSERT INTO jobs
           (id, kind, payload, status, attempts, max_attempts, run_at, dedupe_key, created_at, updated_at)
         VALUES (?, ?, ?, 'queued', 0, ?, ?, ?, ?, ?)${onConflict}`,
        [j.id, j.kind, j.payload, j.maxAttempts, j.runAt, key, j.now, j.now],
      );
      if (key === null) return true;
      // MySQL's affected-row count cannot tell "inserted" from "matched a duplicate", so ask.
      const [row] = await db.query<{ id: string }>('SELECT id FROM jobs WHERE dedupe_key = ?', [
        key,
      ]);
      return row?.id === j.id;
    },
    async byId(id: string): Promise<JobRecord | null> {
      const [row] = await db.query<JobRow>(`SELECT ${COLUMNS} FROM jobs WHERE id = ?`, [id]);
      return row ? toJob(row) : null;
    },
    /** Ids of queued jobs whose time has come, oldest first. */
    async dueIds(now: Date, limit: number): Promise<string[]> {
      const n = Math.max(1, Math.min(500, Math.floor(limit)));
      const rows = await db.query<{ id: string }>(
        `SELECT id FROM jobs WHERE status = 'queued' AND run_at <= ? ORDER BY run_at, id LIMIT ${n}`,
        [now],
      );
      return rows.map((r) => r.id);
    },
    /** Takes a queued job for `workerId` and counts the attempt. True if this caller won it. */
    async claim(id: string, workerId: string, at: Date): Promise<boolean> {
      const r = await db.execute(
        `UPDATE jobs SET status = 'running', locked_by = ?, locked_at = ?, attempts = attempts + 1, updated_at = ?
         WHERE id = ? AND status = 'queued'`,
        [workerId, at, at, id],
      );
      return r.rowsAffected === 1;
    },
    /** running → succeeded. False when `lease` no longer holds the job. */
    async complete(id: string, lease: Lease, at: Date): Promise<boolean> {
      const r = await db.execute(
        `UPDATE jobs SET status = 'succeeded', locked_by = NULL, locked_at = NULL, last_error = NULL, updated_at = ?
         ${HELD}`,
        [at, id, lease.workerId, lease.attempt],
      );
      return r.rowsAffected === 1;
    },
    /** running → queued: a failed attempt runs again at `runAt`. False when `lease` no longer holds it. */
    async requeue(
      id: string,
      lease: Lease,
      error: string,
      runAt: Date,
      at: Date,
    ): Promise<boolean> {
      const r = await db.execute(
        `UPDATE jobs SET status = 'queued', run_at = ?, locked_by = NULL, locked_at = NULL, last_error = ?, updated_at = ?
         ${HELD}`,
        [runAt, error.slice(0, 4000), at, id, lease.workerId, lease.attempt],
      );
      return r.rowsAffected === 1;
    },
    /** running → 'failed' (gave up, may be retried by hand) or 'dead' (attempts used up).
        False when `lease` no longer holds it. */
    async fail(
      id: string,
      lease: Lease,
      error: string,
      status: 'failed' | 'dead',
      at: Date,
    ): Promise<boolean> {
      const r = await db.execute(
        `UPDATE jobs SET status = ?, locked_by = NULL, locked_at = NULL, last_error = ?, updated_at = ?
         ${HELD}`,
        [status, error.slice(0, 4000), at, id, lease.workerId, lease.attempt],
      );
      return r.rowsAffected === 1;
    },
    /** Returns jobs a crashed worker left 'running' since before `lockedBefore` to the queue. */
    async releaseStale(lockedBefore: Date, at: Date): Promise<number> {
      const r = await db.execute(
        `UPDATE jobs SET status = 'queued', locked_by = NULL, locked_at = NULL, updated_at = ?
         WHERE status = 'running' AND locked_at < ?`,
        [at, lockedBefore],
      );
      return r.rowsAffected;
    },
    /** One status's jobs, soonest first (the admin Jobs page). */
    async listByStatus(status: JobStatus, limit: number): Promise<JobRecord[]> {
      const n = Math.max(1, Math.min(200, Math.floor(limit)));
      const rows = await db.query<JobRow>(
        `SELECT ${COLUMNS} FROM jobs WHERE status = ? ORDER BY run_at DESC, id DESC LIMIT ${n}`,
        [status],
      );
      return rows.map(toJob);
    },
    /** A page of jobs, newest run time first, optionally one status (the admin Jobs page).
        The window is inlined as clamped integers (MySQL rejects bound LIMIT/OFFSET). */
    async page(opts: { status?: JobStatus; limit: number; offset: number }): Promise<JobRecord[]> {
      const n = Math.max(1, Math.min(200, Math.floor(opts.limit)));
      const off = Math.max(0, Math.min(1_000_000, Math.floor(opts.offset)));
      const where = opts.status ? ' WHERE status = ?' : '';
      const rows = await db.query<JobRow>(
        `SELECT ${COLUMNS} FROM jobs${where} ORDER BY run_at DESC, id DESC LIMIT ${n} OFFSET ${off}`,
        opts.status ? [opts.status] : [],
      );
      return rows.map(toJob);
    },
    /** Puts a 'failed' or 'dead' job back in the queue for a fresh set of attempts, due at
        `at`. True if it was in one of those states (a job already retried, or still
        running, is left alone). */
    async retry(id: string, at: Date): Promise<boolean> {
      const r = await db.execute(
        `UPDATE jobs SET status = 'queued', attempts = 0, run_at = ?, locked_by = NULL, locked_at = NULL, updated_at = ?
         WHERE id = ? AND status IN ('failed', 'dead')`,
        [at, at, id],
      );
      return r.rowsAffected === 1;
    },
    async countByStatus(): Promise<Record<JobStatus, number>> {
      const rows = await db.query<{ status: string; n: number | string }>(
        'SELECT status, COUNT(*) AS n FROM jobs GROUP BY status',
      );
      const out: Record<JobStatus, number> = {
        queued: 0,
        running: 0,
        succeeded: 0,
        failed: 0,
        dead: 0,
      };
      for (const r of rows) out[r.status as JobStatus] = Number(r.n);
      return out;
    },
    /** Retention: deletes finished jobs last touched before `before`. */
    async deleteFinishedBefore(before: Date): Promise<number> {
      const r = await db.execute(
        "DELETE FROM jobs WHERE status IN ('succeeded', 'failed', 'dead') AND updated_at < ?",
        [before],
      );
      return r.rowsAffected;
    },
  };
}
export type JobsRepository = ReturnType<typeof jobsRepository>;
