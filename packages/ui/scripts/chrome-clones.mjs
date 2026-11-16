// chrome-clones: stop browser checks filling the disk with Google Chrome's code-sign clones.
//
// On macOS every launch of Google Chrome makes a clone of itself in
// `$(getconf DARWIN_USER_TEMP_DIR)/../X/com.google.Chrome.code_sign_clone/code_sign_clone.XXXXXX` and removes it on a
// clean exit. A Chrome that is closed by a script, or killed, leaves it behind, and each costs real disk.
//
// Two things here, no dependencies, so the file can be copied into another repo unchanged:
//   1. `headlessShell()`: playwright-core's own chrome-headless-shell, if installed. It is not a signed .app
//      bundle, so it makes no clone. Install it with `npx playwright-core install chromium-headless-shell`.
//   2. `guardClones()`: the safety net for when the real Chrome is used (headless or headful). Snapshot before
//      launch; before closing, claim the new entries that a process of ours (a descendant of this Node process)
//      holds open; after closing, delete the claimed ones that are now free. Ownership is by process tree, not
//      timing: a clone that another Chrome, or a verify in another worktree, makes meanwhile is not attributable to
//      us and is left alone. What it does not do: free a clone no process held when we looked (a crash before the
//      claim, lsof unsure), or one whose Chrome we did not start. Such leftovers stay. A no-op off macOS or when
//      the folder is absent. Needs `lsof` and `ps`.
//
// Mirrored in base-app/scripts/ and packages/ui/scripts/ (same file in both).
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** The code_sign_clone folder, or null off macOS or when it cannot be worked out. */
export function cloneDir({ platform = process.platform, userTempDir } = {}) {
  if (platform !== 'darwin') return null;
  try {
    const temp =
      userTempDir ?? execFileSync('getconf', ['DARWIN_USER_TEMP_DIR'], { encoding: 'utf8' }).trim();
    return temp ? join(temp, '..', 'X', 'com.google.Chrome.code_sign_clone') : null;
  } catch {
    return null;
  }
}

/** Names in the folder now (empty when it is absent). Call before launching a browser. */
export function snapshotClones({ dir = cloneDir(), list = readdirSync } = {}) {
  if (!dir) return new Set();
  try {
    return new Set(list(dir));
  } catch {
    return new Set();
  }
}

/** Who has a file open under `path`: { state: 'free' | 'held' | 'unknown', pids }. Any pid on stdout means held,
    whatever the exit code (macOS lsof exits 1 even when it prints pids). Empty stdout with exit 1 means free.
    Anything else (timeout, no lsof, a signal, another status) is unknown, and callers treat unknown as in use. */
export function holders(path, { run = spawnSync, timeoutMs = 20_000 } = {}) {
  const r = run('lsof', ['-t', '+D', path], { encoding: 'utf8', timeout: timeoutMs });
  if (r.error || r.signal) return { state: 'unknown', pids: [] };
  const pids = String(r.stdout ?? '')
    .split('\n')
    .map((line) => Number.parseInt(line, 10))
    .filter((n) => Number.isInteger(n) && n > 0);
  if (pids.length > 0) return { state: 'held', pids };
  return r.status === 1 || r.status === 0
    ? { state: 'free', pids: [] }
    : { state: 'unknown', pids: [] };
}

/** True unless `path` is shown to be free: "in doubt" counts as in use. */
export function inUseByProcess(path, options) {
  return holders(path, options).state !== 'free';
}

/** The parent pid of `pid`, or null. */
export function parentOf(pid, { run = spawnSync } = {}) {
  const r = run('ps', ['-o', 'ppid=', '-p', String(pid)], { encoding: 'utf8', timeout: 5_000 });
  const n = Number.parseInt(String(r.stdout ?? ''), 10);
  return r.error || !Number.isInteger(n) ? null : n;
}

/** True when `pid` is `root` or descends from it, by walking the parent chain. */
export function descendsFrom(pid, root = process.pid, parent = parentOf) {
  let at = pid;
  for (let i = 0; i < 64 && at !== null && at > 1; i++) {
    if (at === root) return true;
    at = parent(at);
  }
  return at === root;
}

/** Before the browser is closed: the new entries (not in `before`) that at least one process of ours (a descendant
    of this Node process) holds open. Those are the clones this launch made. An entry nobody can be attributed
    to (another Chrome's, another worktree's verify, or lsof unsure) is not claimed, so it is never deleted. */
export function claimNewClones(
  before,
  { dir = cloneDir(), list = readdirSync, who = holders, ours = (pid) => descendsFrom(pid) } = {},
) {
  const claimed = new Set();
  if (!dir) return claimed;
  let now;
  try {
    now = list(dir);
  } catch {
    return claimed;
  }
  for (const name of now) {
    if (before.has(name)) continue;
    const { state, pids } = who(join(dir, name));
    if (state === 'held' && pids.some(ours)) claimed.add(name);
  }
  return claimed;
}

/** After close: remove the claimed entries that are now shown to be free. Returns the names removed. */
export function sweepClaimed(
  claimed,
  {
    dir = cloneDir(),
    inUse = inUseByProcess,
    remove = (path) => rmSync(path, { recursive: true, force: true }),
  } = {},
) {
  const removed = [];
  if (!dir) return removed;
  for (const name of claimed) {
    const path = join(dir, name);
    if (inUse(path)) continue;
    try {
      remove(path);
      removed.push(name);
    } catch {
      // leave it: the person can take it
    }
  }
  return removed;
}

/** One launch's guard. `const g = guardClones()` before launching; `await g.around(() => browser.close())` to close
    (claims, closes, sweeps in a `finally`, and a close error still rejects). Does nothing off macOS. */
export function guardClones(options = {}) {
  const before = snapshotClones(options);
  let claimed = new Set();
  return {
    claim: () => {
      claimed = new Set([...claimed, ...claimNewClones(before, options)]);
    },
    sweep: () => sweepClaimed(claimed, options),
    async around(close) {
      this.claim();
      try {
        return await close();
      } finally {
        this.sweep();
      }
    },
  };
}

/** playwright-core's chromium-headless-shell executable if installed, else undefined. Found through the pinned
    revision in playwright-core's browsers.json and playwright's cache folders, not a hard-coded path. */
export function headlessShell({
  env = process.env,
  platform = process.platform,
  home = homedir(),
} = {}) {
  try {
    const pkg = createRequire(import.meta.url).resolve('playwright-core/package.json');
    const registry = JSON.parse(readFileSync(join(pkg, '..', 'browsers.json'), 'utf8'));
    const entry = registry.browsers.find((b) => b.name === 'chromium-headless-shell');
    if (!entry) return undefined;
    const roots = [
      env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== '0'
        ? env.PLAYWRIGHT_BROWSERS_PATH
        : null,
      platform === 'darwin' ? join(home, 'Library', 'Caches', 'ms-playwright') : null,
      platform === 'win32'
        ? join(env.LOCALAPPDATA ?? join(home, 'AppData', 'Local'), 'ms-playwright')
        : null,
      platform === 'linux'
        ? join(env.XDG_CACHE_HOME ?? join(home, '.cache'), 'ms-playwright')
        : null,
    ].filter(Boolean);
    const exe = platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
    for (const root of roots) {
      const base = join(root, `chromium_headless_shell-${entry.revision}`);
      if (!existsSync(base)) continue;
      for (const sub of readdirSync(base)) {
        const candidate = join(base, sub, exe);
        if (sub.startsWith('chrome-headless-shell') && existsSync(candidate)) return candidate;
      }
    }
  } catch {
    // not installed, or playwright-core is not here: fall back to Chrome
  }
  return undefined;
}
