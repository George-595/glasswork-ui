// kit-sync + kit-check: a copy syncs, proves itself, and catches every kind of drift.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const SYNC = new URL('./kit-sync.mjs', import.meta.url).pathname;
const check = (dir) =>
  spawnSync(process.execPath, [join(dir, 'kit-check.mjs')], { encoding: 'utf8' });

test('sync, check, and every kind of drift', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kit-sync-'));
  try {
    const cfg = join(dir, 'glasswork.json');
    writeFileSync(
      cfg,
      JSON.stringify({
        targets: { ui: 'ui', colors: 'colors' },
        profile: 'runtime',
        local: ['ui/src/mine.ts'],
      }),
    );
    writeFileSync(join(dir, 'stale.txt'), '');
    execFileSync(process.execPath, [SYNC, cfg, '--allow-dirty'], { encoding: 'utf8' });
    const written = JSON.parse(readFileSync(cfg, 'utf8'));
    assert.match(written.commit, /^[0-9a-f]{40}/);
    assert.ok(written.files['ui/src/index.ts']);
    assert.ok(written.files['colors/package.json']);
    // runtime profile: no tests or scripts
    assert.ok(!Object.keys(written.files).some((f) => f.startsWith('ui/tests/')));
    assert.ok(existsSync(join(dir, 'LICENSE.md')));
    // only what glasswork-ui tracks travels (never build output such as .a11y)
    assert.ok(!Object.keys(written.files).some((f) => f.includes('/.a11y/')));
    assert.equal(check(dir).status, 0);

    // the app's own file is allowed
    writeFileSync(join(dir, 'ui/src/mine.ts'), 'export const x = 1;\n');
    assert.equal(check(dir).status, 0);

    // an edit, an extra file and a missing file all fail
    appendFileSync(join(dir, 'ui/src/index.ts'), '\n// local hack\n');
    writeFileSync(join(dir, 'ui/src/extra.ts'), '');
    rmSync(join(dir, 'colors/package.json'));
    const r = check(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /edited +ui\/src\/index\.ts/);
    assert.match(r.stderr, /extra +ui\/src\/extra\.ts/);
    assert.match(r.stderr, /missing +colors\/package\.json/);

    // syncing again repairs it, removes the extra, keeps the app's own file
    execFileSync(process.execPath, [SYNC, cfg, '--allow-dirty'], { encoding: 'utf8' });
    assert.equal(check(dir).status, 0);
    assert.ok(!existsSync(join(dir, 'ui/src/extra.ts')));
    assert.ok(existsSync(join(dir, 'ui/src/mine.ts')));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
