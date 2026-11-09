#!/usr/bin/env node
/* check:budget — the first-load JavaScript budget.

   Reads dist/client/.vite/manifest.json (written by `vite build`) and adds up the gzip size of every
   script a browser fetches before the page can run, for each scenario:

     sign-in  index.html and everything it imports statically: all a signed-out visitor needs
     home     the above plus the signed-in app (src/app/SignedIn.tsx: the shell, its menus, the
              live connections) and the Home route's file, and the chunks they import statically

   Lazy chunks do not count: the Ask panel, the other pages, the WebGL scene and Home's figures
   (src/pages/home/HomeSections.tsx: the charts), which the browser fetches while it hydrates
   the rest of the page instead of before it. The gzip size is measured with node:zlib at level 9,
   the figure the server's precompressed .gz files have. Run it after `npm run build`; `verify`
   does.

   Raising a budget is a decision, not a fix: say why in the commit. Usage:
     node scripts/check-budget.ts            # check against BUDGETS
     node scripts/check-budget.ts --json     # print the sizes as JSON (no check)
     node scripts/check-budget.ts --dist DIR # another build directory */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

export type Scenario = 'sign-in' | 'home';
export interface ManifestChunk {
  file: string;
  imports?: string[];
}
export type Manifest = Record<string, ManifestChunk>;

/* Gzip bytes of first-load JS. Set a little above what the build measures, so a real regression
   fails and noise does not. */
export const BUDGETS: Readonly<Record<Scenario, number>> = {
  'sign-in': 135_000,
  home: 207_000,
};

/* The manifest key of the route file each non-entry scenario adds. */
const ROUTE_ENTRIES: Partial<Record<Scenario, readonly string[]>> = {
  home: ['src/app/SignedIn.tsx', 'src/pages/home/index.ts'],
};

/* The files of one scenario: the entry's static imports, then the extra entry's. Pure, so the
   test can feed it a hand-made manifest. */
export function firstLoadFiles(manifest: Manifest, roots: readonly string[]): string[] {
  const seen = new Set<string>();
  const files = new Set<string>();
  const visit = (key: string): void => {
    if (seen.has(key)) return;
    seen.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`The manifest has no entry "${key}". Did the build change?`);
    if (chunk.file.endsWith('.js')) files.add(chunk.file);
    for (const dep of chunk.imports ?? []) visit(dep);
  };
  for (const root of roots) visit(root);
  return [...files];
}

export function gzipBytes(buffer: Buffer): number {
  return gzipSync(buffer, { level: 9 }).length;
}

export function measure(
  dist: string,
  manifest: Manifest,
): Record<Scenario, { bytes: number; files: number }> {
  const sizes = {} as Record<Scenario, { bytes: number; files: number }>;
  for (const name of Object.keys(BUDGETS) as Scenario[]) {
    const extra = ROUTE_ENTRIES[name];
    const roots = ['index.html', ...(extra ?? [])];
    const files = firstLoadFiles(manifest, roots);
    const bytes = files.reduce((sum, file) => sum + gzipBytes(readFileSync(join(dist, file))), 0);
    sizes[name] = { bytes, files: files.length };
  }
  return sizes;
}

function main(): void {
  const args = process.argv.slice(2);
  const here = dirname(fileURLToPath(import.meta.url));
  const flagAt = args.indexOf('--dist');
  const dist = resolve(flagAt >= 0 ? (args[flagAt + 1] ?? '') : join(here, '..', 'dist', 'client'));
  const manifestPath = join(dist, '.vite', 'manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`check:budget: ${manifestPath} not found. Run \`npm run build\` first.`);
    process.exit(1);
  }
  const sizes = measure(dist, JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest);
  if (args.includes('--json')) {
    console.log(JSON.stringify(sizes, null, 2));
    return;
  }
  let failed = false;
  for (const [name, { bytes, files }] of Object.entries(sizes) as [
    Scenario,
    { bytes: number; files: number },
  ][]) {
    const budget = BUDGETS[name];
    const ok = bytes <= budget;
    failed ||= !ok;
    const kb = (n: number) => `${(n / 1000).toFixed(1)} kB`;
    console.log(
      `${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(8)} ${kb(bytes)} gzip in ${files} scripts (budget ${kb(budget)})`,
    );
  }
  if (failed) {
    console.error('check:budget: first-load JavaScript is over budget.');
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
