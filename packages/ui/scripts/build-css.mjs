// build-css — compile src/styles/index.css with Tailwind v4, the way an app's
// @tailwindcss/vite plugin does, for checks that load the CSS without Vite
// (the a11y gate). Tailwind scans the package's own sources for class names.
//
//   node scripts/build-css.mjs <out.css>
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(pkg, 'src/styles/index.css');
const out = resolve(process.argv[2] ?? join(pkg, '.a11y/styles.css'));

const compiler = await compile(readFileSync(entry, 'utf8'), {
  base: dirname(entry),
  onDependency: () => {},
});
const sources =
  compiler.root === 'none'
    ? compiler.sources
    : [{ base: pkg, pattern: '**/*', negated: false }, ...compiler.sources];
const candidates = new Scanner({ sources }).scan();
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, compiler.build(candidates));
console.log(`build-css: ${candidates.length} candidates → ${out}`);
