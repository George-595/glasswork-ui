import type { SessionUser } from '../../shared/api.ts';
import type { DbClient, DbExecutor } from '../infra/db/types.ts';
import { newId } from '../lib/ids.ts';
import { createRepositories } from '../repositories/index.ts';
import type { SignedIn } from './auth.ts';
import { ServiceError } from './errors.ts';
import { assertPasswordPolicy } from './password-policy.ts';
import { hashPassword } from './passwords.ts';
import {
  type Notifier,
  noopNotifier,
  noopOutbox,
  noopStreams,
  type Outbox,
  type StreamDisconnector,
} from './platform-deps.ts';
import { createRateLimiter } from './rate-limit.ts';
import { emailLink, invalidTokenError, TOKEN_TTL_WORDS, type TokenService } from './tokens.ts';

/* The credential flows that start from an emailed link or a forgotten password:
   accepting an invitation, asking for a reset link, and using one.

   Security decisions (OWASP ASVS V2.5, V3.3):
   - forgot-password answers the same thing, with a floor on how long it takes (`forgotMinMs`),
     for a known and an unknown address. The email is queued, not sent, in the request, so the
     slow part (the mail provider) is never visible; the floor hides the rest. Only an ACTIVE account is sent a link. An invited account who asks is sent nothing:
     their way in is the invitation (an admin can re-send it), and minting invitation links needs
     an inviter. A suspended account is sent nothing.
   - it is rate limited per email and per address (the 429 does not depend on whether the email
     has an account).
   - accepting and resetting spend the token in the same transaction as the change, so two
     concurrent requests cannot both succeed, and a failed change leaves the link usable.
   - a password reset ends EVERY session of the account (and closes their event streams), then
     signs this browser in fresh. A password-changed email and a security notification follow.
   - the token endpoints are rate limited per address, though the tokens are unguessable. */
export interface CredentialsDeps {
  db: DbClient;
  tokens: TokenService;
  /** Opens a session (from the auth service) in the transaction it is given. */
  startSession: (
    tx: DbExecutor,
    user: SessionUser,
    ip: string,
    userAgent: string | undefined,
  ) => Promise<SignedIn>;
  appBaseUrl: string;
  outbox?: Outbox;
  notifier?: Notifier;
  streams?: StreamDisconnector;
  now?: () => Date;
  /** How long forgot-password takes at least, so a known address cannot be told by speed. */
  forgotMinMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Limits (per window); tests lower them. */
  limits?: {
    forgotPerEmail?: number;
    forgotPerIp?: number;
    tokenPerIp?: number;
    windowMs?: number;
  };
}

const HOUR = 3_600_000;

/** "Tue, 12 Oct 2026, 14:03 UTC", for "your password was changed at …". */
export function formatWhen(at: Date): string {
  const text = new Intl.DateTimeFormat('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(at);
  return `${text} UTC`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const tooMany = () =>
  new ServiceError(
    'rate_limited',
    'too_many_attempts',
    'Too many attempts. Try again in a little while.',
  );

export function createCredentialsService(deps: CredentialsDeps) {
  const { db, tokens } = deps;
  const now = deps.now ?? (() => new Date());
  const outbox = deps.outbox ?? noopOutbox;
  const notifier = deps.notifier ?? noopNotifier;
  const streams = deps.streams ?? noopStreams;
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const forgotMinMs = deps.forgotMinMs ?? 300;
  const windowMs = deps.limits?.windowMs ?? HOUR;
  const forgotEmail = createRateLimiter({ max: deps.limits?.forgotPerEmail ?? 5, windowMs, now });
  const forgotIp = createRateLimiter({ max: deps.limits?.forgotPerIp ?? 20, windowMs, now });
  const tokenIp = createRateLimiter({ max: deps.limits?.tokenPerIp ?? 30, windowMs, now });
  const repos = createRepositories(db);

  const limitTokenCalls = (ip: string) => {
    if (!tokenIp.hit(ip)) throw tooMany();
  };

  return {
    /** Who an invitation is for. Spends nothing. */
    async inviteInfo(token: string, ip: string): Promise<{ name: string; email: string }> {
      limitTokenCalls(ip);
      const valid = await tokens.peek(db, token, 'invite');
      const user = valid ? await repos.users.findById(valid.userId) : null;
      if (user?.status !== 'invited') throw invalidTokenError();
      return { name: user.name, email: user.email };
    },

    async acceptInvite(
      input: { token: string; name: string; password: string },
      ip: string,
      userAgent: string | undefined,
    ): Promise<SignedIn> {
      limitTokenCalls(ip);
      const name = input.name.trim();
      if (name === '' || name.length > 200) {
        throw new ServiceError('invalid', 'invalid_name', 'Enter your name.', 'name');
      }
      // Look first (no spend), so the policy can see the email and the slow hash is made outside
      // the transaction. The token is only spent inside it.
      const valid = await tokens.peek(db, input.token, 'invite');
      const invited = valid ? await repos.users.findById(valid.userId) : null;
      if (invited?.status !== 'invited') throw invalidTokenError();
      assertPasswordPolicy(input.password, invited.email, 'password');
      const passwordHash = await hashPassword(input.password);

      return db.transaction(async (tx) => {
        const r = createRepositories(tx);
        const spent = await tokens.consume(tx, input.token, 'invite');
        const user = await r.users.findById(spent.userId);
        if (user?.status !== 'invited') throw invalidTokenError();
        const at = now();
        await r.users.setPasswordHash(user.id, passwordHash, at);
        await r.users.setName(user.id, name, at);
        // invited → active, only if nobody suspended them since we looked
        if (!(await r.users.moveStatus(user.id, ['invited'], 'active', at)))
          throw invalidTokenError();
        await r.audit.insert({
          id: newId(),
          at: at.toISOString(),
          actorUserId: user.id,
          actor: name,
          action: 'user.accept_invite',
          target: user.email,
          ip,
          outcome: 'success',
        });
        await notifier.notifyAdmins(tx, {
          kind: 'team',
          title: `${name} accepted their invite`,
          body: `${user.email} can now sign in.`,
          link: '/admin/users',
        });
        const session: SessionUser = {
          id: user.id,
          name,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatarUrl ?? null,
        };
        return deps.startSession(tx, session, ip, userAgent);
      });
    },

    /** Always resolves the same way for any well-formed request; only rate limits throw. */
    async forgotPassword(emailRaw: string, ip: string): Promise<void> {
      const began = now().getTime();
      const email = emailRaw.trim().toLowerCase().slice(0, 254);
      // Counted before any await, so a parallel burst cannot all pass.
      const allowed = forgotEmail.hit(`email:${email}`) && forgotIp.hit(`ip:${ip}`);
      if (!allowed) throw tooMany();

      const found = EMAIL.test(email) ? await repos.users.findCredentialsByEmail(email) : null;
      if (found && found.user.status === 'active') {
        const user = found.user;
        await db.transaction(async (tx) => {
          const issued = await tokens.issue(tx, user.id, 'password_reset');
          await outbox.sendEmail(tx, {
            to: user.email,
            template: 'password_reset',
            data: {
              name: user.name,
              link: emailLink(deps.appBaseUrl, 'reset-password', issued.token),
              expiresIn: TOKEN_TTL_WORDS.password_reset,
            },
          });
          await createRepositories(tx).audit.insert({
            id: newId(),
            at: now().toISOString(),
            actorUserId: user.id,
            actor: user.name,
            action: 'password.forgot',
            target: user.email,
            ip,
            outcome: 'success',
          });
        });
      } else {
        // An address that gets no email still costs a hash and a lookup, then waits out the floor.
        await tokens.peek(db, 'x'.repeat(43), 'password_reset');
      }
      const spent = now().getTime() - began;
      if (spent < forgotMinMs) await sleep(forgotMinMs - spent);
    },

    async resetPassword(
      input: { token: string; password: string },
      ip: string,
      userAgent: string | undefined,
    ): Promise<SignedIn> {
      limitTokenCalls(ip);
      const valid = await tokens.peek(db, input.token, 'password_reset');
      const target = valid ? await repos.users.findById(valid.userId) : null;
      if (target?.status !== 'active') throw invalidTokenError();
      assertPasswordPolicy(input.password, target.email, 'password');
      const passwordHash = await hashPassword(input.password);

      const signedIn = await db.transaction(async (tx) => {
        const r = createRepositories(tx);
        const spent = await tokens.consume(tx, input.token, 'password_reset');
        const user = await r.users.findById(spent.userId);
        if (user?.status !== 'active') throw invalidTokenError();
        const at = now();
        await r.users.setPasswordHash(user.id, passwordHash, at);
        await r.sessions.revokeForUser(user.id, at);
        // a second reset link, asked for before this one was used, must not outlive this reset
        await r.authTokens.voidUnused(user.id, 'password_reset', at);
        await r.audit.insert({
          id: newId(),
          at: at.toISOString(),
          actorUserId: user.id,
          actor: user.name,
          action: 'password.reset',
          target: user.email,
          ip,
          outcome: 'success',
        });
        await outbox.sendEmail(tx, {
          to: user.email,
          template: 'password_changed',
          data: { name: user.name, when: formatWhen(at) },
        });
        await notifier.notify(tx, {
          userId: user.id,
          kind: 'security',
          title: 'Your password was reset',
          body: 'All other sessions were signed out. If this was not you, contact an admin.',
          link: '/account',
        });
        const session: SessionUser = {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatarUrl: user.avatarUrl ?? null,
        };
        // opened AFTER the revoke above, so the fresh session is the only live one
        return deps.startSession(tx, session, ip, userAgent);
      });
      // after the commit: a rolled-back reset must not cut anyone's streams
      streams.disconnectUser(target.id);
      return signedIn;
    },
  };
}
export type CredentialsService = ReturnType<typeof createCredentialsService>;
