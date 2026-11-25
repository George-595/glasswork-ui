#!/usr/bin/env node
// kit-check — proves this app's copy of Glasswork UI is exactly what glasswork-ui's kit-sync
// copied (glasswork.json beside this file lists every file and its hash). Offline, no other
// checkout needed. Written by glasswork-ui/scripts/kit-sync.mjs: do not edit it here.
//
//   node <dir>/kit-check.mjs          # exit 1 on any drift
//
// A change to a kit file belongs in glasswork-ui, then `kit-sync` brings it to every app. A file
// the app really must own goes in glasswork.json's "local" list (and stays a fork, by hand).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = dirname(fileURLToPath(import.meta.url));
const cfg = JSON.parse(readFileSync(join(base, 'glasswork.json'), 'utf8'));
const local = new Set(cfg.local ?? []);
const SKIP = new Set(['node_modules', 'dist', '.turbo', '.vite', 'coverage']);
const hash = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

function walk(dir, rel, out) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const abs = join(dir, name);
    const r = `${rel}/${name}`;
    if (statSync(abs).isDirectory()) walk(abs, r, out);
    else out.push(r);
  }
  return out;
}

/* The app's files in a target: git's view (tracked plus new, minus ignored build output such
   as .a11y) when this is a repo, else every file. */
function present(dir, rel) {
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
      .filter((f) => f && existsSync(join(dir, f)))
      .map((f) => `${rel}/${f}`);
  } catch {
    return walk(dir, rel, []);
  }
}

const problems = [];
for (const [rel, want] of Object.entries(cfg.files ?? {})) {
  const abs = join(base, rel);
  if (!existsSync(abs)) problems.push(`missing  ${rel}`);
  else if (hash(abs) !== want) problems.push(`edited   ${rel}`);
}
for (const target of Object.values(cfg.targets ?? {})) {
  const dir = join(base, target);
  if (!existsSync(dir)) continue;
  for (const rel of present(dir, target)) {
    if (!(rel in cfg.files) && !local.has(rel)) problems.push(`extra    ${rel}`);
  }
}

const sha = String(cfg.commit ?? '').slice(0, 7);
if (problems.length) {
  console.error(`Glasswork UI copy has drifted from glasswork-ui ${sha}:`);
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    'Make the change in glasswork-ui, merge it, then run kit-sync (see glasswork-ui docs/USING-THE-KIT.md).',
  );
  process.exit(1);
}
console.log(
  `Glasswork UI copy matches glasswork-ui ${sha} (${Object.keys(cfg.files).length} files, ${local.size} local)`,
);
