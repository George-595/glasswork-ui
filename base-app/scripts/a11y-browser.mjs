// a11y-browser — the real-browser WCAG 2.2 AA pass over the running app, with
// colour contrast ON (jsdom can't measure contrast, so the vitest axe suite
// turns it off; this is where it is checked).
//
//   npm run dev                      # in one terminal
//   npm run check:a11y:browser       # in another
//
// The app needs a session, so the script first scans the sign-in page signed
// out, then signs in (A11Y_EMAIL / A11Y_PASSWORD, default the fixed dev login)
// and scans every route. A route that shows the sign-in page fails the run.
// BASE_URL points it elsewhere.
//
// Opens every route in headless Chrome (scripts/browser.mjs, on playwright-core),
// sets each skin × mode on <html>, and runs axe-core with the WCAG 2.2 AA tags.
// Exits 1 on any violation. A11Y_VERBOSE=1 lists the needs-review nodes.
// axe-core and playwright-core are devDependencies of this app.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { defaultChrome, localBrowser, Stagehand } from './browser.mjs';

const require = createRequire(import.meta.url);
const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');
// the fixed development login (server/config/env.ts); override for other servers
const EMAIL = process.env.A11Y_EMAIL ?? 'admin@example.test';
const PASSWORD = process.env.A11Y_PASSWORD ?? 'adminpassword';
const ROUTES = [
  '/login-page-signed-out',
  // the signed-out pages (a made-up token shows the "link is invalid" state)
  '/forgot-password',
  '/accept-invite?token=not-a-real-token',
  '/reset-password?token=not-a-real-token',
  '/',
  '/table',
  '/tool-1',
  '/graphs',
  '/assistant',
  '/kit',
  '/admin/users',
  '/admin/settings',
  '/admin/audit-log',
  '/admin/mail',
  '/admin/jobs',
  '/account',
  '/notifications',
  '/notifications?tab=preferences',
  '/nope',
];
const PASSES = [
  { skin: 'enterprise', theme: 'light' },
  { skin: 'enterprise', theme: 'dark' },
  { skin: 'glass', theme: 'light' },
  { skin: 'glass', theme: 'dark' },
];
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

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
      throw new Error('no model in a11y-browser');
    },
  },
  logging: { level: 'off', format: 'json' },
});

let violations = 0;
const report = [];
try {
  const tab = (await sh.browser.context.pages())[0] ?? (await sh.browser.context.newPage());
  for (const route of ROUTES) {
    if (route === '/') {
      // everything after the sign-in page is scanned signed in
      const status = await tab.evaluate(`fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(${JSON.stringify({ email: EMAIL, password: PASSWORD })}),
      }).then((r) => r.status)`);
      if (status !== 200) throw new Error(`sign-in for the scan failed: HTTP ${status}`);
    }
    // each route is its own address, so goto is a full page load: the server renders it for the
    // session as it stands now (signed out for the first pages, signed in after the login above)
    const path = route === '/login-page-signed-out' ? '/' : route;
    await tab.goto(`${BASE}${path}`);
    await tab.waitForLoadState('load');
    await tab.evaluate(axeSource);
    for (const p of PASSES) {
      const json = await tab.evaluate(`(async () => {
        const root = document.documentElement;
        // measure the settled page: a colour transition caught mid-flip, or the route's entrance
        // fade caught mid-way, is not what a
        // reader sees once it settles, and a busy headless tab can hold one at its first frame
        if (!document.getElementById('a11y-no-transitions')) {
          const style = document.createElement('style');
          style.id = 'a11y-no-transitions';
          style.textContent =
            '*, *::before, *::after { transition: none !important; animation: none !important; }';
          document.head.append(style);
        }
        root.setAttribute('data-skin', ${JSON.stringify(p.skin)});
        root.setAttribute('data-theme', ${JSON.stringify(p.theme)});
        const until = Date.now() + 5000;
        while (!document.querySelector('main h1') && Date.now() < until) {
          await new Promise((r) => setTimeout(r, 50));
        }
        await document.fonts.ready;
        // the generation reveal hides what it draws for ~2.6s: show it all at once, again for
        // any panel whose data lands while we wait
        const settle = Date.now() + 4000;
        do {
          window.dispatchEvent(new Event('ui:generate-skip'));
          await new Promise((r) => setTimeout(r, 100));
        } while (
          document.querySelector('[data-generating], [data-generate-pending], [aria-busy="true"]') &&
          Date.now() < settle
        );
        window.dispatchEvent(new Event('ui:generate-skip'));
        await new Promise((r) => setTimeout(r, 400)); // let theme transitions finish
        const r = await axe.run(document, {
          runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} },
          resultTypes: ['violations', 'incomplete'],
        });
        return JSON.stringify({
          h1: document.querySelector('main h1')?.textContent ?? null,
          passes: r.passes.length,
          violations: r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help,
            nodes: v.nodes.slice(0, 4).map((n) => n.target.join(' ') + ' — ' + (n.failureSummary || '').split('\\n').slice(1, 2).join('').trim()) })),
          incomplete: r.incomplete.map((v) => v.id + ' ×' + v.nodes.length),
          review: r.incomplete.flatMap((v) => v.nodes.map((n) => v.id + ': ' + n.target.join(' ') + ' — ' + (n.any[0]?.message ?? ''))),
        });
      })()`);
      const r = JSON.parse(json);
      if (!r.h1) {
        r.violations.push({
          id: 'page-did-not-render',
          impact: 'critical',
          help: 'no main h1 after 5s',
          nodes: [],
        });
      } else if (route !== '/login-page-signed-out' && r.h1 === 'Sign in') {
        // the scan must see the app, not the sign-in page (a cookie that did not stick)
        r.violations.push({
          id: 'not-signed-in',
          impact: 'critical',
          help: 'route rendered the sign-in page',
          nodes: [],
        });
      }
      violations += r.violations.length;
      report.push({ route, pass: `${p.skin} ${p.theme}`, ...r });
    }
  }
} finally {
  await sh.close().catch(() => {});
  await browser.close?.().catch?.(() => {});
}

for (const r of report) {
  const mark = r.violations.length ? 'FAIL' : 'ok  ';
  console.log(
    `${mark} ${r.route.padEnd(22)} ${r.pass.padEnd(17)} h1 "${r.h1}"  violations ${r.violations.length}  rules passed ${r.passes}${r.incomplete.length ? `  needs-review ${r.incomplete.join(', ')}` : ''}`,
  );
  if (process.env.A11Y_VERBOSE) for (const n of r.review) console.log(`       review ${n}`);
  for (const v of r.violations) {
    console.log(`       ${v.id} (${v.impact}): ${v.help}`);
    for (const n of v.nodes) console.log(`         ${n}`);
  }
}
console.log(
  violations
    ? `\n${violations} axe violation(s) — WCAG 2.2 AA browser gate FAILED`
    : `\nWCAG 2.2 AA browser gate passed: ${report.length} scans, 0 violations`,
);
process.exit(violations ? 1 : 0);
