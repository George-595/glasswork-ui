import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Role } from '../../../shared/api.ts';
import type { Logger } from '../log/logger.ts';

/* The HTTP framework's types. The framework knows routes, auth levels and the
   signed-in principal; it knows nothing about the app's services, which the
   route handlers close over (server/routes/index.ts). */

/** Who may call a route. 'user' = any signed-in user; 'admin' = role admin. */
export type AuthLevel = 'public' | 'user' | 'admin';

/** The signed-in user, as the framework sees them. */
export interface Principal {
  id: string;
  name: string;
  email: string;
  /** The EFFECTIVE role: the lower role the session views as ("View as"), else the account's
      own. Every auth level and every role rule reads this one. */
  role: Role;
  /** The account's own role: read only by the View-as route (server/services/auth.ts). */
  realRole?: Role;
  /** The lower role this session views as, or null. */
  actingRole?: Role | null;
}

/** What the HTTP layer needs from config. ServerEnv satisfies it structurally. */
export interface HttpSettings {
  /** Origins allowed to send a state-changing request (POST and friends). */
  readonly allowedOrigins: readonly string[];
  /** Host header values answered besides loopback (only when opened beyond loopback). */
  readonly publicHosts: readonly string[];
}

export interface RequestContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  /** Values of the route path's `:name` segments, decoded. Empty for a fixed path. */
  params: Readonly<Record<string, string>>;
  requestId: string;
  /** Null on a public route when nobody is signed in. */
  principal: Principal | null;
  log: Logger;
  startedAt: number;
}

export interface Route {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;
  auth: AuthLevel;
  handler: (ctx: RequestContext) => Promise<void>;
}

/** Runs after authentication and before the handler of every matched route. Throw an
    HttpError to refuse the request (maintenance mode answers 503 here). Must not throw
    anything else for an ordinary request. */
export type RequestGate = (request: {
  principal: Principal | null;
  method: string;
  path: string;
}) => Promise<void>;

export interface ApiDeps {
  settings: HttpSettings;
  routes: readonly Route[];
  /** Resolves the session cookie to a principal, or null. Must not throw for a bad cookie. */
  authenticate: (cookieHeader: string | undefined) => Promise<Principal | null>;
  log: Logger;
  /** An optional check on every matched request, after auth (see RequestGate). */
  gate?: RequestGate;
  /** Development only: Vite's middleware (modules, HMR client), tried first for non-API requests.
      Returns true if it answered. A getter, because Vite needs this server to exist first. */
  middleware?: () => ((req: IncomingMessage, res: ServerResponse) => Promise<boolean>) | undefined;
  /** Serves the built client for non-API GETs (production). Returns true if it answered. */
  serveStatic?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  /** Server-renders a page for the non-API GETs nothing above answered (ssr.ts). Returns true if
      it answered. */
  ssr?: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  startedAt?: number;
}
