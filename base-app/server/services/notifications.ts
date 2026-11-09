import type {
  MarkAllReadResponse,
  MarkReadResponse,
  Notification,
  NotificationKind,
  NotificationPreference,
  NotificationsResponse,
  SessionUser,
} from '../../shared/api.ts';
import { afterCommit } from '../infra/db/after-commit.ts';
import type { DbClient, DbExecutor } from '../infra/db/types.ts';
import { newId } from '../lib/ids.ts';
import { createRepositories } from '../repositories/index.ts';
import type { NotificationRecord } from '../repositories/notifications.ts';
import { ServiceError } from './errors.ts';

/* Notifications: the in-app inbox, each user's choices about how to be told, and the one
   door (Notifier) the rest of the server uses to tell someone something.

   notify(tx, input), called inside the caller's transaction:
     1. looks up the user's preference for that kind (a code default when they never chose);
     2. inserts the inbox row when in-app is on;
     3. enqueues an email through the Outbox (the `notification` template) when email is on;
     4. queues the realtime publish with afterCommit(tx, ...), so the browser hears about it only
        if the transaction committed. A rolled-back business action leaves no row, no email job
        and no event.
   The kinds, their defaults and what may be switched off are in NOTIFICATION_KINDS below. */

export type { NotificationKind } from '../../shared/api.ts';

export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  /** An in-app path ("/admin/users"). */
  link?: string;
}

/** What services hand a notification to. AUTH and the users service depend on this shape only. */
export interface Notifier {
  notify(tx: DbExecutor, input: NotifyInput): Promise<void>;
  /** Every active admin, or all but `exceptUserId` (the admin who did the thing). */
  notifyAdmins(
    tx: DbExecutor,
    input: Omit<NotifyInput, 'userId'>,
    opts?: { exceptUserId?: string },
  ): Promise<void>;
}

/** The mail outbox, as far as this service uses it (the same shape as services/outbox.ts). */
export interface EmailMessage {
  to: string;
  template: 'invite' | 'password_reset' | 'password_changed' | 'notification';
  data: Record<string, string>;
}
export interface Outbox {
  sendEmail(tx: DbExecutor, msg: EmailMessage): Promise<void>;
}

/** How the service tells the browser. RealtimeHub satisfies it. */
export interface Publisher {
  publish(userId: string, event: string, data?: unknown): void;
}

export interface KindInfo {
  label: string;
  description: string;
  defaults: { inApp: boolean; email: boolean };
  /** In-app cannot be switched off (a user must always be able to see it). */
  inAppLocked: boolean;
}

/* The registry. The database holds `kind` as free text (adding a kind is code only); the code
   decides which exist. Add a kind here, and in the shared NotificationKind type. */
export const NOTIFICATION_KINDS: Readonly<Record<NotificationKind, KindInfo>> = {
  account: {
    label: 'Account',
    description: 'Changes to your account: your role, your status, your profile.',
    defaults: { inApp: true, email: true },
    inAppLocked: false,
  },
  security: {
    label: 'Security',
    description: 'New sign-ins, password changes and anything that affects how you get in.',
    defaults: { inApp: true, email: true },
    inAppLocked: true,
  },
  team: {
    label: 'Team',
    description: 'What happens around you: invitations sent, people who joined.',
    defaults: { inApp: true, email: false },
    inAppLocked: false,
  },
  system: {
    label: 'System',
    description: 'Announcements and notices from the workspace.',
    defaults: { inApp: true, email: false },
    inAppLocked: false,
  },
};
const KIND_IDS = Object.keys(NOTIFICATION_KINDS) as NotificationKind[];
const isKind = (value: unknown): value is NotificationKind =>
  typeof value === 'string' && (KIND_IDS as string[]).includes(value);

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const TITLE_MAX = 200;
const BODY_MAX = 1000;
const LINK_MAX = 300;

const toWire = (n: NotificationRecord): Notification => ({
  id: n.id,
  kind: (isKind(n.kind) ? n.kind : 'system') as NotificationKind,
  title: n.title,
  body: n.body,
  link: n.link,
  createdAt: n.createdAt,
  readAt: n.readAt,
});

/* The cursor is opaque to the client: the last row's (createdAt, id), base64url JSON. */
export function encodeCursor(row: { createdAt: string; id: string }): string {
  return Buffer.from(JSON.stringify([row.createdAt, row.id])).toString('base64url');
}
export function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  const bad = () =>
    new ServiceError('invalid', 'invalid_cursor', 'That page marker is not valid.', 'cursor');
  if (cursor.length > 200) throw bad();
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (!Array.isArray(parsed) || parsed.length !== 2) throw bad();
    const [at, id] = parsed as unknown[];
    if (typeof at !== 'string' || typeof id !== 'string' || id.length > 36) throw bad();
    const createdAt = new Date(at);
    if (Number.isNaN(createdAt.getTime())) throw bad();
    return { createdAt, id };
  } catch (err) {
    throw err instanceof ServiceError ? err : bad();
  }
}

export interface NotificationsServiceDeps {
  /** Tells the browser; defaults to nobody (tests of rules alone). */
  publisher?: Publisher;
  /** The mail outbox; without one, email preferences are respected but nothing is sent. */
  outbox?: Outbox;
  /** Absolute origin for links in emails, e.g. http://localhost:5173. */
  appBaseUrl?: string;
  now?: () => Date;
}

export function createNotificationsService(db: DbClient, deps: NotificationsServiceDeps = {}) {
  const now = deps.now ?? (() => new Date());
  const publisher = deps.publisher;
  const base = deps.appBaseUrl?.replace(/\/+$/, '');

  /* The effective choice for one user and kind: their saved row, else the code default; a
     locked in-app channel is always on. */
  async function channelsFor(
    r: ReturnType<typeof createRepositories>,
    userId: string,
    kind: NotificationKind,
  ): Promise<{ inApp: boolean; email: boolean }> {
    const info = NOTIFICATION_KINDS[kind];
    const saved = (await r.notifications.listPreferences(userId)).find((p) => p.kind === kind);
    return {
      inApp: info.inAppLocked ? true : (saved?.inApp ?? info.defaults.inApp),
      email: saved?.email ?? info.defaults.email,
    };
  }

  function checkInput(input: NotifyInput): void {
    if (!isKind(input.kind)) throw new Error(`Unknown notification kind "${String(input.kind)}".`);
    if (input.title.trim() === '' || input.title.length > TITLE_MAX) {
      throw new Error(`A notification title is 1 to ${TITLE_MAX} characters.`);
    }
    if ((input.body?.length ?? 0) > BODY_MAX) {
      throw new Error(`A notification body is at most ${BODY_MAX} characters.`);
    }
    if (input.link !== undefined) {
      // an in-app path only: never an address that could send someone elsewhere
      if (!/^\/(?!\/)[^\s]*$/.test(input.link) || input.link.length > LINK_MAX) {
        throw new Error('A notification link is an in-app path starting with "/".');
      }
    }
  }

  async function notify(tx: DbExecutor, input: NotifyInput): Promise<void> {
    checkInput(input);
    const r = createRepositories(tx);
    const user = await r.users.findById(input.userId);
    if (!user) return;
    const channels = await channelsFor(r, user.id, input.kind);

    if (channels.inApp) {
      const createdAt = now();
      const id = newId();
      await r.notifications.insert({
        id,
        userId: user.id,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        createdAt,
      });
      const unreadCount = await r.notifications.countUnread(user.id);
      const notification: Notification = {
        id,
        kind: input.kind,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
        createdAt: createdAt.toISOString(),
        readAt: null,
      };
      if (publisher) {
        // Only if the surrounding transaction commits.
        afterCommit(tx, () =>
          publisher.publish(user.id, 'notification', { notification, unreadCount }),
        );
      }
    }

    if (channels.email && deps.outbox) {
      await deps.outbox.sendEmail(tx, {
        to: user.email,
        template: 'notification',
        data: {
          name: user.name,
          title: input.title,
          body: input.body ?? '',
          link: input.link && base ? `${base}/#${input.link}` : '',
        },
      });
    }
  }

  async function notifyAdmins(
    tx: DbExecutor,
    input: Omit<NotifyInput, 'userId'>,
    opts: { exceptUserId?: string } = {},
  ): Promise<void> {
    const ids = await createRepositories(tx).users.activeIds({
      role: 'admin',
      ...(opts.exceptUserId ? { exceptId: opts.exceptUserId } : {}),
    });
    for (const userId of ids) await notify(tx, { ...input, userId });
  }

  async function preferences(userId: string): Promise<NotificationPreference[]> {
    const saved = await createRepositories(db).notifications.listPreferences(userId);
    return KIND_IDS.map((kind) => {
      const info = NOTIFICATION_KINDS[kind];
      const mine = saved.find((p) => p.kind === kind);
      return {
        kind,
        label: info.label,
        description: info.description,
        inApp: info.inAppLocked ? true : (mine?.inApp ?? info.defaults.inApp),
        email: mine?.email ?? info.defaults.email,
        inAppLocked: info.inAppLocked,
      };
    });
  }

  const notFound = () =>
    new ServiceError('not_found', 'notification_not_found', 'No such notification.');

  return {
    notify,
    notifyAdmins,

    /** The caller's notifications, newest first, one keyset page. */
    async list(
      userId: string,
      query: { cursor?: string; unreadOnly?: boolean; limit?: number } = {},
    ): Promise<Omit<NotificationsResponse, 'ok'>> {
      const limit = query.limit ?? DEFAULT_LIMIT;
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw new ServiceError(
          'invalid',
          'invalid_limit',
          `"limit" must be a whole number from 1 to ${MAX_LIMIT}.`,
          'limit',
        );
      }
      const after = query.cursor ? decodeCursor(query.cursor) : undefined;
      const repo = createRepositories(db).notifications;
      // one extra row says whether there is a next page
      const rows = await repo.listForUser(userId, {
        limit: limit + 1,
        ...(query.unreadOnly ? { unreadOnly: true } : {}),
        ...(after ? { after } : {}),
      });
      const page = rows.slice(0, limit);
      const last = page.at(-1);
      return {
        notifications: page.map(toWire),
        nextCursor: rows.length > limit && last ? encodeCursor(last) : null,
      };
    },

    unreadCount: (userId: string): Promise<number> =>
      createRepositories(db).notifications.countUnread(userId),

    async markRead(userId: string, id: string): Promise<Omit<MarkReadResponse, 'ok'>> {
      const repo = createRepositories(db).notifications;
      // someone else's id and a missing one are the same answer
      if (!(await repo.findForUser(userId, id))) throw notFound();
      await repo.markRead(userId, id, now());
      const unreadCount = await repo.countUnread(userId);
      publisher?.publish(userId, 'notifications.read', { unreadCount });
      return { unreadCount };
    },

    async markAllRead(userId: string): Promise<Omit<MarkAllReadResponse, 'ok'>> {
      const repo = createRepositories(db).notifications;
      const marked = await repo.markAllRead(userId, now());
      publisher?.publish(userId, 'notifications.read', { unreadCount: 0 });
      return { marked, unreadCount: 0 };
    },

    preferences,

    /** Saves the given kinds (the others keep their value). Returns the full list. */
    async updatePreferences(
      userId: string,
      items: readonly unknown[],
    ): Promise<NotificationPreference[]> {
      if (!Array.isArray(items) || items.length === 0 || items.length > KIND_IDS.length) {
        throw new ServiceError(
          'invalid',
          'invalid_preferences',
          'Send one entry per kind to change.',
        );
      }
      const valid: { kind: NotificationKind; inApp: boolean; email: boolean }[] = [];
      for (const raw of items) {
        const item = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<
          string,
          unknown
        >;
        const { kind, inApp, email } = item;
        if (
          !isKind(kind) ||
          typeof inApp !== 'boolean' ||
          typeof email !== 'boolean' ||
          valid.some((v) => v.kind === kind)
        ) {
          throw new ServiceError(
            'invalid',
            'invalid_preferences',
            'Each entry needs a known kind, once, and inApp and email as true or false.',
          );
        }
        if (NOTIFICATION_KINDS[kind].inAppLocked && !inApp) {
          throw new ServiceError(
            'invalid',
            'preference_locked',
            `${NOTIFICATION_KINDS[kind].label} notifications always show in the app.`,
          );
        }
        valid.push({ kind, inApp, email });
      }
      const at = now();
      await db.transaction(async (tx) => {
        const repo = createRepositories(tx).notifications;
        for (const item of valid) {
          await repo.setPreference({
            userId,
            kind: item.kind,
            inApp: item.inApp,
            email: item.email,
            at,
          });
        }
      });
      return preferences(userId);
    },

    /** An admin's test: a system notification to themself. Goes through the same rules as any other. */
    async sendTest(actor: SessionUser): Promise<void> {
      await db.transaction((tx) =>
        notify(tx, {
          userId: actor.id,
          kind: 'system',
          title: 'Test notification',
          body: 'If you can read this, the notification network works: it was saved, then pushed to your open tabs.',
          link: '/notifications',
        }),
      );
    },

    /** A system notification to every active user, audited. One transaction: at a few thousand
        users make this a job instead (the rows are written one by one). Returns the recipients. */
    async broadcast(
      actor: SessionUser,
      body: { title: string; body?: string },
      ip: string,
    ): Promise<number> {
      const title = typeof body.title === 'string' ? body.title.trim() : '';
      const text = typeof body.body === 'string' ? body.body.trim() : '';
      if (title === '' || title.length > TITLE_MAX) {
        throw new ServiceError(
          'invalid',
          'invalid_title',
          `Enter a title of up to ${TITLE_MAX} characters.`,
          'title',
        );
      }
      if (text.length > BODY_MAX) {
        throw new ServiceError(
          'invalid',
          'invalid_body',
          `The message can be up to ${BODY_MAX} characters.`,
          'body',
        );
      }
      return db.transaction(async (tx) => {
        const r = createRepositories(tx);
        const ids = await r.users.activeIds();
        for (const userId of ids) {
          await notify(tx, {
            userId,
            kind: 'system',
            title,
            ...(text ? { body: text } : {}),
          });
        }
        await r.audit.insert({
          id: newId(),
          at: now().toISOString(),
          actorUserId: actor.id,
          actor: actor.name,
          action: 'notification.broadcast',
          target: `${title.slice(0, 120)} (${ids.length} recipients)`,
          ip,
          outcome: 'success',
        });
        return ids.length;
      });
    },
  };
}
export type NotificationsService = ReturnType<typeof createNotificationsService>;
