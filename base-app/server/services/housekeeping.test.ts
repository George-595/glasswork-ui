import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDbClient } from '../infra/db/index.ts';
import { migrate } from '../infra/db/migrate.ts';
import type { DbClient } from '../infra/db/types.ts';
import { newId } from '../lib/ids.ts';
import { createRepositories } from '../repositories/index.ts';
import { registerHousekeeping } from './housekeeping.ts';
import { createJobsService, type JobsService } from './jobs.ts';

/* The six scheduled sweeps, driven by the real scheduler on a fake clock. */
const NOW = new Date('2026-10-12T10:00:00.000Z');
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 86_400_000);

let db: DbClient;
let jobs: JobsService;

beforeEach(async () => {
  db = await createDbClient('sqlite::memory:');
  await migrate(db);
  jobs = createJobsService(db, { now: () => NOW, random: () => 0.5 });
  registerHousekeeping(jobs, db, { now: () => NOW });
  await db.execute(
    `INSERT INTO users (id, email, name, role, status, team, created_at, updated_at)
     VALUES ('u1', 'u1@example.com', 'U One', 'viewer', 'active', 'Ops', ?, ?)`,
    [NOW, NOW],
  );
});
afterEach(async () => {
  await db.close();
});

/* Six jobs, four at a time: two passes run them all. */
const runAll = async () => {
  for (let i = 0; i < 2; i++) {
    await jobs.tick();
    await jobs.idle();
  }
};

const count = async (table: string): Promise<number> =>
  Number((await db.query<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0]?.n);

describe('housekeeping jobs', () => {
  it('are scheduled once each, run, and finish', async () => {
    await runAll();
    const rows = await db.query<{ kind: string; status: string }>(
      'SELECT kind, status FROM jobs ORDER BY kind',
    );
    expect(rows).toEqual([
      { kind: 'prune_audit_events', status: 'succeeded' },
      { kind: 'prune_emails', status: 'succeeded' },
      { kind: 'prune_jobs', status: 'succeeded' },
      { kind: 'prune_notifications', status: 'succeeded' },
      { kind: 'sweep_auth_tokens', status: 'succeeded' },
      { kind: 'sweep_sessions', status: 'succeeded' },
    ]);
  });

  it('sweeps expired sessions and spent or expired tokens, keeping live ones', async () => {
    const r = createRepositories(db);
    const session = (hash: string, expiresAt: Date) =>
      r.sessions.insert({
        id: newId(),
        tokenHash: hash.padEnd(64, '0'),
        userId: 'u1',
        userAgent: null,
        ip: null,
        createdAt: daysAgo(10),
        expiresAt,
      });
    await session('expired', daysAgo(1));
    await session('live', new Date(NOW.getTime() + 3_600_000));
    const token = async (hash: string, expiresAt: Date, used: boolean) => {
      const id = newId();
      await r.authTokens.insert({
        id,
        tokenHash: hash.padEnd(64, '0'),
        userId: 'u1',
        purpose: 'invite',
        createdAt: daysAgo(10),
        expiresAt,
      });
      if (used) await r.authTokens.markUsed(id, daysAgo(9));
    };
    await token('used', daysAgo(-5), true);
    await token('expired', daysAgo(1), false);
    await token('live', daysAgo(-5), false);

    await runAll();
    expect(await count('sessions')).toBe(1);
    expect(await count('auth_tokens')).toBe(1);
  });

  it('prunes read notifications older than 90 days, never unread or recent ones', async () => {
    const r = createRepositories(db);
    const add = async (age: number, read: boolean) => {
      const id = newId();
      await r.notifications.insert({
        id,
        userId: 'u1',
        kind: 'system',
        title: id,
        createdAt: daysAgo(age),
      });
      if (read) await r.notifications.markRead('u1', id, daysAgo(age - 1));
      return id;
    };
    const oldRead = await add(91, true);
    const oldUnread = await add(200, false);
    const recentRead = await add(89, true);
    await runAll();
    const left = (await r.notifications.listForUser('u1', { limit: 10 })).map((n) => n.id);
    expect(left.sort()).toEqual([oldUnread, recentRead].sort());
    expect(left).not.toContain(oldRead);
  });

  it('prunes emails older than 30 days', async () => {
    const r = createRepositories(db);
    for (const [id, age] of [
      ['old', 31],
      ['new', 29],
    ] as const) {
      await r.outboundEmails.insert({
        id,
        toAddress: 'x@example.com',
        subject: id,
        template: 'invite',
        bodyText: 't',
        provider: 'log',
        createdAt: daysAgo(age),
      });
    }
    await runAll();
    expect(
      (await db.query<{ id: string }>('SELECT id FROM outbound_emails')).map((e) => e.id),
    ).toEqual(['new']);
  });

  it('prunes finished jobs older than 14 days, freeing their dedupe keys, and keeps live ones', async () => {
    const r = createRepositories(db);
    const mk = async (
      kind: string,
      status: 'succeeded' | 'dead' | 'queued',
      age: number,
      key?: string,
    ) => {
      const id = newId();
      await r.jobs.enqueue({
        id,
        kind,
        payload: '{}',
        runAt: daysAgo(age),
        maxAttempts: 3,
        now: daysAgo(age),
        ...(key ? { dedupeKey: key } : {}),
      });
      if (status !== 'queued') {
        await r.jobs.claim(id, 'w', daysAgo(age));
        const lease = { workerId: 'w', attempt: 1 };
        if (status === 'succeeded') await r.jobs.complete(id, lease, daysAgo(age));
        else await r.jobs.fail(id, lease, 'x', 'dead', daysAgo(age));
      }
    };
    await mk('old-done', 'succeeded', 15, 'welcome:u1');
    await mk('old-dead', 'dead', 20);
    await mk('recent-done', 'succeeded', 13);
    await mk('old-queued', 'queued', 30);
    await runAll();
    const kinds = (
      await db.query<{ kind: string }>(
        "SELECT kind FROM jobs WHERE kind NOT IN ('sweep_sessions','sweep_auth_tokens','prune_notifications','prune_jobs','prune_emails','prune_audit_events') ORDER BY kind",
      )
    ).map((j) => j.kind);
    expect(kinds).toEqual(['old-queued', 'recent-done']);
    // the dedupe key of a pruned job can be used again
    expect(
      await db.transaction((tx) => jobs.enqueue(tx, 'old-done', {}, { dedupeKey: 'welcome:u1' })),
    ).toBe(true);
  });

  it('prunes security audit events older than 365 days, and keeps the recent ones', async () => {
    const r = createRepositories(db);
    for (const [id, age] of [
      ['ancient', 400],
      ['old', 366],
      ['a year', 364],
      ['recent', 1],
    ] as const) {
      await r.audit.insert({
        id,
        at: daysAgo(age).toISOString(),
        actor: 'x',
        action: 'login',
        target: 'x@example.com',
        ip: '',
        outcome: 'failure',
      });
    }
    await runAll();
    expect(
      (await db.query<{ id: string }>('SELECT id FROM audit_events ORDER BY id')).map((e) => e.id),
    ).toEqual(['a year', 'recent']);
  });
});
