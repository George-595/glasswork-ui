#!/usr/bin/env node
// kit-bump — moves an app that installs the kit onto a new kit release, without running npm.
//
//   node scripts/kit-bump.mjs <app-dir> [version]   # version defaults to the one in packages/ui
//
// An app pins the kit as two release URLs (…/releases/apps-{ui,colors}-<version>.tgz) in one or
// more package.json files, and its package-lock.json records each tarball's version, sha512 and
// dependencies. This rewrites both from the tarballs in this repo's releases/ folder: no network,
// no install scripts, nothing from the app is executed. It prints a JSON report:
//
//   { from: ["1.0.4"], to: "1.0.5", files: [...], lockfiles: [...], needsInstall: false }
//
// needsInstall is true when the new kit adds, drops or moves a third-party dependency: the
// lockfile then needs one `npm install` in a session before `npm ci` will accept it. An app with
// no kit URL is left untouched (files: []). Used by .github/workflows/kit-bump.yml through
// scripts/kit-bump-prs.mjs, and safe to run by hand.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = 'https://raw.githubusercontent.com/George-595/glasswork-ui/main/releases';
const NAMES = ['ui', 'colors'];
const SKIP = new Set(['node_modules', '.git', 'dist', 'coverage', '.vite', '.turbo']);
const PIN = /glasswork-ui\/main\/releases\/apps-(ui|colors)-(\d+\.\d+\.\d+)\.tgz/g;

export const tarballUrl = (name, version) => `${RAW}/apps-${name}-${version}.tgz`;

function walk(dir, want, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) walk(abs, want, out);
    else if (want(name)) out.push(abs);
  }
  return out;
}

/** What npm records for a release tarball: its version, sha512 and manifest dependencies. */
export function releaseFacts(releasesDir, name, version) {
  const file = join(releasesDir, `apps-${name}-${version}.tgz`);
  const bytes = readFileSync(file);
  const dir = mkdtempSync(join(tmpdir(), 'kit-bump-'));
  try {
    execFileSync('tar', ['-xzf', file, '-C', dir, 'package/package.json']);
    const pkg = JSON.parse(readFileSync(join(dir, 'package', 'package.json'), 'utf8'));
    return {
      version: pkg.version,
      integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}`,
      license: pkg.license,
      dependencies: pkg.dependencies,
      peerDependencies: pkg.peerDependencies,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const thirdParty = (deps = {}) =>
  JSON.stringify(Object.entries(deps).filter(([k]) => !k.startsWith('@apps/')));

/** Rewrites every kit URL in a text to `version`, returning the new text and the old versions. */
export function rewritePins(text, version) {
  const from = new Set();
  const out = text.replace(PIN, (_m, name, v) => {
    from.add(v);
    return `glasswork-ui/main/releases/apps-${name}-${version}.tgz`;
  });
  return { text: out, from: [...from] };
}

/** Points a parsed package-lock at the new release. Returns true if third-party deps changed. */
export function updateLock(lock, facts) {
  let changed = false;
  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    const m = /(?:^|\/)node_modules\/@apps\/(ui|colors)$/.exec(path);
    if (!m || !entry.resolved?.includes('glasswork-ui/main/releases/')) continue;
    const f = facts[m[1]];
    if (thirdParty(entry.dependencies) !== thirdParty(f.dependencies)) changed = true;
    entry.version = f.version;
    entry.resolved = tarballUrl(m[1], f.version);
    entry.integrity = f.integrity;
    if (f.license) entry.license = f.license;
    if (f.dependencies) entry.dependencies = f.dependencies;
    else delete entry.dependencies;
    if (f.peerDependencies) entry.peerDependencies = f.peerDependencies;
  }
  return changed;
}

export function bumpApp(appDir, version, releasesDir = join(ROOT, 'releases')) {
  const facts = Object.fromEntries(NAMES.map((n) => [n, releaseFacts(releasesDir, n, version)]));
  const report = { from: [], to: version, files: [], lockfiles: [], needsInstall: false };
  const from = new Set();
  const manifests = walk(appDir, (n) => n === 'package.json');
  const locks = walk(appDir, (n) => n === 'package-lock.json');
  for (const file of [...manifests, ...locks]) {
    const before = readFileSync(file, 'utf8');
    const { text, from: old } = rewritePins(before, version);
    if (!old.length) continue;
    for (const v of old) from.add(v);
    let after = text;
    if (file.endsWith('package-lock.json')) {
      const lock = JSON.parse(text);
      if (updateLock(lock, facts)) report.needsInstall = true;
      after = `${JSON.stringify(lock, null, 2)}\n`;
      report.lockfiles.push(relative(appDir, file));
    }
    if (after !== before) {
      writeFileSync(file, after);
      report.files.push(relative(appDir, file));
    }
  }
  report.from = [...from].toSorted();
  return report;
}

function main() {
  const [appDir, wanted] = process.argv.slice(2);
  if (!appDir) {
    console.error('usage: node scripts/kit-bump.mjs <app-dir> [version]');
    process.exit(2);
  }
  const version =
    wanted ?? JSON.parse(readFileSync(join(ROOT, 'packages/ui/package.json'), 'utf8')).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    console.error(`not a release version: ${version}`);
    process.exit(2);
  }
  console.log(JSON.stringify(bumpApp(resolve(appDir), version)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
