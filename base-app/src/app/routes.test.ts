import { beforeEach, describe, expect, it } from 'vitest';
import { mockApi } from '~/test/mockApi';
import {
  NOT_FOUND_ROUTE,
  PUBLIC_ROUTES,
  REDIRECTS,
  ROUTES,
  resolvePublicRoute,
  resolveRoute,
} from './routes';

beforeEach(() => {
  mockApi(); // signed in as an admin, as the app tests assume
});

describe('ROUTES', () => {
  it('marks every admin-group route as requiring the admin role, and no main route', () => {
    for (const r of ROUTES) {
      expect(r.requires).toBe(r.group === 'admin' ? 'admin' : undefined);
    }
  });

  it('has unique ids and unique paths', () => {
    const ids = ROUTES.map((r) => r.id);
    const paths = ROUTES.map((r) => r.path);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('starts every path with a slash and gives every route a title', () => {
    for (const r of [...ROUTES, NOT_FOUND_ROUTE]) {
      expect(r.path.startsWith('/')).toBe(true);
      expect(r.title.length).toBeGreaterThan(0);
    }
  });

  it('loads a module with a default export for every route, not-found included', async () => {
    for (const r of [...ROUTES, NOT_FOUND_ROUTE]) {
      const mod = await r.load();
      expect(typeof mod.default).toBe('function');
    }
  });
});

describe('resolveRoute', () => {
  it('resolves hash and path forms to the same route', () => {
    expect(resolveRoute('#/table').id).toBe('table');
    expect(resolveRoute('/table/').id).toBe('table');
    expect(resolveRoute('#/table?x=1').id).toBe('table');
  });

  it('resolves the empty hash to home', () => {
    expect(resolveRoute('').id).toBe('home');
  });

  it('sends unknown paths to not-found', () => {
    expect(resolveRoute('/nope').id).toBe('not-found');
    expect(resolveRoute('/nope').id).toBe(NOT_FOUND_ROUTE.id);
  });

  it('follows the /admin redirect to the users page', () => {
    expect(REDIRECTS['/admin']).toBe('/admin/users');
    expect(resolveRoute('#/admin').id).toBe('admin-users');
  });
});

describe('route prefetch (server rendering)', () => {
  const prefetch = (id: string, url: string) =>
    ROUTES.find((r) => r.id === id)?.prefetch?.(new URL(url, 'http://app.test'));

  it('Home asks for the five calls its first render makes, at the default range', () => {
    expect(prefetch('home', '/')).toEqual([
      '/metrics/kpis?days=30',
      '/metrics/revenue?days=30&compare=1',
      '/metrics/categories',
      '/transactions',
      '/activity',
    ]);
  });

  it('Table asks for exactly the page its address names', () => {
    expect(prefetch('table', '/table')).toEqual(['/transactions?page=1&pageSize=25&sort=-date']);
    expect(prefetch('table', '/table?page=2&size=10&status=paid,failed&sort=-amount&q=ab')).toEqual(
      ['/transactions?page=2&pageSize=10&sort=-amount&q=ab&status=paid%2Cfailed'],
    );
    expect(prefetch('table', '/table?mode=browser')).toEqual(['/transactions']);
  });

  it('a page that declares nothing is rendered with its loading state', () => {
    expect(ROUTES.find((r) => r.id === 'graphs')?.prefetch).toBeUndefined();
  });
});

describe('the account page', () => {
  it('is a signed-in route that is not in the sidebar groups', () => {
    const account = ROUTES.find((r) => r.id === 'account');
    expect(account?.path).toBe('/account');
    expect(account?.group).toBe('account');
    expect(account?.requires).toBeUndefined();
  });
});

describe('PUBLIC_ROUTES', () => {
  it('are the three emailed-link pages, none of them also a signed-in route', () => {
    expect(PUBLIC_ROUTES.map((r) => r.path)).toEqual([
      '/accept-invite',
      '/forgot-password',
      '/reset-password',
    ]);
    for (const r of PUBLIC_ROUTES) expect(ROUTES.some((s) => s.path === r.path)).toBe(false);
  });

  it('loads a module with a default export for every public route', async () => {
    for (const r of PUBLIC_ROUTES) {
      expect(typeof (await r.load()).default).toBe('function');
    }
  });

  it('resolves a hash with a query to its page and nothing else', () => {
    expect(resolvePublicRoute('#/reset-password?token=abc')?.id).toBe('reset-password');
    expect(resolvePublicRoute('/forgot-password/')?.id).toBe('forgot-password');
    expect(resolvePublicRoute('#/table')).toBeUndefined();
    expect(resolvePublicRoute('')).toBeUndefined();
  });
});
