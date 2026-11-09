import { useAuth } from '~/core/auth';
import { appFeatures } from '~/core/config';
import { useMediaQuery } from '~/core/hooks';
import { hrefFor } from '~/core/router';
import { Avatar, Cluster, Menu, type MenuItem, Show, toast } from '~/core/ui';
import { ROLE_LABELS } from '~/core/utils';

/* The signed-in user's menu in the topbar: their avatar (initials on a colour taken from the
   name; decorative here, because the button beside it already says the name) and a menu named
   after the user, holding Account, Notifications (when `appFeatures.notifications` is on) and Sign
   out. The ui kit's Menu has no non-interactive line, so the email and role are not shown here.
   Under 640px (and in a window with no matchMedia: a phone first) the trigger is the person's icon
   alone, 48px on a touch screen, still named after them: the full name squeezed the page name out
   of a phone's top bar. */
export function UserMenu() {
  const { user, logout, viewAs, viewAsOptions, realRole, actingRole } = useAuth();
  const roomy = useMediaQuery('(min-width: 640px)');
  const name = user?.name ?? 'Account';
  const choose = (role: Parameters<typeof viewAs>[0]) => () => {
    viewAs(role).catch(() => toast.error('Could not switch. Please try again.'));
  };
  const viewItems: MenuItem[] = [
    ...(actingRole && realRole
      ? [
          {
            id: 'view-as-back',
            label: `Switch back to ${ROLE_LABELS[realRole]}`,
            icon: 'undo',
            onSelect: choose(null),
          } satisfies MenuItem,
        ]
      : []),
    ...viewAsOptions
      .filter((role) => role !== actingRole)
      .map(
        (role) =>
          ({
            id: `view-as-${role}`,
            label: `View as ${ROLE_LABELS[role]}`,
            icon: 'eye',
            onSelect: choose(role),
          }) satisfies MenuItem,
      ),
  ];

  const items: readonly MenuItem[] = [
    { id: 'account', label: 'Account', icon: 'user', href: hrefFor('/account') },
    ...(appFeatures.notifications
      ? [
          {
            id: 'notifications',
            label: 'Notifications',
            icon: 'bell',
            href: hrefFor('/notifications'),
          } as const,
        ]
      : []),
    ...(viewItems.length > 0 ? [{ separator: true } as const, ...viewItems] : []),
    { separator: true },
    { id: 'sign-out', label: 'Sign out', icon: 'log-out', onSelect: () => void logout() },
  ];
  if (!roomy) {
    // 18px, the size of the search and bell glyphs beside it: one icon-button style
    return <Menu label={name} icon="user" iconOnly iconSize={18} align="end" items={items} />;
  }
  return (
    <Cluster gap={1} nowrap>
      <Show from="sm">
        <Avatar name={name} src={user?.avatarUrl ?? undefined} size="xs" aria-hidden="true" />
      </Show>
      <Menu label={name} align="end" items={items} />
    </Cluster>
  );
}
