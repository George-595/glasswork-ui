import type {
  AccountResponse,
  AccountSessionsResponse,
  AvatarResponse,
  ChangePasswordResponse,
  RevokeOtherSessionsResponse,
  RevokeSessionResponse,
  SessionUser,
  UpdateAccountResponse,
} from '../../shared/api.ts';
import { HttpError } from '../infra/http/errors.ts';
import { sendJson } from '../infra/http/json.ts';
import type { RequestContext, Route } from '../infra/http/types.ts';
import { AVATAR_MAX_BYTES, type Services } from '../services/index.ts';
import { clientIp, sessionToken } from './auth.ts';
import { declaredLength, drainBody, rawBody, readObjectBody, stringField } from './body.ts';
import { call } from './errors.ts';

/* The signed-in person's own account. Every route is `user` level and about the caller only:
   there is no user id in any path, only a session id, which the service matches against the
   caller's own sessions. */
const me = (ctx: RequestContext): SessionUser => {
  if (!ctx.principal) throw new HttpError(401, 'unauthenticated', 'Sign in to use this.');
  return ctx.principal;
};
const token = (ctx: RequestContext) => sessionToken(ctx.req.headers.cookie);

export function createAccountRoutes(services: Services): Route[] {
  return [
    {
      method: 'GET',
      path: '/api/account',
      auth: 'user',
      handler: async (ctx) => {
        const account = await call(() => services.account.get(me(ctx)));
        sendJson(ctx.res, 200, { ok: true, account } satisfies AccountResponse);
      },
    },
    {
      method: 'PATCH',
      path: '/api/account',
      auth: 'user',
      handler: async (ctx) => {
        const body = await readObjectBody(ctx.req, 2 * 1024);
        const name = stringField(body, 'name', 400);
        const account = await call(() =>
          services.account.updateProfile(me(ctx), name, clientIp(ctx)),
        );
        sendJson(ctx.res, 200, { ok: true, account } satisfies UpdateAccountResponse);
      },
    },
    {
      method: 'POST',
      path: '/api/account/password',
      auth: 'user',
      handler: async (ctx) => {
        const body = await readObjectBody(ctx.req, 8 * 1024);
        const currentPassword = stringField(body, 'currentPassword', 1024);
        const newPassword = stringField(body, 'newPassword', 1024);
        await call(() =>
          services.account.changePassword(
            me(ctx),
            token(ctx),
            { currentPassword, newPassword },
            clientIp(ctx),
          ),
        );
        sendJson(ctx.res, 200, { ok: true } satisfies ChangePasswordResponse);
      },
    },
    {
      method: 'GET',
      path: '/api/account/sessions',
      auth: 'user',
      handler: async (ctx) => {
        const sessions = await call(() => services.account.listSessions(me(ctx), token(ctx)));
        sendJson(ctx.res, 200, { ok: true, sessions } satisfies AccountSessionsResponse);
      },
    },
    {
      method: 'POST',
      path: '/api/account/sessions/revoke-others',
      auth: 'user',
      handler: async (ctx) => {
        const revoked = await call(() =>
          services.account.revokeOthers(me(ctx), token(ctx), clientIp(ctx)),
        );
        sendJson(ctx.res, 200, { ok: true, revoked } satisfies RevokeOtherSessionsResponse);
      },
    },
    {
      method: 'DELETE',
      path: '/api/account/sessions/:id',
      auth: 'user',
      handler: async (ctx) => {
        await call(() =>
          services.account.revokeSession(me(ctx), ctx.params.id ?? '', clientIp(ctx)),
        );
        sendJson(ctx.res, 200, { ok: true } satisfies RevokeSessionResponse);
      },
    },
    {
      method: 'PUT',
      path: '/api/account/avatar',
      auth: 'user',
      handler: async (ctx) => {
        let avatarUrl: string;
        try {
          avatarUrl = await call(() =>
            services.files.uploadAvatar(
              me(ctx),
              {
                contentType: ctx.req.headers['content-type'],
                contentLength: declaredLength(ctx.req),
                body: rawBody(ctx.req),
              },
              clientIp(ctx),
            ),
          );
        } catch (err) {
          // The body may be unread or half read: tell the client to stop sending it, after
          // reading what is left (up to 4x the cap, as readJsonBody does) so the answer is not
          // lost to a reset.
          if (err instanceof HttpError && [400, 413, 415].includes(err.status)) {
            await drainBody(ctx.req, AVATAR_MAX_BYTES * 4);
            throw new HttpError(err.status, err.code, err.message, true);
          }
          throw err;
        }
        sendJson(ctx.res, 200, { ok: true, avatarUrl } satisfies AvatarResponse);
      },
    },
    {
      method: 'DELETE',
      path: '/api/account/avatar',
      auth: 'user',
      handler: async (ctx) => {
        await call(() => services.files.removeAvatar(me(ctx), clientIp(ctx)));
        sendJson(ctx.res, 200, { ok: true, avatarUrl: null } satisfies AvatarResponse);
      },
    },
  ];
}
