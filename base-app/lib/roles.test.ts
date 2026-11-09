import { describe, expect, it } from 'vitest';
import { canViewAs, effectiveRole, ROLE_LABELS, roleLabel, viewAsOptions } from './roles.ts';

describe('role names', () => {
  it('shows a name for each wire role, and passes an unknown one through', () => {
    expect(ROLE_LABELS).toEqual({ viewer: 'Viewer', editor: 'Editor', admin: 'Admin' });
    expect(roleLabel('editor')).toBe('Editor');
    expect(roleLabel('root')).toBe('root');
  });
});

describe('view as', () => {
  it('the effective role is the acting role, but only ever equal or lower', () => {
    expect(effectiveRole('admin', null)).toBe('admin');
    expect(effectiveRole('admin', undefined)).toBe('admin');
    expect(effectiveRole('admin', 'editor')).toBe('editor');
    expect(effectiveRole('admin', 'viewer')).toBe('viewer');
    expect(effectiveRole('editor', 'viewer')).toBe('viewer');
    // never higher, never the same role "acting", never a role we do not know
    expect(effectiveRole('editor', 'admin')).toBe('editor');
    expect(effectiveRole('viewer', 'editor')).toBe('viewer');
    expect(effectiveRole('viewer', 'admin')).toBe('viewer');
    expect(effectiveRole('editor', 'editor')).toBe('editor');
    expect(effectiveRole('admin', 'root')).toBe('admin');
    expect(effectiveRole('admin', '')).toBe('admin');
  });
  it('lists only the roles below your own, highest first', () => {
    expect(viewAsOptions('admin')).toEqual(['editor', 'viewer']);
    expect(viewAsOptions('editor')).toEqual(['viewer']);
    expect(viewAsOptions('viewer')).toEqual([]);
    expect(viewAsOptions(null)).toEqual([]);
    expect(viewAsOptions('nonsense')).toEqual([]);
  });
  it('canViewAs refuses your own role, a higher one and an unknown one', () => {
    expect(canViewAs('admin', 'editor')).toBe(true);
    expect(canViewAs('admin', 'viewer')).toBe(true);
    expect(canViewAs('admin', 'admin')).toBe(false);
    expect(canViewAs('editor', 'viewer')).toBe(true);
    expect(canViewAs('editor', 'editor')).toBe(false);
    expect(canViewAs('editor', 'admin')).toBe(false);
    expect(canViewAs('viewer', 'viewer')).toBe(false);
    expect(canViewAs('admin', 'root')).toBe(false);
    expect(canViewAs('admin', null)).toBe(false);
    expect(canViewAs('admin', 7)).toBe(false);
  });
});
