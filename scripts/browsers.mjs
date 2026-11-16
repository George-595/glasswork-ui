#!/usr/bin/env node
/* browsers: install playwright-core's chromium-headless-shell, the browser the repo's browser checks drive.

     npm run browsers

   Idempotent (a second run finds it installed and returns). A download from playwright's CDN of the binary pinned by
   the pinned playwright-core; no new package. It never fails: offline, or behind a proxy, it warns and exits 0, and
   the checks then fall back to the installed Google Chrome. The headless shell is not a signed .app, so it leaves no
   `code_sign_clone` folder behind on macOS the way Chrome does when a script closes it. */
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
try {
  const pkgPath = require.resolve('playwright-core/package.json');
  const pkg = require(pkgPath);
  const bin = join(
    pkgPath,
    '..',
    typeof pkg.bin === 'string' ? pkg.bin : pkg.bin['playwright-core'],
  );
  const run = spawnSync(process.execPath, [bin, 'install', 'chromium-headless-shell'], {
    stdio: 'inherit',
    // offline, give up after the connection timeout (playwright's own setting, 30 s here) rather than hang
    env: { PLAYWRIGHT_DOWNLOAD_CONNECTION_TIMEOUT: '30000', ...process.env },
    timeout: 3 * 60_000,
  });
  if (run.status !== 0) throw new Error(`install exited ${run.status ?? run.signal}`);
} catch (err) {
  console.warn(
    `browsers: could not install chromium-headless-shell (${err.message}); the checks will use Google Chrome.`,
  );
}
