#!/usr/bin/env node
// kit-bump-prs — after a kit release lands on main, opens one version-bump pull request in every
// app listed in .github/kit-apps.json and merges it straight away (George, 27 Nov 2026: if a
// release works in Glasswork it works in the apps, so nobody merges bumps by hand). Run by
// .github/workflows/kit-bump.yml.
//
//   KIT_BUMP_TOKEN=… node scripts/kit-bump-prs.mjs [version] [--dry-run]
//
// For each app: a shallow fetch of its base branch, scripts/kit-bump.mjs on it (no npm, nothing
// from the app runs), a commit on kit/v<version>, a push and a pull request against that base.
// The pull request is squash-merged and its branch deleted, except when the release changes a
// third-party dependency (the lockfile then needs an `npm install`): that one stays open. An app
// that is already on this version (or newer) or has no kit URL yet is skipped; one that already
// has the branch gets its open bump pull request merged instead. The token only ever travels in a git environment header and an
// Authorization header; it is never printed or written to disk.
import { execFileSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bumpApp } from './kit-bump.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const API = 'https://api.github.com';

const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

function gitEnv(token) {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  };
}

async function api(token, method, path, body) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'x-github-api-version': '2022-11-28',
      'user-agent': 'glasswork-kit-bump',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path}: ${res.status} ${data.message ?? ''}`.trim());
  return data;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Squash-merges a bump pull request and deletes its branch. GitHub can answer 405/409 for a few
// seconds after a pull request is opened while it works out mergeability, so retry briefly.
async function mergePr(token, repo, number, branch) {
  let last;
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await api(token, 'PUT', `/repos/${repo}/pulls/${number}/merge`, { merge_method: 'squash' });
      await api(token, 'DELETE', `/repos/${repo}/git/refs/heads/${branch}`).catch(() => {});
      return;
    } catch (err) {
      last = err;
      if (!/: (405|409) /.test(err.message)) break;
      await sleep(5000);
    }
  }
  throw last;
}

const NEEDS_INSTALL = 'Needs one `npm install` before merging';

function prBody(app, report, version) {
  const lines = [
    `Moves this app onto Glasswork kit **${version}** (from ${report.from.join(', ')}).`,
    '',
    `Release notes: https://github.com/George-595/glasswork-ui/commits/main/releases`,
    '',
    `Changed: ${report.files.map((f) => `\`${f}\``).join(', ')}. The lockfile's sha512 is taken from the release tarball itself.`,
  ];
  if (report.needsInstall)
    lines.push(
      '',
      `**${NEEDS_INSTALL}:** this kit release changes a third-party dependency, so the lockfile is not complete yet.`,
    );
  lines.push(
    '',
    report.needsInstall
      ? 'Opened automatically by the kit-bump workflow in glasswork-ui. Left open because of the install above.'
      : 'Opened and merged automatically by the kit-bump workflow in glasswork-ui.',
  );
  if (app.note) lines.push('', app.note);
  return lines.join('\n');
}

export async function run({ version, token, dryRun = false, log = console.log }) {
  const apps = JSON.parse(readFileSync(join(ROOT, '.github/kit-apps.json'), 'utf8')).apps;
  const results = [];
  for (const app of apps) {
    const branch = `kit/v${version}`;
    const dir = mkdtempSync(join(tmpdir(), 'kit-app-'));
    const env = gitEnv(token);
    const git = (...args) =>
      execFileSync('git', args, { cwd: dir, env, stdio: ['ignore', 'pipe', 'pipe'] })
        .toString()
        .trim();
    try {
      git('init', '-q');
      git('remote', 'add', 'origin', `https://github.com/${app.repo}.git`);
      if (git('ls-remote', '--heads', 'origin', branch)) {
        const owner = app.repo.split('/')[0];
        const [open] = await api(token, 'GET', `/repos/${app.repo}/pulls?state=open&head=${owner}:${branch}`);
        if (!open) {
          results.push({ repo: app.repo, outcome: `skipped: ${branch} already exists` });
        } else if ((open.body ?? '').includes(NEEDS_INSTALL)) {
          results.push({ repo: app.repo, outcome: `left open (needs npm install) ${open.html_url}` });
        } else if (dryRun) {
          results.push({ repo: app.repo, outcome: `would merge ${open.html_url}` });
        } else {
          await mergePr(token, app.repo, open.number, branch);
          results.push({ repo: app.repo, outcome: `merged ${open.html_url}` });
        }
        continue;
      }
      git('fetch', '-q', '--depth', '1', 'origin', app.base);
      git('checkout', '-q', '-b', branch, 'FETCH_HEAD');
      const before = bumpApp(dir, version, join(ROOT, 'releases'));
      if (!before.from.length) {
        results.push({ repo: app.repo, outcome: 'skipped: does not install the kit package yet' });
        continue;
      }
      if (before.from.some((v) => newer(v, version))) {
        git('checkout', '-q', '--', '.');
        results.push({ repo: app.repo, outcome: `skipped: already on ${before.from.join(', ')}` });
        continue;
      }
      if (!before.files.length) {
        results.push({ repo: app.repo, outcome: `skipped: already on ${version}` });
        continue;
      }
      if (dryRun) {
        results.push({ repo: app.repo, outcome: `would open and merge: ${before.files.join(', ')}` });
        continue;
      }
      git('add', '--', ...before.files);
      git(
        '-c',
        'user.name=glasswork-kit-bump',
        '-c',
        'user.email=41898282+github-actions[bot]@users.noreply.github.com',
        'commit',
        '-q',
        '-m',
        `Glasswork kit ${version}`,
      );
      git('push', '-q', 'origin', `HEAD:refs/heads/${branch}`);
      const pr = await api(token, 'POST', `/repos/${app.repo}/pulls`, {
        title: `Glasswork kit ${version}`,
        head: branch,
        base: app.base,
        body: prBody(app, before, version),
        maintainer_can_modify: false,
      });
      if (before.needsInstall) {
        results.push({ repo: app.repo, outcome: `opened, left open (needs npm install) ${pr.html_url}` });
      } else {
        await mergePr(token, app.repo, pr.number, branch);
        results.push({ repo: app.repo, outcome: `opened and merged ${pr.html_url}` });
      }
    } catch (err) {
      // Only git's or the API's message: neither ever echoes the token.
      results.push({ repo: app.repo, outcome: `FAILED: ${String(err.message).split('\n')[0]}` });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
  for (const r of results) log(`${r.repo}: ${r.outcome}`);
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const version =
    args.find((a) => !a.startsWith('--')) ||
    JSON.parse(readFileSync(join(ROOT, 'packages/ui/package.json'), 'utf8')).version;
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`not a release version: ${version}`);
  const token = process.env.KIT_BUMP_TOKEN;
  if (!token) throw new Error('KIT_BUMP_TOKEN is not set');
  const results = await run({ version, token, dryRun });
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Glasswork kit ${version}\n\n${results.map((r) => `- ${r.repo}: ${r.outcome}`).join('\n')}\n`,
    );
  if (results.some((r) => r.outcome.startsWith('FAILED'))) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
