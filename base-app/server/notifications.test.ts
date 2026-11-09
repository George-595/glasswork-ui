/* The notification network over HTTP: the inbox routes (pagination, ownership, read state), the
   preferences, the admin test and broadcast, what the users writes notify, the after-commit
   rule (a rolled-back action tells nobody) and the real /api/events stream on a real socket. */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSse, type SseEvent } from '../lib/sse.ts';
import { withAfterCommit } from './infra/db/after-commit.ts';
import { newId } from './lib/ids.ts';
import { createNotificationsService, type EmailMessage } from './services/notifications.ts';
import {
  ADMIN_EMAIL,
  ORIGIN,
  startTestApp,
  type TestApp,
  VIEWER_EMAIL,
  VIEWER_PASSWORD,
} from './testing.ts';

let app: TestApp;
let admin = '';
let viewer = '';
let adminId = '';
let viewerId = '';
const mail: { tx: unknown; msg: EmailMessage }[] = [];

beforeAll(async () => {
  app = await startTestApp({
    outbox: {
      async sendEmail(tx, msg) {
        mail.push({ tx, msg });
      },
    },
  });
  admin = await app.signIn();
  viewer = await app.signIn(VIEWER_EMAIL, VIEWER_PASSWORD);
  const id = async (email: string) =>
    (await app.db.query<{ id: string }>('SELECT id FROM users WHERE email = ?', [email]))[0]?.id ??
    '';
  adminId = await id(ADMIN_EMAIL);
  viewerId = await id(VIEWER_EMAIL);
});
afterAll(() => app.close());

const call = (method: string, path: string, cookie?: string, body?: unknown) =>
  fetch(`${app.base}${path}`, {
    method,
    headers: {
      origin: ORIGIN,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(cookie ? { cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
// oxlint-disable-next-line typescript/no-explicit-any -- response JSON is inspected loosely in tests
const json = async (res: Response) => (await res.json()) as Record<string, any>;

async function insertFor(
  userId: string,
  n: number,
  at: string,
  kind = 'system',
): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const id = newId();
    ids.push(id);
    await app.db.execute(
      'INSERT INTO notifications (id, user_id, kind, title, created_at) VALUES (?, ?, ?, ?, ?)',
      [id, userId, kind, `n${ids.length}`, new Date(at)],
    );
  }
  return ids;
}
const clear = (userId: string) =>
  app.db.execute('DELETE FROM notifications WHERE user_id = ?', [userId]);

describe('who may call what', () => {
  it('needs a session for every route, and an admin for the admin ones', async () => {
    for (const [method, path] of [
      ['GET', '/api/notifications'],
      ['GET', '/api/notifications/unread-count'],
      ['POST', '/api/notifications/read-all'],
      ['POST', '/api/notifications/abc/read'],
      ['GET', '/api/notifications/preferences'],
      ['PUT', '/api/notifications/preferences'],
      ['GET', '/api/events'],
      ['POST', '/api/admin/notifications/test'],
      ['POST', '/api/admin/notifications/broadcast'],
    ] as const) {
      expect((await call(method, path, undefined, method === 'GET' ? undefined : {})).status).toBe(
        401,
      );
    }
    expect((await call('POST', '/api/admin/notifications/test', viewer, {})).status).toBe(403);
    expect(
      (await call('POST', '/api/admin/notifications/broadcast', viewer, { title: 'x' })).status,
    ).toBe(403);
  });
});

describe('the inbox', () => {
  it('lists newest first with keyset pages that skip and repeat nothing', async () => {
    await clear(viewerId);
    // three share a timestamp (the id breaks the tie), two are older
    const same = await insertFor(viewerId, 3, '2026-06-02T10:00:00.000Z');
    const older = await insertFor(viewerId, 2, '2026-06-01T10:00:00.000Z');
    const seen: string[] = [];
    let cursor = '';
    for (let page = 0; page < 5; page++) {
      const res = await call(
        'GET',
        `/api/notifications?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        viewer,
      );
      const body = await json(res);
      expect(res.status).toBe(200);
      seen.push(...body.notifications.map((x: { id: string }) => x.id));
      if (!body.nextCursor) break;
      cursor = body.nextCursor;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    // the three newest are the ones with the later timestamp, in descending id order
    expect(seen.slice(0, 3)).toEqual([...same].sort().reverse());
    expect(seen.slice(3)).toEqual([...older].sort().reverse());
  });

  it('a new row arriving between pages does not shift the next page', async () => {
    await clear(viewerId);
    await insertFor(viewerId, 4, '2026-06-02T10:00:00.000Z');
    const first = await json(await call('GET', '/api/notifications?limit=2', viewer));
    await insertFor(viewerId, 1, '2026-06-09T10:00:00.000Z'); // newer than everything
    const second = await json(
      await call(
        'GET',
        `/api/notifications?limit=2&cursor=${encodeURIComponent(first.nextCursor)}`,
        viewer,
      ),
    );
    const ids = [...first.notifications, ...second.notifications].map((x: { id: string }) => x.id);
    expect(new Set(ids).size).toBe(4);
    expect(second.nextCursor).toBeNull();
  });

  it('filters to unread, counts them, and marks one or all read', async () => {
    await clear(viewerId);
    const [a, b, c] = await insertFor(viewerId, 3, '2026-06-02T10:00:00.000Z');
    expect(
      (await json(await call('GET', '/api/notifications/unread-count', viewer))).unreadCount,
    ).toBe(3);
    const marked = await call('POST', `/api/notifications/${a}/read`, viewer, {});
    expect(marked.status).toBe(200);
    expect((await json(marked)).unreadCount).toBe(2);
    // idempotent
    expect(
      (await json(await call('POST', `/api/notifications/${a}/read`, viewer, {}))).unreadCount,
    ).toBe(2);
    const unread = await json(await call('GET', '/api/notifications?unread=1', viewer));
    expect(unread.notifications.map((x: { id: string }) => x.id).sort()).toEqual([b, c].sort());
    const all = await json(await call('POST', '/api/notifications/read-all', viewer, {}));
    expect(all).toMatchObject({ ok: true, marked: 2, unreadCount: 0 });
    expect(
      (await json(await call('GET', '/api/notifications?unread=1', viewer))).notifications,
    ).toEqual([]);
  });

  it('shows and touches only your own: another user’s id is a 404, not a 403', async () => {
    await clear(adminId);
    const [theirs] = await insertFor(adminId, 1, '2026-06-02T10:00:00.000Z');
    const res = await call('POST', `/api/notifications/${theirs}/read`, viewer, {});
    expect(res.status).toBe(404);
    expect((await json(res)).error.code).toBe('notification_not_found');
    // identical to an id that does not exist
    const missing = await call('POST', `/api/notifications/${newId()}/read`, viewer, {});
    expect(missing.status).toBe(404);
    // and it was not read
    const rows = await app.db.query<{ read_at: string | null }>(
      'SELECT read_at FROM notifications WHERE id = ?',
      [theirs ?? ''],
    );
    expect(rows[0]?.read_at).toBeNull();
    // the viewer's list does not contain it
    const list = await json(await call('GET', '/api/notifications?limit=50', viewer));
    expect(list.notifications.map((x: { id: string }) => x.id)).not.toContain(theirs);
    // read-all by the viewer leaves the admin's unread alone
    await call('POST', '/api/notifications/read-all', viewer, {});
    expect(
      (await json(await call('GET', '/api/notifications/unread-count', admin))).unreadCount,
    ).toBe(1);
  });

  it('rejects a bad cursor or limit with a 400 naming the problem', async () => {
    const cursor = await call('GET', '/api/notifications?cursor=not-a-cursor', viewer);
    expect(cursor.status).toBe(400);
    expect((await json(cursor)).error.code).toBe('invalid_cursor');
    for (const limit of ['0', '51', 'x']) {
      const res = await call('GET', `/api/notifications?limit=${limit}`, viewer);
      expect(res.status).toBe(400);
      expect((await json(res)).error.code).toBe('invalid_limit');
    }
  });
});

describe('preferences', () => {
  it('lists every kind with its default, and saves a change', async () => {
    const before = await json(await call('GET', '/api/notifications/preferences', viewer));
    const byKind = Object.fromEntries(before.preferences.map((p: { kind: string }) => [p.kind, p]));
    expect(Object.keys(byKind).sort()).toEqual(['account', 'security', 'system', 'team']);
    expect(byKind.account).toMatchObject({ inApp: true, email: true, inAppLocked: false });
    expect(byKind.team).toMatchObject({ inApp: true, email: false });
    expect(byKind.security).toMatchObject({ inApp: true, email: true, inAppLocked: true });

    const res = await call('PUT', '/api/notifications/preferences', viewer, {
      preferences: [
        { kind: 'team', inApp: false, email: true },
        { kind: 'account', inApp: true, email: false },
      ],
    });
    expect(res.status).toBe(200);
    const after = Object.fromEntries(
      (await json(res)).preferences.map((p: { kind: string }) => [p.kind, p]),
    );
    expect(after.team).toMatchObject({ inApp: false, email: true });
    expect(after.account).toMatchObject({ inApp: true, email: false });
    expect(after.system).toMatchObject({ inApp: true, email: false }); // untouched

    await call('PUT', '/api/notifications/preferences', viewer, {
      preferences: [
        { kind: 'team', inApp: true, email: false },
        { kind: 'account', inApp: true, email: true },
      ],
    });
  });

  it('refuses to turn security in-app off, and malformed bodies', async () => {
    const locked = await call('PUT', '/api/notifications/preferences', viewer, {
      preferences: [{ kind: 'security', inApp: false, email: true }],
    });
    expect(locked.status).toBe(400);
    expect((await json(locked)).error.code).toBe('preference_locked');
    for (const preferences of [
      [],
      [{ kind: 'nope', inApp: true, email: true }],
      [{ kind: 'team', inApp: 'yes', email: true }],
      [
        { kind: 'team', inApp: true, email: true },
        { kind: 'team', inApp: true, email: false },
      ],
    ]) {
      const res = await call('PUT', '/api/notifications/preferences', viewer, { preferences });
      expect(res.status).toBe(400);
      expect((await json(res)).error.code).toBe('invalid_preferences');
    }
    expect((await call('PUT', '/api/notifications/preferences', viewer, {})).status).toBe(400);
  });
});

describe('Notifier', () => {
  const notifier = () => app.services.notifications;

  it('respects the preference per channel: in-app off writes no row, email on enqueues one', async () => {
    await clear(viewerId);
    mail.length = 0;
    await call('PUT', '/api/notifications/preferences', viewer, {
      preferences: [{ kind: 'team', inApp: false, email: true }],
    });
    await app.db.transaction((tx) =>
      notifier().notify(tx, {
        userId: viewerId,
        kind: 'team',
        title: 'Someone joined',
        body: 'Pat joined the team.',
        link: '/admin/users',
      }),
    );
    expect((await json(await call('GET', '/api/notifications', viewer))).notifications).toEqual([]);
    expect(mail).toHaveLength(1);
    expect(mail[0]?.msg).toMatchObject({
      to: VIEWER_EMAIL,
      template: 'notification',
      data: {
        title: 'Someone joined',
        body: 'Pat joined the team.',
        link: 'http://localhost:5173/#/admin/users',
      },
    });

    // email off, in-app on: a row, no mail
    mail.length = 0;
    await call('PUT', '/api/notifications/preferences', viewer, {
      preferences: [{ kind: 'team', inApp: true, email: false }],
    });
    await app.db.transaction((tx) =>
      notifier().notify(tx, { userId: viewerId, kind: 'team', title: 'Again' }),
    );
    expect(mail).toHaveLength(0);
    const list = await json(await call('GET', '/api/notifications', viewer));
    expect(list.notifications.map((x: { title: string }) => x.title)).toEqual(['Again']);
  });

  it('security in-app is on even if a stored preference says off', async () => {
    await clear(viewerId);
    await app.db.execute(
      `INSERT INTO notification_preferences (user_id, kind, in_app, email, updated_at)
       VALUES (?, 'security', 0, 0, ?)`,
      [viewerId, new Date()],
    );
    await app.db.transaction((tx) =>
      notifier().notify(tx, { userId: viewerId, kind: 'security', title: 'New sign-in' }),
    );
    const list = await json(await call('GET', '/api/notifications', viewer));
    expect(list.notifications.map((x: { title: string }) => x.title)).toEqual(['New sign-in']);
    await app.db.execute("DELETE FROM notification_preferences WHERE kind = 'security'");
  });

  it('rejects an external link and an unknown kind (a programming error, not user input)', async () => {
    await expect(
      app.db.transaction((tx) =>
        notifier().notify(tx, {
          userId: viewerId,
          kind: 'system',
          title: 't',
          link: 'https://evil.example',
        }),
      ),
    ).rejects.toThrow(/in-app path/);
    await expect(
      app.db.transaction((tx) =>
        notifier().notify(tx, { userId: viewerId, kind: 'nope' as 'system', title: 't' }),
      ),
    ).rejects.toThrow(/Unknown notification kind/);
  });

  it('does nothing for a user that does not exist', async () => {
    await app.db.transaction((tx) =>
      notifier().notify(tx, { userId: 'no-such-user', kind: 'system', title: 't' }),
    );
    expect(
      await app.db.query('SELECT id FROM notifications WHERE user_id = ?', ['no-such-user']),
    ).toEqual([]);
  });

  it('tells the browser only AFTER the commit: a rolled-back action publishes nothing', async () => {
    await clear(viewerId);
    const published: { userId: string; event: string; data: unknown }[] = [];
    const wrapped = withAfterCommit(app.db);
    const svc = createNotificationsService(wrapped, {
      publisher: { publish: (userId, event, data) => published.push({ userId, event, data }) },
    });

    await expect(
      wrapped.transaction(async (tx) => {
        await svc.notify(tx, { userId: viewerId, kind: 'system', title: 'rolled back' });
        throw new Error('the business action failed');
      }),
    ).rejects.toThrow('the business action failed');
    expect(published).toEqual([]);
    expect(
      await app.db.query('SELECT id FROM notifications WHERE user_id = ?', [viewerId]),
    ).toEqual([]);

    await wrapped.transaction(async (tx) => {
      await svc.notify(tx, { userId: viewerId, kind: 'system', title: 'kept' });
      // nothing is published while the transaction is still open
      expect(published).toEqual([]);
    });
    expect(published).toHaveLength(1);
    expect(published[0]).toMatchObject({
      userId: viewerId,
      event: 'notification',
      data: { notification: { title: 'kept', readAt: null }, unreadCount: 1 },
    });
  });
});

describe('admin test and broadcast', () => {
  it('the test sends the admin a system notification', async () => {
    await clear(adminId);
    const res = await call('POST', '/api/admin/notifications/test', admin, {});
    expect(res.status).toBe(200);
    const list = await json(await call('GET', '/api/notifications', admin));
    expect(list.notifications[0]).toMatchObject({ kind: 'system', title: 'Test notification' });
  });

  it('a broadcast reaches every active user and is audited', async () => {
    await clear(viewerId);
    await clear(adminId);
    const bad = await call('POST', '/api/admin/notifications/broadcast', admin, { title: '  ' });
    expect(bad.status).toBe(400);
    expect((await json(bad)).error.code).toBe('invalid_title');

    const res = await call('POST', '/api/admin/notifications/broadcast', admin, {
      title: 'Planned downtime',
      body: 'Saturday 02:00 to 03:00.',
    });
    expect(res.status).toBe(200);
    const { recipients } = await json(res);
    const active = await app.db.query<{ n: number }>(
      "SELECT COUNT(*) AS n FROM users WHERE status = 'active'",
    );
    expect(recipients).toBe(Number(active[0]?.n));
    for (const cookie of [admin, viewer]) {
      const list = await json(await call('GET', '/api/notifications', cookie));
      expect(list.notifications[0]).toMatchObject({
        kind: 'system',
        title: 'Planned downtime',
        body: 'Saturday 02:00 to 03:00.',
      });
    }
    const audit = await app.db.query<{ target: string; actor_user_id: string }>(
      "SELECT target, actor_user_id FROM audit_events WHERE action = 'notification.broadcast'",
    );
    expect(audit).toHaveLength(1);
    expect(audit[0]?.actor_user_id).toBe(adminId);
    expect(audit[0]?.target).toContain('Planned downtime');
  });
});

describe('what the users writes tell people', () => {
  const titles = async (userId: string) =>
    (
      await app.db.query<{ title: string; kind: string }>(
        'SELECT title, kind FROM notifications WHERE user_id = ? ORDER BY created_at, id',
        [userId],
      )
    ).map((r) => `${r.kind}:${r.title}`);

  it('a role change, a suspension and a reactivation notify the user (account)', async () => {
    const targetId = newId();
    const at = new Date();
    await app.db.execute(
      `INSERT INTO users (id, name, email, role, status, team, created_at, last_active_at, password_hash, updated_at)
       VALUES (?, 'Tess Target', 'target@example.com', 'viewer', 'active', 'Ops', ?, ?, 'x', ?)`,
      [targetId, at, at, at],
    );
    await call('PATCH', `/api/users/${targetId}`, admin, { role: 'editor' });
    await call('PATCH', `/api/users/${targetId}`, admin, { status: 'suspended' });
    await call('PATCH', `/api/users/${targetId}`, admin, { status: 'active' });
    expect(await titles(targetId)).toEqual([
      'account:Your role changed',
      'account:Your account was suspended',
      'account:Your account was reactivated',
    ]);
  });

  it('a failed change tells nobody', async () => {
    const before = await titles(adminId);
    const res = await call('PATCH', `/api/users/${adminId}`, admin, { role: 'viewer' });
    expect(res.status).toBe(409);
    expect(await titles(adminId)).toEqual(before);
  });

  it('an invitation notifies the OTHER admins, not the one who sent it', async () => {
    const otherId = newId();
    const at = new Date();
    await app.db.execute(
      `INSERT INTO users (id, name, email, role, status, team, created_at, last_active_at, password_hash, updated_at)
       VALUES (?, 'Olly Other', 'other-admin@example.com', 'admin', 'active', 'Ops', ?, ?, 'x', ?)`,
      [otherId, at, at, at],
    );
    const before = (await titles(adminId)).length;
    const res = await call('POST', '/api/users', admin, {
      name: 'Newcomer',
      email: 'newcomer@example.com',
      role: 'viewer',
      sendWelcome: false,
    });
    expect(res.status).toBe(201);
    expect(await titles(otherId)).toEqual(['team:Invitation sent']);
    expect((await titles(adminId)).length).toBe(before);
    // a suspended admin is not told
    await app.db.execute("UPDATE users SET status = 'suspended' WHERE id = ?", [otherId]);
    await call('POST', '/api/users', admin, {
      name: 'Newcomer Two',
      email: 'newcomer2@example.com',
      role: 'viewer',
      sendWelcome: false,
    });
    expect(await titles(otherId)).toEqual(['team:Invitation sent']);
  });
});

/* A real socket: the stream the browser's EventSource opens. */
async function openStream(cookie: string) {
  const abort = new AbortController();
  const res = await fetch(`${app.base}/api/events`, { headers: { cookie }, signal: abort.signal });
  const events: SseEvent[] = [];
  const waiters: (() => void)[] = [];
  let ended = false;
  const done = (async () => {
    try {
      if (res.body) {
        for await (const e of parseSse(res.body)) {
          events.push(e);
          for (const w of waiters.splice(0)) w();
        }
      }
    } catch {
      // aborted
    }
    ended = true;
    for (const w of waiters.splice(0)) w();
  })();
  const until = async (test: () => boolean, ms = 2000) => {
    const deadline = Date.now() + ms;
    while (!test()) {
      if (Date.now() > deadline) throw new Error('timed out waiting for the stream');
      await new Promise<void>((r) => {
        waiters.push(r);
        setTimeout(r, 20);
      });
    }
  };
  return {
    res,
    events,
    until,
    get ended() {
      return ended;
    },
    done,
    close: () => abort.abort(),
  };
}

describe('GET /api/events on a real socket', () => {
  it('opens an event stream, says ready, then delivers only the signed-in user their notifications', async () => {
    await clear(adminId);
    await clear(viewerId);
    const mine = await openStream(admin);
    const theirs = await openStream(viewer);
    expect(mine.res.status).toBe(200);
    expect(mine.res.headers.get('content-type')).toContain('text/event-stream');
    await mine.until(() => mine.events.some((e) => e.event === 'ready'));
    await theirs.until(() => theirs.events.some((e) => e.event === 'ready'));
    expect(app.services.realtime.count(adminId)).toBe(1);

    await call('POST', '/api/admin/notifications/test', admin, {});
    await mine.until(() => mine.events.some((e) => e.event === 'notification'));
    const event = mine.events.find((e) => e.event === 'notification');
    const data = JSON.parse(event?.data ?? '{}');
    expect(data.notification).toMatchObject({ kind: 'system', title: 'Test notification' });
    expect(data.unreadCount).toBe(1);
    expect(Number(event?.id)).toBeGreaterThan(0);

    // reading elsewhere updates the other tabs' count
    await call('POST', '/api/notifications/read-all', admin, {});
    await mine.until(() => mine.events.some((e) => e.event === 'notifications.read'));
    expect(
      JSON.parse(mine.events.find((e) => e.event === 'notifications.read')?.data ?? '{}'),
    ).toEqual({ unreadCount: 0 });

    // nothing reached the other user
    expect(theirs.events.map((e) => e.event)).toEqual(['ready']);
    mine.close();
    theirs.close();
    await Promise.all([mine.done, theirs.done]);
  });

  it('cleans up when the client disconnects', async () => {
    const stream = await openStream(viewer);
    await stream.until(() => stream.events.length > 0);
    expect(app.services.realtime.count(viewerId)).toBe(1);
    stream.close();
    await stream.done;
    for (let i = 0; i < 50 && app.services.realtime.count(viewerId) > 0; i++) {
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(app.services.realtime.count(viewerId)).toBe(0);
  });

  it('closes the stream when the session is revoked (disconnectSession), and on suspension', async () => {
    const cookie = await app.signIn(VIEWER_EMAIL, VIEWER_PASSWORD);
    const stream = await openStream(cookie);
    await stream.until(() => stream.events.length > 0);
    const [session] = await app.db.query<{ id: string }>(
      'SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC, id DESC',
      [viewerId],
    );
    expect(app.services.realtime.disconnectSession(session?.id ?? '')).toBe(1);
    await stream.done;
    expect(stream.ended).toBe(true);

    // an admin suspends the user: their open stream ends, with no extra call
    const targetEmail = 'streamer@example.com';
    const targetId = newId();
    const at = new Date();
    const { hashPassword } = await import('./services/index.ts');
    await app.db.execute(
      `INSERT INTO users (id, name, email, role, status, team, created_at, last_active_at, password_hash, updated_at)
       VALUES (?, 'Sam Streamer', ?, 'viewer', 'active', 'Ops', ?, ?, ?, ?)`,
      [targetId, targetEmail, at, at, await hashPassword('streamer password 1'), at],
    );
    const streamerCookie = await app.signIn(targetEmail, 'streamer password 1');
    const streamer = await openStream(streamerCookie);
    await streamer.until(() => streamer.events.length > 0);
    await call('PATCH', `/api/users/${targetId}`, admin, { status: 'suspended' });
    await streamer.until(() => streamer.ended);
    expect(app.services.realtime.count(targetId)).toBe(0);
  });

  it('keeps at most five streams per user, closing the oldest', async () => {
    const cookie = await app.signIn(VIEWER_EMAIL, VIEWER_PASSWORD);
    const streams: Awaited<ReturnType<typeof openStream>>[] = [];
    for (let i = 0; i < 6; i++) {
      const s = await openStream(cookie);
      await s.until(() => s.events.length > 0);
      streams.push(s);
    }
    await streams[0]?.until(() => streams[0]?.ended === true);
    expect(streams[0]?.ended).toBe(true);
    expect(streams[5]?.ended).toBe(false);
    expect(app.services.realtime.count(viewerId)).toBe(5);
    for (const s of streams) s.close();
    await Promise.all(streams.map((s) => s.done));
  });
});
