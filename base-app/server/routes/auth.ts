import type {
  DevSignInHint,
  LoginResponse,
  LogoutResponse,
  MeResponse,
  ViewAsResponse,
} from '../../shared/api.ts';
import { parseCookies, serializeCookie } from '../infra/http/cookies.ts';
import { HttpError } from '../infra/http/errors.ts';
import { readJsonBody, sendJson } from '../infra/http/json.ts';
import type { RequestContext } from '../infra/http/types.ts';
import type { Services } from '../services/index.ts';
import { call } from './errors.ts';

/* Sign-in routes. The session cookie is httpOnly (scripts cannot read it),
   SameSite=Strict (no other site can make the browser send it), Path=/, and
   Secure unless COOKIE_SECURE=false (http on a non-localhost name). */
export const SESSION_COOKIE = 'sid';

export function sessionToken(cookieHeader: string | undefined): string | undefined {
  return parseCookies(cookieHeader)[SESSION_COOKIE];
}

/* The caller's address, for rate limits and the audit log. Behind one reverse
   proxy (TRUST_PROXY=true) it is the last X-Forwarded-For hop, the one the
   proxy added; never trust the header otherwise, a client can write anything. */
let trustProxy = false;
export function setTrustProxy(on: boolean): void {
  trustProxy = on;
}
export function clientIp(ctx: RequestContext): string {
  const forwarded = ctx.req.headers['x-forwarded-for'];
  if (trustProxy && typeof forwarded === 'string') {
    const last = forwarded.split(',').at(-1)?.trim();
    if (last) return last.slice(0, 45);
  }
  return ctx.req.socket.remoteAddress ?? 'unknown';
}

/* The browser's User-Agent, trimmed to the column's 300 characters. */
export function userAgentOf(ctx: RequestContext): string | undefined {
  const ua = ctx.req.headers['user-agent'];
  return typeof ua === 'string' ? ua.slice(0, 300) : undefined;
}

export function sessionCookie(value: string, maxAgeSec: number, secure: boolean): string {
  return serializeCookie(SESSION_COOKIE, value, {
    maxAgeSec,
    httpOnly: true,
    sameSite: 'Strict',
    secure,
  });
}

export function authRoutes(
  services: Services,
  opts: { cookieSecure: boolean; devSignIn?: DevSignInHint },
) {
  const cookie = (value: string, maxAgeSec: number) =>
    sessionCookie(value, maxAgeSec, opts.cookieSecure);

  return {
    async login(ctx: RequestContext): Promise<void> {
      const raw = await readJsonBody(ctx.req, 4 * 1024);
      const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
      if (typeof body.email !== 'string' || typeof body.password !== 'string') {
        throw new HttpError(400, 'invalid_body', 'Send "email" and "password" as strings.');
      }
      if (body.email.length > 254 || body.password.length > 1024) {
        throw new HttpError(400, 'invalid_body', 'Email or password is too long.');
      }
      const { email, password } = body;
      const signedIn = await call(() =>
        services.auth.login(email, password, clientIp(ctx), userAgentOf(ctx)),
      );
      sendJson(ctx.res, 200, { ok: true, user: signedIn.user } satisfies LoginResponse, {
        'set-cookie': cookie(signedIn.token, signedIn.maxAgeSec),
      });
    },

    async logout(ctx: RequestContext): Promise<void> {
      await services.auth.logout(
        sessionToken(ctx.req.headers.cookie),
        ctx.principal,
        clientIp(ctx),
      );
      sendJson(ctx.res, 200, { ok: true } satisfies LogoutResponse, {
        'set-cookie': cookie('', 0),
      });
    },

    /** POST /api/auth/view-as { role }: view the app as a role below your real one, or null to go
        back. Open to any signed-in person, whatever role they are viewing as now: the service
        holds it to the REAL role, so a viewer can only ever send null. */
    async viewAs(ctx: RequestContext): Promise<void> {
      if (!ctx.principal) throw new HttpError(401, 'unauthenticated', 'Sign in to use this.');
      const raw = await readJsonBody(ctx.req, 1024);
      const body = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
      if (!('role' in body) || (body.role !== null && typeof body.role !== 'string')) {
        throw new HttpError(400, 'invalid_body', 'Send "role": a role name, or null to go back.');
      }
      const user = await call(() =>
        services.auth.viewAs(
          sessionToken(ctx.req.headers.cookie),
          ctx.principal as NonNullable<typeof ctx.principal>,
          body.role,
          clientIp(ctx),
        ),
      );
      sendJson(ctx.res, 200, { ok: true, user } satisfies ViewAsResponse);
    },

    async me(ctx: RequestContext): Promise<void> {
      const body: MeResponse = { ok: true, user: ctx.principal };
      if (!ctx.principal && opts.devSignIn) body.devSignIn = opts.devSignIn;
      sendJson(ctx.res, 200, body);
    },
  };
}
