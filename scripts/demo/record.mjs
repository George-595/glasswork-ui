// record — films the guided tour of the base app for the README: the glass sign-in, the
// dashboard as its data arrives, the reveal in each look, the pointer light, sea glass and the
// assistant, in both skins and both modes.
//
//   npm run dev                      # in another terminal: the app on http://127.0.0.1:5173
//   node scripts/demo/record.mjs     # writes demo-out/demo.webm and demo-out/timeline.json
//
// The browser is packages/ui/scripts/browser.mjs's Chrome (CHROME_PATH, or the usual places).
// BASE_URL points it at another server; DEMO_OUT at another folder. Each scene is tried on its
// own, so a moved button costs that scene, not the film. Sign-in uses the public dev login.
import { mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { defaultChrome } from '../../packages/ui/scripts/browser.mjs';

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');
const OUT = process.env.DEMO_OUT ?? 'demo-out';
const WIDTH = 1440;
const HEIGHT = 900;
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: defaultChrome(),
  args: ['--ignore-gpu-blocklist', '--enable-unsafe-swiftshader'],
});
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  colorScheme: 'dark',
  reducedMotion: 'no-preference',
  recordVideo: { dir: OUT, size: { width: WIDTH, height: HEIGHT } },
});
const page = await context.newPage();
// a step that cannot happen should cost seconds, not half a minute of film
page.setDefaultTimeout(8000);
// the dev server renders each first visit of a route on demand
page.setDefaultNavigationTimeout(45000);
const started = Date.now();
const timeline = [];
const pause = (ms) => page.waitForTimeout(ms);

/** Remember where a scene starts, in seconds of film, for cutting the short loop later. */
function mark(name) {
  timeline.push({ name, at: (Date.now() - started) / 1000 });
  console.log(`${((Date.now() - started) / 1000).toFixed(1)}s  ${name}`);
}

/** Run one scene; a failure is reported and the film goes on. */
async function scene(name, run) {
  mark(name);
  try {
    await run();
  } catch (error) {
    console.warn(`  scene "${name}" skipped: ${error instanceof Error ? error.message : error}`);
    const file = `failed-${timeline.length}.png`;
    await page.screenshot({ path: join(OUT, file) }).catch(() => {});
    console.warn(`  page: ${page.url()} (screenshot ${file})`);
  }
}

/** Choose the skin and mode the way the app stores them (cookie and localStorage). */
async function look(skin, mode) {
  await context.addCookies([
    { name: 'ui-theme', value: `${mode}.${skin}.tide.${mode}`, url: BASE },
  ]);
  await page.evaluate(
    ([s, m]) => {
      localStorage.setItem('ui-skin', s);
      localStorage.setItem('ui-theme', m);
      // a film of the effects: never start on a fallback remembered from an earlier slow run
      localStorage.removeItem('ui:lowpower:lag');
      localStorage.removeItem('ui:seaglass:verdict');
    },
    [skin, mode],
  );
}

async function glide(x, y, steps = 45) {
  await page.mouse.move(x, y, { steps });
}

/** Move the pointer onto an element, as a person would, then click it. */
async function press(locator) {
  const target = locator.filter({ visible: true }).first();
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (box) await glide(box.x + box.width / 2, box.y + box.height / 2, 28);
  await target.click();
}

/** A sidebar link by its name. */
function nav(name) {
  return page.getByRole('navigation').getByRole('link', { name, exact: true });
}

/** Scroll a heading to the top of the view, smoothly, and let it settle. */
async function scrollToHeading(name) {
  const heading = page.getByRole('heading', { name, exact: true }).first();
  await heading.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await pause(1300);
}

/** Sweep the pointer across every element the locator finds, left to right. */
async function sweep(locator, count = 4) {
  const n = Math.min(count, await locator.count());
  for (let i = 0; i < n; i++) {
    const box = await locator.nth(i).boundingBox();
    if (!box) continue;
    await glide(box.x + box.width * 0.2, box.y + box.height * 0.45, 18);
    await glide(box.x + box.width * 0.85, box.y + box.height * 0.6, 30);
  }
}

// the first look is set before anything loads; after that the tour switches skin and mode with
// the app's own controls, and moves with the sidebar, so the page never reloads (a reload in dev
// mode shows the raw page for a moment before its styles arrive)
await context.addCookies([{ name: 'ui-theme', value: 'dark.glass.tide.dark', url: BASE }]);
await page.goto(`${BASE}/`);
await look('glass', 'dark');
await page.reload();
await page.waitForLoadState('load');
await glide(WIDTH * 0.3, HEIGHT * 0.4, 1);
await pause(2500);
mark('start'); // the film is cut from here

await scene('glass sign-in', async () => {
  await glide(WIDTH * 0.7, HEIGHT * 0.55, 70);
  await pause(800);
});

await scene('sign in', async () => {
  // the sign-in page offers the public dev login as a button: on film, a click reads better than
  // typing, and typing is slow while the glass renders in software on a runner with no GPU
  await press(page.getByRole('button', { name: 'Fill dev login' }));
  await pause(700);
  await press(page.getByRole('button', { name: 'Sign in' }));
  await page.getByRole('heading', { name: 'Overview' }).first().waitFor({ timeout: 20000 });
});

// if the form could not be used, sign in the way the browser checks do, so the tour goes on
if (!(await page.getByRole('heading', { name: 'Overview' }).count())) {
  mark('sign in through the API');
  const status = await page.evaluate(
    (body) =>
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.status),
    { email: 'admin@example.test', password: 'adminpassword' },
  );
  console.log(`  status ${status}`);
  await page.goto(`${BASE}/`);
  await page.getByRole('heading', { name: 'Overview' }).first().waitFor({ timeout: 30000 });
}

await scene('dashboard arrives (frost)', async () => {
  await pause(4500);
});

await scene('pointer light on the figures', async () => {
  await sweep(page.locator('.ui-kpi-fx'));
  await pause(600);
});

await scene('switch to enterprise light', async () => {
  await press(page.getByRole('radio', { name: 'Enterprise' }));
  await pause(1200);
  await press(page.getByRole('button', { name: 'Switch to light mode' }));
  await pause(1200);
});

await scene('graphs arrive (plotter)', async () => {
  await press(nav('Graphs'));
  await pause(5000);
});

await scene('the reveal in each look', async () => {
  await press(nav('Kit'));
  await pause(1500);
  await scrollToHeading('Data visualisation');
  await press(page.getByRole('button', { name: 'Replay' }).first());
  await pause(3400);
  await press(page.getByRole('button', { name: "With the agent's notes" }).first());
  await pause(4400);
});

await scene('switch to glass dark', async () => {
  await press(page.getByRole('radio', { name: 'Glass' }));
  await pause(1200);
  await press(page.getByRole('button', { name: 'Switch to dark mode' }));
  await pause(1500);
});

await scene('cards and tiles', async () => {
  await scrollToHeading('Cards and tiles');
  await sweep(page.locator('.ui-kpi-fx'), 3);
  await pause(800);
});

await scene('sea glass', async () => {
  await scrollToHeading('Sea glass');
  await glide(WIDTH * 0.35, HEIGHT * 0.5, 40);
  await glide(WIDTH * 0.65, HEIGHT * 0.45, 60);
  await pause(2000);
});

await scene('the assistant (draft)', async () => {
  await press(nav('Assistant'));
  await pause(1200);
  await press(page.getByRole('button', { name: 'Show example conversation' }));
  await pause(4800);
});

await scene('glass light', async () => {
  await press(page.getByRole('button', { name: 'Switch to light mode' }));
  await pause(800);
  await press(nav('Home'));
  await pause(5000);
});

mark('end');
const video = page.video();
await context.close();
await browser.close();
const recorded = video
  ? await video.path()
  : join(OUT, readdirSync(OUT).find((f) => f.endsWith('.webm')) ?? '');
renameSync(recorded, join(OUT, 'demo.webm'));
writeFileSync(join(OUT, 'timeline.json'), `${JSON.stringify(timeline, null, 2)}\n`);
console.log(`wrote ${join(OUT, 'demo.webm')}`);
