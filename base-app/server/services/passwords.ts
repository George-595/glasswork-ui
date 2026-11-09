import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/* Password hashing with Node's built-in scrypt (no dependency). Stored form:
   scrypt$<N>$<r>$<p>$<salt b64>$<hash b64>, so the cost can rise later and
   old hashes still verify. */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LEN = 64;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LEN, { N: n, r, p, maxmem: 256 * n * r }, (err, key) =>
      err ? reject(err) : resolve(key),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, N, R, P);
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (!n || !r || !p || n > 1 << 20) return false;
  const salt = Buffer.from(parts[4] ?? '', 'base64');
  const expected = Buffer.from(parts[5] ?? '', 'base64');
  if (expected.length !== KEY_LEN) return false;
  const actual = await derive(password, salt, n, r, p);
  return timingSafeEqual(actual, expected);
}

/* Spent on an unknown email, so a login's timing does not reveal which
   emails have accounts. */
let dummy: Promise<string> | undefined;
export async function burnPasswordCheck(password: string): Promise<void> {
  dummy ??= hashPassword('not-a-real-password');
  await verifyPassword(password, await dummy);
}
