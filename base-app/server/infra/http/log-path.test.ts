import { describe, expect, it } from 'vitest';
import { loggablePath } from './log-path.ts';

describe('loggablePath', () => {
  it('hides an invitation token and leaves other paths alone', () => {
    expect(loggablePath('/api/auth/invite/abc_DEF-123')).toBe('/api/auth/invite/[redacted]');
    expect(loggablePath('/api/auth/login')).toBe('/api/auth/login');
    expect(loggablePath('/api/files/0190')).toBe('/api/files/0190');
  });
});
