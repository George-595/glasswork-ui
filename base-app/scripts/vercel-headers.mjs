// vercel-headers — keeps vercel.json's security headers equal to what Docker sends.
//
//   node scripts/vercel-headers.mjs --check   exit 1 when vercel.json is out of date (npm run check:headers)
//   node scripts/vercel-headers.mjs --write   regenerate the `headers` block of vercel.json
//
// On Vercel the CDN serves dist/, so the Node static handler never sees index.html and the
// headers must be in vercel.json. They come from server/infra/http/security-headers.ts, the same
// module static.ts uses, so there is one source of truth. The one input that moves is the sha256
// of the inline theme script in index.html: edit that script and `--check` fails until you run
// `--write`.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vercelHeadersBlock } from '../server/infra/http/security-headers.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const vercelPath = join(root, 'vercel.json');
const indexHtml = readFileSync(join(root, 'index.html'), 'utf8');

const config = JSON.parse(readFileSync(vercelPath, 'utf8'));
const want = vercelHeadersBlock(indexHtml);
const mode = process.argv[2];

if (mode === '--write') {
  // keep the key order readable: headers after rewrites
  const next = {};
  for (const [k, v] of Object.entries(config)) {
    if (k === 'headers') continue;
    next[k] = v;
    if (k === 'rewrites') next.headers = want;
  }
  if (!next.headers) next.headers = want;
  writeFileSync(vercelPath, `${JSON.stringify(next, null, 2)}\n`);
  console.info('vercel-headers: vercel.json headers written');
} else if (mode === '--check') {
  if (JSON.stringify(config.headers) !== JSON.stringify(want)) {
    console.error(
      'vercel-headers: vercel.json `headers` does not match server/infra/http/security-headers.ts ' +
        'and the inline script in index.html. Run `node scripts/vercel-headers.mjs --write`.',
    );
    process.exit(1);
  }
  console.info('vercel-headers: vercel.json headers are current');
} else {
  console.error('usage: node scripts/vercel-headers.mjs --check | --write');
  process.exit(2);
}
