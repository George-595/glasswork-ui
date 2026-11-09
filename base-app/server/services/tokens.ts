import { createHash, randomBytes } from 'node:crypto';
import type { DbExecutor } from '../infra/db/types.ts';
import { newId } from '../lib/ids.ts';
import type { AuthTokenRecord, TokenPurpose } from '../repositories/auth-tokens.ts';
import { createRepositories } from '../repositories/index.ts';
import { ServiceError } from './errors.ts';

/* Single-use tokens for the links in invitation and password-reset emails (OWASP ASVS V2.5).

   - 32 random bytes, base64url: unguessable, so a lookup by hash needs no constant-time compare.
   - Only the SHA-256 is stored. A database leak does not give out working links.
   - Life: an invitation 7 days, a reset 1 hour (`TOKEN_TTL_MS`).
   - One live token per user and purpose: issuing a new one spends every older unused one.
   - Single use is the database's job: `consume` is one conditional UPDATE (`used_at IS NULL`)
     run in the SAME transaction as the action it unlocks, so two concurrent requests with one
     token cannot both win, and an action that fails leaves the token usable.
   - A token that is unknown, expired, already used or of the wrong purpose all answer the same
     way ("This link is invalid or has expired"), so a link cannot be probed. */
export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  invite: 7 * 24 * 3_600_000,
  password_reset: 3_600_000,
};
export const TOKEN_TTL_WORDS: Record<TokenPurpose, string> = {
  invite: '7 days',
  password_reset: '1 hour',
};
export const INVALID_TOKEN_MESSAGE = 'This link is invalid or has expired.';
/* A real token is 43 characters; anything far longer is rubbish and never reaches the database. */
const MAX_TOKEN_LENGTH = 200;

export const sha256Hex = (value: string): string =>
  createHash('sha256').update(value).digest('hex');

export function invalidTokenError(): ServiceError {
  return new ServiceError('invalid', 'invalid_token', INVALID_TOKEN_MESSAGE);
}

/** The absolute link an email carries. The token is in the #fragment, which a browser never sends to
    a server or in a Referer header, so it is in no server log. */
export function emailLink(
  appBaseUrl: string,
  path: 'accept-invite' | 'reset-password',
  token: string,
): string {
  return `${appBaseUrl.replace(/\/+$/, '')}/${path}#token=${encodeURIComponent(token)}`;
}

export interface TokenServiceOptions {
  now?: () => Date;
}

export interface IssuedToken {
  /** The secret, for the email link. It exists only here and in that email. */
  token: string;
  expiresAt: Date;
}

export interface ValidToken {
  record: AuthTokenRecord;
  userId: string;
}

export function createTokenService(opts: TokenServiceOptions = {}) {
  const now = opts.now ?? (() => new Date());

  /** Voids the user's unused tokens of this purpose, then mints a new one. Call inside the
      transaction that sends the email, so a rollback leaves the old link working. */
  async function issue(
    tx: DbExecutor,
    userId: string,
    purpose: TokenPurpose,
  ): Promise<IssuedToken> {
    const repo = createRepositories(tx).authTokens;
    const at = now();
    await repo.voidUnused(userId, purpose, at);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(at.getTime() + TOKEN_TTL_MS[purpose]);
    await repo.insert({
      id: newId(),
      tokenHash: sha256Hex(token),
      userId,
      purpose,
      createdAt: at,
      expiresAt,
    });
    return { token, expiresAt };
  }

  async function find(
    db: DbExecutor,
    token: string,
    purpose: TokenPurpose,
  ): Promise<ValidToken | null> {
    if (token === '' || token.length > MAX_TOKEN_LENGTH) return null;
    const record = await createRepositories(db).authTokens.findByHash(sha256Hex(token));
    if (!record || record.purpose !== purpose) return null;
    if (record.usedAt !== null || record.expiresAt <= now().toISOString()) return null;
    return { record, userId: record.userId };
  }

  return {
    issue,

    /** Looks at a token without spending it (the page asking who an invitation is for). Null
        when it is unknown, the wrong purpose, used or expired. */
    peek: find,

    /** Spends a token, once. Throws the generic invalid-link error unless this caller is the
        one that spent it. Run it first inside the transaction of the action it unlocks. */
    async consume(tx: DbExecutor, token: string, purpose: TokenPurpose): Promise<ValidToken> {
      const found = await find(tx, token, purpose);
      if (!found) throw invalidTokenError();
      if (!(await createRepositories(tx).authTokens.markUsed(found.record.id, now()))) {
        throw invalidTokenError();
      }
      return found;
    },
  };
}
export type TokenService = ReturnType<typeof createTokenService>;
