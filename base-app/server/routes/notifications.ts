import type {
  BroadcastNotificationResponse,
  MarkAllReadResponse,
  MarkReadResponse,
  NotificationPreferencesResponse,
  NotificationsResponse,
  TestNotificationResponse,
  UnreadCountResponse,
  UpdateNotificationPreferencesBody,
} from '../../shared/api.ts';
import { HttpError } from '../infra/http/errors.ts';
import { readJsonBody, sendJson } from '../infra/http/json.ts';
import type { Principal, RequestContext, Route } from '../infra/http/types.ts';
import type { Services } from '../services/index.ts';
import { clientIp } from './auth.ts';
import { call } from './errors.ts';

/* The notification routes (the inbox, the preferences, the admin test and broadcast). Every handler acts on the caller (`ctx.principal`) only: there is no
   user id in any path, and a notification id that is not the caller's is a 404. */
function me(ctx: RequestContext): Principal {
  if (!ctx.principal) throw new HttpError(401, 'unauthenticated', 'Sign in to use this.');
  return ctx.principal;
}

function objectBody(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
}

export function notificationRoutes(services: Services): Route[] {
  const n = services.notifications;
  return [
    {
      method: 'GET',
      path: '/api/notifications',
      auth: 'user',
      handler: async (ctx) => {
        const sp = ctx.url.searchParams;
        const limitRaw = sp.get('limit');
        if (limitRaw !== null && !/^\d{1,4}$/.test(limitRaw)) {
          throw new HttpError(400, 'invalid_limit', '"limit" must be a whole number.');
        }
        const unread = sp.get('unread');
        const page = await call(() =>
          n.list(me(ctx).id, {
            ...(sp.get('cursor') ? { cursor: sp.get('cursor') as string } : {}),
            ...(unread === '1' || unread === 'true' ? { unreadOnly: true } : {}),
            ...(limitRaw !== null ? { limit: Number(limitRaw) } : {}),
          }),
        );
        sendJson(ctx.res, 200, { ok: true, ...page } satisfies NotificationsResponse);
      },
    },
    {
      method: 'GET',
      path: '/api/notifications/unread-count',
      auth: 'user',
      handler: async (ctx) => {
        const unreadCount = await n.unreadCount(me(ctx).id);
        sendJson(ctx.res, 200, { ok: true, unreadCount } satisfies UnreadCountResponse);
      },
    },
    {
      method: 'POST',
      path: '/api/notifications/read-all',
      auth: 'user',
      handler: async (ctx) => {
        const result = await n.markAllRead(me(ctx).id);
        sendJson(ctx.res, 200, { ok: true, ...result } satisfies MarkAllReadResponse);
      },
    },
    {
      method: 'POST',
      path: '/api/notifications/:id/read',
      auth: 'user',
      handler: async (ctx) => {
        const result = await call(() => n.markRead(me(ctx).id, ctx.params.id ?? ''));
        sendJson(ctx.res, 200, { ok: true, ...result } satisfies MarkReadResponse);
      },
    },
    {
      method: 'GET',
      path: '/api/notifications/preferences',
      auth: 'user',
      handler: async (ctx) => {
        const preferences = await n.preferences(me(ctx).id);
        sendJson(ctx.res, 200, { ok: true, preferences } satisfies NotificationPreferencesResponse);
      },
    },
    {
      method: 'PUT',
      path: '/api/notifications/preferences',
      auth: 'user',
      handler: async (ctx) => {
        const body = objectBody(await readJsonBody(ctx.req, 4 * 1024));
        if (!Array.isArray(body.preferences)) {
          throw new HttpError(400, 'invalid_body', 'Send "preferences" as a list.');
        }
        const preferences = await call(() =>
          n.updatePreferences(
            me(ctx).id,
            body.preferences as UpdateNotificationPreferencesBody['preferences'],
          ),
        );
        sendJson(ctx.res, 200, { ok: true, preferences } satisfies NotificationPreferencesResponse);
      },
    },
    {
      method: 'POST',
      path: '/api/admin/notifications/test',
      auth: 'admin',
      handler: async (ctx) => {
        await n.sendTest(me(ctx));
        sendJson(ctx.res, 200, { ok: true } satisfies TestNotificationResponse);
      },
    },
    {
      method: 'POST',
      path: '/api/admin/notifications/broadcast',
      auth: 'admin',
      handler: async (ctx) => {
        const body = objectBody(await readJsonBody(ctx.req, 4 * 1024));
        if (
          typeof body.title !== 'string' ||
          (body.body !== undefined && typeof body.body !== 'string')
        ) {
          throw new HttpError(
            400,
            'invalid_body',
            'Send "title" and optionally "body" as strings.',
          );
        }
        const message = {
          title: body.title,
          ...(typeof body.body === 'string' ? { body: body.body } : {}),
        };
        const recipients = await call(() => n.broadcast(me(ctx), message, clientIp(ctx)));
        sendJson(ctx.res, 200, { ok: true, recipients } satisfies BroadcastNotificationResponse);
      },
    },
  ];
}
