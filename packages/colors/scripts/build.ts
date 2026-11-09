// Writes css/colors.css, css/theme.css, css/favicon.svg from the
// role table. `--check` writes nothing and exits 1 if a committed file is out of date.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { colorsCss, themeCss } from '../src/css.ts';
import { faviconSvg } from '../src/favicon.ts';
import { runGate } from '../src/gate.ts';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'css');
const files: Record<string, string> = {
  'colors.css': colorsCss(),
  'theme.css': themeCss(),
  'favicon.svg': faviconSvg(),
};

const failures = runGate();
if (failures.length > 0) {
  console.error(`Contrast gate FAILED (${failures.length}):`);
  for (const f of failures)
    console.error(`  ${f.theme}  ${f.pair}  ${f.ratio.toFixed(2)} < ${f.need}`);
  process.exit(1);
}

const check = process.argv.includes('--check');
let stale = 0;
for (const [name, body] of Object.entries(files)) {
  const path = join(out, name);
  if (check) {
    let now = '';
    try {
      now = readFileSync(path, 'utf8');
    } catch {}
    if (now !== body) {
      console.error(`css/${name} is out of date: run npm run build --workspace @apps/colors`);
      stale += 1;
    }
  } else {
    writeFileSync(path, body);
  }
}
if (stale > 0) process.exit(1);
console.log(
  check
    ? 'Colours: generated CSS is current; contrast gate passed.'
    : 'Colours: wrote css/; contrast gate passed.',
);
