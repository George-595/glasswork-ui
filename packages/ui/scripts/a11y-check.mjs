// a11y-check — the WCAG 2.2 AA gate for @apps/ui.
//
//   npm run check:a11y
//
// 1. bundles fixture/Showcase.tsx for Node with Vite's SSR build (ES modules:
//    @tanstack/charts ships import entries only) → .a11y/ssr, and compiles
//    the stylesheet with Tailwind (scripts/build-css.mjs) → .a11y/styles.css
// 2. renders the Showcase to static HTML with react-dom/server
// 3. opens it in headless Chrome (scripts/browser.mjs, on playwright-core) and
//    runs axe-core with the WCAG 2.2 AA tags, once per skin × mode:
//      enterprise dark, enterprise light, glass dark, glass light,
//    plus a WORST-CASE pass per glass mode: the page backdrop is replaced by
//    the solid colour at the peak of its accent wash, so axe measures every
//    translucent surface over the darkest/brightest point it can sit on
//    (axe cannot measure text over a gradient and would report it incomplete).
//    Each pass scans the page, then each modal dialog opened with showModal().
// Then a touch pass (scripts/touch-targets.mjs): no visible control under 48px with pointer: coarse.
// Exits 1 on any violation. A11Y_VERBOSE=1 lists the needs-review nodes. typescript, axe-core and
// playwright-core come from the workspace root (the repo root, or an exported app).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { LINK_TARGET, TARGET, touchTargets } from './touch-targets.mjs';
import { defaultChrome, localBrowser, Stagehand } from './browser.mjs';

const pkg = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(pkg, '.a11y');
const require = createRequire(import.meta.url);

// 1. build
const { build } = await import('vite');
await build({
  root: pkg,
  configFile: false,
  logLevel: 'warn',
  build: {
    ssr: join(pkg, 'fixture/Showcase.tsx'),
    outDir: join(out, 'ssr'),
    emptyOutDir: true,
    rollupOptions: { output: { entryFileNames: 'Showcase.mjs' } },
  },
});
execFileSync(process.execPath, [join(pkg, 'scripts/build-css.mjs'), join(out, 'styles.css')], {
  stdio: 'inherit',
});

// 2. render
const React = await import('react');
const { renderToStaticMarkup } = await import('react-dom/server');
const { Showcase } = await import(pathToFileURL(join(out, 'ssr/Showcase.mjs')).href);
const body = renderToStaticMarkup(React.createElement(Showcase));
const css = pathToFileURL(join(out, 'styles.css')).href;
const html = `<!doctype html>
<html lang="en-GB" data-theme="dark" data-skin="enterprise">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>@apps/ui showcase</title><link rel="stylesheet" href="${css}">
<style>
  /* measure end states: a theme switch would otherwise be scanned mid-transition */
  *, *::before, *::after { transition: none !important; animation: none !important; }
  /* worst-case glass: the backdrop's peak, as a solid colour axe can measure */
  html[data-worst] .ui-app {
    /* the strongest wash a role gives (--selected) laid over the page colour */
    background-image: linear-gradient(var(--selected), var(--selected));
    background-color: var(--canvas);
  }
</style></head>
<body style="margin:0">${body}</body></html>`;
mkdirSync(out, { recursive: true });
const page = join(out, 'showcase.html');
writeFileSync(page, html);

// 3. scan
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const PASSES = [
  { skin: 'enterprise', theme: 'dark' },
  { skin: 'enterprise', theme: 'light' },
  { skin: 'glass', theme: 'dark' },
  { skin: 'glass', theme: 'light' },
  { skin: 'glass', theme: 'dark', worst: true },
  { skin: 'glass', theme: 'light', worst: true },
];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'];

const exe = defaultChrome();
const browser = await localBrowser.launch({
  headless: true,
  ...(exe ? { executablePath: exe } : {}),
  viewport: { width: 1280, height: 900 },
});
const sh = await Stagehand.create({
  browser,
  model: {
    generate: async () => {
      throw new Error('no model in a11y-check');
    },
  },
  logging: { level: 'off', format: 'json' },
});

let violations = 0;
const report = [];
try {
  const tab = (await sh.browser.context.pages())[0] ?? (await sh.browser.context.newPage());
  await tab.goto(pathToFileURL(page).href);
  await tab.waitForLoadState('load');
  await tab.evaluate(axeSource);

  for (const p of PASSES) {
    const name = `${p.skin} ${p.theme}${p.worst ? ' worst-case backdrop' : ''}`;
    const json = await tab.evaluate(`(async () => {
      const root = document.documentElement;
      root.setAttribute('data-skin', ${JSON.stringify(p.skin)});
      root.setAttribute('data-theme', ${JSON.stringify(p.theme)});
      ${p.worst ? "root.setAttribute('data-worst', '');" : "root.removeAttribute('data-worst');"}
      await document.fonts.ready;
      // show anything the generation reveal is still drawing (it hides it for ~2.6s)
      window.dispatchEvent(new Event('ui:generate-skip'));
      const opts = { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} }, resultTypes: ['violations', 'incomplete'] };
      const pick = (r, where) => ({
        where,
        passes: r.passes.length,
        violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help,
          nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' — ' + (n.failureSummary || '').split('\\n').slice(1, 2).join('').trim()) })),
        incomplete: r.incomplete.map((v) => v.id + ' ×' + v.nodes.length),
        review: r.incomplete.flatMap((v) => v.nodes.map((n) => v.id + ': ' + n.target.join(' ') + ' — ' + (n.any[0]?.message ?? ''))),
      });
      const results = [pick(await axe.run(document, opts), 'page')];
      for (const d of document.querySelectorAll('dialog')) {
        d.showModal();
        results.push(pick(await axe.run(d, opts), 'dialog "' + d.querySelector('h2').textContent + '"'));
        d.close();
      }
      return JSON.stringify(results);
    })()`);
    for (const r of JSON.parse(json)) {
      violations += r.violations.length;
      report.push({ pass: name, ...r });
    }
  }
} finally {
  await sh.close().catch(() => {});
  await browser.close?.().catch?.(() => {});
}

for (const r of report) {
  const mark = r.violations.length ? 'FAIL' : 'ok  ';
  console.log(
    `${mark} ${r.pass.padEnd(32)} ${r.where.padEnd(34)} violations ${r.violations.length}  rules passed ${r.passes}${r.incomplete.length ? `  needs-review ${r.incomplete.join(', ')}` : ''}`,
  );
  if (process.env.A11Y_VERBOSE) for (const n of r.review) console.log(`       review ${n}`);
  for (const v of r.violations) {
    console.log(`       ${v.id} (${v.impact}): ${v.help}`);
    for (const n of v.nodes) console.log(`         ${n}`);
  }
}
console.log(
  violations
    ? `\n${violations} axe violation(s) — WCAG 2.2 AA gate FAILED`
    : `\nWCAG 2.2 AA gate passed: ${report.length} scans, 0 violations`,
);

// 4. touch targets: every control is 48px on a phone (a second Chrome, reporting pointer: coarse)
const small = await touchTargets({ Stagehand, localBrowser, exe, page });
for (const t of small) {
  console.log(`FAIL touch target ${t.name.padEnd(48)} ${t.w} x ${t.h}px, needs ${t.floor}`);
}
console.log(
  small.length
    ? `\n${small.length} control(s) under ${TARGET}px (${LINK_TARGET}px for a link) with pointer: coarse — touch gate FAILED`
    : `Touch gate passed: every visible control is at least ${TARGET}px with pointer: coarse (${LINK_TARGET}px for a link)`,
);
process.exit(violations || small.length ? 1 : 0);
