import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { BUDGETS, firstLoadFiles, gzipBytes, type Manifest, measure } from './check-budget.ts';

/* A hand-made manifest, the shape vite writes: the entry, a shared chunk both import, a vendor
   chunk, a lazy chunk that only a dynamic import reaches, the signed-in app and the Home route. */
const MANIFEST: Manifest = {
  'index.html': { file: 'assets/index.js', imports: ['_vendor.js', '_shared.js'] },
  '_vendor.js': { file: 'assets/vendor.js' },
  '_shared.js': { file: 'assets/shared.js', imports: ['_vendor.js'] },
  '_charts.js': { file: 'assets/charts.js', imports: ['_shared.js'] },
  'src/app/SignedIn.tsx': { file: 'assets/signed-in.js', imports: ['_shared.js'] },
  'src/pages/home/index.ts': { file: 'assets/home.js', imports: ['_shared.js', '_charts.js'] },
  'src/app/AskPanel.tsx': { file: 'assets/ask.js', imports: ['_charts.js'] },
  'style.css': { file: 'assets/style.css' },
};

describe('firstLoadFiles', () => {
  it('follows static imports once, however many chunks share them', () => {
    expect(firstLoadFiles(MANIFEST, ['index.html']).sort()).toEqual([
      'assets/index.js',
      'assets/shared.js',
      'assets/vendor.js',
    ]);
  });

  it('adds a route’s own file and what only it imports', () => {
    expect(firstLoadFiles(MANIFEST, ['index.html', 'src/pages/home/index.ts']).sort()).toEqual([
      'assets/charts.js',
      'assets/home.js',
      'assets/index.js',
      'assets/shared.js',
      'assets/vendor.js',
    ]);
  });

  it('leaves out a lazy chunk nothing static reaches', () => {
    expect(firstLoadFiles(MANIFEST, ['index.html'])).not.toContain('assets/ask.js');
  });

  it('counts scripts only, not stylesheets', () => {
    expect(firstLoadFiles(MANIFEST, ['style.css'])).toEqual([]);
  });

  it('fails loudly when a root is not in the manifest', () => {
    expect(() => firstLoadFiles(MANIFEST, ['src/pages/gone/index.ts'])).toThrow(/gone/);
  });
});

describe('measure', () => {
  let dist: string;
  beforeEach(async () => {
    dist = await mkdtemp(join(tmpdir(), 'budget-'));
    await mkdir(join(dist, 'assets'));
  });
  afterEach(async () => {
    await rm(dist, { recursive: true, force: true });
  });

  it('adds the gzip size of each first-load script, per scenario', async () => {
    const files: Record<string, string> = {
      'assets/index.js': 'index '.repeat(500),
      'assets/vendor.js': 'vendor '.repeat(500),
      'assets/shared.js': 'shared '.repeat(500),
      'assets/charts.js': 'charts '.repeat(500),
      'assets/home.js': 'home '.repeat(500),
      'assets/signed-in.js': 'signed-in '.repeat(500),
    };
    for (const [name, text] of Object.entries(files)) await writeFile(join(dist, name), text);
    const size = (name: string) => gzipBytes(Buffer.from(files[name] ?? ''));
    const sizes = measure(dist, MANIFEST);
    expect(sizes['sign-in']).toEqual({
      bytes: size('assets/index.js') + size('assets/vendor.js') + size('assets/shared.js'),
      files: 3,
    });
    // Home is the sign-in page's files plus the signed-in app and the Home route's own
    expect(sizes.home.files).toBe(6);
    expect(sizes.home.bytes).toBe(
      sizes['sign-in'].bytes +
        size('assets/signed-in.js') +
        size('assets/charts.js') +
        size('assets/home.js'),
    );
  });
});

describe('the command', () => {
  let dist: string;
  beforeEach(async () => {
    dist = await mkdtemp(join(tmpdir(), 'budget-cli-'));
    await mkdir(join(dist, 'assets'));
    await mkdir(join(dist, '.vite'));
  });
  afterEach(async () => {
    await rm(dist, { recursive: true, force: true });
  });

  const run = (...args: string[]) =>
    spawnSync(process.execPath, [new URL('./check-budget.ts', import.meta.url).pathname, ...args], {
      encoding: 'utf8',
    });

  async function build(bytes: number) {
    for (const name of ['index', 'vendor', 'shared', 'charts', 'home', 'signed-in']) {
      await writeFile(
        join(dist, 'assets', `${name}.js`),
        name === 'index' ? randomBytes(bytes) : '//',
      );
    }
    await writeFile(join(dist, '.vite', 'manifest.json'), JSON.stringify(MANIFEST));
  }

  it('passes a build inside the budget', async () => {
    await build(1000);
    const out = run('--dist', dist);
    expect(out.status).toBe(0);
    expect(out.stdout).toContain('ok   sign-in');
  });

  it('fails a build over the budget and says which scenario', async () => {
    await build(BUDGETS['sign-in'] + 5000);
    const out = run('--dist', dist);
    expect(out.status).toBe(1);
    expect(out.stdout).toContain('FAIL sign-in');
    expect(out.stderr).toContain('over budget');
  });

  it('prints the sizes as JSON on request, without checking', async () => {
    await build(BUDGETS['sign-in'] + 5000);
    const out = run('--dist', dist, '--json');
    expect(out.status).toBe(0);
    expect(JSON.parse(out.stdout)['sign-in'].files).toBe(3);
  });

  it('asks for a build when there is no manifest', () => {
    const out = run('--dist', join(dist, 'nowhere'));
    expect(out.status).toBe(1);
    expect(out.stderr).toContain('npm run build');
  });
});

describe('BUDGETS', () => {
  it('has a budget for every scenario, and Home may not be smaller than sign-in', () => {
    expect(Object.keys(BUDGETS).sort()).toEqual(['home', 'sign-in']);
    expect(BUDGETS.home).toBeGreaterThanOrEqual(BUDGETS['sign-in']);
  });
});
