import { HttpError } from '../infra/http/errors.ts';
import type { RequestGate } from '../infra/http/types.ts';
import type { Services } from '../services/index.ts';

/* Maintenance mode, as a gate on the HTTP layer (main.ts passes it to createApiServer).

   While `maintenance.enabled` is on, every /api request from anyone but an admin answers
   503 { error: { code: 'maintenance', message } } -- except what a person needs to get in, see
   the notice or be monitored:
     /api/auth/*     sign in (an admin must be able to), sign out, who am I
     /api/settings   the client reads the flag and the message here
     /api/health     the load balancer's probe
   The gate runs after authentication, so a signed-out request to a protected route is still a
   401 and an admin's every request goes through. A route added later for a signed-out visitor
   (accept invite, forgot password) belongs under /api/auth/ so it stays reachable. */
const EXEMPT = [/^\/api\/auth\//, /^\/api\/settings$/, /^\/api\/health$/];

export function createMaintenanceGate(services: Pick<Services, 'settings'>): RequestGate {
  return async ({ principal, path }) => {
    if (principal?.role === 'admin') return;
    if (EXEMPT.some((re) => re.test(path))) return;
    const { enabled, message } = await services.settings.maintenance();
    if (enabled) throw new HttpError(503, 'maintenance', message);
  };
}
