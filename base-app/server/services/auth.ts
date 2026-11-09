import { randomBytes } from 'node:crypto';
import { canViewAs, ROLE_LABELS } from '../../lib/roles.ts';
import { describeUserAgent } from '../../lib/user-agent.ts';
import type { Role, SessionUser } from '../../shared/api.ts';
import type { DbClient, DbExecutor } from '../infra/db/types.ts';
import { newId } from '../lib/ids.ts';
import { createRepositories } from '../repositories/index.ts';
import { ServiceError } from './errors.ts';
import { burnPasswordCheck, verifyPassword } from './passwords.ts';
import { type Notifier, noopNotifier } from './platform-deps.ts';
import { toSessionUser } from './session-user.ts';
import { sha256Hex } from './tokens.ts';

/* Sign-in, sessions and sign-out.
   - A session is a random 32-byte token in an httpOnly cookie; the database
     stores only its SHA-256, with an expiry, the browser and address it was made
     from, and when it was last seen (written at most once a minute per session).
     Sign-out sets revoked_at; the row stays until it expires.
   - Failed sign-ins are rate limited per email and per client address
     (in memory: one process, which is what this template runs).
   - Every sign-in, failed sign-in and sign-out is written to the audit log.
   - "View as": an admin may view as an editor or a viewer and an editor as a viewer. The session
     stores the role (`acting_role`); `authenticate` returns the person with `role` = the
     effective role (never above the real one), so every check downstream is the lower role's.
     Starting and ending it are audited (`view_as.start`, `view_as.end`) under the REAL person's
     id; sign-out ends it.
   - A sign-in from a browser and system this person has not used in their last
     NEW_DEVICE_WINDOW sessions raises a `security` notification ("New sign-in on Chrome on
     macOS"). Their very first session raises none (there is nothing to compare with). */
export interface AuthServiceOptions {
  sessionTtlHours: number;
  /** Failed attempts allowed per window, per email and per address. */
  maxFailures?: number;
  failureWindowMs?: number;
  now?: () => Date;
  notifier?: Notifier;
  /** Told, after the change is saved, that a session now views as another role: the live
      streams of that session count as `role` from then on (the realtime hub). */
  onViewAs?: (sessionId: string, role: Role, actingRole: Role | null) => void;
}

/* How many of a person's latest sessions a new sign-in is compared with. */
const NEW_DEVICE_WINDOW = 10;

/* A session's last_seen_at is refreshed at most this often, so reads do not write. */
const TOUCH_INTERVAL_MS = 60_000;

export interface SignedIn {
  user: SessionUser;
  token: string;
  maxAgeSec: number;
}

const hashToken = sha256Hex;

export function createAuthService(db: DbClient, opts: AuthServiceOptions) {
  const repos = createRepositories(db);
  const now = opts.now ?? (() => new Date());
  const notifier = opts.notifier ?? noopNotifier;
  const maxFailures = opts.maxFailures ?? 10;
  const windowMs = opts.failureWindowMs ?? 15 * 60_000;
  const failures = new Map<string, number[]>();
  const MAX_KEYS = 10_000;

  /* Attempts in the window for a key. Empty keys are dropped, and the map is
     capped (oldest keys first), so random emails cannot grow it without bound. */
  const recent = (key: string): number[] => {
    const cutoff = now().getTime() - windowMs;
    const list = (failures.get(key) ?? []).filter((t) => t > cutoff);
    if (list.length === 0) failures.delete(key);
    else failures.set(key, list);
    return list;
  };
  const record = (key: string): void => {
    const list = recent(key);
    list.push(now().getTime());
    failures.delete(key);
    failures.set(key, list);
    while (failures.size > MAX_KEYS) {
      const oldest = failures.keys().next().value;
      if (oldest === undefined) break;
      failures.delete(oldest);
    }
  };
  const audit = (
    actor: string,
    actorUserId: string | null,
    action: 'login' | 'logout',
    target: string,
    ip: string,
    ok: boolean,
  ) =>
    repos.audit.insert({
      id: newId(),
      at: now().toISOString(),
      actorUserId,
      // the columns are VARCHAR(200) / VARCHAR(254): an over-long email must not 500 the login
      actor: actor.slice(0, 200),
      action,
      target: target.slice(0, 254),
      ip,
      outcome: ok ? 'success' : 'failure',
    });

  /* Opens a session for a user, in the caller's transaction: the token to set in the cookie. */
  const startSession = async (
    tx: DbExecutor,
    user: SessionUser,
    ip: string,
    userAgent: string | undefined,
  ): Promise<SignedIn> => {
    const r = createRepositories(tx);
    const token = randomBytes(32).toString('base64url');
    const created = now();
    const maxAgeSec = Math.round(opts.sessionTtlHours * 3600);
    await r.sessions.insert({
      id: newId(),
      tokenHash: hashToken(token),
      userId: user.id,
      userAgent: userAgent ?? null,
      ip,
      createdAt: created,
      expiresAt: new Date(created.getTime() + maxAgeSec * 1000),
    });
    await r.users.touchLastActive(user.id, created);
    return { user, token, maxAgeSec };
  };

  return {
    startSession,

    async login(
      emailRaw: string,
      password: string,
      ip: string,
      userAgent?: string,
    ): Promise<SignedIn> {
      const email = emailRaw.trim().toLowerCase();
      /* Three limits, so a stranger cannot cheaply lock the real admin out:
         this email from this address (tight), this address (an office or proxy
         serves many people), and this email from anywhere (distributed guessing). */
      const limits: [string, number][] = [
        [`pair:${email}|${ip}`, maxFailures],
        [`ip:${ip}`, maxFailures * 5],
        [`email:${email}`, maxFailures * 10],
      ];
      if (limits.some(([k, max]) => recent(k).length >= max)) {
        throw new ServiceError(
          'rate_limited',
          'too_many_attempts',
          'Too many failed sign-ins. Try again in a few minutes.',
        );
      }

      // Counted before any await, so a parallel burst cannot all pass the check above.
      for (const [k] of limits) record(k);

      const found = await repos.users.findCredentialsByEmail(email);
      const ok =
        found?.passwordHash && found.user.status === 'active'
          ? await verifyPassword(password, found.passwordHash)
          : (await burnPasswordCheck(password), false);
      if (!found || !ok) {
        await audit(found?.user.name ?? email, found?.user.id ?? null, 'login', email, ip, false);
        throw new ServiceError(
          'invalid_credentials',
          'invalid_credentials',
          'Email or password is incorrect.',
        );
      }

      // A good sign-in clears this pair, and takes back its own attempt from the wider limits.
      failures.delete(limits[0]?.[0] ?? '');
      for (const [k] of limits.slice(1)) recent(k).pop();
      // a fresh sign-in is never viewing as anyone
      const user = toSessionUser(found.user);
      const signedIn = await db.transaction(async (tx) => {
        // judged against the sessions that existed BEFORE this one
        const seen = await createRepositories(tx).sessions.recentUserAgents(
          user.id,
          NEW_DEVICE_WINDOW,
        );
        const opened = await startSession(tx, user, ip, userAgent);
        const device = describeUserAgent(userAgent).label;
        if (seen.length > 0 && !seen.some((ua) => describeUserAgent(ua).label === device)) {
          await notifier.notify(tx, {
            userId: user.id,
            kind: 'security',
            title: `New sign-in on ${device}`,
            body: 'If this was not you, change your password and sign out your other sessions.',
            link: '/account',
          });
        }
        return opened;
      });
      await audit(found.user.name, found.user.id, 'login', email, ip, true);
      return signedIn;
    },

    /** The user behind a session token, or null when missing, unknown or expired. */
    async authenticate(token: string | undefined): Promise<SessionUser | null> {
      if (!token || token.length > 200) return null;
      const tokenHash = hashToken(token);
      const session = await repos.sessions.find(tokenHash);
      if (!session) return null;
      const at = now();
      if (session.revokedAt !== null || session.expiresAt <= at.toISOString()) return null;
      const user = await repos.users.findById(session.userId);
      if (user?.status !== 'active') return null;
      if (at.getTime() - Date.parse(session.lastSeenAt) >= TOUCH_INTERVAL_MS) {
        await repos.sessions.touch(session.id, at, new Date(at.getTime() - TOUCH_INTERVAL_MS));
      }
      return toSessionUser(user, session.actingRole);
    },

    /** POST /api/auth/view-as: this session views as `role` (a role strictly below the person's
        REAL role), or, with null, goes back to its own. The one place the real role is read.
        403 `forbidden_role` for a role that is not below it. Returns the person as the session
        now sees them. Audited under the real person's id: `view_as.start` with the role, and
        `view_as.end` when it stops (a change from one role to another writes both). */
    async viewAs(
      token: string | undefined,
      actor: SessionUser,
      role: unknown,
      ip: string,
    ): Promise<SessionUser> {
      const real = actor.realRole ?? actor.role;
      if (role !== null && !canViewAs(real, role)) {
        throw new ServiceError(
          'forbidden',
          'forbidden_role',
          'You can only view the app as a role below your own.',
          'role',
        );
      }
      if (!token || token.length > 200) {
        throw new ServiceError('forbidden', 'unauthenticated', 'Sign in to use this.');
      }
      const tokenHash = hashToken(token);
      const target: Role | null = role;
      const before = actor.actingRole ?? null;
      const at = now();
      const changed = await db.transaction(async (tx) => {
        const r = createRepositories(tx);
        const live = await r.sessions.setActingRole(tokenHash, target, at);
        if (!live) {
          throw new ServiceError('forbidden', 'unauthenticated', 'Sign in to use this.');
        }
        if (before === target) return false;
        const event = (action: 'view_as.start' | 'view_as.end', text: string, detail: object) =>
          r.audit.insert({
            id: newId(),
            at: at.toISOString(),
            actorUserId: actor.id,
            actor: actor.name.slice(0, 200),
            action,
            target: `${actor.email} ${text}`.slice(0, 254),
            ip,
            outcome: 'success',
            detail: JSON.stringify({ realRole: real, ...detail }),
          });
        if (before) {
          await event('view_as.end', `stopped viewing as ${ROLE_LABELS[before]}`, {
            actingRole: before,
          });
        }
        if (target) {
          await event('view_as.start', `viewing as ${ROLE_LABELS[target]}`, { actingRole: target });
        }
        return true;
      });
      const next = toSessionUser(
        {
          id: actor.id,
          name: actor.name,
          email: actor.email,
          role: real,
          avatarUrl: actor.avatarUrl ?? null,
        },
        target,
      );
      if (changed) {
        const session = await repos.sessions.find(tokenHash);
        if (session) opts.onViewAs?.(session.id, next.role, next.actingRole ?? null);
      }
      return next;
    },

    /** Ends the session. Signing out also ends "View as" (the row keeps no acting role), and says
        so in the audit log when it was on. */
    async logout(token: string | undefined, actor: SessionUser | null, ip: string): Promise<void> {
      if (token) await repos.sessions.revoke(hashToken(token), now());
      if (actor?.actingRole) {
        await repos.audit.insert({
          id: newId(),
          at: now().toISOString(),
          actorUserId: actor.id,
          actor: actor.name.slice(0, 200),
          action: 'view_as.end',
          target:
            `${actor.email} signed out while viewing as ${ROLE_LABELS[actor.actingRole]}`.slice(
              0,
              254,
            ),
          ip,
          outcome: 'success',
          detail: JSON.stringify({ realRole: actor.realRole, actingRole: actor.actingRole }),
        });
      }
      if (actor) await audit(actor.name, actor.id, 'logout', actor.email, ip, true);
    },

    async sweepExpired(): Promise<number> {
      return repos.sessions.deleteExpired(now());
    },
  };
}
export type AuthService = ReturnType<typeof createAuthService>;
