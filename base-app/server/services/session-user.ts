import { effectiveRole } from '../../lib/roles.ts';
import type { Role, SessionUser } from '../../shared/api.ts';

/* The one place a SessionUser is built from an account ("View as").

   `role` on the result is the EFFECTIVE role: the lower role the session views as, else the
   account's real one. Everything on the server that decides who may do what reads `role` (the
   router's auth levels, the maintenance gate, the services), so a person who is viewing as a
   viewer is held to exactly what a viewer may do, with no check to forget. The real role
   travels beside it as `realRole`, read only by the View-as route and by what tells the person
   they are viewing as someone else. */
export function toSessionUser(
  account: { id: string; name: string; email: string; role: Role; avatarUrl?: string | null },
  storedActingRole: string | null = null,
): SessionUser {
  const effective = effectiveRole(account.role, storedActingRole);
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: effective,
    realRole: account.role,
    effectiveRole: effective,
    // only what is really in force: a stored role that is no longer below the real one is nothing
    actingRole: effective === account.role ? null : effective,
    avatarUrl: account.avatarUrl ?? null,
  };
}
