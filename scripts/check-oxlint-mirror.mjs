// check-oxlint-mirror — the general oxlint rules live in two files: apps/.oxlintrc.json
// (for @apps/ui) and base-app/.oxlintrc.json (the app carries its own so it can be
// exported). Both mark the block MIRRORED; this fails when the copies differ.
//
// It also checks that scripts/check-colours.mjs, check-pages.mjs and check-craft.mjs equal their copies in
// base-app/scripts/.
//
//   node scripts/check-oxlint-mirror.mjs
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const apps = join(dirname(fileURLToPath(import.meta.url)), '..');
const files = ['.oxlintrc.json', 'base-app/.oxlintrc.json'];
// .oxlintrc.json allows // comments; none of ours sit inside a string
const read = (f) => JSON.parse(readFileSync(join(apps, f), 'utf8').replace(/^\s*\/\/.*$/gm, ''));
const shared = (f) => {
  const c = read(f);
  const scripts = c.overrides?.find((o) => o.files?.join() === '**/scripts/**');
  if (!c.plugins || !c.categories || !c.rules || !scripts) {
    console.error(`oxlint mirror FAILED: ${f} is missing part of the MIRRORED block.`);
    process.exit(1);
  }
  return JSON.stringify({ plugins: c.plugins, categories: c.categories, rules: c.rules, scripts });
};
const [a, b] = files.map(shared);
if (a !== b) {
  console.error(
    `oxlint mirror FAILED: the MIRRORED block (plugins, categories, rules, **/scripts/** override) differs between ${files.join(' and ')}. Make the same edit in both.`,
  );
  process.exit(1);
}
// the colour/page checkers are copied into the app so an exported copy keeps them
for (const f of ['check-colours.mjs', 'check-pages.mjs', 'check-craft.mjs']) {
  if (
    readFileSync(join(apps, 'scripts', f), 'utf8') !==
    readFileSync(join(apps, 'base-app/scripts', f), 'utf8')
  ) {
    console.error(
      `mirror FAILED: scripts/${f} and base-app/scripts/${f} differ. Copy one over the other.`,
    );
    process.exit(1);
  }
}
console.log(`oxlint mirror OK: ${files.join(' and ')} share the general rules.`);
