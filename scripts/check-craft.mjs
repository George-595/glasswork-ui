// check-craft — motion and wording habits that make an interface feel generated or janky
// (ENGINEERING §14, rule 137). Adapted from the lint in Leonxlnx/taste-skill (MIT, © 2026 Leonxlnx);
// only the rules that agree with the kit's own design are kept.
//
//   node scripts/check-craft.mjs [--strict] [root]
//
// Looks at packages/*/src and base-app/src (in an exported app: src), tests excluded:
//   transition-all  `transition: all` / `transition-all`: name the properties (transform, opacity)
//   ease-in         ease-in on UI motion feels sluggish; enters and exits use a strong ease-out
//   scale-zero      entering from scale(0); start at 0.95–0.98 with opacity 0
//   vh              100vh / h-screen / min-h-screen jump when a phone's toolbar moves; use dvh/svh
//   stock-copy      stock marketing phrases ("unlock", "seamless", "elevate"…) in strings or JSX text
//   vague-label     a button or link that says "Learn more", "Get started", "Submit"…; name the action
//
// A deliberate exception carries `craft-ok: <reason>` in a comment on the same or the line above
// (a check mark growing from its centre is fine at scale 0; a dialog entering is not).
// Default mode prints the report and exits 0. `--strict` exits 1 on any finding;
// `npm run check:craft` (and so `npm run check`) runs strict.
//
// Mirrored byte for byte in base-app/scripts/ (so an exported app keeps it); the oxlint mirror
// check fails when the copies differ. Edit both.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lexJs } from './check-colours.mjs';

const RULE = {
  'transition-all': 'name the properties you animate (transform, opacity), never all',
  'ease-in': 'ease-in feels sluggish on UI; use the kit ease-out tokens',
  'scale-zero': 'enter from scale 0.95–0.98 with opacity 0, not from nothing',
  vh: '100vh jumps on phones; use dvh or svh (h-dvh, min-h-dvh)',
  'stock-copy': 'stock marketing phrase; say the specific thing it does',
  'vague-label': 'vague label; name the action or the thing ("Save changes", "Invite user")',
};

// motion and layout: tested on code with comments removed (strings kept: class names live there)
const MOTION = [
  ['transition-all', /transition\s*:\s*all\b|(?<![\w-])transition-all\b/],
  ['ease-in', /(?<![\w-])ease-in(?![\w-])/],
  ['scale-zero', /scale\(\s*0\s*\)|(?<![\w-])scale-0(?![\w.-])/],
  ['vh', /\b100vh\b|(?<![\w-])(?:min-|max-)?h-screen\b/],
];

// wording: tested on string literals and JSX text only, never identifiers or comments
const STOCK =
  /\b(unlock(?:s|ed)?|unleash|supercharge|seamless(?:ly)?|elevate[sd]?|empower(?:s|ing)?|revolutioni[sz]e|game[- ]chang(?:er|ing)|cutting[- ]edge|next[- ]gen(?:eration)?|world[- ]class|best[- ]in[- ]class|all[- ]in[- ]one|effortless(?:ly)?|blazing(?:ly)?[- ]fast|lightning[- ]fast|reimagin(?:e|ed|ing)|turbocharge|take your .{1,30} to the next level|say goodbye to|in today'?s (?:fast|digital|world)|built for the modern)\b/i;
// a label starts with a capital, so `type="submit"` is not one
const VAGUE =
  /^\s*(Learn more|Get started|Click here|Read more|Discover more|Explore now|Submit)\s*$/i;
const LABEL = /^\s*[A-Z]/;

/** @returns {{line:number, cat:string, text:string}[]} findings for one source file */
export function scanSource(text, kind = 'js') {
  const out = [];
  const lines = text.split('\n');
  const ok = (n) =>
    /craft-ok\s*:/.test(lines[n - 1] ?? '') || /craft-ok\s*:/.test(lines[n - 2] ?? '');
  const push = (line, cat, t) => {
    if (!ok(line)) out.push({ line, cat, text: t.trim().slice(0, 60) });
  };

  if (kind === 'css') {
    const code = text.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, ' '));
    code.split('\n').forEach((l, i) => {
      for (const [cat, re] of MOTION) {
        const m = re.exec(l);
        if (m) push(i + 1, cat, m[0]);
      }
    });
    return out;
  }

  const lex = lexJs(text);
  const code = Array.isArray(lex.code) ? lex.code.join('') : lex.code;
  const strings = Array.isArray(lex.strings) ? lex.strings.join('') : lex.strings;
  code.split('\n').forEach((l, i) => {
    for (const [cat, re] of MOTION) {
      const m = re.exec(l);
      if (m) push(i + 1, cat, m[0]);
    }
  });

  // string literal runs, plus JSX text between > and < (outside braces)
  const runs = [];
  for (const m of strings.matchAll(/[^\s][^\n]*[^\s]|[^\s]/g)) runs.push([m.index, m[0]]);
  if (kind === 'jsx')
    for (const m of code.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g))
      runs.push([m.index + 1, m[1]]);
  const lineAt = (idx) => text.slice(0, idx).split('\n').length;
  for (const [idx, run] of runs) {
    const s = STOCK.exec(run);
    if (s) push(lineAt(idx), 'stock-copy', s[0]);
    if (VAGUE.test(run) && LABEL.test(run)) push(lineAt(idx), 'vague-label', run);
  }
  return out;
}

const SKIP = new Set(['node_modules', 'dist', 'coverage', '.a11y', 'tests', '__tests__']);
function* files(dir, root = dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) yield* files(p, root);
    } else yield relative(root, p).split(sep).join('/');
  }
}

export function run(root) {
  const dirs = existsSync(join(root, 'base-app/src'))
    ? [
        join(root, 'base-app/src'),
        ...(existsSync(join(root, 'packages'))
          ? readdirSync(join(root, 'packages')).map((p) => join(root, 'packages', p, 'src'))
          : []),
      ]
    : [join(root, 'src')];
  const found = [];
  let scanned = 0;
  for (const src of dirs.filter((d) => existsSync(d))) {
    const prefix = relative(root, src).split(sep).join('/');
    for (const rel of files(src)) {
      if (/\.test\.|\.d\.ts$/.test(rel)) continue;
      const kind = rel.endsWith('.css')
        ? 'css'
        : /\.(tsx|jsx)$/.test(rel)
          ? 'jsx'
          : /\.(ts|js|mjs)$/.test(rel)
            ? 'js'
            : null;
      if (!kind) continue;
      scanned++;
      const text = readFileSync(join(src, rel), 'utf8');
      for (const f of scanSource(text, kind)) found.push({ ...f, file: `${prefix}/${rel}` });
    }
  }
  return { scanned, found };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const rootArg = args.find((a) => !a.startsWith('--'));
  const root = rootArg ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const r = run(root);
  const byCat = {};
  for (const f of r.found) byCat[f.cat] = (byCat[f.cat] ?? 0) + 1;
  for (const f of r.found) console.error(`${f.file}:${f.line}  ${f.cat} ${JSON.stringify(f.text)}`);
  console.log(`craft: ${r.scanned} files scanned, ${r.found.length} findings`);
  for (const [cat, n] of Object.entries(byCat))
    console.log(`  ${cat.padEnd(14)} ${String(n).padStart(4)}  ${RULE[cat]}`);
  if (r.found.length && strict) {
    console.error(
      'craft: FAILED (--strict). See ENGINEERING §14; `craft-ok: <reason>` marks a deliberate exception.',
    );
    process.exit(1);
  }
  if (r.found.length) console.log('  (report only; --strict fails on these)');
}

/*
The rule patterns above are adapted from Leonxlnx/taste-skill's scripts/lint.mjs:

MIT License

Copyright (c) 2026 Leonxlnx

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
*/
