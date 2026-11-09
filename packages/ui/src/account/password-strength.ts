/* scorePassword — a length-and-variety heuristic for the meter under a password field.
   It informs and never blocks: the server's rules decide what is accepted. Pure.

   score 0 nothing typed · 1 Weak (too short, or very common) · 2 Fair · 3 Good · 4 Strong.
   Length counts most (a long passphrase beats a short mixed string), then how many kinds of
   character appear, then penalties for one repeated character or a well-known password. */
export type StrengthScore = 0 | 1 | 2 | 3 | 4;
export const STRENGTH_LABELS = ['Empty', 'Weak', 'Fair', 'Good', 'Strong'] as const;

export interface PasswordChecks {
  length: boolean;
  lower: boolean;
  upper: boolean;
  number: boolean;
  symbol: boolean;
}

export interface PasswordStrengthResult {
  score: StrengthScore;
  label: (typeof STRENGTH_LABELS)[number];
  checks: PasswordChecks;
  /** One short hint for the next improvement, or '' when strong. */
  hint: string;
}

const COMMON = new Set([
  'password',
  'password1',
  'password123',
  '123456',
  '12345678',
  '123456789',
  '1234567890',
  'qwerty',
  'qwertyuiop',
  'letmein',
  'welcome',
  'admin',
  'iloveyou',
  'abc123',
  'monkey',
  'dragon',
  'football',
  'changeme',
]);

export function passwordChecks(password: string, minLength: number): PasswordChecks {
  return {
    length: [...password].length >= minLength,
    lower: /\p{Ll}/u.test(password),
    upper: /\p{Lu}/u.test(password),
    number: /\p{N}/u.test(password),
    symbol: /[^\p{L}\p{N}]/u.test(password),
  };
}

export function scorePassword(password: string, minLength = 10): PasswordStrengthResult {
  const checks = passwordChecks(password, minLength);
  const length = [...password].length;
  if (length === 0) return { score: 0, label: 'Empty', checks, hint: '' };

  const kinds = [checks.lower, checks.upper, checks.number, checks.symbol].filter(Boolean).length;
  const common = COMMON.has(password.toLowerCase()) || new Set(password).size <= 2;
  let points = 0;
  if (length >= minLength) points += 1;
  if (length >= minLength + 4) points += 1;
  if (length >= minLength + 10) points += 1;
  if (kinds >= 2) points += 1;
  if (kinds >= 3) points += 1;

  let score = points <= 1 ? 1 : points === 2 ? 2 : points === 3 ? 3 : 4;
  // a long passphrase of one kind can still be Good, but not Strong
  if (kinds < 2) score = Math.min(score, 3);
  if (length < minLength) score = Math.min(score, 1);
  if (common) score = 1;

  const hint = !checks.length
    ? `Use at least ${minLength} characters.`
    : common
      ? 'Avoid common or repeated passwords.'
      : score < 4 && kinds < 3
        ? 'Mix upper and lower case, numbers and symbols, or make it longer.'
        : score < 4
          ? 'A longer password is stronger.'
          : '';
  const s = score as StrengthScore;
  return { score: s, label: STRENGTH_LABELS[s], checks, hint };
}
