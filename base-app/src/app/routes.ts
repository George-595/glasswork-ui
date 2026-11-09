import type { ComponentType } from 'react';
import { apiPaths } from '~/core/api';
import { appFeatures } from '~/core/config';
import { normalizePath } from '~/core/router';
import type { IconName } from '~/core/ui';
import { tablePrefetch } from '../pages/table/query';

/* `main` and `admin` fill the sidebar; `account` routes are reached from the user menu and the
   command palette, not the sidebar. */
export type RouteGroup = 'main' | 'admin' | 'account';

/** What a page's file exports. `ready` (optional) settles when the parts the page loads lazily
    itself have arrived; the server awaits it before rendering and the browser before hydrating
    (`loadInitialRoute`), so those parts are in the first render too. */
export interface PageModule {
  default: ComponentType;
  ready?: () => Promise<unknown>;
}

export interface RouteDef {
  id: string;
  path: `/${string}`;
  title: string;
  icon: IconName;
  group: RouteGroup;
  /** The role a signed-in user needs. Absent = any signed-in user. */
  requires?: 'admin';
  load: () => Promise<PageModule>;
  /** The GET API calls this page makes on its first render, as paths relative to the API base
      (`apiPaths`), worked out from the request's address. A server render answers them ahead of
      the browser, in process and as the signed-in person, and embeds the answers; the page reads
      them with `useApiQuery(load, key, fromServer(path))` and so draws with data on its first
      paint. Leave it out and the page renders its loading state and fetches in the browser.
      Pure and cheap: it runs on every request for this route, and it must not import the page
      (see src/app/README.md "Server rendering"). */
  prefetch?: (url: URL) => readonly string[];
}

const ALL_ROUTES: readonly RouteDef[] = [
  {
    id: 'home',
    path: '/',
    title: 'Home',
    icon: 'home',
    group: 'main',
    load: () => import('../pages/home'),
    prefetch: () => [
      apiPaths.kpis(30),
      apiPaths.revenue(30, true),
      apiPaths.categories,
      apiPaths.transactions,
      apiPaths.activity,
    ],
  },
  {
    id: 'table',
    path: '/table',
    title: 'Table',
    icon: 'table',
    group: 'main',
    load: () => import('../pages/table'),
    prefetch: tablePrefetch,
  },
  {
    id: 'tool-1',
    path: '/tool-1',
    title: 'Tool 1',
    icon: 'wrench',
    group: 'main',
    load: () => import('../pages/tool-1'),
  },
  {
    id: 'graphs',
    path: '/graphs',
    title: 'Graphs',
    icon: 'chart',
    group: 'main',
    load: () => import('../pages/graphs'),
  },
  {
    id: 'assistant',
    path: '/assistant',
    title: 'Assistant',
    icon: 'sparkles',
    group: 'main',
    load: () => import('../pages/assistant'),
  },
  {
    id: 'views',
    path: '/views',
    title: 'Views',
    icon: 'pin',
    group: 'main',
    load: () => import('../pages/views'),
  },
  {
    id: 'notifications',
    path: '/notifications',
    title: 'Notifications',
    icon: 'bell',
    group: 'main',
    load: () => import('../pages/notifications'),
  },
  {
    id: 'kit',
    path: '/kit',
    title: 'Kit',
    icon: 'panel-left',
    group: 'main',
    load: () => import('../pages/kit'),
  },
  {
    id: 'account',
    path: '/account',
    title: 'Account',
    icon: 'user',
    group: 'account',
    load: () => import('../pages/account'),
  },
  {
    id: 'admin-users',
    path: '/admin/users',
    title: 'Users',
    icon: 'users',
    group: 'admin',
    requires: 'admin',
    load: () => import('../pages/admin/users'),
  },
  {
    id: 'admin-settings',
    path: '/admin/settings',
    title: 'Settings',
    icon: 'settings',
    group: 'admin',
    requires: 'admin',
    load: () => import('../pages/admin/settings'),
  },
  {
    id: 'admin-mail',
    path: '/admin/mail',
    title: 'Mail',
    icon: 'mail',
    group: 'admin',
    requires: 'admin',
    load: () => import('../pages/admin/mail'),
  },
  {
    id: 'admin-jobs',
    path: '/admin/jobs',
    title: 'Jobs',
    icon: 'clock',
    group: 'admin',
    requires: 'admin',
    load: () => import('../pages/admin/jobs'),
  },
  {
    id: 'admin-audit-log',
    path: '/admin/audit-log',
    title: 'Audit log',
    icon: 'file-text',
    group: 'admin',
    requires: 'admin',
    load: () => import('../pages/admin/audit-log'),
  },
];

/** Every signed-in screen that is switched on (`appFeatures`: with `notifications` off, the
    Notifications screen is not a route). */
export const ROUTES: readonly RouteDef[] = ALL_ROUTES.filter(
  (r) => r.id !== 'notifications' || appFeatures.notifications,
);

/* Pages for people who are signed out (or not yet): no shell, no role. The gate renders one of
   these in place of the sign-in page when the address is its path, signed in or not. */
export interface PublicRouteDef {
  id: string;
  path: `/${string}`;
  title: string;
  load: () => Promise<PageModule>;
}

export const PUBLIC_ROUTES: readonly PublicRouteDef[] = [
  {
    id: 'accept-invite',
    path: '/accept-invite',
    title: 'Accept your invitation',
    load: () => import('../pages/accept-invite'),
  },
  {
    id: 'forgot-password',
    path: '/forgot-password',
    title: 'Forgot your password?',
    load: () => import('../pages/forgot-password'),
  },
  {
    id: 'reset-password',
    path: '/reset-password',
    title: 'Choose a new password',
    load: () => import('../pages/reset-password'),
  },
];

/* The public page for a hash or path, or undefined (an ordinary route). */
export function resolvePublicRoute(path: string): PublicRouteDef | undefined {
  const normal = normalizePath(path);
  return PUBLIC_ROUTES.find((r) => r.path === normal);
}

export const NOT_FOUND_ROUTE: RouteDef = {
  id: 'not-found',
  path: '/404',
  title: 'Page not found',
  icon: 'alert',
  group: 'main',
  load: () => import('../pages/not-found'),
};

/* Old or shortened addresses that move somewhere else. Keys and values are normalised paths. */
export const REDIRECTS: Readonly<Record<string, string>> = { '/admin': '/admin/users' };

/* The route for a hash or path. A redirect is followed first; anything unknown is not found. */
export function resolveRoute(path: string): RouteDef {
  const normal = normalizePath(path);
  const target = REDIRECTS[normal] ?? normal;
  return ROUTES.find((r) => r.path === target) ?? NOT_FOUND_ROUTE;
}
