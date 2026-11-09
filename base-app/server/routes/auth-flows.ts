import type {
  AcceptInviteResponse,
  ForgotPasswordResponse,
  InviteInfoResponse,
  ResetPasswordResponse,
} from '../../shared/api.ts';
import { sendJson } from '../infra/http/json.ts';
import type { Route } from '../infra/http/types.ts';
import type { Services } from '../services/index.ts';
import { clientIp, sessionCookie, userAgentOf } from './auth.ts';
import { readObjectBody, stringField } from './body.ts';
import { call } from './errors.ts';

/* The public sign-in flows that start from a link in an email or a forgotten password:
   accepting an invitation, asking for a reset link, using one. The rules live in
   services/credentials.ts; these handlers parse, call and write. A token in a path is redacted
   from the request log (infra/http/server.ts). */
export function createAuthFlowRoutes(services: Services, opts: { cookieSecure: boolean }): Route[] {
  const cookie = (value: string, maxAgeSec: number) =>
    sessionCookie(value, maxAgeSec, opts.cookieSecure);

  return [
    {
      method: 'GET',
      path: '/api/auth/invite/:token',
      auth: 'public',
      handler: async (ctx) => {
        const invite = await call(() =>
          services.credentials.inviteInfo(ctx.params.token ?? '', clientIp(ctx)),
        );
        sendJson(ctx.res, 200, { ok: true, invite } satisfies InviteInfoResponse);
      },
    },
    {
      method: 'POST',
      path: '/api/auth/accept-invite',
      auth: 'public',
      handler: async (ctx) => {
        const body = await readObjectBody(ctx.req, 8 * 1024);
        const token = stringField(body, 'token', 200);
        const name = stringField(body, 'name', 400);
        const password = stringField(body, 'password', 1024);
        const signedIn = await call(() =>
          services.credentials.acceptInvite(
            { token, name, password },
            clientIp(ctx),
            userAgentOf(ctx),
          ),
        );
        sendJson(ctx.res, 200, { ok: true, user: signedIn.user } satisfies AcceptInviteResponse, {
          'set-cookie': cookie(signedIn.token, signedIn.maxAgeSec),
        });
      },
    },
    {
      method: 'POST',
      path: '/api/auth/forgot-password',
      auth: 'public',
      handler: async (ctx) => {
        const body = await readObjectBody(ctx.req, 2 * 1024);
        const email = stringField(body, 'email', 254);
        await call(() => services.credentials.forgotPassword(email, clientIp(ctx)));
        // 202 and this exact body, whether or not the address has an account
        sendJson(ctx.res, 202, { ok: true } satisfies ForgotPasswordResponse);
      },
    },
    {
      method: 'POST',
      path: '/api/auth/reset-password',
      auth: 'public',
      handler: async (ctx) => {
        const body = await readObjectBody(ctx.req, 8 * 1024);
        const token = stringField(body, 'token', 200);
        const password = stringField(body, 'password', 1024);
        const signedIn = await call(() =>
          services.credentials.resetPassword({ token, password }, clientIp(ctx), userAgentOf(ctx)),
        );
        sendJson(ctx.res, 200, { ok: true, user: signedIn.user } satisfies ResetPasswordResponse, {
          'set-cookie': cookie(signedIn.token, signedIn.maxAgeSec),
        });
      },
    },
  ];
}
