import { describe, expect, it } from 'vitest';
import { createId, slugify } from './ids.ts';
import { createRng } from './rng.ts';

describe('createId', () => {
  it('uses the prefix and a six-character suffix', () => {
    expect(createId('usr')).toMatch(/^usr_[a-z0-9]{6}$/);
  });

  it('is reproducible with a seeded rng', () => {
    expect(createId('usr', createRng(20261011))).toBe(createId('usr', createRng(20261011)));
  });
});

describe('slugify', () => {
  it('lowercases, strips accents and joins words with hyphens', () => {
    expect(slugify('  Crème Brûlée & Co.  ')).toBe('creme-brulee-co');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('--Hello, World!--')).toBe('hello-world');
  });
});
