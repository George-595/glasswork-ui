// check-ignore-files — the upload filters must not lose a secret.
//
//   npm run check:ignore
//
// `vercel` (the CLI) uploads the folder minus .vercelignore, and ignores .gitignore as soon as
// a .vercelignore exists; its built-in list skips `.env.local` but not `.env`. So every pattern
// in .gitignore that guards a secret or local data (env files, SQLite files, uploads) must also
// be in .vercelignore, or `vercel` would upload the .env that README tells George to fill with
// the API keys. The same for the Docker build context (.dockerignore), for env files.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const lines = (name) =>
  readFileSync(join(root, name), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
/** A leading `**` + slash, a leading slash and a trailing slash are the same pattern. */
const norm = (l) => l.replace(/^(!?)(\*\*\/|\/)/, '$1').replace(/\/$/, '');

/** `.env*` is the same as `.env` plus `.env.*`. */
const expand = (l) => (l === '.env*' ? ['.env', '.env.*'] : [l]);

const guarded = (l) => /^!?(\*\*\/|\/)?\.env/.test(l) || /sqlite|^\.?data|\.db$|uploads/.test(l);

const patterns = (name) => lines(name).map(norm).flatMap(expand);
const gitignore = [...new Set(patterns('.gitignore').filter(guarded))];
const vercel = new Set(patterns('.vercelignore'));
// the Docker build context holds the .dockerignore: here it is the repo root (the workspace root);
// in a copy made by `npm run export` it is the app's own folder. Neither present: readFileSync throws.
const dockerignore = existsSync(join(root, '.dockerignore')) ? '.dockerignore' : '../.dockerignore';
const docker = new Set(patterns(dockerignore));

const problems = [];
for (const pattern of gitignore) {
  if (!vercel.has(pattern))
    problems.push(`.vercelignore is missing "${pattern}" (it is in .gitignore)`);
}
for (const pattern of gitignore.filter((l) => /^!?\.env/.test(l))) {
  if (!docker.has(pattern))
    problems.push(`.dockerignore is missing "${pattern}" (it is in .gitignore)`);
}
if (problems.length) {
  console.error(`check:ignore FAILED:\n  - ${problems.join('\n  - ')}`);
  process.exit(1);
}
console.info(`check:ignore: ${gitignore.length} secret and data patterns are in .vercelignore`);
