import type { DbExecutor } from '../infra/db/types.ts';

/* SQL for single-use tokens (invitations, password resets). Like sessions, only the token's
   SHA-256 is stored. Whether a token is acceptable (unexpired, unused, right purpose) is the
   service's call; `markUsed` is the atomic part: of two requests presenting the same token,
   exactly one gets true. */
export type TokenPurpose = 'invite' | 'password_reset';

export interface AuthTokenRecord {
  id: string;
  userId: string;
  purpose: TokenPurpose;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
}

type TokenRow = {
  id: string;
  user_id: string;
  purpose: string;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

const toToken = (r: TokenRow): AuthTokenRecord => ({
  id: r.id,
  userId: r.user_id,
  purpose: r.purpose as TokenPurpose,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
  usedAt: r.used_at,
});

export function authTokensRepository(db: DbExecutor) {
  return {
    async insert(t: {
      id: string;
      tokenHash: string;
      userId: string;
      purpose: TokenPurpose;
      createdAt: Date;
      expiresAt: Date;
    }): Promise<void> {
      await db.execute(
        `INSERT INTO auth_tokens (id, token_hash, user_id, purpose, created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [t.id, t.tokenHash, t.userId, t.purpose, t.createdAt, t.expiresAt],
      );
    },
    async findByHash(tokenHash: string): Promise<AuthTokenRecord | null> {
      const [row] = await db.query<TokenRow>(
        'SELECT id, user_id, purpose, created_at, expires_at, used_at FROM auth_tokens WHERE token_hash = ?',
        [tokenHash],
      );
      return row ? toToken(row) : null;
    },
    /** Spends a token. True for the one caller that spent it, false if it was already used. */
    async markUsed(id: string, at: Date): Promise<boolean> {
      const r = await db.execute(
        'UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL',
        [at, id],
      );
      return r.rowsAffected === 1;
    },
    /** Spends every unused token of one purpose for a user (a new reset link voids the old ones). */
    async voidUnused(userId: string, purpose: TokenPurpose, at: Date): Promise<number> {
      const r = await db.execute(
        'UPDATE auth_tokens SET used_at = ? WHERE user_id = ? AND purpose = ? AND used_at IS NULL',
        [at, userId, purpose],
      );
      return r.rowsAffected;
    },
    /** Housekeeping: deletes tokens that are spent or expired at or before `now`. */
    async deleteSpentOrExpired(now: Date): Promise<number> {
      const r = await db.execute(
        'DELETE FROM auth_tokens WHERE used_at IS NOT NULL OR expires_at <= ?',
        [now],
      );
      return r.rowsAffected;
    },
    /** Deletes tokens that expired at or before `now`. */
    async deleteExpired(now: Date): Promise<number> {
      const r = await db.execute('DELETE FROM auth_tokens WHERE expires_at <= ?', [now]);
      return r.rowsAffected;
    },
  };
}
export type AuthTokensRepository = ReturnType<typeof authTokensRepository>;
