/* The roles an account can hold, and "View as". The database and the API keep
   `admin | editor | viewer`; everything asks these helpers and never compares to the raw word.

   View as: an admin may view the app as an editor or a viewer, an editor as a viewer: never as a
   higher role. The session stores the role being viewed as (`acting_role`); every role check on
   the server and in the client asks the EFFECTIVE role, `effectiveRole(real, acting)`, which is
   the acting role when it is below the real one and the real role otherwise. */
export type WireRole = 'admin' | 'editor' | 'viewer';

export const ROLE_LABELS: Readonly<Record<WireRole, string>> = {
  viewer: 'Viewer',
  editor: 'Editor',
  admin: 'Admin',
};

const ROLE_RANK: Readonly<Record<WireRole, number>> = { viewer: 0, editor: 1, admin: 2 };

export const isWireRole = (value: unknown): value is WireRole =>
  value === 'viewer' || value === 'editor' || value === 'admin';

export const roleLabel = (role: string): string =>
  (ROLE_LABELS as Record<string, string>)[role] ?? role;

/** The role a person is treated as: `acting` when it is a known role strictly below `real`,
    else `real`. Never higher than the real role, whatever is stored (a demoted editor's old
    "view as" cannot keep an admin's powers, and a bad value changes nothing). */
export function effectiveRole(real: WireRole, acting: string | null | undefined): WireRole {
  if (!isWireRole(acting)) return real;
  return ROLE_RANK[acting] < ROLE_RANK[real] ? acting : real;
}

/** The roles a person may view as, highest first: admin: Editor and Viewer; editor: Viewer;
    viewer: none. */
export function viewAsOptions(real: string | null | undefined): WireRole[] {
  if (real === 'admin') return ['editor', 'viewer'];
  if (real === 'editor') return ['viewer'];
  return [];
}

/** Whether `real` may view as `target`: a known role strictly below their own. */
export const canViewAs = (real: string | null | undefined, target: unknown): target is WireRole =>
  isWireRole(target) && viewAsOptions(real).includes(target);
