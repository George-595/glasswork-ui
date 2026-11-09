// check-pages — pages are made of kit components and nothing else (ENGINEERING §13).
//
//   node scripts/check-pages.mjs [--strict] [--all] [root]
//
// Looks at base-app/src (in this repo: base-app/src; in an exported app: src):
//   css-file       any .css file under src/ at all
//   css-import     `import './x.css'` (a relative stylesheet import) anywhere under src/
//   inline-style   a `style=` prop in src/pages/** or src/app/**
//   arbitrary      an arbitrary Tailwind value (`w-[320px]`, `[--x:…]`) in a className there
//   classname      a className token on a kit component that is not on the allowlist
//   raw-element    a className token on a raw <div>/<span>/… that is not on the allowlist
//
// className is allowed to carry ONLY these utilities (with an optional responsive prefix
// sm: md: lg: xl: 2xl:): `sr-only`, `col-span-*`, `row-span-*`. Anything else means the kit is
// missing a component or a prop: add it there, with its test and axe pass, instead of styling
// around it in the page (ENGINEERING §13). Do not grow ALLOWED to make a page pass.
//
// Default mode prints the report and exits 0. `--strict` exits 1 on any finding;
// `npm run check:pages` (and so `npm run check`) runs strict.
//
// Mirrored byte for byte in base-app/scripts/ (so an exported app keeps it); the oxlint mirror
// check fails when the copies differ. Edit both.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { lexJs } from './check-colours.mjs';

export const ALLOWED = [/^sr-only$/, /^not-sr-only$/, /^(?:col|row)-span-(?:\d+|full)$/];
const RESPONSIVE = /^(?:(?:sm|md|lg|xl|2xl):)+/;

export const tokenAllowed = (token) => ALLOWED.some((re) => re.test(token.replace(RESPONSIVE, '')));

const RULE = {
  'css-file': '§13: no .css under base-app/src; the kit owns CSS',
  'css-import': '§13: no stylesheet imports in the app',
  'inline-style': '§13: no inline style in a page; a kit prop or component is missing',
  arbitrary: '§13: no arbitrary Tailwind values in a page; a kit prop is missing',
  classname: '§13: kit components take layout props, not classes; add the prop to the kit',
  'raw-element': '§13: use Stack/Cluster/Grid/Card/Text… instead of a styled <div>/<span>',
};

/** Skeleton: code with the contents of strings blanked, so braces inside strings do not count. */
const skeleton = (code, strings) => {
  let out = '';
  for (let i = 0; i < code.length; i++)
    out += strings[i] !== ' ' && code[i] !== '\n' ? ' ' : code[i];
  return out;
};

/** @returns {{line:number, cat:string, text:string}[]} findings for one page/app source file */
export function scanPage(text) {
  const { code, strings } = lexJs(text);
  const skel = skeleton(code, strings);
  const out = [];
  const lineAt = (idx) => text.slice(0, idx).split('\n').length;

  for (const m of skel.matchAll(/(?<![\w.$-])style\s*=\s*[{"']/g)) {
    out.push({ line: lineAt(m.index), cat: 'inline-style', text: 'style=' });
  }

  for (const m of code.matchAll(/\bclassName\s*=\s*/g)) {
    const start = m.index + m[0].length;
    let end = start;
    if (code[start] === '"' || code[start] === "'") {
      end = code.indexOf(code[start], start + 1) + 1;
    } else if (code[start] === '{') {
      let depth = 0;
      for (end = start; end < skel.length; end++) {
        if (skel[end] === '{') depth++;
        else if (skel[end] === '}' && --depth === 0) {
          end++;
          break;
        }
      }
    } else continue;
    // the literals inside the prop: everything the lexer kept as string text (or the quoted value)
    let literal = strings.slice(start, end);
    if (code[start] === '"' || code[start] === "'") literal = text.slice(start + 1, end - 1);
    const open = skel.lastIndexOf('<', m.index);
    const tag = (/^<\s*([A-Za-z][\w.]*)/.exec(skel.slice(open)) ?? [])[1] ?? '';
    const raw = /^[a-z]/.test(tag);
    for (const token of literal.split(/\s+/).filter(Boolean)) {
      if (token.includes('[')) out.push({ line: lineAt(m.index), cat: 'arbitrary', text: token });
      else if (!tokenAllowed(token))
        out.push({ line: lineAt(m.index), cat: raw ? 'raw-element' : 'classname', text: token });
    }
  }
  return out;
}

const SKIP = new Set(['node_modules', 'dist', 'coverage']);
function* files(dir, root = dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP.has(e.name)) yield* files(p, root);
    } else yield relative(root, p).split(sep).join('/');
  }
}

export function run(root) {
  const src = existsSync(join(root, 'base-app/src'))
    ? join(root, 'base-app/src')
    : join(root, 'src');
  const prefix = relative(root, src).split(sep).join('/');
  const found = [];
  let scanned = 0;
  if (!existsSync(src)) return { scanned, found, src };
  for (const rel of files(src)) {
    const file = `${prefix}/${rel}`;
    if (rel.endsWith('.css')) found.push({ file, line: 1, cat: 'css-file', text: rel });
    if (!/\.(tsx?|jsx?|mjs)$/.test(rel) || /\.test\.|\.d\.ts$/.test(rel)) continue;
    const text = readFileSync(join(src, rel), 'utf8');
    for (const m of text.matchAll(
      /^\s*import\s+(?:[^'"\n]*from\s+)?['"](\.{1,2}\/[^'"]+\.css)['"]/gm,
    )) {
      found.push({
        file,
        line: text.slice(0, m.index).split('\n').length,
        cat: 'css-import',
        text: m[1],
      });
    }
    if (!/^(pages|app)\//.test(rel)) continue;
    scanned++;
    for (const f of scanPage(text)) found.push({ ...f, file });
  }
  return { scanned, found, src };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const rootArg = args.find((a) => !a.startsWith('--'));
  const root = rootArg ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const r = run(root);
  const byCat = {};
  const byFile = {};
  for (const f of r.found) {
    byCat[f.cat] = (byCat[f.cat] ?? 0) + 1;
    byFile[f.file] = (byFile[f.file] ?? 0) + 1;
  }
  const show = args.includes('--all') ? r.found : strict ? r.found.slice(0, 60) : [];
  for (const f of show) console.error(`${f.file}:${f.line}  ${f.cat} ${JSON.stringify(f.text)}`);
  if (r.found.length > show.length && strict) console.error(`… more (--all lists them)`);
  console.log(`pages: ${r.scanned} page/app files scanned, ${r.found.length} findings`);
  for (const [cat, n] of Object.entries(byCat))
    console.log(`  ${cat.padEnd(13)} ${String(n).padStart(4)}  ${RULE[cat]}`);
  const worst = Object.entries(byFile)
    .toSorted((a, b) => b[1] - a[1])
    .slice(0, 12);
  if (worst.length)
    console.log(
      `  worst files: ${worst.map(([f, n]) => `${f.replace('base-app/', '')} ${n}`).join(', ')}`,
    );
  if (r.found.length && strict) {
    console.error('pages: FAILED (--strict). See ENGINEERING §13.');
    process.exit(1);
  }
  if (r.found.length) console.log('  (report only; --strict fails on these)');
}
