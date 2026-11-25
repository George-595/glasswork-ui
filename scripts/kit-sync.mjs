#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
// kit-sync — the one way an app takes Glasswork UI. Copies @apps/ui and @apps/colors from this
// checkout into an app, records exactly what was copied, and lets the app prove it has not
// drifted. Replaces copying files by hand, which left every app on its own fork of the kit.
//
//   node ~/glasswork-ui/scripts/kit-sync.mjs <app>/<path>/glasswork.json          # sync
//   node ~/glasswork-ui/scripts/kit-sync.mjs <app>/<path>/glasswork.json --dry    # show only
//   node <dir of glasswork.json>/kit-check.mjs                                     # in the app
//
// glasswork.json (the app writes the first three fields once; the sync fills in the rest):
//   {
//     "targets": { "ui": "ui", "colors": "colors" },  // where each package goes, relative to this file
//     "profile": "runtime",                             // "runtime": src, css, manifests, docs, notices
//                                                       // "full": the whole package (tests, scripts, fixtures)
//     "local": ["ui/package.json"],                     // files the app owns: kept on sync, allowed by the check
//     "upstream": "George-595/glasswork-ui",
//     "commit": "<sha>",                                // the glasswork-ui commit copied
//     "files": { "ui/src/index.ts": "<sha256>", ... }   // every copied file, so the check is offline
//   }
//
// Rules: a file listed in `local` is never overwritten or deleted, and the check skips it. Any
// other difference from upstream (an edited file, an extra file, a missing one) fails the check:
// a fix to the kit goes to glasswork-ui first, then every app syncs. Keep `local` short; each
// entry is a fork the app carries by hand. LICENSE.md and NOTICE go next to glasswork.json.
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGES = { ui: 'packages/ui', colors: 'packages/colors' };
const ALWAYS_SKIP = new Set(['node_modules', 'dist', '.turbo', '.vite', 'coverage']);
// what a "runtime" copy keeps, per package: the code an app imports and what it must ship with it
const RUNTIME = [
  /^src\//,
  /^css\//,
  /^package\.json$/,
  /^README\.md$/,
  /^THIRD_PARTY_NOTICES\.md$/,
];

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const cfgPath = args.find((a) => !a.startsWith('--'));
if (!cfgPath) {
  console.error('usage: kit-sync.mjs <path/to/glasswork.json> [--dry]');
  process.exit(2);
}
const cfgFile = resolve(cfgPath);
const base = dirname(cfgFile);
const cfg = existsSync(cfgFile)
  ? JSON.parse(readFileSync(cfgFile, 'utf8'))
  : { targets: { ui: 'ui', colors: 'colors' }, profile: 'runtime', local: [] };
const local = new Set(cfg.local ?? []);
const profile = cfg.profile ?? 'runtime';

const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim();
const commit = git('rev-parse', 'HEAD');
const dirty = git('status', '--porcelain', '--', 'packages/ui', 'packages/colors') !== '';
if (dirty && !args.includes('--allow-dirty')) {
  console.error(
    'glasswork-ui has uncommitted kit changes: commit and merge them first (or pass --allow-dirty to try a branch).',
  );
  process.exit(1);
}

function walk(dir, out = [], rel = '') {
  for (const name of readdirSync(dir)) {
    if (ALWAYS_SKIP.has(name)) continue;
    const abs = join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(abs).isDirectory()) walk(abs, out, r);
    else out.push(r);
  }
  return out;
}
const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
/* Only what glasswork-ui tracks: build output and caches (.a11y, dist) never travel. */
const tracked = (pkgDir) =>
  execFileSync('git', ['ls-files', '-z', '--', pkgDir], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
    .map((f) => f.slice(pkgDir.length + 1));
/* What the app has in a target: its git's view (tracked plus new, minus ignored) when it is a
   repo, so ignored build output is never taken for drift; a plain walk otherwise. */
function present(dir) {
  try {
    return execFileSync(
      'git',
      ['ls-files', '-z', '--cached', '--others', '--exclude-standard', '--', '.'],
      {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    )
      .split('\0')
      .filter((f) => f && existsSync(join(dir, f)));
  } catch {
    return walk(dir);
  }
}

const files = {};
let copied = 0;
let removed = 0;
for (const [pkg, target] of Object.entries(cfg.targets ?? {})) {
  const src = join(ROOT, PACKAGES[pkg] ?? '');
  if (!PACKAGES[pkg]) throw new Error(`unknown package "${pkg}" (ui or colors)`);
  const keep = tracked(PACKAGES[pkg]).filter(
    (f) => profile === 'full' || RUNTIME.some((re) => re.test(f)),
  );
  const wanted = new Set(keep.map((f) => `${target}/${f}`));
  for (const f of keep) {
    const rel = `${target}/${f}`;
    if (local.has(rel)) continue;
    const from = join(src, f);
    const to = join(base, rel);
    files[rel] = hash(from);
    if (existsSync(to) && hash(to) === files[rel]) continue;
    copied++;
    if (!dry) {
      mkdirSync(dirname(to), { recursive: true });
      copyFileSync(from, to);
    }
    if (dry) console.log(`copy   ${rel}`);
  }
  // anything in the target that upstream no longer has (and the app does not own) goes
  const there = existsSync(join(base, target)) ? present(join(base, target)) : [];
  for (const f of there) {
    const rel = `${target}/${f}`;
    if (wanted.has(rel) || local.has(rel)) continue;
    removed++;
    if (dry) console.log(`remove ${rel}`);
    else rmSync(join(base, rel));
  }
}
for (const n of ['LICENSE.md', 'NOTICE']) {
  if (!existsSync(join(ROOT, n)) || local.has(n)) continue;
  files[n] = hash(join(ROOT, n));
  if (!dry) copyFileSync(join(ROOT, n), join(base, n));
}

const out = {
  targets: cfg.targets,
  profile,
  local: [...local].sort(),
  upstream: 'George-595/glasswork-ui',
  commit: dirty ? `${commit}-dirty` : commit,
  files: Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b))),
};
if (!dry) {
  writeFileSync(cfgFile, `${JSON.stringify(out, null, 2)}\n`);
  copyFileSync(join(ROOT, 'scripts/kit-check.mjs'), join(base, 'kit-check.mjs'));
}
const where = relative(process.cwd(), base).split(sep).join('/') || '.';
console.log(
  `${dry ? 'would sync' : 'synced'} glasswork-ui ${commit.slice(0, 7)}${dirty ? ' (dirty)' : ''} into ${where}: ${copied} changed, ${removed} removed, ${local.size} local`,
);
if (!dry)
  console.log(
    "next: npm install (the lockfile follows the kit's package.json), then the app's checks",
  );
