import { readFileSync } from 'node:fs';
import { ServiceError } from './errors.ts';

/* The one password policy: every place a password is set (accepting an invite, resetting,
   changing) goes through `assertPasswordPolicy`. OWASP ASVS V2.1: a minimum length, a generous
   maximum (long passphrases are welcome; the cap only stops a hashing denial of service), no
   composition rules, and a refusal of the passwords everyone tries first.

   - at least 10 and at most 256 characters (code points, so an emoji counts once);
   - not one of the common passwords in common-passwords.txt, compared lower-case, and also
     not one of them followed only by digits or punctuation ("password2026!");
   - not one repeated character;
   - does not contain the whole email address or its local part (3+ characters), in any case.
   It is checked on the server whatever the page's strength meter says: the meter informs, this
   decides. Sign-in does not use it (an old password must still work). */
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 256;
const MIN_LOCAL_PART = 3;

let common: ReadonlySet<string> | undefined;
function commonPasswords(): ReadonlySet<string> {
  common ??= new Set(
    readFileSync(new URL('./common-passwords.txt', import.meta.url), 'utf8')
      .split('\n')
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line !== ''),
  );
  return common;
}

export type PasswordProblem =
  | 'password_too_short'
  | 'password_too_long'
  | 'password_common'
  | 'password_repeated'
  | 'password_contains_email';

const MESSAGE: Record<PasswordProblem, string> = {
  password_too_short: `Use at least ${PASSWORD_MIN} characters.`,
  password_too_long: `Use at most ${PASSWORD_MAX} characters.`,
  password_common: 'That password is too common. Choose something harder to guess.',
  password_repeated: 'That password is one character repeated. Choose something harder to guess.',
  password_contains_email: 'The password must not contain your email address.',
};

/** What is wrong with a password, or null when it is acceptable. */
export function checkPassword(password: string, email: string): PasswordProblem | null {
  const length = [...password].length;
  if (length < PASSWORD_MIN) return 'password_too_short';
  if (length > PASSWORD_MAX) return 'password_too_long';
  const lower = password.toLowerCase();
  if (new Set(lower).size === 1) return 'password_repeated';
  const list = commonPasswords();
  if (list.has(lower) || list.has(lower.replace(/[\d\s!@#$%^&*()_+=.,?-]+$/u, ''))) {
    return 'password_common';
  }
  const address = email.trim().toLowerCase();
  const local = address.split('@')[0] ?? '';
  if (
    (address !== '' && lower.includes(address)) ||
    (local.length >= MIN_LOCAL_PART && lower.includes(local))
  ) {
    return 'password_contains_email';
  }
  return null;
}

/** Throws a 400 ServiceError (code from `PasswordProblem`, `field` for the form) when the
    password is not acceptable. */
export function assertPasswordPolicy(password: string, email: string, field: string): void {
  const problem = checkPassword(password, email);
  if (problem) throw new ServiceError('invalid', problem, MESSAGE[problem], field);
}
