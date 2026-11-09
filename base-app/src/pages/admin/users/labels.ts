import type { Role, User } from '~/core/api';
import type { BadgeVariant } from '~/core/ui';

export const ROLES: readonly Role[] = ['admin', 'editor', 'viewer'];

export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Viewer',
};

export const ROLE_HINT: Record<Role, string> = {
  admin: 'Manages users and settings, and sees the audit log.',
  editor: 'Works with the data. Cannot manage users.',
  viewer: 'Read-only access to the data.',
};

export const STATUS_LABEL: Record<User['status'], string> = {
  active: 'Active',
  invited: 'Invited',
  suspended: 'Suspended',
};

export const STATUS_BADGE: Record<User['status'], { label: string; variant: BadgeVariant }> = {
  active: { label: 'Active', variant: 'up' },
  invited: { label: 'Invited', variant: 'info' },
  suspended: { label: 'Suspended', variant: 'down' },
};
