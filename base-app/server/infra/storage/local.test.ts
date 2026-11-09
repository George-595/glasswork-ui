import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createLocalFileStorage } from './local.ts';
import { InvalidStorageKeyError, StorageNotFoundError } from './types.ts';

let root = '';
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'storage-test-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const from = (...parts: string[]) =>
  (async function* () {
    for (const p of parts) yield Buffer.from(p);
  })();
const read = async (stream: AsyncIterable<Buffer>) => {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks).toString();
};

describe('local file storage', () => {
  it('stores a stream under a new random key and reads it back', async () => {
    const storage = createLocalFileStorage(root);
    const a = await storage.put(from('hello ', 'world'));
    const b = await storage.put(from('hello ', 'world'));
    expect(a.key).toMatch(/^[0-9a-f]{32}$/);
    expect(a.key).not.toBe(b.key);
    expect(a.size).toBe(11);
    expect(await read(await storage.get(a.key))).toBe('hello world');
    expect(readdirSync(join(root, a.key.slice(0, 2)))).toContain(a.key);
  });

  it('delete removes the bytes and is idempotent', async () => {
    const storage = createLocalFileStorage(root);
    const { key } = await storage.put(from('x'));
    await storage.delete(key);
    await storage.delete(key);
    await expect(storage.get(key)).rejects.toBeInstanceOf(StorageNotFoundError);
  });

  it('a source that throws leaves no file and no temp file', async () => {
    const storage = createLocalFileStorage(root);
    const failing = (async function* () {
      yield Buffer.from('partial');
      throw new Error('boom');
    })();
    await expect(storage.put(failing)).rejects.toThrow('boom');
    const entries = readdirSync(root).filter((e) => e !== 'tmp');
    expect(entries).toEqual([]);
    expect(readdirSync(join(root, 'tmp'))).toEqual([]);
  });

  it('refuses any key that is not 32 hex characters, so no path can be built from it', async () => {
    const storage = createLocalFileStorage(join(root, 'uploads'));
    writeFileSync(join(root, 'secret.txt'), 'secret');
    for (const key of [
      '../secret.txt',
      '../../secret.txt',
      '/etc/passwd',
      'a/b',
      '..',
      '',
      'a'.repeat(31),
      'a'.repeat(33),
      `${'a'.repeat(31)}\0`,
      'A'.repeat(32), // upper case is not one of ours
      `${'a'.repeat(30)}..`,
    ]) {
      await expect(storage.get(key)).rejects.toBeInstanceOf(InvalidStorageKeyError);
      await expect(storage.delete(key)).rejects.toBeInstanceOf(InvalidStorageKeyError);
    }
  });

  it('a well-formed key that holds nothing is not found', async () => {
    const storage = createLocalFileStorage(root);
    await expect(storage.get('0'.repeat(32))).rejects.toBeInstanceOf(StorageNotFoundError);
  });
});
