import type { AccountProfile, AccountSession, SessionUser } from '../../shared/api.ts';
import type { DbClient } from '../infra/db/types.ts';
import { newId } from '../lib/ids.ts';
import { createRepositories } from '../repositories/index.ts';
import { formatWhen } from './credentials.ts';
import { ServiceError } from './errors.ts';
import { assertPasswordPolicy } from './password-policy.ts';
import { burnPasswordCheck, hashPassword, verifyPassword } from './passwords.ts';
import {
  type Notifier,
  noopNotifier,
  noopOutbox,
  noopStreams,
  type Outbox,
  type StreamDisconnector,
} from './platform-deps.ts';
import { createRateLimiter } from './rate-limit.ts';
import { sha256Hex } from './tokens.ts';

/* The signed-in person's own account: profile, password, and where they are signed in. Every
   method is about the caller and nothing else (the route never takes a user id), so there is no
   id to tamper with; a session id from the URL is matched against the caller's own sessions in
   the same statement that revokes it, and a stranger's id is a 404, not a 403.

   - changing the password needs the current one (rate limited per person: wrong guesses count),
     follows the shared policy, ends every OTHER session (this one stays), closes the event
     streams of those sessions, emails "password changed" and raises a `security` notification;
   - revoking a session ends it and closes its event stream;
   - the session token hash never leaves the server: the list says which row is `current` by
     comparing hashes here. */
export interface AccountDeps {
  db: DbClient;
  outbox?: Outbox;
  notifier?: Notifier;
  streams?: StreamDisconnector;
  now?: () => Date;
  /** Wrong current passwords allowed per person per window. */
  maxWrongPasswords?: number;
  windowMs?: number;
}

const profileOf = (user: {
  id: string;
  name: string;
  email: string;
  role: AccountProfile['role'];
  avatarUrl?: string | null;
}): AccountProfile => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  avatarUrl: user.avatarUrl ?? null,
});

export function createAccountService(deps: AccountDeps) {
  const { db } = deps;
  const now = deps.now ?? (() => new Date());
  const outbox = deps.outbox ?? noopOutbox;
  const notifier = deps.notifier ?? noopNotifier;
  const streams = deps.streams ?? noopStreams;
  const wrong = createRateLimiter({
    max: deps.maxWrongPasswords ?? 5,
    windowMs: deps.windowMs ?? 15 * 60_000,
    now,
  });
  const repos = createRepositories(db);

  /* The caller's current session row id, from their cookie's token; null when it cannot be found. */
  const currentSessionId = async (token: string | undefined): Promise<string | null> => {
    if (!token) return null;
    const session = await repos.sessions.find(sha256Hex(token));
    return session ? session.id : null;
  };

  return {
    async get(actor: SessionUser): Promise<AccountProfile> {
      const user = await repos.users.findById(actor.id);
      if (!user) throw new ServiceError('not_found', 'user_not_found', 'No such user.');
      return profileOf(user);
    },

    async updateProfile(actor: SessionUser, nameRaw: string, ip: string): Promise<AccountProfile> {
      const name = nameRaw.trim();
      if (name === '' || name.length > 200) {
        throw new ServiceError(
          'invalid',
          'invalid_name',
          'Enter a name (up to 200 characters).',
          'name',
        );
      }
      return db.transaction(async (tx) => {
        const r = createRepositories(tx);
        const user = await r.users.findById(actor.id);
        if (!user) throw new ServiceError('not_found', 'user_not_found', 'No such user.');
        const at = now();
        await r.users.setName(user.id, name, at);
        await r.audit.insert({
          id: newId(),
          at: at.toISOString(),
          actorUserId: user.id,
          actor: name,
          action: 'profile.update',
          target: user.email,
          ip,
          outcome: 'success',
        });
        return profileOf({ ...user, name });
      });
    },

    async changePassword(
      actor: SessionUser,
      sessionToken: string | undefined,
      input: { currentPassword: string; newPassword: string },
      ip: string,
    ): Promise<void> {
      if (wrong.blocked(actor.id)) {
        throw new ServiceError(
          'rate_limited',
          'too_many_attempts',
          'Too many wrong passwords. Try again in a few minutes.',
        );
      }
      const stored = await repos.users.findPasswordHash(actor.id);
      let matches = false;
      if (stored) matches = await verifyPassword(input.currentPassword, stored);
      else await burnPasswordCheck(input.currentPassword);
      const failAudit = (target: string) =>
        repos.audit.insert({
          id: newId(),
          at: now().toISOString(),
          actorUserId: actor.id,
          actor: actor.name,
          action: 'password.change',
          target,
          ip,
          outcome: 'failure',
        });
      if (!matches) {
        wrong.record(actor.id);
        await failAudit(actor.email);
        throw new ServiceError(
          'invalid',
          'incorrect_password',
          'Your current password is incorrect.',
          'currentPassword',
        );
      }
      wrong.clear(actor.id);
      assertPasswordPolicy(input.newPassword, actor.email, 'newPassword');
      if (input.newPassword === input.currentPassword) {
        throw new ServiceError(
          'invalid',
          'password_unchanged',
          'Choose a password you have not used just now.',
          'newPassword',
        );
      }
      const passwordHash = await hashPassword(input.newPassword);
      const keepId = await currentSessionId(sessionToken);

      const ended = await db.transaction(async (tx) => {
        const r = createRepositories(tx);
        const at = now();
        const others = (await r.sessions.listActiveForUser(actor.id, at)).filter(
          (s) => s.id !== keepId,
        );
        await r.users.setPasswordHash(actor.id, passwordHash, at);
        if (keepId) await r.sessions.revokeForUser(actor.id, at, keepId);
        else await r.sessions.revokeForUser(actor.id, at);
        await r.audit.insert({
          id: newId(),
          at: at.toISOString(),
          actorUserId: actor.id,
          actor: actor.name,
          action: 'password.change',
          target: actor.email,
          ip,
          outcome: 'success',
        });
        await outbox.sendEmail(tx, {
          to: actor.email,
          template: 'password_changed',
          data: { name: actor.name, when: formatWhen(at) },
        });
        await notifier.notify(tx, {
          userId: actor.id,
          kind: 'security',
          title: 'Your password was changed',
          body:
            others.length > 0
              ? `${others.length} other ${others.length === 1 ? 'session was' : 'sessions were'} signed out.`
              : 'If this was not you, reset your password now.',
          link: '/account',
        });
        return others;
      });
      for (const s of ended) streams.disconnectSession(s.id);
    },

    async listSessions(
      actor: SessionUser,
      sessionToken: string | undefined,
    ): Promise<AccountSession[]> {
      const current = await currentSessionId(sessionToken);
      const rows = await repos.sessions.listActiveForUser(actor.id, now());
      return rows.map((s) => ({
        id: s.id,
        userAgent: s.userAgent,
        ip: s.ip,
        createdAt: s.createdAt,
        lastSeenAt: s.lastSeenAt,
        current: s.id === current,
      }));
    },

    /** Ends one of the caller's own sessions. 404 for anyone else's, or one already ended. */
    async revokeSession(actor: SessionUser, sessionId: string, ip: string): Promise<void> {
      await db.transaction(async (tx) => {
        const r = createRepositories(tx);
        const at = now();
        if (!(await r.sessions.revokeById(actor.id, sessionId, at))) {
          throw new ServiceError('not_found', 'session_not_found', 'No such session.');
        }
        await r.audit.insert({
          id: newId(),
          at: at.toISOString(),
          actorUserId: actor.id,
          actor: actor.name,
          action: 'session.revoke',
          target: 'one session',
          ip,
          outcome: 'success',
        });
      });
      streams.disconnectSession(sessionId);
    },

    /** Ends every session of the caller except the one making this request. */
    async revokeOthers(
      actor: SessionUser,
      sessionToken: string | undefined,
      ip: string,
    ): Promise<number> {
      const keepId = await currentSessionId(sessionToken);
      if (!keepId) {
        // Without knowing which session this is, "the others" is undefined: end nothing.
        throw new ServiceError('not_found', 'session_not_found', 'No such session.');
      }
      const ended = await db.transaction(async (tx) => {
        const r = createRepositories(tx);
        const at = now();
        const others = (await r.sessions.listActiveForUser(actor.id, at)).filter(
          (s) => s.id !== keepId,
        );
        if (others.length === 0) return others;
        await r.sessions.revokeForUser(actor.id, at, keepId);
        await r.audit.insert({
          id: newId(),
          at: at.toISOString(),
          actorUserId: actor.id,
          actor: actor.name,
          action: 'session.revoke',
          target: `${others.length} other ${others.length === 1 ? 'session' : 'sessions'}`,
          ip,
          outcome: 'success',
        });
        return others;
      });
      for (const s of ended) streams.disconnectSession(s.id);
      return ended.length;
    },
  };
}
export type AccountService = ReturnType<typeof createAccountService>;
