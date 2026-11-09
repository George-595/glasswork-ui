import type { Rng } from './rng.ts';

/* Ids are "<prefix>_<length chars>" (default 6, the fake data's short ids). With an
   rng they are reproducible (fake data); without one they come from the Web Crypto
   generator. Records the server creates use 16 characters, so they never collide. */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const SUFFIX_LENGTH = 6;

export function createId(prefix: string, rng?: Rng, length = SUFFIX_LENGTH): string {
  let suffix = '';
  if (rng) {
    for (let i = 0; i < length; i++) suffix += ALPHABET[rng.int(0, ALPHABET.length - 1)];
  } else {
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);
    for (const b of bytes) suffix += ALPHABET[b % ALPHABET.length];
  }
  return `${prefix}_${suffix}`;
}

export function slugify(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
