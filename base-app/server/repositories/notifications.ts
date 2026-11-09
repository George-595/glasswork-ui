import { isUniqueViolation } from '../infra/db/index.ts';
import type { DbExecutor, SqlParam } from '../infra/db/types.ts';

/* SQL for in-app notifications and each user's per-kind delivery preferences. No rules here:
   which kinds exist, who gets them and whether a preference allows an email is the service's. */
export interface NotificationRecord {
  id: string;
  userId: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  createdAt: string;
  readAt: string | null;
}

type NotificationRow = {
  id: string;
  user_id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  created_at: string;
  read_at: string | null;
};

const COLUMNS = 'id, user_id, kind, title, body, link, created_at, read_at';

const toNotification = (r: NotificationRow): NotificationRecord => ({
  id: r.id,
  userId: r.user_id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  link: r.link,
  createdAt: r.created_at,
  readAt: r.read_at,
});

export interface PreferenceRecord {
  userId: string;
  kind: string;
  inApp: boolean;
  email: boolean;
  updatedAt: string;
}

type PreferenceRow = {
  user_id: string;
  kind: string;
  in_app: number | string;
  email: number | string;
  updated_at: string;
};

export function notificationsRepository(db: DbExecutor) {
  return {
    async insert(n: {
      id: string;
      userId: string;
      kind: string;
      title: string;
      body?: string | null;
      link?: string | null;
      createdAt: Date;
    }): Promise<void> {
      await db.execute(
        `INSERT INTO notifications (id, user_id, kind, title, body, link, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [n.id, n.userId, n.kind, n.title, n.body ?? null, n.link ?? null, n.createdAt],
      );
    },
    /** A user's notifications, newest first. LIMIT is inlined as a checked integer (MySQL).
        `after` is a keyset cursor: only rows older than that (createdAt, id) pair, in the same
        (created_at DESC, id DESC) order, so a page never skips or repeats a row however many
        arrive meanwhile. ix_notifications_user_id_created_at serves it. */
    async listForUser(
      userId: string,
      opts: {
        limit: number;
        unreadOnly?: boolean;
        after?: { createdAt: Date; id: string };
      },
    ): Promise<NotificationRecord[]> {
      const n = Math.max(1, Math.min(200, Math.floor(opts.limit)));
      const params: SqlParam[] = [userId];
      let where = 'user_id = ?';
      if (opts.unreadOnly) where += ' AND read_at IS NULL';
      if (opts.after) {
        where += ' AND (created_at < ? OR (created_at = ? AND id < ?))';
        params.push(opts.after.createdAt, opts.after.createdAt, opts.after.id);
      }
      const rows = await db.query<NotificationRow>(
        `SELECT ${COLUMNS} FROM notifications WHERE ${where}
         ORDER BY created_at DESC, id DESC LIMIT ${n}`,
        params,
      );
      return rows.map(toNotification);
    },
    /** One notification, only if it belongs to the user (someone else's id is simply absent). */
    async findForUser(userId: string, id: string): Promise<NotificationRecord | null> {
      const [row] = await db.query<NotificationRow>(
        `SELECT ${COLUMNS} FROM notifications WHERE id = ? AND user_id = ?`,
        [id, userId],
      );
      return row ? toNotification(row) : null;
    },
    async countUnread(userId: string): Promise<number> {
      const [row] = await db.query<{ n: number | string }>(
        'SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL',
        [userId],
      );
      return Number(row?.n ?? 0);
    },
    /** Marks one of the user's notifications read; false if it is not theirs or already read. */
    async markRead(userId: string, id: string, at: Date): Promise<boolean> {
      const r = await db.execute(
        'UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ? AND read_at IS NULL',
        [at, id, userId],
      );
      return r.rowsAffected > 0;
    },
    async markAllRead(userId: string, at: Date): Promise<number> {
      const r = await db.execute(
        'UPDATE notifications SET read_at = ? WHERE user_id = ? AND read_at IS NULL',
        [at, userId],
      );
      return r.rowsAffected;
    },
    /** Retention: deletes notifications created before `before`. */
    async deleteCreatedBefore(before: Date): Promise<number> {
      const r = await db.execute('DELETE FROM notifications WHERE created_at < ?', [before]);
      return r.rowsAffected;
    },
    /** Retention: deletes notifications that were read and created before `before`. Unread
        ones are kept however old they are. */
    async deleteReadBefore(before: Date): Promise<number> {
      const r = await db.execute(
        'DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < ?',
        [before],
      );
      return r.rowsAffected;
    },

    async listPreferences(userId: string): Promise<PreferenceRecord[]> {
      const rows = await db.query<PreferenceRow>(
        'SELECT user_id, kind, in_app, email, updated_at FROM notification_preferences WHERE user_id = ? ORDER BY kind',
        [userId],
      );
      return rows.map((r) => ({
        userId: r.user_id,
        kind: r.kind,
        inApp: Number(r.in_app) === 1,
        email: Number(r.email) === 1,
        updatedAt: r.updated_at,
      }));
    },
    /** Sets one preference. UPDATE first, INSERT when nothing matched (portable upsert); if a
        concurrent writer inserted in between, the INSERT's key violation falls back to UPDATE. */
    async setPreference(p: {
      userId: string;
      kind: string;
      inApp: boolean;
      email: boolean;
      at: Date;
    }): Promise<void> {
      const update = () =>
        db.execute(
          `UPDATE notification_preferences SET in_app = ?, email = ?, updated_at = ?
           WHERE user_id = ? AND kind = ?`,
          [p.inApp ? 1 : 0, p.email ? 1 : 0, p.at, p.userId, p.kind],
        );
      if ((await update()).rowsAffected > 0) return;
      try {
        await db.execute(
          `INSERT INTO notification_preferences (user_id, kind, in_app, email, updated_at)
           VALUES (?, ?, ?, ?, ?)`,
          [p.userId, p.kind, p.inApp ? 1 : 0, p.email ? 1 : 0, p.at],
        );
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
        await update();
      }
    },
  };
}
export type NotificationsRepository = ReturnType<typeof notificationsRepository>;
