import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  claimNewClones,
  cloneDir,
  descendsFrom,
  guardClones,
  holders,
  inUseByProcess,
  snapshotClones,
  sweepClaimed,
} from '../base-app/scripts/chrome-clones.mjs';

const DIR = '/fake/X/com.google.Chrome.code_sign_clone';
// an injected process tree: 100 is "us"; 101 is our child, 102 its child; 900 is a stranger
const TREE = { 102: 101, 101: 100, 100: 1, 900: 1 };
const ours = (pid) => descendsFrom(pid, 100, (p) => TREE[p] ?? null);

test('a process descends from us through its parents, and a stranger does not', () => {
  assert.equal(ours(102), true);
  assert.equal(ours(101), true);
  assert.equal(ours(100), true);
  assert.equal(ours(900), false);
});

test('claim keeps new entries held by our tree only; foreign, free and old ones are not claimed', () => {
  const before = new Set(['old']);
  const held = { mine: [102], theirs: [900], both: [900, 101] };
  const who = (path) => {
    const pids = held[path.slice(DIR.length + 1)] ?? [];
    return pids.length ? { state: 'held', pids } : { state: 'free', pids: [] };
  };
  const claimed = claimNewClones(before, {
    dir: DIR,
    list: () => ['old', 'mine', 'theirs', 'both', 'orphan'],
    who,
    ours,
  });
  assert.deepEqual([...claimed].sort(), ['both', 'mine']);
});

test('an entry lsof could not judge is not claimed', () => {
  const claimed = claimNewClones(new Set(), {
    dir: DIR,
    list: () => ['x'],
    who: () => ({ state: 'unknown', pids: [] }),
    ours,
  });
  assert.equal(claimed.size, 0);
});

test('sweep removes claimed entries once free, and keeps those still in use', () => {
  const removed = [];
  const out = sweepClaimed(new Set(['a', 'b']), {
    dir: DIR,
    inUse: (path) => path.endsWith('/b'),
    remove: (path) => removed.push(path.slice(DIR.length + 1)),
  });
  assert.deepEqual(out, ['a']);
  assert.deepEqual(removed, ['a']);
});

test('a removal that fails leaves the entry and carries on', () => {
  const out = sweepClaimed(new Set(['a', 'b']), {
    dir: DIR,
    inUse: () => false,
    remove: (path) => {
      if (path.endsWith('/a')) throw new Error('EBUSY');
    },
  });
  assert.deepEqual(out, ['b']);
});

test('guard: a held-by-us clone is removed after close, a foreign one made meanwhile is kept, and close errors reject', async () => {
  let listing = ['old'];
  const removed = [];
  const state = { mine: 'held', theirs: 'held' };
  const options = {
    dir: DIR,
    list: () => listing,
    who: (path) => {
      const name = path.slice(DIR.length + 1);
      return name === 'mine'
        ? { state: state.mine, pids: [101] }
        : { state: state.theirs, pids: [900] };
    },
    ours,
    inUse: (path) => (path.endsWith('/theirs') ? true : state.mine === 'held'),
    remove: (path) => removed.push(path.slice(DIR.length + 1)),
  };
  const guard = guardClones(options);
  listing = ['old', 'mine', 'theirs'];
  await guard.around(async () => {
    state.mine = 'free';
  });
  assert.deepEqual(removed, ['mine']);

  const guard2 = guardClones({ ...options, list: () => ['old', 'mine'] });
  await assert.rejects(
    guard2.around(async () => {
      throw new Error('close failed');
    }),
    /close failed/,
  );
});

// the real functions, no fake: a child holds a file open under a directory
test('real lsof: a held directory is in use, a free one is not (macOS exits 1 with pids on stdout)', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'clone-test-'));
  if (holders(dir).state === 'unknown') {
    rmSync(dir, { recursive: true, force: true });
    return t.skip('lsof is not usable here');
  }
  mkdirSync(join(dir, 'clone'));
  const file = join(dir, 'clone', 'held');
  writeFileSync(file, 'x');
  const child = spawn(
    process.execPath,
    [
      '-e',
      "require('node:fs').openSync(process.argv[1], 'r'); console.log('ready'); setInterval(() => {}, 1000)",
      file,
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  try {
    await new Promise((resolve) => child.stdout.once('data', resolve));
    const held = holders(join(dir, 'clone'));
    assert.equal(held.state, 'held');
    assert.ok(held.pids.includes(child.pid), 'lists the child pid');
    assert.equal(inUseByProcess(join(dir, 'clone')), true);
    assert.equal(descendsFrom(child.pid), true, 'the child descends from this process');
    assert.equal(descendsFrom(1), false);
    mkdirSync(join(dir, 'free'));
    assert.equal(holders(join(dir, 'free')).state, 'free');
    assert.equal(inUseByProcess(join(dir, 'free')), false);
  } finally {
    child.kill();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('lsof missing, timed out or killed counts as in use', () => {
  assert.equal(
    holders('/x', { run: () => ({ error: new Error('ENOENT'), status: null }) }).state,
    'unknown',
  );
  assert.equal(
    holders('/x', { run: () => ({ signal: 'SIGTERM', status: null, stdout: '' }) }).state,
    'unknown',
  );
  assert.equal(holders('/x', { run: () => ({ status: 2, stdout: '' }) }).state, 'unknown');
  assert.equal(holders('/x', { run: () => ({ status: 1, stdout: '123\n456\n' }) }).state, 'held');
  assert.equal(holders('/x', { run: () => ({ status: 1, stdout: '' }) }).state, 'free');
});

test('a missing folder or a failed listing is a no-op', () => {
  const boom = () => {
    throw new Error('ENOENT');
  };
  assert.equal(snapshotClones({ dir: DIR, list: boom }).size, 0);
  assert.equal(claimNewClones(new Set(), { dir: DIR, list: boom }).size, 0);
  assert.equal(claimNewClones(new Set(), { dir: null }).size, 0);
  assert.deepEqual(sweepClaimed(new Set(['a']), { dir: null }), []);
});

test('the folder is under the user temp dir, and absent off macOS', () => {
  assert.equal(
    cloneDir({ platform: 'darwin', userTempDir: '/var/folders/ab/xyz/T/' }),
    '/var/folders/ab/xyz/X/com.google.Chrome.code_sign_clone',
  );
  assert.equal(cloneDir({ platform: 'linux' }), null);
});

test('the mirrored copies agree', () => {
  const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  for (const f of ['chrome-clones.mjs', 'browser.mjs'])
    assert.equal(read(`base-app/scripts/${f}`), read(`packages/ui/scripts/${f}`), f);
});

test('localBrowser.launch: a launch that throws sweeps the clones it left, then rethrows its own error', async () => {
  const { localBrowser } = await import('../base-app/scripts/browser.mjs');
  const { chromium } = await import('playwright-core');
  const executablePath = '/nonexistent/chrome-for-test';
  const expected = await chromium.launch({ headless: true, executablePath }).then(
    () => assert.fail('the launch should have failed'),
    (err) => err,
  );
  const removed = [];
  let listing = ['old'];
  const guardOptions = {
    dir: DIR,
    // the failed launch "leaves" a clone that our fake process tree owns
    list: () => {
      const seen = listing;
      listing = ['old', 'half-started'];
      return seen;
    },
    who: () => ({ state: 'held', pids: [102] }),
    ours,
    inUse: () => false,
    remove: (path) => removed.push(path.slice(DIR.length + 1)),
  };
  const err = await localBrowser.launch({ executablePath, guardOptions }).then(
    () => assert.fail('the launch should have failed'),
    (e) => e,
  );
  assert.equal(err.message, expected.message);
  assert.deepEqual(removed, ['half-started']);
});

test('the guard sweeps for a launch that never produced a browser', async () => {
  const removed = [];
  let listing = ['old'];
  const options = {
    dir: DIR,
    list: () => listing,
    who: () => ({ state: 'held', pids: [102] }),
    ours,
    inUse: () => false,
    remove: (path) => removed.push(path.slice(DIR.length + 1)),
  };
  const guard = guardClones(options);
  listing = ['old', 'half-started'];
  await guard.around(async () => undefined);
  assert.deepEqual(removed, ['half-started']);
});
