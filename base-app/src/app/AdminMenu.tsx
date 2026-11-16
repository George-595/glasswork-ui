import { hrefFor } from '~/core/router';
import { Menu, type MenuItem } from '~/core/ui';
import { ROUTES } from './routes';

/* The admin menu in the topbar, for admins only (Shell does not render it for anyone else).
   The admin pages come from the route table, so a new admin route appears here with no edit
   to this file. Sign out lives in UserMenu. */
const ADMIN_ITEMS: readonly MenuItem[] = ROUTES.filter((r) => r.group === 'admin').map(
  (r): MenuItem => ({ id: r.id, label: r.title, icon: r.icon, href: hrefFor(r.path) }),
);

/** `compact`: the shield alone (a phone's top bar), still named Admin. */
export function AdminMenu({ compact = false }: { compact?: boolean }) {
  return compact ? (
    <Menu label="Admin" icon="shield" iconOnly iconSize={18} align="end" items={ADMIN_ITEMS} />
  ) : (
    <Menu label="Admin" icon="shield" align="end" items={ADMIN_ITEMS} />
  );
}
