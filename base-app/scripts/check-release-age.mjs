// check-release-age — George's 7-day quarantine for every dependency.
//
//   npm run check:deps                            # exits 1 on a breach
//   MIN_DAYS=14 npm run check:deps
//
// Reads the app's lockfile: its own (an exported copy), else that of the
// workspace root one folder up that lists it (the repo root), and asks the npm registry when each locked version was published. Any
// package (direct or transitive) younger than MIN_DAYS (default 7) fails, as
// does any range (^, ~, *, latest) in a workspace package.json: every version
// is an exact pin. The .npmrc beside the lockfile sets min-release-age=7 so a
// fresh `npm install` cannot resolve anything younger in the first place;
// this script proves the lockfile agrees.
//
// Exceptions: `dep-quarantine-allowlist` beside the lockfile, one exact version
// per line, in this format:
//   npm <name>@<version> <YYYY-MM-DD granted> <George's words>
// An entry exempts that one version from the age rule only (it must still be an
// exact pin). Only George grants one; the check says when an entry can go.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = join(dirname(fileURLToPath(import.meta.url)), '..');
const parent = dirname(app);
const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
const listsApp = () =>
  existsSync(join(parent, 'package.json')) &&
  (readJson(join(parent, 'package.json')).workspaces ?? []).includes(basename(app));
let root = app;
if (!existsSync(join(app, 'package-lock.json'))) {
  if (!existsSync(join(parent, 'package-lock.json')) || !listsApp()) {
    console.log(`Release-age check FAILED: no package-lock.json in ${app}. Run npm install.`);
    process.exit(1);
  }
  root = parent;
}
const MIN_DAYS = Number(process.env.MIN_DAYS ?? 7);
const cutoff = Date.now() - MIN_DAYS * 24 * 60 * 60 * 1000;
const lock = JSON.parse(readFileSync(join(root, 'package-lock.json'), 'utf8'));

const problems = [];
const notes = [];

const allowFile = join(root, 'dep-quarantine-allowlist');
const allowed = new Set(
  existsSync(allowFile)
    ? readFileSync(allowFile, 'utf8')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => l.split(/\s+/))
        .filter(([eco]) => eco === 'npm')
        .map(([, spec]) => spec)
    : [],
);

// 1. exact pins in every workspace manifest
const manifests = [
  'package.json',
  ...Object.keys(lock.packages)
    .filter((p) => p !== '' && !p.includes('node_modules/'))
    .map((p) => `${p}/package.json`),
];
for (const m of manifests) {
  const pkg = JSON.parse(readFileSync(join(root, m), 'utf8'));
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    for (const [name, spec] of Object.entries(pkg[field] ?? {})) {
      if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(spec))
        problems.push(`${m}: ${field}.${name} is "${spec}", not an exact version`);
    }
  }
}

// 1b. inside a workspace root, the app's pins must equal the root's: the app
// carries its own so it can leave, and two pins of one package would drift
if (root !== app) {
  const rootPkg = readJson(join(root, 'package.json'));
  const rootPins = { ...rootPkg.dependencies, ...rootPkg.devDependencies };
  const appPkg = readJson(join(app, 'package.json'));
  for (const [name, spec] of Object.entries({
    ...appPkg.dependencies,
    ...appPkg.devDependencies,
  })) {
    if (rootPins[name] && rootPins[name] !== spec)
      problems.push(
        `${basename(app)}/package.json: ${name} is ${spec}, the root pins ${rootPins[name]}`,
      );
  }
}

// 2. publish age of every locked registry package
const locked = new Map();
for (const [path, info] of Object.entries(lock.packages)) {
  if (!path.includes('node_modules/') || info.link || !info.version) continue;
  if (info.resolved && !info.resolved.startsWith('https://registry.npmjs.org/')) continue;
  const name = info.name ?? path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  locked.set(`${name}@${info.version}`, { name, version: info.version });
}

const entries = [...locked.values()];
const times = new Map();
async function fetchTimes(name) {
  if (times.has(name)) return times.get(name);
  const p = fetch(`https://registry.npmjs.org/${name.replace('/', '%2F')}`, {
    headers: { accept: 'application/json' },
  }).then(async (r) => {
    if (!r.ok) throw new Error(`${name}: registry answered ${r.status}`);
    return (await r.json()).time ?? {};
  });
  times.set(name, p);
  return p;
}

let next = 0;
async function worker() {
  while (next < entries.length) {
    const { name, version } = entries[next++];
    try {
      const t = (await fetchTimes(name))[version];
      if (!t) problems.push(`${name}@${version}: no publish time in the registry`);
      else if (Date.parse(t) > cutoff && allowed.has(`${name}@${version}`)) {
        notes.push(
          `${name}@${version}: under ${MIN_DAYS} days old, allowed by dep-quarantine-allowlist`,
        );
      } else if (allowed.has(`${name}@${version}`)) {
        notes.push(`${name}@${version}: now ${MIN_DAYS}+ days old, delete its allowlist entry`);
      } else if (Date.parse(t) > cutoff) {
        const days = ((Date.now() - Date.parse(t)) / 86_400_000).toFixed(1);
        problems.push(`${name}@${version}: published ${t.slice(0, 10)} (${days} days ago)`);
      }
    } catch (err) {
      problems.push(String(err.message ?? err));
    }
  }
}
await Promise.all(Array.from({ length: 16 }, worker));

for (const n of notes) console.log(`  note: ${n}`);
if (problems.length) {
  console.log(`Release-age check FAILED (${MIN_DAYS}-day quarantine, ${entries.length} packages):`);
  for (const p of problems.sort()) console.log(`  ${p}`);
  process.exit(1);
}
console.log(
  `Release-age check passed: ${entries.length} locked packages, all at least ${MIN_DAYS} days old, every manifest pin exact.`,
);
