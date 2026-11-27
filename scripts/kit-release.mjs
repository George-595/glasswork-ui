#!/usr/bin/env node
// kit-release — publishes @apps/ui and @apps/colors as versioned packages that any app installs
// with npm, so an app takes the kit by pinning a version, not by copying files.
//
//   node scripts/kit-release.mjs          # pack the current version into releases/
//   node scripts/kit-release.mjs --check  # prove releases/ holds the current version, unchanged
//
// How it works: each package is staged with only what an app imports and ships (src/, css/, its
// manifest, README, notices, LICENSE.md, NOTICE), its manifest is made installable (no "private",
// no scripts, no devDependencies, @apps/colors pointed at its own release), and `npm pack` writes
// releases/apps-<name>-<version>.tgz. That file is committed and merged; an app then depends on
//
//   https://raw.githubusercontent.com/George-595/glasswork-ui/main/releases/apps-ui-<version>.tgz
//
// and its lockfile records the tarball's sha512, so the bytes it installs can never change under
// it. Nothing runs in CI and no registry account is needed: it is done from a session, then
// merged. A released file is never overwritten: to ship a change, raise "version" in both
// packages' package.json (they move together) and run this again.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASES = join(ROOT, 'releases');
export const RAW = 'https://raw.githubusercontent.com/George-595/glasswork-ui/main/releases';
const PACKAGES = { colors: 'packages/colors', ui: 'packages/ui' };
const RUNTIME = [
  /^src\//,
  /^css\//,
  /^package\.json$/,
  /^README\.md$/,
  /^THIRD_PARTY_NOTICES\.md$/,
];
const SKIP = new Set(['node_modules', 'dist', '.turbo', '.vite', 'coverage']);

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));
export const tarball = (name, version) => `apps-${name}-${version}.tgz`;
export const url = (name, version) => `${RAW}/${tarball(name, version)}`;

function walk(dir, out = [], rel = '') {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const abs = join(dir, name);
    const r = rel ? `${rel}/${name}` : name;
    if (statSync(abs).isDirectory()) walk(abs, out, r);
    else out.push(r);
  }
  return out;
}

/** The manifest an app installs: installable, no scripts, the colors dependency on its release. */
export function releaseManifest(pkg, version) {
  const out = { ...pkg, version };
  delete out.private;
  delete out.scripts;
  delete out.devDependencies;
  out.license = 'SEE LICENSE IN LICENSE.md';
  out.repository = { type: 'git', url: 'git+https://github.com/George-595/glasswork-ui.git' };
  if (out.dependencies?.['@apps/colors'])
    out.dependencies = { ...out.dependencies, '@apps/colors': url('colors', version) };
  return out;
}

function stage(name, version) {
  const src = join(ROOT, PACKAGES[name]);
  const dir = mkdtempSync(join(tmpdir(), `glasswork-${name}-`));
  for (const rel of walk(src).filter((f) => RUNTIME.some((re) => re.test(f)))) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true });
    copyFileSync(join(src, rel), join(dir, rel));
  }
  for (const f of ['LICENSE.md', 'NOTICE']) copyFileSync(join(ROOT, f), join(dir, f));
  const manifest = releaseManifest(readJson(join(src, 'package.json')), version);
  writeFileSync(join(dir, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return dir;
}

function pack(name, version, dest) {
  const dir = stage(name, version);
  try {
    execFileSync('npm', ['pack', '--silent', '--pack-destination', dest], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return join(dest, tarball(name, version));
}

/** A digest of what a tarball holds (paths and bytes), so a different gzip never counts as a change. */
function contents(file) {
  const dir = mkdtempSync(join(tmpdir(), 'glasswork-x-'));
  try {
    execFileSync('tar', ['-xzf', file, '-C', dir]);
    const h = createHash('sha256');
    for (const rel of walk(dir).sort()) h.update(`${rel}\0`).update(readFileSync(join(dir, rel)));
    return h.digest('hex');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const integrity = (file) =>
  `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`;

function main() {
  const check = process.argv.includes('--check');
  const versions = Object.values(PACKAGES).map(
    (p) => readJson(join(ROOT, p, 'package.json')).version,
  );
  if (new Set(versions).size !== 1) {
    console.error(
      `@apps/ui and @apps/colors must share one version (have ${versions.join(', ')}).`,
    );
    process.exit(1);
  }
  const [version] = versions;
  mkdirSync(RELEASES, { recursive: true });
  const problems = [];
  for (const name of Object.keys(PACKAGES)) {
    const file = join(RELEASES, tarball(name, version));
    if (check) {
      if (!existsSync(file)) {
        problems.push(`${tarball(name, version)} is missing: run node scripts/kit-release.mjs`);
        continue;
      }
      const tmp = mkdtempSync(join(tmpdir(), 'glasswork-check-'));
      try {
        const fresh = pack(name, version, tmp);
        if (contents(fresh) !== contents(file))
          problems.push(
            `${tarball(name, version)} no longer matches packages/${name}: a released version never changes, so raise "version" in both packages and run node scripts/kit-release.mjs`,
          );
      } finally {
        rmSync(tmp, { recursive: true, force: true });
      }
      continue;
    }
    if (existsSync(file)) {
      console.log(
        `${tarball(name, version)} already released; raise the version to ship a change.`,
      );
      continue;
    }
    pack(name, version, RELEASES);
    console.log(`released ${tarball(name, version)}  ${integrity(file)}`);
  }
  if (problems.length) {
    console.error(`Kit release check FAILED:\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  if (check) console.log(`Kit release check passed: releases/ holds ${version}, unchanged.`);
  else
    console.log(
      `\nIn an app's package.json:\n  "@apps/colors": "${url('colors', version)}",\n  "@apps/ui": "${url('ui', version)}"`,
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
