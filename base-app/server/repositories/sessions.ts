import type { DbExecutor } from '../infra/db/types.ts';

/* SQL for sign-in sessions. Only the token's hash is ever stored or queried. A session ends
   by `revoked_at` (sign-out, suspension, "sign out everywhere") or by `expires_at`; revoked
   rows stay until they expire so the account's session list can show them. Timestamps go in
   as Date and come back as ISO-8601 UTC strings. */
export interface SessionRecord {
  id: string;
  userId: string;
  userAgent: string | null;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  revokedAt: string | null;
  /** The lower role this session views as (docs/V2-UX.md 2.6 B), or null. */
  actingRole: string | null;
}

type SessionRow = {
  id: string;
  user_id: string;
  user_agent: string | null;
  ip: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  revoked_at: string | null;
  acting_role: string | null;
};

const COLUMNS =
  'id, user_id, user_agent, ip, created_at, last_seen_at, expires_at, revoked_at, acting_role';

const toSession = (r: SessionRow): SessionRecord => ({
  id: r.id,
  userId: r.user_id,
  userAgent: r.user_agent,
  ip: r.ip,
  createdAt: r.created_at,
  lastSeenAt: r.last_seen_at,
  expiresAt: r.expires_at,
  revokedAt: r.revoked_at,
  actingRole: r.acting_role,
});

export function sessionsRepository(db: DbExecutor) {
  return {
    async insert(s: {
      id: string;
      tokenHash: string;
      userId: string;
      userAgent: string | null;
      ip: string | null;
      createdAt: Date;
      expiresAt: Date;
    }): Promise<void> {
      await db.execute(
        `INSERT INTO sessions (id, token_hash, user_id, user_agent, ip, created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          s.id,
          s.tokenHash,
          s.userId,
          s.userAgent?.slice(0, 300) ?? null,
          s.ip?.slice(0, 45) ?? null,
          s.createdAt,
          s.createdAt,
          s.expiresAt,
        ],
      );
    },
    async find(tokenHash: string): Promise<SessionRecord | null> {
      const [row] = await db.query<SessionRow>(
        `SELECT ${COLUMNS} FROM sessions WHERE token_hash = ?`,
        [tokenHash],
      );
      return row ? toSession(row) : null;
    },
    /** A user's sessions that are neither revoked nor expired at `now`, newest first. */
    async listActiveForUser(userId: string, now: Date): Promise<SessionRecord[]> {
      const rows = await db.query<SessionRow>(
        `SELECT ${COLUMNS} FROM sessions
         WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
         ORDER BY created_at DESC, id DESC`,
        [userId, now],
      );
      return rows.map(toSession);
    },
    /** The user agents of a user's newest `limit` sessions, ended or not, newest first (null when
        a client sent none): what "a device we have seen before" is judged against. */
    async recentUserAgents(userId: string, limit: number): Promise<(string | null)[]> {
      const n = Math.max(1, Math.min(100, Math.floor(limit)));
      const rows = await db.query<{ user_agent: string | null }>(
        `SELECT user_agent FROM sessions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ${n}`,
        [userId],
      );
      return rows.map((r) => r.user_agent);
    },
    /** Records activity, but only when the last record is older than `olderThan`: the throttle
        is in the statement, so a busy session writes at most once per interval. */
    async touch(id: string, at: Date, olderThan: Date): Promise<boolean> {
      const r = await db.execute(
        'UPDATE sessions SET last_seen_at = ? WHERE id = ? AND last_seen_at < ?',
        [at, id, olderThan],
      );
      return r.rowsAffected > 0;
    },
    /** Sets (or, with null, clears) the role a LIVE session views as. False when there is no such
        live session. The caller has already checked the role is below the person's own. */
    async setActingRole(tokenHash: string, role: string | null, now: Date): Promise<boolean> {
      const r = await db.execute(
        `UPDATE sessions SET acting_role = ?
         WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
        [role, tokenHash, now],
      );
      return r.rowsAffected > 0;
    },
    /** Ends one session by token hash. Idempotent: an already revoked session keeps its time. */
    async revoke(tokenHash: string, at: Date): Promise<void> {
      await db.execute(
        'UPDATE sessions SET revoked_at = ?, acting_role = NULL WHERE token_hash = ? AND revoked_at IS NULL',
        [at, tokenHash],
      );
    },
    /** Ends one of a user's sessions by id; false when it is not theirs or already ended. */
    async revokeById(userId: string, id: string, at: Date): Promise<boolean> {
      const r = await db.execute(
        'UPDATE sessions SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at IS NULL',
        [at, id, userId],
      );
      return r.rowsAffected > 0;
    },
    /** Ends every live session of one user (on suspension, password change). */
    async revokeForUser(userId: string, at: Date, exceptId?: string): Promise<void> {
      if (exceptId === undefined) {
        await db.execute(
          'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL',
          [at, userId],
        );
      } else {
        await db.execute(
          'UPDATE sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL AND id <> ?',
          [at, userId, exceptId],
        );
      }
    },
    /** Deletes sessions that expired at or before `now`. */
    async deleteExpired(now: Date): Promise<number> {
      const r = await db.execute('DELETE FROM sessions WHERE expires_at <= ?', [now]);
      return r.rowsAffected;
    },
  };
}
export type SessionsRepository = ReturnType<typeof sessionsRepository>;
