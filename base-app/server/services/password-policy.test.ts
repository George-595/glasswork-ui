import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ServiceError } from './errors.ts';
import {
  assertPasswordPolicy,
  checkPassword,
  PASSWORD_MAX,
  PASSWORD_MIN,
} from './password-policy.ts';

const EMAIL = 'sam.jones@example.com';

describe('password policy', () => {
  it('accepts a long passphrase and a plain 10-character password with no composition rules', () => {
    expect(checkPassword('correct horse battery staple', EMAIL)).toBeNull();
    expect(checkPassword('kettle-rain-47', EMAIL)).toBeNull();
    expect(checkPassword('alllowercasebutlong', EMAIL)).toBeNull();
  });

  it(`needs ${PASSWORD_MIN} characters, counted as code points`, () => {
    expect(checkPassword('x7Kp2mQz9', EMAIL)).toBe('password_too_short');
    expect(checkPassword('x7Kp2mQz91', EMAIL)).toBeNull();
    expect(checkPassword('😀'.repeat(9), EMAIL)).toBe('password_too_short');
    expect(checkPassword(`${'😀x'.repeat(5)}`, EMAIL)).toBeNull();
  });

  it(`stops at ${PASSWORD_MAX} characters`, () => {
    expect(checkPassword('a1'.repeat(PASSWORD_MAX / 2), EMAIL)).toBeNull();
    expect(checkPassword(`${'a1'.repeat(PASSWORD_MAX / 2)}x`, EMAIL)).toBe('password_too_long');
  });

  it('refuses common passwords in any case, and a common password with a tail of digits or symbols', () => {
    expect(checkPassword('password123', EMAIL)).toBe('password_common');
    expect(checkPassword('PASSWORD123', EMAIL)).toBe('password_common');
    expect(checkPassword('qwertyuiop', EMAIL)).toBe('password_common');
    expect(checkPassword('1234567890', EMAIL)).toBe('password_common');
    expect(checkPassword('football2026!!', EMAIL)).toBe('password_common');
    expect(checkPassword('letmein-1999', EMAIL)).toBe('password_common');
  });

  it('refuses one repeated character', () => {
    expect(checkPassword('zzzzzzzzzzzz', EMAIL)).toBe('password_repeated');
  });

  it('refuses a password containing the email or its local part', () => {
    expect(checkPassword('SAM.JONES-is-here!', EMAIL)).toBe('password_contains_email');
    expect(checkPassword('prefix sam.jones@example.com', EMAIL)).toBe('password_contains_email');
    // too short a local part is not worth matching (every password would contain "a")
    expect(checkPassword('a-pretty-long-phrase', 'a@example.com')).toBeNull();
    expect(checkPassword('my-ed-passphrase', 'ed@example.com')).toBeNull();
  });

  it('assertPasswordPolicy throws a 400 ServiceError naming the field', () => {
    const attempt = () => assertPasswordPolicy('short', EMAIL, 'newPassword');
    expect(attempt).toThrow(ServiceError);
    expect(attempt).toThrow(
      expect.objectContaining({
        kind: 'invalid',
        code: 'password_too_short',
        field: 'newPassword',
      }),
    );
    expect(() =>
      assertPasswordPolicy('quiet-harbour-lamp-4721', EMAIL, 'newPassword'),
    ).not.toThrow();
  });

  it('the bundled list is trimmed, lower-case, without duplicates, and has about a thousand entries', () => {
    const lines = readFileSync(new URL('./common-passwords.txt', import.meta.url), 'utf8')
      .split('\n')
      .filter((l) => l !== '');
    expect(lines.every((l) => l === l.trim() && l === l.toLowerCase())).toBe(true);
    expect(new Set(lines).size).toBe(lines.length);
    expect(lines.length).toBeGreaterThan(800);
  });
});
