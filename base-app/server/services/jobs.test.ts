import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbClient } from '../infra/db/index.ts';
import { migrate } from '../infra/db/migrate.ts';
import type { DbClient } from '../infra/db/types.ts';
import { newId } from '../lib/ids.ts';
import { createRepositories } from '../repositories/index.ts';
import {
  backoffMs,
  createJobsService,
  defineJob,
  type JobsOptions,
  type JobsService,
  PermanentJobError,
  parseEvery,
} from './jobs.ts';

/* The queue on a real (in-memory SQLite) database with a fake clock. `tick()` is one polling
   pass and `idle()` waits for what it started, so no test sleeps. */
const T0 = new Date('2026-10-12T10:00:00.000Z');
const ACTOR = {
  id: 'admin-1',
  name: 'Ada Admin',
  email: 'ada@example.com',
  role: 'admin',
} as const;

let db: DbClient;
let clock: Date;
const advance = (ms: number): void => {
  clock = new Date(clock.getTime() + ms);
};

function make(over: JobsOptions = {}): JobsService {
  return createJobsService(db, { now: () => clock, random: () => 0.5, ...over });
}

const jsonDef = <P>(kind: string, run: (p: P, attempt: number) => Promise<void>, extra = {}) =>
  defineJob<P>({
    kind,
    parse: (raw) => raw as P,
    run: (p, ctx) => run(p, ctx.attempt),
    ...extra,
  });

async function row(id: string) {
  const r = createRepositories(db);
  return await r.jobs.byId(id);
}
async function onlyJob(kind: string) {
  const rows = await db.query<{ id: string }>('SELECT id FROM jobs WHERE kind = ?', [kind]);
  expect(rows).toHaveLength(1);
  return rows[0]?.id ?? '';
}
async function enqueue(jobs: JobsService, kind: string, payload: unknown = {}, o = {}) {
  return await db.transaction((tx) => jobs.enqueue(tx, kind, payload, o));
}

beforeEach(async () => {
  clock = new Date(T0);
  db = await createDbClient('sqlite::memory:');
  await migrate(db);
  await db.execute(
    `INSERT INTO users (id, email, name, role, status, team, created_at, updated_at)
     VALUES ('admin-1', 'ada@example.com', 'Ada Admin', 'admin', 'active', 'Ops', ?, ?)`,
    [T0, T0],
  );
});
afterEach(async () => {
  await db.close();
});

describe('pure helpers', () => {
  it('backoff doubles from 10s, with equal jitter, capped at an hour', () => {
    expect(backoffMs(1, () => 0)).toBe(5_000);
    expect(backoffMs(1, () => 0.999999)).toBe(10_000);
    expect(backoffMs(2, () => 0.5)).toBe(15_000);
    expect(backoffMs(3, () => 0.5)).toBe(30_000);
    expect(backoffMs(30, () => 0.5)).toBe(45 * 60_000);
    expect(backoffMs(30, () => 1)).toBe(60 * 60_000);
  });

  it('parses schedule intervals and refuses nonsense', () => {
    expect(parseEvery('30s')).toBe(30_000);
    expect(parseEvery('5m')).toBe(300_000);
    expect(parseEvery('1h')).toBe(3_600_000);
    expect(parseEvery('2d')).toBe(172_800_000);
    for (const bad of ['', '1', 'h', '0s', '1w', '-5m', '1.5h']) {
      expect(() => parseEvery(bad)).toThrow(/Invalid schedule interval/);
    }
  });
});

describe('running jobs', () => {
  it('runs a due job once, with its typed payload, and marks it succeeded', async () => {
    const jobs = make();
    const seen: unknown[] = [];
    jobs.register(jsonDef<{ n: number }>('count', async (p) => void seen.push(p)));
    expect(await enqueue(jobs, 'count', { n: 7 })).toBe(true);

    expect(await jobs.tick()).toBe(1);
    await jobs.idle();
    expect(seen).toEqual([{ n: 7 }]);
    expect(await row(await onlyJob('count'))).toMatchObject({
      status: 'succeeded',
      attempts: 1,
      lastError: null,
      lockedBy: null,
    });
    // nothing left to do
    expect(await jobs.tick()).toBe(0);
    expect(seen).toHaveLength(1);
  });

  it('waits for run_at', async () => {
    const jobs = make();
    const run = vi.fn<() => Promise<void>>(async () => {});
    jobs.register(jsonDef('later', run));
    await enqueue(jobs, 'later', {}, { runAt: new Date(clock.getTime() + 60_000) });
    expect(await jobs.tick()).toBe(0);
    advance(59_999);
    expect(await jobs.tick()).toBe(0);
    advance(1);
    expect(await jobs.tick()).toBe(1);
    await jobs.idle();
    expect(run).toHaveBeenCalledOnce();
  });

  it('typed enqueueJob uses the definition', async () => {
    const jobs = make();
    const run = vi.fn<() => Promise<void>>(async () => {});
    const def = jsonDef<{ to: string }>('typed', run, { maxAttempts: 2 });
    jobs.register(def);
    await db.transaction((tx) => jobs.enqueueJob(tx, def, { to: 'a' }));
    expect((await row(await onlyJob('typed')))?.maxAttempts).toBe(2);
    await jobs.tick();
    await jobs.idle();
    expect(run).toHaveBeenCalledWith({ to: 'a' }, 1);
  });

  it('refuses to register a kind twice', () => {
    const jobs = make();
    jobs.register(jsonDef('dup', async () => {}));
    expect(() => jobs.register(jsonDef('dup', async () => {}))).toThrow(/already registered/);
  });
});

describe('retry and backoff', () => {
  it('records the error and reschedules with exponential, jittered backoff', async () => {
    const jobs = make();
    jobs.register(
      jsonDef('flaky', async () => {
        throw new Error('upstream is down');
      }),
    );
    await enqueue(jobs, 'flaky');
    const id = await onlyJob('flaky');

    await jobs.tick();
    await jobs.idle();
    // random 0.5: 10s ceiling -> 5s + 2.5s
    expect(await row(id)).toMatchObject({
      status: 'queued',
      attempts: 1,
      lastError: 'upstream is down',
      runAt: new Date(T0.getTime() + 7_500).toISOString(),
      lockedBy: null,
    });

    advance(7_499);
    expect(await jobs.tick()).toBe(0);
    advance(1);
    expect(await jobs.tick()).toBe(1);
    await jobs.idle();
    // attempt 2: 20s ceiling -> 15s
    expect(await row(id)).toMatchObject({
      status: 'queued',
      attempts: 2,
      runAt: new Date(clock.getTime() + 15_000).toISOString(),
    });
  });

  it('succeeding on a later attempt clears the error', async () => {
    const jobs = make();
    let calls = 0;
    jobs.register(
      jsonDef('eventually', async () => {
        calls += 1;
        if (calls < 2) throw new Error('not yet');
      }),
    );
    await enqueue(jobs, 'eventually');
    const id = await onlyJob('eventually');
    await jobs.tick();
    await jobs.idle();
    advance(60_000);
    await jobs.tick();
    await jobs.idle();
    expect(await row(id)).toMatchObject({ status: 'succeeded', attempts: 2, lastError: null });
  });

  it('dead-letters after max attempts, and an admin can retry it with a fresh budget (audited)', async () => {
    const jobs = make();
    jobs.register(
      jsonDef(
        'doomed',
        async () => {
          throw new Error('always');
        },
        { maxAttempts: 2 },
      ),
    );
    await enqueue(jobs, 'doomed');
    const id = await onlyJob('doomed');
    await jobs.tick();
    await jobs.idle();
    advance(60_000);
    await jobs.tick();
    await jobs.idle();
    expect(await row(id)).toMatchObject({ status: 'dead', attempts: 2, lastError: 'always' });
    // dead jobs are never claimed again
    advance(3_600_000);
    expect(await jobs.tick()).toBe(0);

    const retried = await jobs.retry(id, ACTOR, '203.0.113.9');
    expect(retried).toMatchObject({ status: 'queued', attempts: 0 });
    const audit = await db.query<{
      action: string;
      target: string;
      actor_user_id: string;
      ip: string;
    }>("SELECT action, target, actor_user_id, ip FROM audit_events WHERE action = 'job.retry'");
    expect(audit).toEqual([
      { action: 'job.retry', target: `doomed ${id}`, actor_user_id: 'admin-1', ip: '203.0.113.9' },
    ]);
    expect(await jobs.tick()).toBe(1);
    await jobs.idle();
    expect(await row(id)).toMatchObject({ status: 'queued', attempts: 1 });
  });

  it('only a failed or dead job can be retried', async () => {
    const jobs = make();
    jobs.register(jsonDef('ok', async () => {}));
    await enqueue(jobs, 'ok');
    const id = await onlyJob('ok');
    await expect(jobs.retry(id, ACTOR, 'x')).rejects.toMatchObject({ code: 'job_not_retryable' });
    await expect(jobs.retry(newId(), ACTOR, 'x')).rejects.toMatchObject({ code: 'job_not_found' });
  });
});

describe('failures that cannot be retried', () => {
  it('a PermanentJobError ends the job as failed at once', async () => {
    const jobs = make();
    jobs.register(
      jsonDef('bad-address', async () => {
        throw new PermanentJobError('no such mailbox');
      }),
    );
    await enqueue(jobs, 'bad-address');
    const id = await onlyJob('bad-address');
    await jobs.tick();
    await jobs.idle();
    expect(await row(id)).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastError: 'no such mailbox',
    });
    advance(3_600_000);
    expect(await jobs.tick()).toBe(0);
  });

  it('an unknown kind fails (an admin can retry once the handler exists)', async () => {
    const jobs = make();
    await enqueue(jobs, 'nobody-home');
    await jobs.tick();
    await jobs.idle();
    const j = await row(await onlyJob('nobody-home'));
    expect(j?.status).toBe('failed');
    expect(j?.lastError).toMatch(/No handler is registered/);
  });

  it('a payload the handler cannot parse fails without running it', async () => {
    const jobs = make();
    const run = vi.fn<() => Promise<void>>(async () => {});
    jobs.register(
      defineJob<{ id: string }>({
        kind: 'strict',
        parse: (raw) => {
          if (typeof (raw as { id?: unknown }).id !== 'string') throw new Error('id is missing');
          return raw as { id: string };
        },
        run,
      }),
    );
    await enqueue(jobs, 'strict', { nope: 1 });
    await jobs.tick();
    await jobs.idle();
    expect(run).not.toHaveBeenCalled();
    const j = await row(await onlyJob('strict'));
    expect(j).toMatchObject({ status: 'failed' });
    expect(j?.lastError).toBe('Invalid payload: id is missing');
  });

  it('a handler that outlives its timeout is aborted and retried', async () => {
    const jobs = make({ timeoutMs: 20 });
    let signal: AbortSignal | undefined;
    jobs.register(
      defineJob<undefined>({
        kind: 'hang',
        parse: () => undefined,
        run: (_p, ctx) => {
          signal = ctx.signal;
          return new Promise<void>(() => {});
        },
      }),
    );
    await enqueue(jobs, 'hang');
    await jobs.tick();
    await jobs.idle();
    expect(signal?.aborted).toBe(true);
    expect(await row(await onlyJob('hang'))).toMatchObject({
      status: 'queued',
      attempts: 1,
      lastError: 'Timed out after 0s.',
    });
  });
});

describe('lease recovery (a crashed process)', () => {
  it('returns a job left running past the lease to the queue and runs it', async () => {
    const jobs = make({ leaseMs: 5 * 60_000 });
    const run = vi.fn<() => Promise<void>>(async () => {});
    jobs.register(jsonDef('orphan', run));
    await enqueue(jobs, 'orphan');
    const id = await onlyJob('orphan');
    // another process claimed it and died
    expect(await createRepositories(db).jobs.claim(id, 'crashed-worker', clock)).toBe(true);

    advance(5 * 60_000 - 31_000); // still within the lease
    expect(await jobs.tick()).toBe(0);
    expect((await row(id))?.status).toBe('running');

    advance(32_000); // past the lease, and past the 30 s between recovery sweeps
    expect(await jobs.tick()).toBe(1);
    await jobs.idle();
    expect(run).toHaveBeenCalledOnce();
    // the lost attempt counted
    expect(await row(id)).toMatchObject({ status: 'succeeded', attempts: 2 });
  });

  it('a stalled worker that answers after its lease ran out does not overwrite the newer run', async () => {
    let finishSlow = () => {};
    const slow = make({ leaseMs: 60_000, timeoutMs: 10 * 60_000, workerId: 'slow' });
    slow.register(
      jsonDef(
        'late',
        () =>
          new Promise<void>((r) => {
            finishSlow = r;
          }),
      ),
    );
    await enqueue(slow, 'late');
    const id = await onlyJob('late');
    expect(await slow.tick()).toBe(1);
    await vi.waitFor(async () => expect((await row(id))?.lockedBy).toBe('slow'));

    // the lease runs out; another worker takes the job and is still running it
    advance(61_000);
    await createRepositories(db).jobs.releaseStale(new Date(clock.getTime() - 60_000), clock);
    expect(await createRepositories(db).jobs.claim(id, 'fresh', clock)).toBe(true);

    finishSlow();
    await slow.idle();
    expect(await row(id)).toMatchObject({ status: 'running', lockedBy: 'fresh', attempts: 2 });
  });

  it('a job that keeps killing its worker is dead-lettered, not run forever', async () => {
    const jobs = make({ leaseMs: 60_000 });
    const run = vi.fn<() => Promise<void>>(async () => {});
    jobs.register(jsonDef('killer', run, { maxAttempts: 2 }));
    await enqueue(jobs, 'killer');
    const id = await onlyJob('killer');
    const repo = createRepositories(db).jobs;
    await repo.claim(id, 'w1', clock);
    advance(61_000);
    await repo.releaseStale(new Date(clock.getTime() - 60_000), clock);
    await repo.claim(id, 'w2', clock);
    advance(61_000);
    await repo.releaseStale(new Date(clock.getTime() - 60_000), clock);
    // attempts is now 2 = max; the next claim makes 3 > 2
    await jobs.tick();
    await jobs.idle();
    expect(run).not.toHaveBeenCalled();
    expect(await row(id)).toMatchObject({ status: 'dead', attempts: 3 });
  });
});

describe('dedupe', () => {
  it('a second enqueue with the same key is ignored and says so', async () => {
    const jobs = make();
    jobs.register(jsonDef('once', async () => {}));
    expect(await enqueue(jobs, 'once', { a: 1 }, { dedupeKey: 'welcome:u1' })).toBe(true);
    expect(await enqueue(jobs, 'once', { a: 2 }, { dedupeKey: 'welcome:u1' })).toBe(false);
    expect(await enqueue(jobs, 'once', { a: 3 }, { dedupeKey: 'welcome:u2' })).toBe(true);
    const rows = await db.query<{ payload: string }>('SELECT payload FROM jobs ORDER BY payload');
    expect(rows.map((r) => r.payload)).toEqual(['{"a":1}', '{"a":3}']);
  });

  it('a rolled-back transaction leaves no job behind', async () => {
    const jobs = make();
    jobs.register(jsonDef('rolled', async () => {}));
    await expect(
      db.transaction(async (tx) => {
        await jobs.enqueue(tx, 'rolled', {}, { dedupeKey: 'k' });
        throw new Error('the caller failed after enqueueing');
      }),
    ).rejects.toThrow('the caller failed');
    expect(await db.query('SELECT id FROM jobs')).toHaveLength(0);
    // the key is free again
    expect(await enqueue(jobs, 'rolled', {}, { dedupeKey: 'k' })).toBe(true);
  });
});

describe('concurrency', () => {
  it('never runs more than the limit at once', async () => {
    const jobs = make({ concurrency: 2 });
    const gates: (() => void)[] = [];
    let running = 0;
    let peak = 0;
    jobs.register(
      jsonDef('slow', async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise<void>((resolve) => gates.push(resolve));
        running -= 1;
      }),
    );
    for (let i = 0; i < 5; i++) await enqueue(jobs, 'slow');
    const release = async () => {
      for (const open of gates.splice(0)) open();
      await jobs.idle();
    };

    expect(await jobs.tick()).toBe(2);
    await vi.waitFor(() => expect(running).toBe(2));
    expect(await jobs.tick()).toBe(0); // full
    await release();
    expect(await jobs.tick()).toBe(2);
    await vi.waitFor(() => expect(running).toBe(2));
    await release();
    expect(await jobs.tick()).toBe(1);
    await vi.waitFor(() => expect(running).toBe(1));
    await release();
    expect(peak).toBe(2);
    const done = await db.query("SELECT id FROM jobs WHERE status = 'succeeded'");
    expect(done).toHaveLength(5);
  });
});

describe('scheduler', () => {
  const sweep = () =>
    defineJob<undefined>({ kind: 'sweep', parse: () => undefined, run: async () => {} });

  it('enqueues a recurring job once per time bucket', async () => {
    const jobs = make();
    const def = sweep();
    jobs.register(def);
    jobs.schedule({ name: 'sweep', every: '1h', job: def });

    await jobs.tick();
    await jobs.idle();
    advance(10 * 60_000);
    await jobs.tick();
    await jobs.idle();
    expect(await db.query('SELECT id FROM jobs WHERE kind = ?', ['sweep'])).toHaveLength(1);

    advance(60 * 60_000); // next bucket
    await jobs.tick();
    await jobs.idle();
    const rows = await db.query<{ dedupe_key: string; status: string }>(
      'SELECT dedupe_key, status FROM jobs WHERE kind = ? ORDER BY dedupe_key',
      ['sweep'],
    );
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.status === 'succeeded')).toBe(true);
    expect(rows[0]?.dedupe_key).toMatch(/^schedule:sweep:\d+$/);
  });

  it('several instances in the same bucket enqueue it once between them', async () => {
    const a = make({ workerId: 'a' });
    const b = make({ workerId: 'b' });
    const c = make({ workerId: 'c' });
    const runs = vi.fn<() => Promise<void>>(async () => {});
    for (const inst of [a, b, c]) {
      const def = defineJob<undefined>({ kind: 'sweep', parse: () => undefined, run: runs });
      inst.register(def);
      inst.schedule({ name: 'sweep', every: '1h', job: def });
    }
    await Promise.all([a.tick(), b.tick(), c.tick()]);
    await Promise.all([a.idle(), b.idle(), c.idle()]);
    expect(await db.query('SELECT id FROM jobs WHERE kind = ?', ['sweep'])).toHaveLength(1);
    expect(runs).toHaveBeenCalledOnce();
  });

  it('refuses a duplicate schedule name', () => {
    const jobs = make();
    const def = sweep();
    jobs.schedule({ name: 'x', every: '5m', job: def });
    expect(() => jobs.schedule({ name: 'x', every: '5m', job: def })).toThrow(/already exists/);
  });
});

describe('shutdown', () => {
  it('waits for running jobs, then stops claiming', async () => {
    const jobs = make();
    const gates: (() => void)[] = [];
    const run = vi.fn<() => Promise<void>>(
      () => new Promise<void>((resolve) => gates.push(resolve)),
    );
    jobs.register(jsonDef('long', run));
    await enqueue(jobs, 'long');
    await enqueue(jobs, 'long');
    await jobs.tick();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));

    const stopped = jobs.stop(5_000);
    let settled = false;
    void stopped.then(() => {
      settled = true;
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(settled).toBe(false); // still draining
    for (const open of gates.splice(0)) open();
    expect(await stopped).toEqual({ abandoned: 0 });
    const done = await db.query("SELECT id FROM jobs WHERE status = 'succeeded'");
    expect(done).toHaveLength(2);

    await enqueue(jobs, 'long');
    expect(await jobs.tick()).toBe(0); // stopped: claims nothing
  });

  it('gives up after the grace period and leaves the job running for the lease to recover', async () => {
    const jobs = make({ leaseMs: 60_000 });
    jobs.register(jsonDef('stuck', () => new Promise<void>(() => {})));
    await enqueue(jobs, 'stuck');
    const id = await onlyJob('stuck');
    await jobs.tick();
    await vi.waitFor(async () => expect((await row(id))?.status).toBe('running'));
    expect(await jobs.stop(20)).toEqual({ abandoned: 1 });
    expect((await row(id))?.status).toBe('running');

    // the next process picks it up once the lease has passed
    const next = make({ leaseMs: 60_000, workerId: 'next' });
    const run = vi.fn<() => Promise<void>>(async () => {});
    next.register(jsonDef('stuck', run));
    advance(61_000);
    await next.tick();
    await next.idle();
    expect(run).toHaveBeenCalledOnce();
  });
});

describe('the polling loop and the wake-up', () => {
  it('start() picks up a job enqueued afterwards without waiting for the next poll', async () => {
    const jobs = createJobsService(db, { pollMs: 60_000, wakeDelayMs: 5 });
    const run = vi.fn<() => Promise<void>>(async () => {});
    jobs.register(jsonDef('prompt', run));
    jobs.start();
    await db.transaction((tx) => jobs.enqueue(tx, 'prompt', {}));
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce(), { timeout: 2_000 });
    expect(await jobs.stop(1_000)).toEqual({ abandoned: 0 });
  });
});

describe('the admin list', () => {
  it('pages, filters by status and counts every status', async () => {
    const jobs = make();
    jobs.register(jsonDef('a', async () => {}));
    jobs.register(
      jsonDef('b', async () => {
        throw new PermanentJobError('nope');
      }),
    );
    for (let i = 0; i < 3; i++)
      await enqueue(jobs, 'a', {}, { runAt: new Date(clock.getTime() + i) });
    await enqueue(jobs, 'b');
    await jobs.tick();
    await jobs.idle();

    const all = await jobs.list({ pageSize: 2 });
    expect(all).toMatchObject({ total: 4, page: 1, pageSize: 2 });
    expect(all.jobs).toHaveLength(2);
    expect(all.counts).toEqual({ queued: 2, running: 0, succeeded: 1, failed: 1, dead: 0 });
    const failed = await jobs.list({ status: 'failed' });
    expect(failed.total).toBe(1);
    expect(failed.jobs[0]).toMatchObject({ kind: 'b', status: 'failed', lastError: 'nope' });
    expect(failed.jobs[0]).not.toHaveProperty('payload');
    expect((await jobs.list({ status: 'queued', page: 2, pageSize: 1 })).jobs).toHaveLength(1);

    await expect(jobs.list({ status: 'bogus' })).rejects.toMatchObject({ code: 'invalid_status' });
    await expect(jobs.list({ page: 0 })).rejects.toMatchObject({ code: 'invalid_page' });
    await expect(jobs.list({ pageSize: 101 })).rejects.toMatchObject({ code: 'invalid_page_size' });
  });
});
