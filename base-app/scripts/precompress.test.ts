import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MIN_BYTES, precompressDir } from './precompress.ts';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'precompress-'));
  await mkdir(join(dir, 'assets'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const big = (tag: string) => `/* ${tag} */ ${'const value = 1;\n'.repeat(400)}`;

describe('precompressDir', () => {
  it('writes a .br and a .gz beside each text file of 1 kB or more, in any folder', async () => {
    await writeFile(join(dir, 'index.html'), big('html'));
    await writeFile(join(dir, 'assets', 'app-1.js'), big('js'));
    await writeFile(join(dir, 'assets', 'app-1.css'), big('css'));
    await writeFile(join(dir, 'assets', 'logo.svg'), big('svg'));
    await writeFile(join(dir, 'data.json'), JSON.stringify({ a: big('json') }));
    const totals = await precompressDir(dir);
    expect(totals.files).toBe(5);
    expect(totals.brotli).toBeLessThan(totals.original);
    expect(totals.gzip).toBeLessThan(totals.original);
    for (const file of [
      'index.html',
      'assets/app-1.js',
      'assets/app-1.css',
      'assets/logo.svg',
      'data.json',
    ]) {
      const original = await readFile(join(dir, file));
      expect(brotliDecompressSync(await readFile(join(dir, `${file}.br`))).equals(original)).toBe(
        true,
      );
      expect(gunzipSync(await readFile(join(dir, `${file}.gz`))).equals(original)).toBe(true);
    }
  });

  it('skips files under 1 kB', async () => {
    await writeFile(join(dir, 'assets', 'tiny.js'), 'x'.repeat(MIN_BYTES - 1));
    const totals = await precompressDir(dir);
    expect(totals.files).toBe(0);
    expect(await readdir(join(dir, 'assets'))).toEqual(['tiny.js']);
  });

  it('skips images, fonts and other types that do not compress', async () => {
    await writeFile(join(dir, 'assets', 'photo.png'), Buffer.alloc(5000, 1));
    await writeFile(join(dir, 'assets', 'font.woff2'), Buffer.alloc(5000, 2));
    await precompressDir(dir);
    expect((await readdir(join(dir, 'assets'))).sort()).toEqual(['font.woff2', 'photo.png']);
  });

  it('writes a variant only when it is smaller than the file', async () => {
    // random bytes do not compress: both variants would be larger than the file
    await writeFile(join(dir, 'assets', 'noise.json'), randomBytes(4000));
    const totals = await precompressDir(dir);
    expect(totals.files).toBe(0);
    expect(await readdir(join(dir, 'assets'))).toEqual(['noise.json']);
  });

  it('does not compress its own output when run twice', async () => {
    await writeFile(join(dir, 'assets', 'app-1.js'), big('js'));
    await precompressDir(dir);
    await precompressDir(dir);
    expect((await readdir(join(dir, 'assets'))).sort()).toEqual([
      'app-1.js',
      'app-1.js.br',
      'app-1.js.gz',
    ]);
  });
});
