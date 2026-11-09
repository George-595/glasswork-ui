/* Precompression for the built client: beside each text file in dist/ that is 1 kB or more,
   write `file.br` (Brotli, quality 11) and `file.gz` (gzip, level 9), only when the result is
   smaller than the original. server/infra/http/static.ts serves them to a client whose
   Accept-Encoding allows it; a file with no variant is served as it is. Node's own zlib, so no
   dependency. vite.config.ts runs it after the client bundle is written. */

import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { brotliCompressSync, constants, gzipSync } from 'node:zlib';

/* What compresses well. Images, fonts (woff2) and wasm are already compressed or not worth it. */
export const COMPRESSIBLE = new Set([
  '.js',
  '.mjs',
  '.css',
  '.html',
  '.svg',
  '.json',
  '.txt',
  '.map',
  '.webmanifest',
]);
export const MIN_BYTES = 1024;

async function* walk(dir: string): AsyncGenerator<string> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (entry.isFile()) yield path;
  }
}

export interface PrecompressTotals {
  files: number;
  original: number;
  brotli: number;
  gzip: number;
}

/* How many files got variants, and the byte totals. */
export async function precompressDir(dir: string): Promise<PrecompressTotals> {
  const totals: PrecompressTotals = { files: 0, original: 0, brotli: 0, gzip: 0 };
  for await (const path of walk(dir)) {
    if (!COMPRESSIBLE.has(extname(path).toLowerCase())) continue;
    const { size } = await stat(path);
    if (size < MIN_BYTES) continue;
    const body = await readFile(path);
    const br = brotliCompressSync(body, {
      params: {
        [constants.BROTLI_PARAM_QUALITY]: 11,
        [constants.BROTLI_PARAM_SIZE_HINT]: body.length,
      },
    });
    const gz = gzipSync(body, { level: 9 });
    let wrote = false;
    if (br.length < body.length) {
      await writeFile(`${path}.br`, br);
      totals.brotli += br.length;
      wrote = true;
    }
    if (gz.length < body.length) {
      await writeFile(`${path}.gz`, gz);
      totals.gzip += gz.length;
      wrote = true;
    }
    if (wrote) {
      totals.files += 1;
      totals.original += body.length;
    }
  }
  return totals;
}
