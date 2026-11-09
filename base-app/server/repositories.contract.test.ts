import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isUniqueViolation } from './infra/db/index.ts';
import { openTestDb, TEST_TARGETS, type TestDb } from './infra/db/test-databases.ts';
import { newId } from './lib/ids.ts';
import { createRepositories, type Repositories } from './repositories/index.ts';
import { createAuthService } from './services/auth.ts';
import { seedIfEmpty } from './services/seed.ts';
import { createTokenService } from './services/tokens.ts';

/* The repository contract: the SAME tests on every database. SQLite always; Postgres and
   MySQL when TEST_POSTGRES_URL / TEST_MYSQL_URL are set (`npm run test:db`). Each driver gets
   a fresh, migrated database. A repository that passes here behaves the same on all three:
   the timestamp contract (bind Date, read ISO-8601 UTC text), integrity rules the database
   enforces, the atomic claim, the portable upserts. */

const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const at = (iso: string): Date => new Date(iso);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const T0 = '2026-03-01T10:00:00.123Z';

const job = (over: Partial<Parameters<Repositories['jobs']['enqueue']>[0]> = {}) => ({
  id: newId(),
  kind: 'email.send',
  payload: JSON.stringify({ to: 'x@example.com' }),
  runAt: at('2026-07-01T10:00:00.000Z'),
  maxAttempts: 3,
  now: at('2026-07-01T09:00:00.000Z'),
  ...over,
});

for (const target of TEST_TARGETS) {
  describe.skipIf(!target.available)(`repositories (${target.driver})`, () => {
    let t: TestDb;
    let r: Repositories;
    let n = 0;
    const uniq = (p: string): string => `${p}${++n}`;

    const mkUser = async (over: { email?: string; role?: 'admin' | 'editor' | 'viewer' } = {}) => {
      const id = newId();
      const email = over.email ?? `${uniq('u')}@example.com`;
      await r.users.insert({
        id,
        name: 'Test User',
        email,
        role: over.role ?? 'viewer',
        status: 'active',
        team: 'Ops',
        createdAt: T0,
        lastActiveAt: T0,
      });
      return { id, email };
    };

    beforeAll(async () => {
      t = await openTestDb(target);
      r = createRepositories(t.db);
    }, 60_000);
    afterAll(async () => {
      await t?.close();
    });

    describe('timestamps', () => {
      it('binds Date and reads ISO-8601 UTC with milliseconds', async () => {
        const u = await mkUser();
        const found = await r.users.findById(u.id);
        expect(found?.createdAt).toBe(T0);
        expect(found?.createdAt).toMatch(ISO);
        expect(found?.lastActiveAt).toBe(T0);
      });

      it('keeps milliseconds and is independent of the process time zone', async () => {
        const u = await mkUser();
        await r.users.touchLastActive(u.id, at('2026-12-31T23:59:59.999Z'));
        expect((await r.users.findById(u.id))?.lastActiveAt).toBe('2026-12-31T23:59:59.999Z');
        await r.users.touchLastActive(u.id, at('2026-06-01T00:00:00.000+05:30'));
        expect((await r.users.findById(u.id))?.lastActiveAt).toBe('2026-05-31T18:30:00.000Z');
      });

      it('compares instants correctly in WHERE (a Date bound, not text)', async () => {
        const id = uniq('tx_range_');
        await r.transactions.insert({
          id,
          date: '2026-05-05T12:00:00.500Z',
          customer: 'Range Co',
          description: 'range test',
          category: 'Office',
          amountMinor: 100,
          currency: 'GBP',
          status: 'paid',
        });
        const page = (from?: string, before?: string) =>
          r.transactions.page({
            q: 'range test',
            status: [],
            category: [],
            from,
            before,
            sort: [{ key: 'date', desc: true }],
            limit: 10,
            offset: 0,
          });
        expect((await page('2026-05-05T12:00:00.500Z')).total).toBe(1); // inclusive lower bound
        expect((await page('2026-05-05T12:00:00.501Z')).total).toBe(0);
        expect((await page(undefined, '2026-05-05T12:00:00.500Z')).total).toBe(0); // exclusive upper
        expect((await page(undefined, '2026-05-05T12:00:00.501Z')).total).toBe(1);
        // an offset instant is the same moment as its UTC form
        expect(
          (await page('2026-05-05T13:00:00.500+01:00', '2026-05-05T14:00:00.000+01:00')).total,
        ).toBe(1);
        // a date alone means 00:00 UTC
        expect((await page('2026-05-05', '2026-05-06')).total).toBe(1);
        expect((await page('2026-05-06')).total).toBe(0);
        expect((await page(undefined, '2026-05-05')).total).toBe(0);
      });
    });

    describe('integrity the database enforces', () => {
      it('rejects a duplicate email, whatever the case, with a recognisable unique violation', async () => {
        const u = await mkUser();
        const err = await mkUser({ email: u.email }).catch((e: unknown) => e);
        expect(isUniqueViolation(err)).toBe(true);
      });

      it('rejects a mixed-case email (CHECK email = LOWER(email))', async () => {
        await expect(mkUser({ email: 'Mixed.Case@Example.com' })).rejects.toThrow(/query failed/);
      });

      it('rejects a role or status outside the enum', async () => {
        const u = await mkUser();
        await expect(
          t.db.execute('UPDATE users SET role = ? WHERE id = ?', ['owner', u.id]),
        ).rejects.toThrow(/query failed/);
        await expect(
          t.db.execute('UPDATE users SET status = ? WHERE id = ?', ['gone', u.id]),
        ).rejects.toThrow(/query failed/);
      });

      it('rejects a row whose foreign key points nowhere', async () => {
        await expect(
          r.sessions.insert({
            id: newId(),
            tokenHash: sha(uniq('orphan')),
            userId: newId(),
            userAgent: null,
            ip: null,
            createdAt: at(T0),
            expiresAt: at(T0),
          }),
        ).rejects.toThrow(/query failed/);
      });

      it('CASCADE: deleting a user deletes their sessions, tokens, notifications and preferences', async () => {
        const u = await mkUser();
        await r.sessions.insert({
          id: newId(),
          tokenHash: sha(uniq('s')),
          userId: u.id,
          userAgent: null,
          ip: null,
          createdAt: at(T0),
          expiresAt: at('2999-01-01T00:00:00.000Z'),
        });
        await r.authTokens.insert({
          id: newId(),
          tokenHash: sha(uniq('a')),
          userId: u.id,
          purpose: 'invite',
          createdAt: at(T0),
          expiresAt: at('2999-01-01T00:00:00.000Z'),
        });
        await r.notifications.insert({
          id: newId(),
          userId: u.id,
          kind: 'x',
          title: 't',
          createdAt: at(T0),
        });
        await r.notifications.setPreference({
          userId: u.id,
          kind: 'x',
          inApp: true,
          email: false,
          at: at(T0),
        });
        await t.db.execute('DELETE FROM users WHERE id = ?', [u.id]);
        const left: string[] = [];
        for (const table of [
          'sessions',
          'auth_tokens',
          'notifications',
          'notification_preferences',
        ]) {
          const rows = await t.db.query(`SELECT 1 FROM ${table} WHERE user_id = ?`, [u.id]);
          left.push(...rows.map(() => table));
        }
        expect(left).toEqual([]);
      });

      it('SET NULL: deleting a user keeps their audit events, files and settings, unowned', async () => {
        const u = await mkUser();
        const auditId = newId();
        await r.audit.insert({
          id: auditId,
          at: T0,
          actorUserId: u.id,
          actor: 'Test User',
          action: 'login',
          target: u.email,
          ip: '127.0.0.1',
          outcome: 'success',
        });
        const fileId = newId();
        await r.files.insert({
          id: fileId,
          ownerUserId: u.id,
          purpose: 'avatar',
          originalName: 'me.png',
          contentType: 'image/png',
          sizeBytes: 10,
          sha256: sha('me'),
          storageKey: uniq('files/me-'),
          createdAt: at(T0),
        });
        await r.users.setAvatarFileId(u.id, fileId, at(T0));
        const key = uniq('setting.');
        await r.appSettings.set(key, '1', at(T0), u.id);

        await t.db.execute('DELETE FROM users WHERE id = ?', [u.id]);
        const [a] = await t.db.query<{ actor_user_id: string | null; actor_label: string }>(
          'SELECT actor_user_id, actor_label FROM audit_events WHERE id = ?',
          [auditId],
        );
        expect(a).toEqual({ actor_user_id: null, actor_label: 'Test User' });
        expect((await r.files.byId(fileId))?.ownerUserId).toBeNull();
        expect((await r.appSettings.get(key))?.updatedByUserId).toBeNull();
      });

      it('SET NULL the other way: deleting an avatar file clears users.avatar_file_id', async () => {
        const u = await mkUser();
        const fileId = newId();
        await r.files.insert({
          id: fileId,
          ownerUserId: u.id,
          purpose: 'avatar',
          originalName: 'a.png',
          contentType: 'image/png',
          sizeBytes: 1,
          sha256: sha('a'),
          storageKey: uniq('files/a-'),
          createdAt: at(T0),
        });
        await r.users.setAvatarFileId(u.id, fileId, at(T0));
        expect(await r.files.delete(fileId)).toBe(true);
        const [row] = await t.db.query<{ avatar_file_id: string | null }>(
          'SELECT avatar_file_id FROM users WHERE id = ?',
          [u.id],
        );
        expect(row?.avatar_file_id).toBeNull();
      });

      it('rolls a transaction back across repositories', async () => {
        const email = `${uniq('rb')}@example.com`;
        await expect(
          t.db.transaction(async (tx) => {
            const rr = createRepositories(tx);
            await rr.users.insert({
              id: newId(),
              name: 'Rolled Back',
              email,
              role: 'viewer',
              status: 'active',
              team: 'Ops',
              createdAt: T0,
              lastActiveAt: T0,
            });
            throw new Error('boom');
          }),
        ).rejects.toThrow('boom');
        expect(await r.users.findCredentialsByEmail(email)).toBeNull();
      });
    });

    describe('users', () => {
      it('round-trips a user and updates updated_at on change', async () => {
        const u = await mkUser();
        await r.users.setRole(u.id, 'editor', at('2026-04-01T00:00:00.000Z'));
        expect(
          await r.users.moveStatus(
            u.id,
            ['active', 'invited'],
            'suspended',
            at('2026-04-02T00:00:00.000Z'),
          ),
        ).toBe(true);
        // a move from a status the row is no longer in changes nothing
        expect(
          await r.users.moveStatus(u.id, ['invited'], 'active', at('2026-04-03T00:00:00.000Z')),
        ).toBe(false);
        const found = await r.users.findById(u.id);
        expect(found).toMatchObject({ role: 'editor', status: 'suspended', team: 'Ops' });
        const [row] = await t.db.query<{ updated_at: string }>(
          'SELECT updated_at FROM users WHERE id = ?',
          [u.id],
        );
        expect(row?.updated_at).toBe('2026-04-02T00:00:00.000Z');
      });

      it('finds credentials by email and counts active admins', async () => {
        const a = await mkUser({ role: 'admin' });
        const b = await mkUser({ role: 'admin' });
        await r.users.setPasswordHash(a.id, 'hash-a', at(T0));
        const found = await r.users.findCredentialsByEmail(a.email);
        expect(found?.passwordHash).toBe('hash-a');
        expect(await r.users.hasPassword(a.id)).toBe(true);
        expect(await r.users.hasPassword(b.id)).toBe(false);
        expect(await r.users.countActiveAdmins(a.id)).toBeGreaterThanOrEqual(1);
      });
    });

    describe('account queries', () => {
      it('renames a user, reads their password hash and avatar file, and maps avatarUrl', async () => {
        const u = await mkUser();
        await r.users.setName(u.id, 'Renamed Person', at('2026-04-03T00:00:00.000Z'));
        expect((await r.users.findById(u.id))?.name).toBe('Renamed Person');
        expect(await r.users.findPasswordHash(u.id)).toBeNull();
        await r.users.setPasswordHash(u.id, 'hash-z', at(T0));
        expect(await r.users.findPasswordHash(u.id)).toBe('hash-z');
        expect(await r.users.findPasswordHash(newId())).toBeNull();

        expect(await r.users.findAvatarFileId(u.id)).toBeNull();
        expect((await r.users.findById(u.id))?.avatarUrl).toBeNull();
        const fileId = newId();
        await r.files.insert({
          id: fileId,
          ownerUserId: u.id,
          purpose: 'avatar',
          originalName: 'avatar.png',
          contentType: 'image/png',
          sizeBytes: 10,
          sha256: sha('png'),
          storageKey: uniq('avatar-key-'),
          createdAt: at(T0),
        });
        await r.users.setAvatarFileId(u.id, fileId, at(T0));
        expect(await r.users.findAvatarFileId(u.id)).toBe(fileId);
        expect((await r.users.findById(u.id))?.avatarUrl).toBe(`/api/files/${fileId}`);
        expect((await r.users.findCredentialsByEmail(u.email))?.user.avatarUrl).toBe(
          `/api/files/${fileId}`,
        );
        await r.users.setAvatarFileId(u.id, null, at(T0));
        expect((await r.users.findById(u.id))?.avatarUrl).toBeNull();
      });

      it("lists the newest sessions' user agents, ended ones included, with a clamped limit", async () => {
        const u = await mkUser();
        const agents = ['UA-1', null, 'UA-3', 'UA-4'];
        for (const [i, ua] of agents.entries()) {
          await r.sessions.insert({
            id: newId(),
            tokenHash: sha(uniq('ua')),
            userId: u.id,
            userAgent: ua,
            ip: null,
            createdAt: at(`2026-05-01T10:0${i}:00.000Z`),
            expiresAt: at('2999-01-01T00:00:00.000Z'),
          });
        }
        await r.sessions.revokeForUser(u.id, at('2026-05-02T00:00:00.000Z'));
        expect(await r.sessions.recentUserAgents(u.id, 3)).toEqual(['UA-4', 'UA-3', null]);
        expect(await r.sessions.recentUserAgents(u.id, 0)).toHaveLength(1);
        expect(await r.sessions.recentUserAgents(u.id, 1000)).toHaveLength(4);
        expect(await r.sessions.recentUserAgents(newId(), 5)).toEqual([]);
      });
    });

    describe('sessions', () => {
      it('stores the new columns, throttles last_seen_at, and revokes', async () => {
        const u = await mkUser();
        const id = newId();
        const tokenHash = sha(uniq('tok'));
        await r.sessions.insert({
          id,
          tokenHash,
          userId: u.id,
          userAgent: 'Mozilla/5.0 test',
          ip: '203.0.113.9',
          createdAt: at('2026-05-01T10:00:00.000Z'),
          expiresAt: at('2999-01-01T00:00:00.000Z'),
        });
        const s = await r.sessions.find(tokenHash);
        expect(s).toMatchObject({
          id,
          userId: u.id,
          userAgent: 'Mozilla/5.0 test',
          ip: '203.0.113.9',
          createdAt: '2026-05-01T10:00:00.000Z',
          lastSeenAt: '2026-05-01T10:00:00.000Z',
          revokedAt: null,
        });

        // last seen 30 s ago: inside the minute, no write
        expect(
          await r.sessions.touch(
            id,
            at('2026-05-01T10:00:30.000Z'),
            at('2026-05-01T09:59:30.000Z'),
          ),
        ).toBe(false);
        // 90 s later: older than the interval, written
        expect(
          await r.sessions.touch(
            id,
            at('2026-05-01T10:01:30.000Z'),
            at('2026-05-01T10:00:30.000Z'),
          ),
        ).toBe(true);
        expect((await r.sessions.find(tokenHash))?.lastSeenAt).toBe('2026-05-01T10:01:30.000Z');

        expect(
          await r.sessions.listActiveForUser(u.id, at('2026-05-02T00:00:00.000Z')),
        ).toHaveLength(1);
        await r.sessions.revoke(tokenHash, at('2026-05-02T00:00:00.000Z'));
        await r.sessions.revoke(tokenHash, at('2026-05-03T00:00:00.000Z')); // idempotent: keeps the first time
        expect((await r.sessions.find(tokenHash))?.revokedAt).toBe('2026-05-02T00:00:00.000Z');
        expect(
          await r.sessions.listActiveForUser(u.id, at('2026-05-02T00:00:00.000Z')),
        ).toHaveLength(0);
      });

      it('revokes all but one, by id for the owner only, and deletes the expired', async () => {
        const u = await mkUser();
        const other = await mkUser();
        const ids = [newId(), newId(), newId()];
        for (const [i, id] of ids.entries()) {
          await r.sessions.insert({
            id,
            tokenHash: sha(uniq('m')),
            userId: u.id,
            userAgent: null,
            ip: null,
            createdAt: at(`2026-05-01T10:0${i}:00.000Z`),
            expiresAt: at(i === 2 ? '2026-05-01T11:00:00.000Z' : '2999-01-01T00:00:00.000Z'),
          });
        }
        const now = at('2026-05-01T12:00:00.000Z');
        expect(await r.sessions.revokeById(other.id, ids[0] ?? '', now)).toBe(false); // not theirs
        expect(await r.sessions.revokeById(u.id, ids[0] ?? '', now)).toBe(true);
        expect(await r.sessions.revokeById(u.id, ids[0] ?? '', now)).toBe(false); // already ended
        await r.sessions.revokeForUser(u.id, now, ids[1]);
        const live = await r.sessions.listActiveForUser(u.id, at('2026-05-01T10:30:00.000Z'));
        expect(live.map((s) => s.id)).toEqual([ids[1]]);
        expect(
          await r.sessions.deleteExpired(at('2026-05-01T11:00:00.000Z')),
        ).toBeGreaterThanOrEqual(1);
        expect(
          await t.db.query('SELECT 1 FROM sessions WHERE id = ?', [ids[2] ?? '']),
        ).toHaveLength(0);
      });
    });

    describe('records', () => {
      it('writes and lists audit events (actor_user_id, actor_label, null ip as empty)', async () => {
        const u = await mkUser();
        const id = newId();
        await r.audit.insert({
          id,
          at: '2030-01-01T00:00:00.000Z',
          actorUserId: u.id,
          actor: 'Ada',
          action: 'user.role',
          target: 'x@example.com (viewer → editor)',
          ip: '',
          outcome: 'success',
          detail: 'why',
        });
        const first = (await r.audit.list())[0];
        expect(first).toEqual({
          id,
          at: '2030-01-01T00:00:00.000Z',
          actor: 'Ada',
          action: 'user.role',
          target: 'x@example.com (viewer → editor)',
          ip: '',
          outcome: 'success',
        });
        const [row] = await t.db.query<{ actor_user_id: string; detail: string }>(
          'SELECT actor_user_id, detail FROM audit_events WHERE id = ?',
          [id],
        );
        expect(row).toEqual({ actor_user_id: u.id, detail: 'why' });
      });

      it('keeps money as BIGINT minor units beyond 32 bits', async () => {
        const id = uniq('tx_big_');
        await r.transactions.insert({
          id,
          date: T0,
          customer: 'Big Money Ltd',
          description: 'bigint test',
          category: 'Services',
          amountMinor: 5_000_000_000,
          currency: 'GBP',
          status: 'paid',
        });
        expect((await r.transactions.byId(id))?.amountMinor).toBe(5_000_000_000);
        const totals = await r.transactions.totalsByCategory();
        expect(totals.find((x) => x.label === 'Services')?.value).toBeGreaterThanOrEqual(
          5_000_000_000,
        );
      });

      it('pages, sorts, inlines LIMIT, counts facets and finds related rows', async () => {
        for (let i = 0; i < 4; i++) {
          await r.transactions.insert({
            id: uniq('tx_rel_'),
            date: `2026-02-0${i + 1}T09:00:00.000Z`,
            customer: 'Related Customer',
            description: `rel ${i}`,
            category: 'Travel',
            amountMinor: 100 * (i + 1),
            currency: 'GBP',
            status: i % 2 === 0 ? 'paid' : 'pending',
          });
        }
        const p = await r.transactions.page({
          q: 'rel ',
          status: ['paid'],
          category: [],
          sort: [{ key: 'amount', desc: true }],
          limit: 1,
          offset: 1,
        });
        expect(p.total).toBe(2);
        expect(p.rows.map((x) => x.amountMinor)).toEqual([100]);
        const rel = await r.transactions.relatedTo('Related Customer', 'none', 2);
        expect(rel.count).toBe(4);
        expect(rel.items.map((x) => x.date)).toEqual([
          '2026-02-04T09:00:00.000Z',
          '2026-02-03T09:00:00.000Z',
        ]);
        const f = await r.transactions.facets({ q: 'rel ', status: [], category: [] });
        expect(f.status.get('paid')).toBe(2);
        expect(f.status.get('pending')).toBe(2);
        expect((await r.activity.latest(3)).length).toBeLessThanOrEqual(3);
      });

      it('stores activity and the dashboard metrics', async () => {
        await r.activity.insert({
          id: uniq('act_'),
          at: '2031-01-01T00:00:00.000Z',
          actor: 'Ada',
          summary: 'did a thing',
          kind: 'deploy',
        });
        expect((await r.activity.latest(1))[0]?.at).toBe('2031-01-01T00:00:00.000Z');
        await r.metrics.insertRevenueDay('2026-01-01', 12_345_678_901, 5);
        await r.metrics.insertKpi(
          {
            id: 'revenue',
            label: 'Revenue',
            value: 1.5,
            previous: 1,
            unit: 'money',
            trend: [1, 2, 3],
          },
          0,
        );
        await r.metrics.insertSignups(0, { label: 'Jan', value: 7 });
        expect((await r.metrics.revenueDaily()).revenue).toEqual([
          { date: '2026-01-01', value: 12_345_678_901 },
        ]);
        expect((await r.metrics.kpis())[0]).toMatchObject({
          id: 'revenue',
          value: 1.5,
          trend: [1, 2, 3],
        });
        expect(await r.metrics.signups()).toEqual([{ label: 'Jan', value: 7 }]);
        expect(await r.metrics.isEmpty('kpis')).toBe(false);
      });
    });

    describe('notifications', () => {
      it('lists newest first, counts unread, marks read once, and upserts preferences', async () => {
        const u = await mkUser();
        const other = await mkUser();
        const ids = [newId(), newId(), newId()];
        for (const [i, id] of ids.entries()) {
          await r.notifications.insert({
            id,
            userId: u.id,
            kind: 'invite.accepted',
            title: `n${i}`,
            body: i === 0 ? 'with body' : null,
            link: i === 1 ? '/users' : null,
            createdAt: at(`2026-06-01T10:00:0${i}.000Z`),
          });
        }
        const list = await r.notifications.listForUser(u.id, { limit: 10 });
        expect(list.map((x) => x.title)).toEqual(['n2', 'n1', 'n0']);
        expect(list[2]).toMatchObject({
          body: 'with body',
          readAt: null,
          createdAt: '2026-06-01T10:00:00.000Z',
        });
        expect(await r.notifications.countUnread(u.id)).toBe(3);

        const when = at('2026-06-02T00:00:00.000Z');
        expect(await r.notifications.markRead(other.id, ids[0] ?? '', when)).toBe(false); // not theirs
        expect(await r.notifications.markRead(u.id, ids[0] ?? '', when)).toBe(true);
        expect(await r.notifications.markRead(u.id, ids[0] ?? '', when)).toBe(false);
        expect(await r.notifications.countUnread(u.id)).toBe(2);
        expect(
          await r.notifications.listForUser(u.id, { limit: 10, unreadOnly: true }),
        ).toHaveLength(2);
        expect(await r.notifications.markAllRead(u.id, when)).toBe(2);
        expect(await r.notifications.countUnread(u.id)).toBe(0);

        await r.notifications.setPreference({
          userId: u.id,
          kind: 'k',
          inApp: true,
          email: false,
          at: when,
        });
        await r.notifications.setPreference({
          userId: u.id,
          kind: 'k',
          inApp: false,
          email: true,
          at: at('2026-06-03T00:00:00.000Z'),
        });
        expect(await r.notifications.listPreferences(u.id)).toEqual([
          {
            userId: u.id,
            kind: 'k',
            inApp: false,
            email: true,
            updatedAt: '2026-06-03T00:00:00.000Z',
          },
        ]);
        expect(
          await r.notifications.deleteCreatedBefore(at('2026-06-01T10:00:01.000Z')),
        ).toBeGreaterThanOrEqual(1);
      });
    });

    describe('agent: saved chats and views', () => {
      it('keeps conversations per owner, messages in order, pending state, and cascades', async () => {
        const u = await mkUser();
        const other = await mkUser();
        const a = newId();
        const b = newId();
        await r.agent.insertConversation({ id: a, userId: u.id, title: 'First', at: at(T0) });
        await r.agent.insertConversation({
          id: b,
          userId: u.id,
          title: 'Second',
          at: at('2026-03-01T11:00:00.000Z'),
        });
        expect((await r.agent.listConversations(u.id, 10)).map((c) => c.title)).toEqual([
          'Second',
          'First',
        ]);
        expect(await r.agent.findConversation(other.id, a)).toBeNull(); // not theirs
        expect(await r.agent.renameConversation(other.id, a, 'x', at(T0))).toBe(false);

        const m1 = newId();
        const m2 = newId();
        await r.agent.insertMessage({
          id: m1,
          conversationId: a,
          role: 'user',
          content: '[{"type":"text","text":"hi"}]',
          at: at('2026-03-01T12:00:00.000Z'),
        });
        await r.agent.insertMessage({
          id: m2,
          conversationId: a,
          role: 'assistant',
          content: '[{"type":"text","text":"hello"}]',
          model: 'test-model',
          inputTokens: 12,
          outputTokens: 3,
          at: at('2026-03-01T12:00:00.000Z'), // same instant: id breaks the tie
        });
        const msgs = await r.agent.listMessages(a);
        expect(msgs.map((m) => m.id)).toEqual([m1, m2]);
        expect(msgs[1]).toMatchObject({
          role: 'assistant',
          model: 'test-model',
          inputTokens: 12,
          outputTokens: 3,
          createdAt: '2026-03-01T12:00:00.000Z',
        });
        expect(msgs[0]).toMatchObject({ model: null, inputTokens: null });

        await r.agent.touchConversation(a, '{"callId":"c1"}', at('2026-03-01T13:00:00.000Z'));
        expect(await r.agent.findConversation(u.id, a)).toMatchObject({
          pending: '{"callId":"c1"}',
          updatedAt: '2026-03-01T13:00:00.000Z',
        });
        // only one claim of the same waiting approval wins
        expect(await r.agent.claimPending(a, '{"callId":"other"}', at(T0))).toBe(false);
        expect(
          await r.agent.claimPending(a, '{"callId":"c1"}', at('2026-03-01T13:00:00.000Z')),
        ).toBe(true);
        expect(
          await r.agent.claimPending(a, '{"callId":"c1"}', at('2026-03-01T13:00:00.000Z')),
        ).toBe(false);
        expect((await r.agent.findConversation(u.id, a))?.pending).toBeNull();
        expect((await r.agent.listConversations(u.id, 10))[0]?.id).toBe(a);
        expect(await r.agent.renameConversation(u.id, a, 'Renamed', at(T0))).toBe(true);

        expect(await r.agent.deleteConversation(other.id, a)).toBe(false);
        expect(await r.agent.deleteConversation(u.id, a)).toBe(true);
        expect(await r.agent.listMessages(a)).toEqual([]); // cascaded
        expect(await r.agent.findConversation(u.id, a)).toBeNull();
      });

      it('lists saved views oldest first, per owner, and refuses an unknown tool', async () => {
        const u = await mkUser();
        const other = await mkUser();
        const v1 = newId();
        await r.savedViews.insert({
          id: v1,
          userId: u.id,
          title: 'Revenue',
          tool: 'show_chart',
          spec: '{}',
          at: at(T0),
        });
        await r.savedViews.insert({
          id: newId(),
          userId: u.id,
          title: 'KPIs',
          tool: 'show_kpis',
          spec: '{}',
          at: at('2026-03-02T10:00:00.000Z'),
        });
        expect((await r.savedViews.listForUser(u.id, 10)).map((v) => v.title)).toEqual([
          'Revenue',
          'KPIs',
        ]);
        expect(await r.savedViews.countForUser(u.id)).toBe(2);
        expect(await r.savedViews.delete(other.id, v1)).toBe(false);
        expect(await r.savedViews.delete(u.id, v1)).toBe(true);
        expect(await r.savedViews.countForUser(u.id)).toBe(1);
        await expect(
          r.savedViews.insert({
            id: newId(),
            userId: u.id,
            title: 'x',
            tool: 'drop_tables',
            spec: '{}',
            at: at(T0),
          }),
        ).rejects.toThrow(/query failed/);
      });
    });

    describe('notifications: keyset pages, ownership, fan-out', () => {
      it('pages newest first with (created_at, id) as the key: no gaps, no repeats, ties included', async () => {
        const u = await mkUser();
        const stamps = [
          '2026-06-01T10:00:00.000Z',
          '2026-06-01T10:00:00.000Z', // same instant as the one above: the id breaks the tie
          '2026-06-01T10:00:00.000Z',
          '2026-06-01T10:00:01.500Z',
          '2026-05-31T23:59:59.999Z',
        ];
        const inserted: { id: string; at: string }[] = [];
        for (const at of stamps) {
          const id = newId();
          inserted.push({ id, at });
          await r.notifications.insert({
            id,
            userId: u.id,
            kind: 'system',
            title: id,
            createdAt: new Date(at),
          });
        }
        const expected = inserted
          .toSorted((a, b) => (a.at === b.at ? (a.id < b.id ? 1 : -1) : a.at < b.at ? 1 : -1))
          .map((x) => x.id);

        const seen: string[] = [];
        let after: { createdAt: Date; id: string } | undefined;
        for (let page = 0; page < 6; page++) {
          const rows = await r.notifications.listForUser(u.id, {
            limit: 2,
            ...(after ? { after } : {}),
          });
          if (rows.length === 0) break;
          seen.push(...rows.map((x) => x.id));
          const last = rows[rows.length - 1];
          if (!last) break;
          after = { createdAt: new Date(last.createdAt), id: last.id };
        }
        expect(seen).toEqual(expected);
      });

      it('keyset paging combines with the unread filter and stays inside one user', async () => {
        const u = await mkUser();
        const other = await mkUser();
        const ids: string[] = [];
        for (let i = 0; i < 4; i++) {
          const id = newId();
          ids.push(id);
          await r.notifications.insert({
            id,
            userId: u.id,
            kind: 'team',
            title: `t${i}`,
            createdAt: new Date(`2026-07-01T10:00:0${i}.000Z`),
          });
        }
        await r.notifications.insert({
          id: newId(),
          userId: other.id,
          kind: 'team',
          title: 'not yours',
          createdAt: new Date('2026-07-01T10:00:09.000Z'),
        });
        await r.notifications.markRead(u.id, ids[3] ?? '', new Date('2026-07-02T00:00:00.000Z'));
        const unread = await r.notifications.listForUser(u.id, {
          limit: 10,
          unreadOnly: true,
          after: { createdAt: new Date('2026-07-01T10:00:02.000Z'), id: ids[2] ?? '' },
        });
        expect(unread.map((x) => x.title)).toEqual(['t1', 't0']);
      });

      it('finds a notification only for its owner', async () => {
        const u = await mkUser();
        const other = await mkUser();
        const id = newId();
        await r.notifications.insert({
          id,
          userId: u.id,
          kind: 'system',
          title: 'mine',
          createdAt: new Date('2026-07-01T10:00:00.000Z'),
        });
        expect((await r.notifications.findForUser(u.id, id))?.title).toBe('mine');
        expect(await r.notifications.findForUser(other.id, id)).toBeNull();
        expect(await r.notifications.findForUser(u.id, newId())).toBeNull();
      });

      it('mark-all-read counts only the unread, once', async () => {
        const u = await mkUser();
        const other = await mkUser();
        for (let i = 0; i < 3; i++) {
          await r.notifications.insert({
            id: newId(),
            userId: u.id,
            kind: 'system',
            title: `n${i}`,
            createdAt: new Date(`2026-07-01T10:00:0${i}.000Z`),
          });
        }
        await r.notifications.insert({
          id: newId(),
          userId: other.id,
          kind: 'system',
          title: 'theirs',
          createdAt: new Date('2026-07-01T10:00:00.000Z'),
        });
        const first = (await r.notifications.listForUser(u.id, { limit: 1 }))[0];
        await r.notifications.markRead(u.id, first?.id ?? '', new Date('2026-07-02T00:00:00.000Z'));
        expect(await r.notifications.markAllRead(u.id, new Date('2026-07-03T00:00:00.000Z'))).toBe(
          2,
        );
        expect(await r.notifications.markAllRead(u.id, new Date('2026-07-03T00:00:00.000Z'))).toBe(
          0,
        );
        expect(await r.notifications.countUnread(other.id)).toBe(1);
      });

      it('lists active user ids for fan-out: all, only admins, all but one', async () => {
        const admin = await mkUser({ role: 'admin' });
        const viewer = await mkUser({ role: 'viewer' });
        const gone = await mkUser({ role: 'admin' });
        await r.users.moveStatus(
          gone.id,
          ['active'],
          'suspended',
          new Date('2026-07-01T00:00:00.000Z'),
        );
        const all = await r.users.activeIds();
        expect(all).toContain(admin.id);
        expect(all).toContain(viewer.id);
        expect(all).not.toContain(gone.id);
        const admins = await r.users.activeIds({ role: 'admin' });
        expect(admins).toContain(admin.id);
        expect(admins).not.toContain(viewer.id);
        expect(admins).not.toContain(gone.id);
        expect(await r.users.activeIds({ role: 'admin', exceptId: admin.id })).not.toContain(
          admin.id,
        );
      });
    });

    describe('jobs', () => {
      it('enqueues, and ignores a duplicate dedupe_key without throwing', async () => {
        const key = uniq('dedupe-');
        const first = job({ dedupeKey: key });
        const second = job({ dedupeKey: key });
        expect(await r.jobs.enqueue(first)).toBe(true);
        expect(await r.jobs.enqueue(second)).toBe(false);
        expect(await r.jobs.byId(second.id)).toBeNull();
        expect(await r.jobs.byId(first.id)).toMatchObject({
          kind: 'email.send',
          status: 'queued',
          attempts: 0,
          maxAttempts: 3,
          runAt: '2026-07-01T10:00:00.000Z',
          dedupeKey: key,
          lockedAt: null,
        });
        // jobs without a key never collide
        expect(await r.jobs.enqueue(job())).toBe(true);
        expect(await r.jobs.enqueue(job())).toBe(true);
      });

      it('a duplicate enqueue inside a transaction leaves the transaction usable', async () => {
        const key = uniq('dedupe-tx-');
        expect(await r.jobs.enqueue(job({ dedupeKey: key }))).toBe(true);
        await t.db.transaction(async (tx) => {
          const rr = createRepositories(tx);
          expect(await rr.jobs.enqueue(job({ dedupeKey: key }))).toBe(false);
          expect(await rr.jobs.enqueue(job())).toBe(true); // still works afterwards (Postgres would abort otherwise)
        });
      });

      it('claims atomically: of many racing workers exactly one wins', async () => {
        const j = job();
        await r.jobs.enqueue(j);
        const wins = await Promise.all(
          ['w1', 'w2', 'w3', 'w4', 'w5'].map((w) =>
            r.jobs.claim(j.id, w, at('2026-07-01T10:00:01.000Z')),
          ),
        );
        expect(wins.filter(Boolean)).toHaveLength(1);
        const claimed = await r.jobs.byId(j.id);
        expect(claimed).toMatchObject({
          status: 'running',
          attempts: 1,
          lockedAt: '2026-07-01T10:00:01.000Z',
        });
        expect(claimed?.lockedBy).toMatch(/^w[1-5]$/);
        expect(await r.jobs.claim(j.id, 'late', at('2026-07-01T10:00:02.000Z'))).toBe(false);
      });

      it('runs the lifecycle: due, claim, requeue with backoff, complete, fail, release stale', async () => {
        const j = job({ runAt: at('2026-08-01T00:00:00.000Z') });
        await r.jobs.enqueue(j);
        expect(await r.jobs.dueIds(at('2026-07-31T23:59:59.999Z'), 500)).not.toContain(j.id);
        expect(await r.jobs.dueIds(at('2026-08-01T00:00:00.000Z'), 500)).toContain(j.id);

        await r.jobs.claim(j.id, 'w', at('2026-08-01T00:00:01.000Z'));
        await r.jobs.requeue(
          j.id,
          { workerId: 'w', attempt: 1 },
          'timeout',
          at('2026-08-01T00:05:00.000Z'),
          at('2026-08-01T00:00:02.000Z'),
        );
        expect(await r.jobs.byId(j.id)).toMatchObject({
          status: 'queued',
          runAt: '2026-08-01T00:05:00.000Z',
          lockedBy: null,
          lastError: 'timeout',
          attempts: 1,
        });
        await r.jobs.claim(j.id, 'w', at('2026-08-01T00:05:01.000Z'));
        // a stale lease (the last attempt's, or another worker's) changes nothing
        expect(
          await r.jobs.complete(
            j.id,
            { workerId: 'w', attempt: 1 },
            at('2026-08-01T00:05:02.000Z'),
          ),
        ).toBe(false);
        expect(
          await r.jobs.fail(
            j.id,
            { workerId: 'x', attempt: 2 },
            'late',
            'dead',
            at('2026-08-01T00:05:02.000Z'),
          ),
        ).toBe(false);
        expect((await r.jobs.byId(j.id))?.status).toBe('running');
        expect(
          await r.jobs.complete(
            j.id,
            { workerId: 'w', attempt: 2 },
            at('2026-08-01T00:05:02.000Z'),
          ),
        ).toBe(true);
        expect(await r.jobs.byId(j.id)).toMatchObject({
          status: 'succeeded',
          lastError: null,
          attempts: 2,
        });

        const dead = job();
        await r.jobs.enqueue(dead);
        await r.jobs.claim(dead.id, 'w', at('2026-08-02T00:00:00.000Z'));
        await r.jobs.fail(
          dead.id,
          { workerId: 'w', attempt: 1 },
          'no more attempts',
          'dead',
          at('2026-08-02T00:00:01.000Z'),
        );
        expect((await r.jobs.byId(dead.id))?.status).toBe('dead');

        const stale = job();
        await r.jobs.enqueue(stale);
        await r.jobs.claim(stale.id, 'crashed', at('2026-08-03T00:00:00.000Z'));
        // locked exactly at the cutoff is not stale yet (strictly older only)
        await r.jobs.releaseStale(at('2026-08-03T00:00:00.000Z'), at('2026-08-03T01:00:00.000Z'));
        expect((await r.jobs.byId(stale.id))?.status).toBe('running');
        expect(
          await r.jobs.releaseStale(at('2026-08-03T00:30:00.000Z'), at('2026-08-03T01:00:00.000Z')),
        ).toBeGreaterThanOrEqual(1);
        expect((await r.jobs.byId(stale.id))?.status).toBe('queued');

        const counts = await r.jobs.countByStatus();
        expect(counts.succeeded).toBeGreaterThanOrEqual(1);
        expect(counts.dead).toBeGreaterThanOrEqual(1);
        expect((await r.jobs.listByStatus('dead', 10)).map((x) => x.id)).toContain(dead.id);
        expect(
          await r.jobs.deleteFinishedBefore(at('2026-08-04T00:00:00.000Z')),
        ).toBeGreaterThanOrEqual(2);
      });
    });

    describe('platform queries (admin pages and retention)', () => {
      it('retries a failed or dead job only, with a fresh set of attempts', async () => {
        const dead = job();
        const running = job();
        await r.jobs.enqueue(dead);
        await r.jobs.enqueue(running);
        await r.jobs.claim(dead.id, 'w', at('2026-10-01T00:00:00.000Z'));
        await r.jobs.fail(
          dead.id,
          { workerId: 'w', attempt: 1 },
          'boom',
          'dead',
          at('2026-10-01T00:00:01.000Z'),
        );
        await r.jobs.claim(running.id, 'w', at('2026-10-01T00:00:00.000Z'));
        const when = at('2026-10-02T00:00:00.000Z');
        expect(await r.jobs.retry(running.id, when)).toBe(false); // running is left alone
        expect(await r.jobs.retry(dead.id, when)).toBe(true);
        expect(await r.jobs.retry(dead.id, when)).toBe(false); // already queued again
        expect(await r.jobs.byId(dead.id)).toMatchObject({
          status: 'queued',
          attempts: 0,
          runAt: '2026-10-02T00:00:00.000Z',
          lockedBy: null,
        });
        expect(await r.jobs.retry(newId(), when)).toBe(false);
      });

      it('pages jobs, newest run time first, optionally by status', async () => {
        const ids: string[] = [];
        for (let i = 0; i < 3; i++) {
          const j = job({ runAt: at(`2031-01-01T00:00:0${i}.000Z`) });
          ids.push(j.id);
          await r.jobs.enqueue(j);
        }
        const first = await r.jobs.page({ status: 'queued', limit: 2, offset: 0 });
        expect(first.map((j) => j.id)).toEqual([ids[2], ids[1]]);
        const second = await r.jobs.page({ status: 'queued', limit: 2, offset: 2 });
        expect(second[0]?.id).toBe(ids[0]);
        expect((await r.jobs.page({ limit: 1, offset: 0 }))[0]?.id).toBe(ids[2]);
      });

      it('pages, counts and prunes outbound emails', async () => {
        const base = await r.outboundEmails.count();
        const old = newId();
        const fresh = newId();
        for (const [id, when] of [
          [old, '2020-01-01T00:00:00.000Z'],
          [fresh, '2026-02-01T00:00:00.000Z'],
        ] as const) {
          await r.outboundEmails.insert({
            id,
            toAddress: 'x@example.com',
            subject: 'Hi',
            template: 'invite',
            bodyText: 'text',
            provider: 'log',
            createdAt: at(when),
          });
        }
        expect(await r.outboundEmails.count()).toBe(base + 2);
        const ids = (await r.outboundEmails.page({ limit: 200, offset: 0 })).map((e) => e.id);
        expect(ids.indexOf(fresh)).toBeGreaterThanOrEqual(0);
        expect(ids.indexOf(fresh)).toBeLessThan(ids.indexOf(old)); // newest first
        expect(await r.outboundEmails.page({ limit: 1, offset: 0 })).toHaveLength(1);
        expect(
          await r.outboundEmails.deleteCreatedBefore(at('2021-01-01T00:00:00.000Z')),
        ).toBeGreaterThanOrEqual(1);
        expect(await r.outboundEmails.byId(old)).toBeNull();
        expect(await r.outboundEmails.byId(fresh)).not.toBeNull();
      });

      it('prunes only read notifications', async () => {
        const u = await mkUser();
        const read = newId();
        const unread = newId();
        for (const id of [read, unread]) {
          await r.notifications.insert({
            id,
            userId: u.id,
            kind: 'system',
            title: id,
            createdAt: at('2019-01-01T00:00:00.000Z'),
          });
        }
        await r.notifications.markRead(u.id, read, at('2019-01-02T00:00:00.000Z'));
        expect(
          await r.notifications.deleteReadBefore(at('2020-01-01T00:00:00.000Z')),
        ).toBeGreaterThanOrEqual(1);
        const left = (await r.notifications.listForUser(u.id, { limit: 10 })).map((n) => n.id);
        expect(left).toEqual([unread]);
      });

      it('deletes spent and expired auth tokens, keeping live ones', async () => {
        const u = await mkUser();
        const mk = async (state: 'used' | 'expired' | 'live') => {
          const id = newId();
          await r.authTokens.insert({
            id,
            tokenHash: sha(`${state}-${id}`),
            userId: u.id,
            purpose: 'invite',
            createdAt: at('2026-01-01T00:00:00.000Z'),
            expiresAt: at(
              state === 'expired' ? '2026-01-02T00:00:00.000Z' : '2099-01-01T00:00:00.000Z',
            ),
          });
          if (state === 'used') await r.authTokens.markUsed(id, at('2026-01-01T00:00:01.000Z'));
          return sha(`${state}-${id}`);
        };
        const used = await mk('used');
        const expired = await mk('expired');
        const live = await mk('live');
        expect(
          await r.authTokens.deleteSpentOrExpired(at('2026-06-01T00:00:00.000Z')),
        ).toBeGreaterThanOrEqual(2);
        expect(await r.authTokens.findByHash(used)).toBeNull();
        expect(await r.authTokens.findByHash(expired)).toBeNull();
        expect(await r.authTokens.findByHash(live)).not.toBeNull();
      });
    });

    describe('mail, settings, files, tokens', () => {
      it('queues, sends and fails outbound emails', async () => {
        const a = newId();
        const b = newId();
        for (const [id, when] of [
          [a, '2026-09-01T10:00:00.000Z'],
          [b, '2026-09-01T10:00:01.000Z'],
        ] as const) {
          await r.outboundEmails.insert({
            id,
            toAddress: 'x@example.com',
            subject: 'Hello',
            template: 'invite',
            bodyText: 'text',
            bodyHtml: id === a ? '<p>html</p>' : null,
            provider: 'dev',
            createdAt: at(when),
          });
        }
        await r.outboundEmails.markSent(a, 'msg-1', at('2026-09-01T10:00:05.000Z'));
        await r.outboundEmails.markFailed(b, 'smtp refused');
        expect(await r.outboundEmails.byId(a)).toMatchObject({
          status: 'sent',
          providerMessageId: 'msg-1',
          sentAt: '2026-09-01T10:00:05.000Z',
          bodyHtml: '<p>html</p>',
        });
        expect(await r.outboundEmails.byId(b)).toMatchObject({
          status: 'failed',
          error: 'smtp refused',
          sentAt: null,
        });
        expect((await r.outboundEmails.latest(2)).map((e) => e.id)).toEqual([b, a]);
      });

      it('upserts settings and reads them back', async () => {
        const key = uniq('app.flag.');
        const u = await mkUser();
        await r.appSettings.set(key, 'true', at('2026-09-02T00:00:00.000Z'), null);
        await r.appSettings.set(key, '{"on":false}', at('2026-09-03T00:00:00.000Z'), u.id);
        expect(await r.appSettings.get(key)).toEqual({
          key,
          value: '{"on":false}',
          updatedAt: '2026-09-03T00:00:00.000Z',
          updatedByUserId: u.id,
        });
        expect((await r.appSettings.list()).some((s) => s.key === key)).toBe(true);
        expect(await r.appSettings.delete(key)).toBe(true);
        expect(await r.appSettings.get(key)).toBeNull();
      });

      it('stores file metadata with a size beyond 32 bits and a unique storage key', async () => {
        const u = await mkUser();
        const key = uniq('files/big-');
        const id = newId();
        await r.files.insert({
          id,
          ownerUserId: u.id,
          purpose: 'attachment',
          originalName: 'big.bin',
          contentType: 'application/octet-stream',
          sizeBytes: 6_000_000_000,
          sha256: sha('big'),
          storageKey: key,
          createdAt: at(T0),
        });
        expect(await r.files.byId(id)).toMatchObject({
          sizeBytes: 6_000_000_000,
          purpose: 'attachment',
          createdAt: T0,
        });
        expect((await r.files.listForOwner(u.id, 10)).map((f) => f.id)).toEqual([id]);
        const dup = await r.files
          .insert({
            id: newId(),
            ownerUserId: u.id,
            purpose: 'attachment',
            originalName: 'x',
            contentType: 'text/plain',
            sizeBytes: 1,
            sha256: sha('x'),
            storageKey: key,
            createdAt: at(T0),
          })
          .catch((e: unknown) => e);
        expect(isUniqueViolation(dup)).toBe(true);
      });

      it('the token service: concurrent consumes in transactions, exactly one wins; a rollback keeps the token', async () => {
        const u = await mkUser();
        const tokens = createTokenService();
        const { token } = await t.db.transaction((tx) => tokens.issue(tx, u.id, 'password_reset'));
        const attempts = await Promise.allSettled(
          Array.from({ length: 6 }, () =>
            t.db.transaction((tx) => tokens.consume(tx, token, 'password_reset')),
          ),
        );
        expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
        expect(attempts.filter((a) => a.status === 'rejected')).toHaveLength(5);

        const second = await t.db.transaction((tx) => tokens.issue(tx, u.id, 'password_reset'));
        await expect(
          t.db.transaction(async (tx) => {
            await tokens.consume(tx, second.token, 'password_reset');
            throw new Error('the action failed');
          }),
        ).rejects.toThrow('the action failed');
        expect(await tokens.peek(t.db, second.token, 'password_reset')).not.toBeNull();
      });

      it('spends an auth token exactly once, and voids unused ones', async () => {
        const u = await mkUser();
        const id = newId();
        const hash = sha(uniq('reset'));
        await r.authTokens.insert({
          id,
          tokenHash: hash,
          userId: u.id,
          purpose: 'password_reset',
          createdAt: at(T0),
          expiresAt: at('2026-10-01T00:00:00.000Z'),
        });
        expect(await r.authTokens.findByHash(hash)).toMatchObject({
          id,
          userId: u.id,
          purpose: 'password_reset',
          expiresAt: '2026-10-01T00:00:00.000Z',
          usedAt: null,
        });
        const wins = await Promise.all(
          [1, 2, 3].map(() => r.authTokens.markUsed(id, at('2026-09-30T00:00:00.000Z'))),
        );
        expect(wins.filter(Boolean)).toHaveLength(1);
        expect((await r.authTokens.findByHash(hash))?.usedAt).toBe('2026-09-30T00:00:00.000Z');

        const second = newId();
        await r.authTokens.insert({
          id: second,
          tokenHash: sha(uniq('reset')),
          userId: u.id,
          purpose: 'password_reset',
          createdAt: at(T0),
          expiresAt: at('2026-10-01T00:00:00.000Z'),
        });
        expect(
          await r.authTokens.voidUnused(u.id, 'password_reset', at('2026-09-30T00:00:00.000Z')),
        ).toBe(1);
        expect(
          await r.authTokens.deleteExpired(at('2026-10-01T00:00:00.000Z')),
        ).toBeGreaterThanOrEqual(2);
      });
    });

    describe('services on this database', () => {
      it('seeds the demo data and the admin, then signs in, authenticates and signs out', async () => {
        const fresh = await openTestDb(target);
        try {
          const report = await seedIfEmpty(fresh.db, {
            adminEmail: 'admin@example.test',
            adminPassword: 'adminpassword',
          });
          expect(report.admin).toBe('created');
          expect(report.seeded).toEqual([
            'users',
            'transactions',
            'audit_events',
            'activity',
            'revenue_daily',
            'kpis',
            'signups_monthly',
            'notifications',
          ]);
          let now = at('2026-10-12T09:00:00.000Z');
          const auth = createAuthService(fresh.db, { sessionTtlHours: 1, now: () => now });
          const signedIn = await auth.login(
            'Admin@Example.test',
            'adminpassword',
            '203.0.113.5',
            'UA/1.0',
          );
          expect(signedIn.user.role).toBe('admin');

          const [session] = await fresh.db.query<{
            user_agent: string;
            ip: string;
            last_seen_at: string;
            revoked_at: string | null;
          }>('SELECT user_agent, ip, last_seen_at, revoked_at FROM sessions');
          expect(session).toEqual({
            user_agent: 'UA/1.0',
            ip: '203.0.113.5',
            last_seen_at: '2026-10-12T09:00:00.000Z',
            revoked_at: null,
          });

          // a read inside the minute does not write; one after it does
          now = at('2026-10-12T09:00:30.000Z');
          expect((await auth.authenticate(signedIn.token))?.email).toBe('admin@example.test');
          const seen = async () =>
            (await fresh.db.query<{ s: string }>('SELECT last_seen_at AS s FROM sessions'))[0]?.s;
          expect(await seen()).toBe('2026-10-12T09:00:00.000Z');
          now = at('2026-10-12T09:01:30.000Z');
          await auth.authenticate(signedIn.token);
          expect(await seen()).toBe('2026-10-12T09:01:30.000Z');

          await auth.logout(signedIn.token, signedIn.user, '203.0.113.5');
          expect(await auth.authenticate(signedIn.token)).toBeNull();
          const audit = await createRepositories(fresh.db).audit.list();
          expect(audit.filter((e) => e.action === 'login' && e.actor === 'Admin')).toHaveLength(1);

          // a failed sign-in is audited with the account's id when there is one
          await expect(
            auth.login('admin@example.test', 'wrong password', '203.0.113.5'),
          ).rejects.toThrow(/incorrect/);
          const [failed] = await fresh.db.query<{ actor_user_id: string | null }>(
            "SELECT actor_user_id FROM audit_events WHERE outcome = 'failure' AND target = 'admin@example.test'",
          );
          expect(failed?.actor_user_id).toBe(signedIn.user.id);

          now = at('2026-10-12T11:00:00.000Z');
          expect(await auth.sweepExpired()).toBe(1);
        } finally {
          await fresh.close();
        }
      }, 60_000);
    });
  });
}
