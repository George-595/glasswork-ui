// check-colours — fails when a colour is written anywhere except @apps/colors.
//
//   node scripts/check-colours.mjs [--no-legacy] [--all] [--limit N] [root]
//
// The rule (ENGINEERING §5, §14 rule 1): every colour in apps/ is a role from @apps/colors,
// used through its Tailwind utility (`bg-surface`, `text-fg-muted`) or `cssVar('role')`.
// This scans every .css .ts .tsx .js .jsx .mjs .svg .html file (comments ignored) under the
// folder above this script: the repo root, or the app's own folder in an exported copy. It
// fails on:
//   hex            #rgb #rrggbb #rrggbbaa in a CSS value or a string literal / JSX attribute
//   colour-fn      rgb( rgba( hsl( hsla( hwb( lab( lch( oklab( oklch( color( color-mix(
//   named          a CSS named colour (white, red, rebeccapurple…) used as a colour value;
//                  transparent, currentColor, inherit, initial, unset and none are allowed
//   tw-palette     Tailwind stock palette utilities (bg-red-500, text-white, border-black/10…)
//   arbitrary      a bracket that holds a role's var(--role) (bg-[var(--surface)], [--x:var(--fg)])
// and, with --no-legacy (which `npm run check:colours` always passes):
//   legacy         the old colour names (--ink, text-ink, border-edge, bg-elevated, --accent,
//                  text-muted-foreground, --glass-tint-*, --glass-chip, --btn-fill…)
// Without the flag the legacy count is printed as information only.
//
// Skipped: packages/colors and vendor/colors (the one place colours live), portfolio/,
// node_modules, dist, coverage. Anything else that must hold a colour goes in ALLOW below
// with a reason; the aim is zero entries beyond this checker's own patterns.
//
// This file is mirrored byte for byte in base-app/scripts/ (so an exported app keeps it);
// scripts/check-oxlint-mirror.mjs fails when the copies differ. Edit both.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The checkers and their tests name colours on purpose.
export const ALLOW = [
  { path: /(^|\/)scripts\/check-(colours|pages)(\.test)?\.mjs$/, why: 'the checkers name colours' },
];

const EXTS = new Set(['.css', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.mts', '.svg', '.html']);
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.a11y', '.data', '.git']);
const SKIP_PATHS = [/^packages\/colors(\/|$)/, /^vendor\/colors(\/|$)/, /^portfolio(\/|$)/];

export const NAMED = new Set(
  `aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet
brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue
darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange
darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise
darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia
gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo
ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan
lightgoldenrodyellow lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue
lightslategray lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon
mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue
mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin
navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen
paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red
rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue
slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white
whitesmoke yellow yellowgreen`.split(/\s+/),
);

// The old names (the deleted migration map), kept here so they cannot come back. Variables are written --name; utilities are bg-name, text-name, …
const LEGACY_VAR_NAMES = [
  'bg',
  'bg-sunken',
  'elevated',
  'ink',
  'ink-2',
  'muted',
  'dim',
  'line',
  'line-strong',
  'control-border',
  'accent',
  'accent-strong',
  'accent-soft',
  'accent-wash',
  'on-accent',
  'danger-fill',
  'up-wash',
  'down-wash',
  'up-bright',
  'down-bright',
  'warn',
  's-indigo',
  's-cyan',
  's-purple',
  's-orange',
  's-amber',
  's-pink',
  'bar-surface',
  'inset-press',
  'glass-highlight',
  'glass-chip',
  'btn-fill',
];
const LEGACY_VAR_PREFIXES = ['glass-tint-'];
const LEGACY_UTIL_NAMES = [
  'background',
  'foreground',
  'card',
  'card-foreground',
  'popover',
  'popover-foreground',
  'primary-foreground',
  'muted',
  'muted-foreground',
  'accent',
  'accent-foreground',
  'destructive',
  'destructive-foreground',
  'input',
  'ring',
  'elevated',
  'ink',
  'ink-2',
  'line',
  'line-strong',
  'edge',
  'accent-brand',
  'accent-soft',
  'accent-strong',
  'accent-wash',
  'on-accent',
  'up-wash',
  'down-wash',
  'warn',
];

const PALETTE =
  'white|black|slate|gray|zinc|neutral(?=-\\d)|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const PREFIX =
  '(?:bg|text|border(?:-[trblxyse])?|ring(?:-offset)?|fill|stroke|from|via|to|outline|decoration|divide|shadow|placeholder|caret)';
const RE_PALETTE = new RegExp(
  `(?<![\\w.\\[-])${PREFIX}-(?:${PALETTE})(?:-\\d{2,3})?(?![\\w-])`,
  'g',
);
const RE_LEGACY_UTIL = new RegExp(
  `(?<![\\w.\\[-])${PREFIX}-(?:${LEGACY_UTIL_NAMES.join('|')})(?![\\w-])`,
  'g',
);
const RE_LEGACY_VAR = new RegExp(
  `--(?:${LEGACY_VAR_NAMES.join('|')}|(?:${LEGACY_VAR_PREFIXES.join('|')})[\\w-]*)(?![\\w-])`,
  'g',
);
const RE_LEGACY_CSSVAR = new RegExp(`cssVar\\(\\s*['"](?:${LEGACY_VAR_NAMES.join('|')})['"]`, 'g');
const RE_FN = /(?<![\w.-])(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color-mix|color|device-cmyk)\(/gi;
const RE_HEX = /(?<![\w&#/.-])#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})(?![\w-])/g;
const ANCHOR_BEFORE =
  /\b(?:href|id|for|htmlFor|name|to|from|hash|aria-[\w]+|data-[\w-]+|url\()\s*[=:(]?\s*['"(]?$/i;
const CSS_COLOUR_PROP =
  /^(--[\w-]+|color|[\w-]*-color|background[\w-]*|border[\w-]*|outline[\w-]*|box-shadow|text-shadow|fill|stroke|filter|text-decoration[\w-]*|column-rule[\w-]*|mask[\w-]*)$/;
const JS_COLOUR_KEY =
  /\b(fill|stroke|color|stopColor|floodColor|lightingColor|backgroundColor|borderColor|outlineColor|caretColor|accentColor|background|border|borderTop|borderBottom|borderLeft|borderRight|outline|boxShadow|textShadow|filter|textDecorationColor|stroke-color|stop-color|flood-color|bgcolor)\s*[=:]\s*\{?\s*(['"`])([^'"`\n]*)\2/g;

// ---- lexing -------------------------------------------------------------------------

const blank = (s) => s.replace(/[^\n]/g, ' ');

/** JS/TS/JSX: `code` is the text with comments blanked; `strings` keeps only the text inside
 * string and template literals (everything else blanked). Both keep every newline. */
export function lexJs(text) {
  const n = text.length;
  const code = text.split('');
  const strings = Array.from({ length: n }, () => ' ');
  for (let i = 0; i < n; i++) if (text[i] === '\n') strings[i] = '\n';
  const stack = [];
  let braces = 0;
  let i = 0;
  const blankRange = (a, b) => {
    for (let k = a; k < b; k++) if (code[k] !== '\n') code[k] = ' ';
  };
  const template = () => {
    while (i < n) {
      const c = text[i];
      if (c === '\\') {
        strings[i] = c;
        if (i + 1 < n && text[i + 1] !== '\n') strings[i + 1] = text[i + 1];
        i += 2;
      } else if (c === '`') {
        i++;
        return;
      } else if (c === '$' && text[i + 1] === '{') {
        stack.push(braces);
        braces++;
        i += 2;
        return;
      } else {
        if (c !== '\n') strings[i] = c;
        i++;
      }
    }
  };
  while (i < n) {
    const c = text[i];
    const d = text[i + 1];
    if (c === '/' && d === '/') {
      const s = i;
      while (i < n && text[i] !== '\n') i++;
      blankRange(s, i);
    } else if (c === '/' && d === '*') {
      const s = i;
      const e = text.indexOf('*/', i + 2);
      i = e < 0 ? n : e + 2;
      blankRange(s, i);
    } else if (c === "'" || c === '"') {
      i++;
      while (i < n && text[i] !== c && text[i] !== '\n') {
        if (text[i] === '\\' && i + 1 < n && text[i + 1] !== '\n') {
          strings[i] = text[i];
          strings[i + 1] = text[i + 1];
          i += 2;
        } else {
          strings[i] = text[i];
          i++;
        }
      }
      if (text[i] === c) i++;
    } else if (c === '`') {
      i++;
      template();
    } else {
      if (c === '{') braces++;
      else if (c === '}') {
        braces--;
        if (stack.length && stack[stack.length - 1] === braces) {
          stack.pop();
          i++;
          template();
          continue;
        }
      }
      i++;
    }
  }
  return { code: code.join(''), strings: strings.join('') };
}

/** CSS (and the text of html/svg): comments blanked. */
export function lexCss(text) {
  let out = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    if (c === '/' && text[i + 1] === '*') {
      const e = text.indexOf('*/', i + 2);
      const end = e < 0 ? n : e + 2;
      out += blank(text.slice(i, end));
      i = end;
    } else if (c === '<' && text.startsWith('<!--', i)) {
      const e = text.indexOf('-->', i + 4);
      const end = e < 0 ? n : e + 3;
      out += blank(text.slice(i, end));
      i = end;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      out += text.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

export const kindOf = (file) => {
  if (file.endsWith('.css')) return 'css';
  if (file.endsWith('.svg') || file.endsWith('.html')) return 'markup';
  return 'js';
};

// ---- scanning -----------------------------------------------------------------------

const RULE = {
  hex: 'ENGINEERING §5, §14 rule 1: write a role, not a hex',
  'colour-fn': 'ENGINEERING §5, §14 rule 1: no rgb()/hsl()/oklch()/color-mix(); use a role',
  named:
    'ENGINEERING §5, §14 rule 1: no named colours; use a role (transparent/currentColor are fine)',
  'tw-palette':
    'ENGINEERING §14 rule 14: no stock Tailwind palette; use a role utility (bg-surface, text-fg…)',
  arbitrary:
    'ENGINEERING §14 rule 14: a role has a utility (bg-surface), not a bracket with var(--role)',
  legacy: 'ENGINEERING §14 rule 15: old colour name; use the role (packages/colors/src/roles.ts)',
};

const each = (re, src, fn) => {
  re.lastIndex = 0;
  for (let m = re.exec(src); m; m = re.exec(src)) fn(m);
};

/** @returns {{line:number, cat:string, text:string, legacy:boolean, rule:string}[]} */
export function scanText(text, file, { roles = new Set() } = {}) {
  const kind = kindOf(file);
  const out = [];
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  const lineAt = (idx) => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= idx) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };
  const add = (idx, cat, hit) => {
    out.push({ line: lineAt(idx), cat, text: hit, legacy: cat === 'legacy', rule: RULE[cat] });
  };
  let code;
  let view; // where colour words can live: string contents (js) or the whole text
  if (kind === 'js') {
    const lx = lexJs(text);
    code = lx.code;
    view = lx.strings;
  } else {
    code = lexCss(text);
    view = code;
  }

  each(RE_HEX, view, (m) => {
    const before = code.slice(Math.max(0, m.index - 24), m.index);
    if (ANCHOR_BEFORE.test(before)) return;
    if (kind === 'css') {
      const cut = Math.max(
        code.lastIndexOf('{', m.index),
        code.lastIndexOf(';', m.index),
        code.lastIndexOf('}', m.index),
      );
      if (!code.slice(cut + 1, m.index).includes(':')) return;
      if (/^\s*\{/.test(code.slice(m.index + m[0].length))) return;
    }
    const prev = code[m.index - 1];
    const quoted = prev === '"' || prev === "'" || prev === '`';
    const hasLetter = /[a-fA-F]/.test(m[1]);
    const cue = /(?:solid|dashed|dotted|double|none|inset|\d(?:px|em|rem)|[(,:])\s*$/;
    if (!hasLetter && !quoted && !cue.test(before)) return;
    add(m.index, 'hex', m[0]);
  });

  each(RE_FN, view, (m) => add(m.index, 'colour-fn', `${m[1]}(`));

  const checkWords = (value, idx) => {
    for (const w of value.toLowerCase().split(/[^a-z-]+/)) {
      if (NAMED.has(w)) add(idx, 'named', w);
    }
  };
  if (kind === 'css' || kind === 'markup') {
    const scanDecls = (src, base) => {
      each(/([\w-]+)\s*:\s*([^;{}]+)/g, src, (m) => {
        if (!CSS_COLOUR_PROP.test(m[1])) return;
        const value = m[2].replace(/url\([^)]*\)|(['"]).*?\1/g, ' ');
        checkWords(value, base + m.index);
      });
    };
    if (kind === 'css') scanDecls(code, 0);
    else {
      each(/<style[^>]*>([\s\S]*?)<\/style>/gi, code, (m) =>
        scanDecls(m[1], m.index + m[0].indexOf(m[1])),
      );
      each(/\bstyle\s*=\s*"([^"]*)"/gi, code, (m) => scanDecls(m[1], m.index));
      each(
        /\b(fill|stroke|stop-color|flood-color|lighting-color|color|bgcolor)\s*=\s*"([^"]*)"/gi,
        code,
        (m) => checkWords(m[2], m.index),
      );
    }
  } else {
    each(JS_COLOUR_KEY, code, (m) => checkWords(m[3], m.index));
  }

  each(RE_PALETTE, view, (m) => add(m.index, 'tw-palette', m[0]));

  if (roles.size) {
    each(/\[[^\]\n]*var\(--([\w-]+)\)[^\]\n]*\]/g, view, (m) => {
      if (roles.has(m[1])) add(m.index, 'arbitrary', m[0]);
    });
  }

  each(RE_LEGACY_VAR, view, (m) => add(m.index, 'legacy', m[0]));
  each(RE_LEGACY_UTIL, view, (m) => add(m.index, 'legacy', m[0]));
  if (kind === 'js') each(RE_LEGACY_CSSVAR, code, (m) => add(m.index, 'legacy', m[0]));
  return out;
}

// ---- running ------------------------------------------------------------------------

export function* walk(root, dir = root) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    const rel = relative(root, p).split(sep).join('/');
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name) || SKIP_PATHS.some((re) => re.test(rel))) continue;
      yield* walk(root, p);
    } else if (EXTS.has(e.name.slice(e.name.lastIndexOf('.')))) {
      yield rel;
    }
  }
}

export function readRoles(root) {
  for (const f of ['packages/colors/src/roles.ts', 'vendor/colors/src/roles.ts']) {
    try {
      const src = readFileSync(join(root, f), 'utf8');
      const block = src.slice(src.indexOf('export const ROLES'), src.indexOf('] as const'));
      return new Set([...block.matchAll(/'([\w-]+)'/g)].map((m) => m[1]));
    } catch {
      // not there: try the next place
    }
  }
  return new Set();
}

export function run(root, { noLegacy = false } = {}) {
  const roles = readRoles(root);
  const found = [];
  let files = 0;
  for (const rel of walk(root)) {
    if (ALLOW.some((a) => a.path.test(rel))) continue;
    files++;
    const text = readFileSync(join(root, rel), 'utf8');
    const lines = text.split('\n');
    for (const f of scanText(text, rel, { roles })) {
      found.push({ ...f, file: rel, snippet: (lines[f.line - 1] ?? '').trim().slice(0, 110) });
    }
  }
  const hard = found.filter((f) => !f.legacy);
  const legacy = found.filter((f) => f.legacy);
  return { files, hard, legacy, failing: noLegacy ? [...hard, ...legacy] : hard };
}

const count = (list) => {
  const c = {};
  for (const f of list) c[f.cat] = (c[f.cat] ?? 0) + 1;
  return (
    Object.entries(c)
      .map(([k, v]) => `${k} ${v}`)
      .join(', ') || 'none'
  );
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const flag = (f) => args.includes(f);
  const li = args.indexOf('--limit');
  const limit = flag('--all') ? Number.POSITIVE_INFINITY : li >= 0 ? Number(args[li + 1]) : 60;
  const rootArg = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--limit');
  const root = rootArg ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const noLegacy = flag('--no-legacy') || process.env.COLOURS_NO_LEGACY === '1';
  const r = run(root, { noLegacy });
  for (const f of r.failing.slice(0, limit)) {
    console.error(`${f.file}:${f.line}  ${f.cat} ${JSON.stringify(f.text)}  | ${f.snippet}`);
  }
  for (const cat of new Set(r.failing.map((f) => f.cat))) console.error(`  ${cat}: ${RULE[cat]}`);
  if (r.failing.length > limit)
    console.error(`… and ${r.failing.length - limit} more (--all lists them)`);
  const head = `colours: ${r.files} files scanned`;
  if (r.failing.length) {
    console.error(`${head}; FAILED with ${r.failing.length} (${count(r.failing)}).`);
    if (!noLegacy && r.legacy.length)
      console.error(`  (plus ${r.legacy.length} old-name uses, not enforced yet)`);
    process.exit(1);
  }
  const note =
    r.legacy.length && !noLegacy
      ? ` Old names still in use (not enforced yet, --no-legacy enforces): ${r.legacy.length}.`
      : '';
  console.log(`${head}; no hand-rolled colours.${note}`);
}
